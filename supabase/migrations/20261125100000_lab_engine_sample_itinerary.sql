-- Founder review: a new-engine Test Lab sandbox (lab_engine_create) never got an itinerary, so its
-- Trip tab showed an empty plan. The older sandboxes (lab_create) always seeded the sample one.
-- Travel rooms now get the same sample itinerary and day tags, moved to Lisbon and Porto to match
-- the sandbox's destination. At-home rooms have no itinerary. Sandboxes only, as before.
--
-- Rollback: re-run lab_engine_create from 20261104140000_m6_test_lab.sql.

-- Unchanged except for the sample itinerary before the schedule is planned.
CREATE OR REPLACE FUNCTION trip_private.lab_engine_create(p_room text, p_mode text, p_size integer, p_days integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  r jsonb := trip_private.room_rules(p_room);
  me uuid := auth.uid();
  v_trip uuid;
  v_start date;
  v_end date;
  v_size int;
  v_pre int;
  b record;
  k int := 0;
  v_tz text := 'America/Los_Angeles';
BEGIN
  PERFORM trip_private.lab_guard(NULL);
  IF r IS NULL THEN RAISE EXCEPTION 'Pick a room'; END IF;
  IF NOT (r->'modes') ? p_mode THEN RAISE EXCEPTION 'This room has no "%" mode', p_mode; END IF;
  IF p_days NOT BETWEEN (r->'mainDays'->>'min')::int AND (r->'mainDays'->>'max')::int THEN
    RAISE EXCEPTION 'This room takes % to % days', r->'mainDays'->>'min', r->'mainDays'->>'max';
  END IF;
  v_size := CASE WHEN p_mode = 'crew' THEN least(greatest(coalesce(p_size, 4), 2), (r->>'maxCrew')::int) ELSE 1 END;
  IF (SELECT count(*) FROM public.sandbox_bots WHERE trip_id IS NULL) < v_size - 1 THEN RAISE EXCEPTION 'Not enough bots ready'; END IF;
  v_pre := least(3, (r->'preFlightDays'->>'max')::int);
  v_start := (now() AT TIME ZONE v_tz)::date + greatest(v_pre - 1, 1);
  v_end := v_start + p_days - 1;
  INSERT INTO public.trips (name, destination, start_date, end_date, home_timezone, trip_timezone, join_code, is_sandbox,
                            require_approval, room, play_mode, preflight_days, cultures, passport_country, passport_city,
                            crowning_at, max_squad, join_code_enabled, setup_completed_at, kind, play_arrangement, season_rule)
  VALUES ('🧪 ' || p_room || ' · ' || p_mode || ' · ' || p_days || 'd',
          CASE WHEN (r->>'atHome')::boolean THEN 'Home' ELSE 'Lisbon, Portugal' END,
          v_start, v_end, v_tz, CASE WHEN (r->>'atHome')::boolean THEN v_tz ELSE 'Europe/Lisbon' END,
          public.new_trip_code(), true, false, p_room, p_mode, v_pre,
          CASE WHEN p_room IN ('explore_culture', 'show_culture') THEN ARRAY['Japan'] ELSE '{}' END,
          CASE WHEN (r->>'atHome')::boolean THEN NULL ELSE 'PT' END,
          CASE WHEN (r->>'atHome')::boolean THEN NULL ELSE 'Lisbon' END,
          CASE WHEN (r->>'pointsEnabled')::boolean
               THEN (v_end + time '20:00') AT TIME ZONE CASE WHEN (r->>'atHome')::boolean THEN v_tz ELSE 'Europe/Lisbon' END END,
          greatest(2, (r->>'maxCrew')::int), p_mode = 'crew', NULL,
          CASE WHEN (r->>'atHome')::boolean THEN 'at_home' ELSE 'trip' END,
          CASE p_mode WHEN 'crew' THEN 'online' ELSE p_mode END, 'a2c')
  RETURNING id INTO v_trip;
  INSERT INTO public.trip_members (trip_id, user_id, role, status, approved_at) VALUES (v_trip, me, 'captain', 'approved', now());
  PERFORM trip_private.lab_card(v_trip, me, 'Founder', 0);
  FOR b IN SELECT user_id, name FROM public.sandbox_bots WHERE trip_id IS NULL ORDER BY created_at, user_id LIMIT v_size - 1 LOOP
    k := k + 1;
    UPDATE public.sandbox_bots SET trip_id = v_trip WHERE user_id = b.user_id;
    INSERT INTO public.trip_members (trip_id, user_id, role, status, approved_at) VALUES (v_trip, b.user_id, 'player', 'approved', now());
    PERFORM trip_private.lab_card(v_trip, b.user_id, b.name, k);
  END LOOP;
  -- Travel rooms get the sample itinerary, set in Lisbon and Porto like the sandbox itself, so the
  -- Trip tab isn't empty (founder review).
  IF NOT (r->>'atHome')::boolean THEN
    PERFORM trip_private.lab_itinerary(v_trip);
    UPDATE public.trip_itineraries
    SET days = replace(replace(replace(replace(days::text, 'Bangkok', 'Lisbon'), 'Phuket', 'Porto'),
                               '"BKK"', '"LIS"'), '"HKT"', '"OPO"')::jsonb
    WHERE trip_id = v_trip;
  END IF;
  UPDATE public.trips SET setup_completed_at = now() WHERE id = v_trip;  -- plans the schedule
  RETURN v_trip;
END
$$;
