CREATE OR REPLACE FUNCTION trip_private.delete_trip(p_trip uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$ DECLARE t public.trips; n integer; BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 IF p_name IS DISTINCT FROM t.name AND upper(btrim(coalesce(p_name,''))) <> 'DELETE' THEN RAISE EXCEPTION 'Trip name does not match'; END IF;
 SELECT count(*) INTO n FROM public.trip_members WHERE trip_id=p_trip;
 INSERT INTO public.trip_deletion_notes(user_id,trip_name,captain_id) SELECT user_id,t.name,auth.uid() FROM public.trip_members WHERE trip_id=p_trip AND user_id<>auth.uid();
 INSERT INTO public.trip_deletion_log(trip_id,trip_name,captain_id,member_count) VALUES(p_trip,t.name,auth.uid(),n);
 DELETE FROM public.trips WHERE id=p_trip;
END $function$;
GRANT EXECUTE ON FUNCTION trip_private.delete_trip(uuid, text) TO authenticated;