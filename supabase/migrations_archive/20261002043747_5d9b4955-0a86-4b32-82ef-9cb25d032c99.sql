DO $do$ DECLARE d text; BEGIN
 d := pg_get_functiondef('trip_private.lab_role(uuid,text)'::regprocedure);
 d := replace(d, $a$UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=me;$a$, $a$UPDATE public.trip_members SET role='captain', status='approved' WHERE trip_id=p_trip AND user_id=me;$a$);
 EXECUTE d; END $do$;