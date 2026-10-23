DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.proname='ensure_sealed' AND pg_get_function_identity_arguments(p.oid)='p_trip uuid, p_user uuid';
 IF definition IS NULL OR position('PERFORM pg_advisory_xact_lock' IN definition)=0 OR position('IF NOT FOUND OR t.kind NOT IN (''trip'',''at_home'') OR (t.id=' IN definition)=0 THEN RAISE EXCEPTION 'Quest guard definition changed; aborting'; END IF;
 definition:=replace(definition,'PERFORM pg_advisory_xact_lock(hashtext(p_trip::text||p_user::text||''sealed''));','IF t.season_rule=''a2c'' AND t.kind=''trip'' AND t.start_date>(now() AT TIME ZONE t.home_timezone)::date AND t.game_plan IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_trip::text||p_user::text||''sealed''));');
 EXECUTE definition;
END $$;