DO $do$ DECLARE src text; BEGIN
  SELECT pg_get_functiondef('trip_private.apply_game_plan(uuid,text,integer,time without time zone,date,integer)'::regprocedure) INTO src;
  src := replace(src, 'least(coalesce(game_start, v_today), (SELECT', 'coalesce((SELECT');
  src := replace(src, 'FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now()))', 'FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now()), v_today)');
  src := replace(src, E'WHEN p_plan=''short'' THEN coalesce((SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip))', E'WHEN p_plan=''short'' THEN coalesce((SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now()), v_today)');
  IF position('coalesce((SELECT min' in src)=0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE src;
END $do$;