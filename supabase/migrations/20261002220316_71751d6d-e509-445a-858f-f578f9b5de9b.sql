CREATE OR REPLACE FUNCTION trip_private.set_my_dob(p_dob date, p_agree boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm you are 18 or older and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date,p_dob))::int;
 IF a < 18 THEN RAISE EXCEPTION 'You must be 18 or older to create an account'; END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your birthday is already saved; contact support for corrections'; END IF;
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 IF (SELECT public_launch FROM public.app_settings LIMIT 1) THEN INSERT INTO public.beta_access(user_id,source) VALUES(auth.uid(),'launch') ON CONFLICT DO NOTHING; END IF;
 RETURN trip_private.age_range(a);
END $$;
CREATE OR REPLACE FUNCTION trip_private.is_approved_adult(p_trip uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid()=p_user AND EXISTS (SELECT 1 FROM public.trips t JOIN public.trip_adult_approvals a ON a.trip_id=t.id AND a.user_id=p_user WHERE t.id=p_trip AND t.vibe='party' AND trip_private.is_trip_member(p_trip,p_user) AND coalesce(trip_private.age_of(p_user),0)>=21 AND NOT coalesce((SELECT no_alcohol FROM public.player_private WHERE user_id=p_user),false)) $$;
CREATE OR REPLACE FUNCTION trip_private.adult_badge(p_trip uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT trip_private.is_trip_member(p_trip,auth.uid()) AND EXISTS (SELECT 1 FROM public.trips t JOIN public.trip_adult_approvals a ON a.trip_id=t.id AND a.user_id=p_user WHERE t.id=p_trip AND t.vibe='party' AND trip_private.is_trip_member(p_trip,p_user) AND coalesce(trip_private.age_of(p_user),0)>=21) $$;
CREATE OR REPLACE FUNCTION trip_private.approve_adult_player(p_trip uuid,p_user uuid,p_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain' AND status='approved') THEN RAISE EXCEPTION 'Captain only'; END IF;
 IF p_approve THEN
  IF NOT trip_private.is_trip_member(p_trip,p_user) OR coalesce(trip_private.age_of(p_user),0)<21 THEN RAISE EXCEPTION 'Player must be 21 or older'; END IF;
  INSERT INTO public.trip_adult_approvals(trip_id,user_id,approved_by) VALUES(p_trip,p_user,auth.uid()) ON CONFLICT(trip_id,user_id) DO UPDATE SET approved_by=excluded.approved_by;
 ELSE DELETE FROM public.trip_adult_approvals WHERE trip_id=p_trip AND user_id=p_user; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.approve_adult_player(p_trip uuid,p_user uuid,p_approve boolean) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.approve_adult_player(p_trip,p_user,p_approve) $$;
REVOKE ALL ON FUNCTION trip_private.approve_adult_player(uuid,uuid,boolean), public.approve_adult_player(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.approve_adult_player(uuid,uuid,boolean), public.approve_adult_player(uuid,uuid,boolean) TO authenticated;