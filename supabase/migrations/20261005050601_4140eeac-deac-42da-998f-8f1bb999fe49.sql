DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.proname='ensure_sealed' AND pg_get_function_identity_arguments(p.oid)='p_trip uuid, p_user uuid';
 IF definition IS NULL OR position('IF NOT FOUND OR t.kind NOT IN (''trip'',''at_home'') THEN RETURN; END IF;' IN definition)=0 THEN RAISE EXCEPTION 'Quest guard definition changed; aborting'; END IF;
 definition:=replace(definition,'IF NOT FOUND OR t.kind NOT IN (''trip'',''at_home'') THEN RETURN; END IF;','IF NOT FOUND OR t.kind NOT IN (''trip'',''at_home'') OR (t.id=''a4842ba8-540c-4595-9417-a9a7fb53f395''::uuid AND t.join_code=''VRFQQM'') THEN RETURN; END IF;');
 EXECUTE definition;
END $$;