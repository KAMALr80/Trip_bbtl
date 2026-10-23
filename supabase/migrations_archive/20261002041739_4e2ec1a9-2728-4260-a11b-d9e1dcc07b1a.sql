CREATE OR REPLACE FUNCTION trip_private.lab_shift(p_trip uuid, p_target text, p_day int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; today date; off interval := interval '0'; v_days int; wk int; n_count int; ts timestamptz; me uuid := auth.uid();
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  UPDATE public.trips SET ended_at = NULL WHERE id=p_trip;
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  today := (now() AT TIME ZONE t.home_timezone)::date;
  SELECT count(*) INTO n_count FROM public.game_nights WHERE trip_id=p_trip;
  IF p_target = 'before' THEN
    off := ((today + 3) - coalesce(t.game_start, (SELECT min((starts_at AT TIME ZONE t.home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip), t.start_date - 1)) * interval '1 day';
  ELSIF p_target IN ('kickoff','buildup','takeoff') THEN
    IF n_count = 0 THEN RAISE EXCEPTION 'This sandbox has no game nights'; END IF;
    wk := CASE p_target WHEN 'kickoff' THEN (SELECT min(week_number) FROM public.game_nights WHERE trip_id=p_trip)
                        WHEN 'takeoff' THEN (SELECT max(week_number) FROM public.game_nights WHERE trip_id=p_trip)
                        ELSE (SELECT week_number FROM public.game_nights WHERE trip_id=p_trip ORDER BY week_number OFFSET greatest(0,(n_count-1)/2) LIMIT 1) END;
    SELECT starts_at INTO ts FROM public.game_nights WHERE trip_id=p_trip AND week_number=wk;
    off := (now() - interval '2 minutes') - ts;
  ELSIF p_target IN ('day','rest','surprise') THEN
    off := (today - (t.start_date + greatest(1, least(coalesce(p_day,1), t.end_date - t.start_date + 1)) - 1)) * interval '1 day';
  ELSIF p_target = 'end' THEN off := (today - t.end_date) * interval '1 day';
  ELSIF p_target IN ('feedback','wrapped') THEN off := (today - 1 - t.end_date) * interval '1 day';
  ELSE RAISE EXCEPTION 'Unknown time travel target'; END IF;
  v_days := round(extract(epoch FROM off) / 86400.0)::int;
  UPDATE public.trips SET start_date = start_date + v_days, end_date = end_date + v_days, game_start = game_start + v_days,
    rest_days = ARRAY(SELECT x + v_days FROM unnest(rest_days) x),
    surprise_mode = CASE WHEN p_target='surprise' THEN true WHEN p_target='day' THEN false ELSE surprise_mode END
  WHERE id=p_trip;
  UPDATE public.game_nights SET starts_at = starts_at + off WHERE trip_id=p_trip;
  UPDATE public.weekly_questions SET drops_at = drops_at + off WHERE trip_id=p_trip;
  UPDATE public.season_settings SET crowning_at = crowning_at + off WHERE trip_id=p_trip AND crowning_at IS NOT NULL;
  DELETE FROM public.trip_day_games WHERE trip_id=p_trip;
  DELETE FROM public.bingo_marks WHERE trip_id=p_trip; DELETE FROM public.quest_posts WHERE trip_id=p_trip;
  DELETE FROM public.trivia_answers WHERE trip_id=p_trip; DELETE FROM public.secret_missions WHERE trip_id=p_trip;
  DELETE FROM public.mission_votes WHERE trip_id=p_trip; DELETE FROM public.photo_posts WHERE trip_id=p_trip;
  DELETE FROM public.day_votes WHERE trip_id=p_trip; DELETE FROM public.airport_claims WHERE trip_id=p_trip;
  DELETE FROM public.trip_item_alternatives WHERE trip_id=p_trip;
  PERFORM trip_private.lab_itinerary(p_trip);
  IF p_target = 'rest' THEN
    UPDATE public.trips SET surprise_mode=false, rest_days = array_append(array_remove(rest_days, today), today) WHERE id=p_trip;
  END IF;
  IF p_target IN ('kickoff','buildup','takeoff') THEN
    UPDATE public.game_nights SET host_id = me WHERE trip_id=p_trip AND week_number=wk;
    DELETE FROM public.host_penalties WHERE trip_id=p_trip AND week_number=wk;
  END IF;
  IF p_target = 'feedback' THEN DELETE FROM public.trip_feedback WHERE trip_id=p_trip AND user_id=me; END IF;
  IF p_target = 'wrapped' THEN INSERT INTO public.trip_feedback(trip_id,user_id,skipped) VALUES (p_trip,me,true) ON CONFLICT DO NOTHING; END IF;
  BEGIN PERFORM trip_private.ensure_weekly_questions(p_trip); EXCEPTION WHEN others THEN NULL; END;
  IF p_target IN ('end','feedback','wrapped') THEN UPDATE public.trips SET ended_at = now() WHERE id=p_trip; END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_delete(p_trip uuid) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ids uuid[];
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  UPDATE public.trips SET ended_at = NULL WHERE id=p_trip;
  SELECT coalesce(array_agg(user_id),'{}') INTO ids FROM public.sandbox_bots WHERE trip_id=p_trip;
  DELETE FROM trip_private.trip_join_grants WHERE trip_id=p_trip;
  DELETE FROM public.sandbox_bots WHERE trip_id=p_trip;
  DELETE FROM public.trips WHERE id=p_trip AND is_sandbox;
  RETURN ids;
END $$;