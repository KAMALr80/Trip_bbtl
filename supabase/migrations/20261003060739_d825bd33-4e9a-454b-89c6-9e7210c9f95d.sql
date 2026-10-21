CREATE OR REPLACE FUNCTION trip_private.member_stamp_badges(p_trip uuid)
RETURNS TABLE(user_id uuid, country text, state text, city text, stamped_on date, trip_name text, squad_count integer, stamp_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RETURN; END IF;
 RETURN QUERY
 SELECT s.user_id, s.country, s.state, s.city, s.stamped_on, s.trip_name, s.squad_count,
   (SELECT count(*) FROM public.passport_stamps x WHERE x.user_id=s.user_id)
 FROM public.passport_stamps s
 JOIN public.trip_members m ON m.user_id=s.user_id AND m.trip_id=p_trip AND m.status='approved'
 WHERE s.trip_id=p_trip AND s.stamped_on=(SELECT max(x.stamped_on) FROM public.passport_stamps x WHERE x.user_id=s.user_id AND x.trip_id=p_trip);
END $$;
REVOKE ALL ON FUNCTION trip_private.member_stamp_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.member_stamp_badges(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.member_stamp_badges(p_trip uuid)
RETURNS TABLE(user_id uuid, country text, state text, city text, stamped_on date, trip_name text, squad_count integer, stamp_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT * FROM trip_private.member_stamp_badges(p_trip) $$;
REVOKE ALL ON FUNCTION public.member_stamp_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_stamp_badges(uuid) TO authenticated;