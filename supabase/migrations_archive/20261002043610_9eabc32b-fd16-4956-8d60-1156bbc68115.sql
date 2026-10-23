CREATE OR REPLACE FUNCTION trip_private.approve_adult_player(p_trip uuid, p_user uuid, p_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 IF p_approve THEN
   IF NOT trip_private.is_trip_member(p_trip,p_user) OR coalesce(trip_private.age_of(p_user), (SELECT extract(year FROM age(current_date,b.birthday))::int FROM public.player_birthdays b WHERE b.user_id=p_user), 0) < 21 THEN RAISE EXCEPTION 'Player must be 21 or older'; END IF;
   INSERT INTO public.trip_adult_approvals(trip_id,user_id,approved_by) VALUES(p_trip,p_user,auth.uid()) ON CONFLICT(trip_id,user_id) DO UPDATE SET approved_by=excluded.approved_by;
 ELSE DELETE FROM public.trip_adult_approvals WHERE trip_id=p_trip AND user_id=p_user; END IF; END $function$;
CREATE OR REPLACE FUNCTION trip_private.member_age_ranges(p_trip uuid) RETURNS TABLE(user_id uuid, age_range text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 RETURN QUERY SELECT m.user_id, trip_private.age_range(coalesce(trip_private.age_of(m.user_id), (SELECT extract(year FROM age(current_date,b.birthday))::int FROM public.player_birthdays b WHERE b.user_id=m.user_id))) FROM public.trip_members m WHERE m.trip_id=p_trip AND m.status='approved'; END $$;
GRANT EXECUTE ON FUNCTION trip_private.member_age_ranges(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.member_age_ranges(p_trip uuid) RETURNS TABLE(user_id uuid, age_range text) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.member_age_ranges(p_trip) $$;
REVOKE EXECUTE ON FUNCTION public.member_age_ranges(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.member_age_ranges(uuid) TO authenticated;