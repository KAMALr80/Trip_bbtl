-- M6-06 Test Lab for the new engine (R-908). Founder only (lab_guard), sandbox trips only.
--  * lab_engine_create: a sandbox for any room × "Who's playing?" with bots from the bot pool, in
--    Pre-Flight, planned like a real trip.
--  * lab_jump: "Jump to phase": moves the sandbox's dates so now falls in Pre-Flight, Takeoff, Trip
--    Season or Baggage Claim, or past Day 7 (then locks it). Time travel for sandboxes is done by
--    moving their dates, so the real phase engine (trip_phase) and schedule run unchanged; real
--    trips can't be moved by it (lab_guard).
--  * lab_engine_play: every bot does what is open for it right now: daily items, quest / mission /
--    drop proofs (text), the journal, 👍 on the crew's proofs, Game Night Live (👍 and award votes
--    for the founder) and wrap-up (an answer and hearts). Each action goes through the same
--    identity-checked functions as a player's, as that bot.
-- Reset / delete stay the existing resetSandbox / deleteSandbox (lab_delete).
-- rollback: DROP FUNCTION public.lab_engine_create(text, text, int, int), public.lab_jump(uuid, text),
--   public.lab_engine_play(uuid) and their trip_private bodies.

CREATE FUNCTION trip_private.lab_engine_create(p_room text, p_mode text, p_size int, p_days int) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
  UPDATE public.trips SET setup_completed_at = now() WHERE id = v_trip;  -- plans the schedule
  RETURN v_trip;
END
$$;

-- Move a sandbox so that now is just inside the chosen phase (or past Day 7: then it locks).
CREATE FUNCTION trip_private.lab_jump(p_trip uuid, p_phase text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; v_days int; v_today date; v_start date; v_zone text; v_phase text; v_home boolean;
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
  UPDATE public.trips
  SET start_date = v_start, end_date = v_start + v_days, locked_at = NULL, photos_purged_at = NULL,
      arrived_at = CASE WHEN p_phase IN ('preflight', 'takeoff') THEN NULL ELSE now() - interval '1 day' END,
      arrived_by = CASE WHEN p_phase IN ('preflight', 'takeoff') THEN NULL ELSE auth.uid() END,
      crowning_at = CASE WHEN crowning_at IS NULL THEN NULL
                         ELSE ((v_start + v_days) + time '20:00') AT TIME ZONE v_zone END
  WHERE id = p_trip;
  IF p_phase = 'locked' THEN
    DELETE FROM public.trip_postcards WHERE trip_id = p_trip;   -- a fresh lock each time
    PERFORM trip_private.lock_trip(p_trip, true);
  END IF;
  SELECT phase INTO v_phase FROM trip_private.trip_phase(p_trip, now());
  RETURN CASE WHEN p_phase = 'locked' THEN 'locked' ELSE v_phase END;
END
$$;

-- Every bot plays what is open for it right now. Returns "N actions, M refused (last reason)".
CREATE FUNCTION trip_private.lab_engine_play(p_trip uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_phase text;
  b record;
  s record;
  p record;
  v_live uuid;
  ok int := 0;
  fail int := 0;
  last_err text := '';
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT phase INTO v_phase FROM trip_private.trip_phase(p_trip, now());
  SELECT id INTO v_live FROM public.live_sessions WHERE trip_id = p_trip AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  FOR b IN SELECT sb.user_id FROM public.sandbox_bots sb
           JOIN public.trip_members m ON m.user_id = sb.user_id AND m.trip_id = p_trip AND m.status = 'approved'
           WHERE sb.trip_id = p_trip LOOP
    PERFORM trip_private.lab_become(b.user_id);
    FOR s IN SELECT x.* FROM public.trip_schedule x
             WHERE x.trip_id = p_trip AND (x.user_id IS NULL OR x.user_id = b.user_id)
               AND x.opens_at <= now() AND (x.closes_at IS NULL OR x.closes_at > now())
               AND x.kind NOT IN ('phase', 'call_night', 'crowning') LOOP
      BEGIN
        IF s.kind IN ('daily_discovery', 'daily_card') THEN
          PERFORM public.answer_daily(s.id, 0);
        ELSIF s.kind = 'journal_prompt' THEN
          PERFORM public.write_journal(s.id, 'A bot''s day: ate well, got lost, found a view. 🤖', 0);
        ELSIF s.kind = 'surprise_drop' THEN
          PERFORM public.submit_drop_proof(s.id, 0, NULL, 'Found it! 🤖');
        ELSE
          BEGIN PERFORM public.open_item(s.id); EXCEPTION WHEN others THEN NULL; END;
          PERFORM public.submit_proof(s.id, NULL, 'Done by a bot 🤖');
        END IF;
        ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM;
      END;
    END LOOP;
    FOR p IN SELECT c.id FROM public.crew_check(p_trip) c LOOP
      BEGIN PERFORM public.approve_proof(p.id); ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
    END LOOP;
    IF v_live IS NOT NULL THEN
      BEGIN
        PERFORM public.live_present(v_live, me);
        PERFORM public.live_vote_award(v_live, a, me) FROM unnest(ARRAY['best_overall', 'most_creative', 'best_story']) a;
        ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
    END IF;
    IF v_phase = 'baggage_claim' THEN
      BEGIN
        PERFORM public.answer_wrapup(p_trip, 'never_forget', 'The sunset from the castle 🤖');
        PERFORM public.heart_photo(p_trip, w.proof_id, true) FROM public.wrapup_board(p_trip) w WHERE NOT w.mine;
        ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  RETURN ok || ' actions, ' || fail || ' refused' || CASE WHEN fail > 0 THEN ' (' || left(last_err, 120) || ')' ELSE '' END;
END
$$;

REVOKE ALL ON FUNCTION trip_private.lab_engine_create(text, text, int, int), trip_private.lab_jump(uuid, text),
  trip_private.lab_engine_play(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.lab_engine_create(text, text, int, int), trip_private.lab_jump(uuid, text),
  trip_private.lab_engine_play(uuid) TO authenticated, service_role;
CREATE FUNCTION public.lab_engine_create(p_room text, p_mode text, p_size int, p_days int) RETURNS uuid
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.lab_engine_create(p_room, p_mode, p_size, p_days) $$;
CREATE FUNCTION public.lab_jump(p_trip uuid, p_phase text) RETURNS text
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.lab_jump(p_trip, p_phase) $$;
CREATE FUNCTION public.lab_engine_play(p_trip uuid) RETURNS text
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.lab_engine_play(p_trip) $$;
REVOKE ALL ON FUNCTION public.lab_engine_create(text, text, int, int), public.lab_jump(uuid, text),
  public.lab_engine_play(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lab_engine_create(text, text, int, int), public.lab_jump(uuid, text),
  public.lab_engine_play(uuid) TO authenticated, service_role;
