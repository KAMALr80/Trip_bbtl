DO $do$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.proname='create_at_home' LIMIT 1;
 IF definition IS NULL OR position('🏠 ' IN definition)=0 THEN RAISE EXCEPTION 'Expected At Home naming expression was not found'; END IF;
 definition := replace(definition, '''🏠 '' || v_name || '' at Home''', 'v_name || '' at Home''');
 IF position('''🏠 '' || v_name || '' at Home''' IN definition)>0 THEN RAISE EXCEPTION 'At Home naming expression could not be replaced'; END IF;
 EXECUTE definition;
END $do$;
UPDATE public.trips SET name = regexp_replace(name, '^🏠[[:space:]]*', '') WHERE kind='at_home' AND name LIKE '🏠%';