DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.proname='create_trip_a2c' AND pg_get_function_identity_arguments(p.oid)='p_name text, p_destination text, p_start_date date, p_end_date date, p_home_timezone text';
 IF definition IS NULL OR position('IF p_end_date<v_today OR p_start_date>v_today+365' IN definition)=0 THEN RAISE EXCEPTION 'Trip creator changed; aborting'; END IF;
 definition:=replace(definition,'IF p_end_date<v_today OR p_start_date>v_today+365', 'IF p_end_date-p_start_date NOT BETWEEN 1 AND 29 THEN RAISE EXCEPTION ''Trips can be 2 to 30 days long''; END IF; IF p_end_date<v_today OR p_start_date>v_today+365');
 EXECUTE definition;
END $$;