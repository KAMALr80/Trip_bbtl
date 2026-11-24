-- Founder review (Test Lab): jumping a sandbox to another phase "reset the itinerary" every time.
-- The older time travel (lab_shift) replaced the trip's itinerary with the sample one on every jump;
-- the new engine's jump (lab_jump) moved the dates but left the itinerary and day tags on the old
-- dates, so they showed as empty. Both now move the itinerary (days and flights) and the day tags by
-- the same number of days; the sample itinerary is only seeded when the trip has none.
-- The older time travel still clears that day's played games, posts and photos on purpose, so the
-- day can be played again. Sandboxes only (lab_guard), as before.
--
-- Rollback: re-run lab_jump from 20261104140000_m6_test_lab.sql and lab_shift from the baseline;
-- DROP FUNCTION trip_private.lab_move_itinerary(uuid, integer), trip_private.lab_shift_date(jsonb, integer).

-- An object's "date" (YYYY-MM-DD) moved by p_days; anything else comes back unchanged.
CREATE FUNCTION trip_private.lab_shift_date(p_item jsonb, p_days integer) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_item) = 'object' AND coalesce(p_item->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      THEN jsonb_set(p_item, '{date}', to_jsonb(((p_item->>'date')::date + p_days)::text))
    ELSE p_item END
$$;
REVOKE ALL ON FUNCTION trip_private.lab_shift_date(jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.lab_shift_date(jsonb, integer) TO service_role;

-- Move a sandbox's itinerary and day tags by p_days.
CREATE FUNCTION trip_private.lab_move_itinerary(p_trip uuid, p_days integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_days = 0 THEN RETURN; END IF;
  -- Every day's date and every flight's date move with the trip.
  UPDATE public.trip_itineraries i
  SET days = coalesce((
    SELECT jsonb_agg(
             CASE WHEN jsonb_typeof(d) <> 'object' THEN d ELSE
               trip_private.lab_shift_date(d, p_days)
               || CASE WHEN jsonb_typeof(d->'flights') = 'array' THEN jsonb_build_object('flights', (
                    SELECT coalesce(jsonb_agg(trip_private.lab_shift_date(f, p_days) ORDER BY fo), '[]'::jsonb)
                    FROM jsonb_array_elements(d->'flights') WITH ORDINALITY x(f, fo)))
                  ELSE '{}'::jsonb END
             END ORDER BY n)
    FROM jsonb_array_elements(i.days) WITH ORDINALITY e(d, n)), '[]'::jsonb)
  WHERE i.trip_id = p_trip;
  -- Day tags are keyed by date; move them as a set so no two rows collide on the way.
  WITH moved AS (DELETE FROM public.trip_day_tags WHERE trip_id = p_trip RETURNING day_date, tag, created_at)
  INSERT INTO public.trip_day_tags (trip_id, day_date, tag, created_at)
  SELECT p_trip, day_date + p_days, tag, created_at FROM moved;
END
$$;
REVOKE ALL ON FUNCTION trip_private.lab_move_itinerary(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.lab_move_itinerary(uuid, integer) TO service_role;

-- Unchanged except for v_shift and the move after the trips update.
CREATE OR REPLACE FUNCTION trip_private.lab_jump(p_trip uuid, p_phase text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE t public.trips; v_days int; v_today date; v_start date; v_zone text; v_phase text; v_home boolean;
        v_shift int;
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT * INTO t FROM public.trips WHERE id = p_trip FOR UPDATE;
  v_days := t.end_date - t.start_date;
  v_today := (now() AT TIME ZONE t.home_timezone)::date;
  v_home := (trip_private.room_rules(t.room)->>'atHome')::boolean;
  v_start := CASE p_phase
    WHEN 'preflight' THEN v_today + greatest(1, least(t.preflight_days, 3)) + CASE WHEN v_home THEN 1 ELSE 0 END
    -- at home, Takeoff (Home Missions) is the day before the first experience day
    WHEN 'takeoff' THEN v_today + CASE WHEN v_home THEN 1 ELSE 0 END
    WHEN 'trip_season' THEN v_today - CASE WHEN v_home THEN 0 ELSE 1 END
    WHEN 'baggage_claim' THEN v_today - v_days - 2
    WHEN 'locked' THEN v_today - v_days - 9
    ELSE NULL END;
  IF v_start IS NULL THEN RAISE EXCEPTION 'Pick preflight, takeoff, trip_season, baggage_claim or locked'; END IF;
  IF p_phase = 'preflight' AND t.preflight_days = 0 THEN RAISE EXCEPTION 'This room has no Pre-Flight'; END IF;
  v_zone := coalesce(t.trip_timezone, t.home_timezone);
  v_shift := v_start - t.start_date;
  UPDATE public.trips
  SET start_date = v_start, end_date = v_start + v_days, locked_at = NULL, photos_purged_at = NULL,
      arrived_at = CASE WHEN p_phase IN ('preflight', 'takeoff') THEN NULL ELSE now() - interval '1 day' END,
      arrived_by = CASE WHEN p_phase IN ('preflight', 'takeoff') THEN NULL ELSE auth.uid() END,
      crowning_at = CASE WHEN crowning_at IS NULL THEN NULL
                         ELSE ((v_start + v_days) + time '20:00') AT TIME ZONE v_zone END
  WHERE id = p_trip;
  -- The itinerary and day tags move with the dates, so they don't fall outside the trip.
  PERFORM trip_private.lab_move_itinerary(p_trip, v_shift);
  IF p_phase = 'locked' THEN
    DELETE FROM public.trip_postcards WHERE trip_id = p_trip;   -- a fresh lock each time
    PERFORM trip_private.lock_trip(p_trip, true);
  END IF;
  SELECT phase INTO v_phase FROM trip_private.trip_phase(p_trip, now());
  RETURN CASE WHEN p_phase = 'locked' THEN 'locked' ELSE v_phase END;
END
$$;

-- Unchanged except for keeping (moving) the trip's own itinerary.
CREATE OR REPLACE FUNCTION trip_private.lab_shift(p_trip uuid, p_target text, p_day integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  ELSIF p_target = 'qotw' THEN
    SELECT drops_at INTO ts FROM public.weekly_questions WHERE trip_id=p_trip AND week_number < 1000 ORDER BY week_number LIMIT 1;
    IF ts IS NULL THEN SELECT drops_at INTO ts FROM public.weekly_questions WHERE trip_id=p_trip ORDER BY drops_at LIMIT 1; END IF;
    IF ts IS NULL THEN RAISE EXCEPTION 'This sandbox has no Question of the Week (1-night season)'; END IF;
    off := (now() - interval '1 hour') - ts;
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
  -- Keep the trip's own itinerary, moved with the dates; seed the sample one only when there is none.
  IF EXISTS (SELECT 1 FROM public.trip_itineraries WHERE trip_id = p_trip AND jsonb_array_length(days) > 0) THEN
    PERFORM trip_private.lab_move_itinerary(p_trip, v_days);
  ELSE
    PERFORM trip_private.lab_itinerary(p_trip);
  END IF;
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
