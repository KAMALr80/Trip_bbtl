DO $$ DECLARE c text; n int; BEGIN
FOREACH c IN ARRAY ARRAY['BFGYFUTG','HHRXKDRY','UBHDDDDK','XEKZFEKF'] LOOP
  SELECT count(*) INTO n FROM public.trip_members m JOIN public.trips t ON t.id=m.trip_id WHERE t.join_code=c;
  IF n = 1 THEN DELETE FROM public.trips WHERE join_code=c AND join_code NOT IN ('VRFQQM','HDEBKCAG','ZBMUNMTR');
  ELSE RAISE NOTICE 'Skipped % (members=%)', c, n; END IF;
END LOOP; END $$;