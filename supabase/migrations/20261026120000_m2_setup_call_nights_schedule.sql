-- M2-05 (server), M2-06 call nights, M2-12 schedule planner skeleton.
-- rollback: DROP FUNCTION public.create_trip_v2(jsonb), public.save_trip_draft(jsonb),
--   public.discard_trip_draft(), public.set_call_nights(uuid, jsonb) and their trip_private bodies,
--   trip_private.plan_trip(uuid), trip_private.desired_schedule(uuid), trip_private.trip_phase_windows(uuid),
--   trip_private.phase_windows(...); DROP TABLE public.trip_schedule, public.trip_drafts; restore phase_at
--   and mark_arrived from 20261026100000 / 20261026110000; re-create trigger trips_check_length.

-- The older 2–30 day length check is replaced by the room rules (1–14 days, 1–7 at home, one night
-- for Game Night; trips_room_rules).
DROP TRIGGER trips_check_length ON public.trips;

-- ---------------------------------------------------------------------------------------------
-- Phase windows: the four phases' boundaries. phase_at now reads them, so the planner and the
-- phase of the moment can't disagree (14_phase_engine.test.sql still runs every shared case).
CREATE FUNCTION trip_private.phase_windows(
  p_room text, p_start date, p_end date, p_preflight_days int, p_preflight_skipped boolean,
  p_home_tz text, p_trip_tz text, p_arrived_at timestamptz)
RETURNS TABLE(phase text, starts_at timestamptz, ends_at timestamptz, tz text)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  r jsonb := trip_private.room_rules(p_room);
  v_away text;
  v_pre int := CASE WHEN p_preflight_skipped THEN 0 ELSE greatest(0, coalesce(p_preflight_days, 0)) END;
  v_takeoff_day date;
  v_takeoff_start timestamptz;
  v_season_start timestamptz;
  v_season_end timestamptz;
  v_backup timestamptz;
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Unknown room %', p_room; END IF;
  IF (r->>'atHome')::boolean THEN
    -- Home time only; Takeoff = Home Missions the day before; Trip Season = experience days.
    v_takeoff_day := CASE WHEN r->>'takeoff' = 'none' THEN p_start ELSE p_start - 1 END;
    v_takeoff_start := v_takeoff_day::timestamp AT TIME ZONE p_home_tz;
    v_season_start := p_start::timestamp AT TIME ZONE p_home_tz;
    v_season_end := (p_end + 1)::timestamp AT TIME ZONE p_home_tz;
    RETURN QUERY VALUES
      ('preflight', (v_takeoff_day - v_pre)::timestamp AT TIME ZONE p_home_tz, v_takeoff_start, p_home_tz),
      ('takeoff', v_takeoff_start, v_season_start, p_home_tz),
      ('trip_season', v_season_start, v_season_end, p_home_tz),
      ('baggage_claim', v_season_end, (p_end + 8)::timestamp AT TIME ZONE p_home_tz, p_home_tz);
    RETURN;
  END IF;
  -- Home time until arrival; Trip Season from the tap or the backup (23:59 trip time, next night).
  v_away := coalesce(p_trip_tz, p_home_tz);
  v_takeoff_start := p_start::timestamp AT TIME ZONE p_home_tz;
  v_season_end := (p_end + 1)::timestamp AT TIME ZONE v_away;
  v_backup := ((p_start + 1) + time '23:59') AT TIME ZONE v_away;
  v_season_start := CASE WHEN p_arrived_at IS NULL THEN v_backup ELSE least(p_arrived_at, v_backup) END;
  v_season_start := least(greatest(v_season_start, v_takeoff_start), greatest(v_season_end, v_takeoff_start));
  RETURN QUERY VALUES
    ('preflight', (p_start - v_pre)::timestamp AT TIME ZONE p_home_tz, v_takeoff_start, p_home_tz),
    ('takeoff', v_takeoff_start, v_season_start, p_home_tz),
    ('trip_season', v_season_start, greatest(v_season_end, v_season_start), v_away),
    ('baggage_claim', greatest(v_season_end, v_season_start),
      greatest((p_end + 8)::timestamp AT TIME ZONE p_home_tz, v_season_end), p_home_tz);
END
$$;
REVOKE ALL ON FUNCTION trip_private.phase_windows(text, date, date, int, boolean, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.phase_windows(text, date, date, int, boolean, text, text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.phase_at(
  p_room text, p_start date, p_end date, p_preflight_days int, p_preflight_skipped boolean,
  p_home_tz text, p_trip_tz text, p_arrived_at timestamptz, p_setup_complete boolean, p_at timestamptz)
RETURNS TABLE(phase text, phase_starts_at timestamptz, phase_ends_at timestamptz, tz text, day_index int)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE w record; v_first timestamptz; v_last timestamptz;
BEGIN
  IF trip_private.room_rules(p_room) IS NULL THEN RAISE EXCEPTION 'Unknown room %', p_room; END IF;
  IF NOT p_setup_complete THEN
    RETURN QUERY SELECT 'setup'::text, NULL::timestamptz, NULL::timestamptz, p_home_tz, NULL::int;
    RETURN;
  END IF;
  FOR w IN SELECT * FROM trip_private.phase_windows(p_room, p_start, p_end, p_preflight_days,
                                                    p_preflight_skipped, p_home_tz, p_trip_tz, p_arrived_at) LOOP
    v_last := w.ends_at;
    CONTINUE WHEN w.ends_at <= w.starts_at;  -- empty phase (Skip, 0 days, a one-day trip)
    IF v_first IS NULL THEN
      v_first := w.starts_at;
      IF p_at < v_first THEN
        RETURN QUERY SELECT 'upcoming'::text, NULL::timestamptz, v_first, p_home_tz, NULL::int;
        RETURN;
      END IF;
    END IF;
    IF p_at >= w.starts_at AND p_at < w.ends_at THEN
      RETURN QUERY SELECT w.phase, w.starts_at, w.ends_at, w.tz,
        CASE WHEN w.phase = 'baggage_claim'  -- counted from the day after the trip, home time
          THEN greatest(1, (p_at AT TIME ZONE p_home_tz)::date - p_end)
          ELSE (p_at AT TIME ZONE w.tz)::date - (w.starts_at AT TIME ZONE w.tz)::date + 1 END;
      RETURN;
    END IF;
  END LOOP;
  RETURN QUERY SELECT 'archived'::text, v_last, NULL::timestamptz, p_home_tz, NULL::int;
END
$$;

CREATE FUNCTION trip_private.trip_phase_windows(p_trip uuid)
RETURNS TABLE(phase text, starts_at timestamptz, ends_at timestamptz, tz text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT w.* FROM public.trips t
  CROSS JOIN LATERAL trip_private.phase_windows(t.room, t.start_date, t.end_date, t.preflight_days,
    t.preflight_skipped, t.home_timezone, t.trip_timezone, t.arrived_at) w
  WHERE t.id = p_trip
$$;
REVOKE ALL ON FUNCTION trip_private.trip_phase_windows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.trip_phase_windows(uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Schedule (M2-12, dev-docs/03 §9). plan_trip writes the phase markers, call nights and the
-- crowning night; M3 adds the content kinds. It runs on every relevant change (triggers below),
-- never touches rows that have finished, and is idempotent.
CREATE TABLE public.trip_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('phase', 'call_night', 'crowning')),
  slot text NOT NULL DEFAULT '',          -- which one: the phase name, the call night id
  user_id uuid,                           -- per-player items (M3); NULL = the whole crew
  day date,                               -- local day it opens, in the zone it is measured in
  opens_at timestamptz NOT NULL,
  closes_at timestamptz,
  ref_id uuid,                            -- e.g. call_nights.id
  content_item_id uuid,                   -- M3
  tailored_text text,                     -- M3
  points int,                             -- M3
  revealed_at timestamptz,                -- M3
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (trip_id, kind, slot, user_id)
);
CREATE INDEX trip_schedule_trip_opens_idx ON public.trip_schedule (trip_id, opens_at);
ALTER TABLE public.trip_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read the schedule" ON public.trip_schedule FOR SELECT TO authenticated
  USING (trip_private.is_trip_member(trip_id, auth.uid()) AND (user_id IS NULL OR user_id = auth.uid()));
REVOKE ALL ON public.trip_schedule FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trip_schedule TO authenticated;
GRANT ALL ON public.trip_schedule TO service_role;
CREATE TRIGGER trip_schedule_archive_guard BEFORE INSERT OR UPDATE ON public.trip_schedule
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

CREATE FUNCTION trip_private.desired_schedule(p_trip uuid)
RETURNS TABLE(kind text, slot text, day date, opens_at timestamptz, closes_at timestamptz, ref_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT 'phase', w.phase, (w.starts_at AT TIME ZONE w.tz)::date, w.starts_at, w.ends_at, NULL::uuid
  FROM trip_private.trip_phase_windows(p_trip) w
  WHERE w.ends_at > w.starts_at
  UNION ALL
  SELECT 'call_night', c.id::text, (c.starts_at AT TIME ZONE t.home_timezone)::date, c.starts_at,
         c.starts_at + interval '3 hours', c.id
  FROM public.call_nights c JOIN public.trips t ON t.id = c.trip_id
  WHERE c.trip_id = p_trip
  UNION ALL
  SELECT 'crowning', '', (t.crowning_at AT TIME ZONE
           CASE WHEN (trip_private.room_rules(t.room)->>'atHome')::boolean THEN t.home_timezone
                ELSE coalesce(t.trip_timezone, t.home_timezone) END)::date,
         t.crowning_at, t.crowning_at + interval '4 hours', NULL::uuid
  FROM public.trips t
  WHERE t.id = p_trip AND t.crowning_at IS NOT NULL
$$;
REVOKE ALL ON FUNCTION trip_private.desired_schedule(uuid) FROM PUBLIC;

CREATE FUNCTION trip_private.plan_trip(p_trip uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_now timestamptz := now();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip AND rules_version = 2 AND setup_completed_at IS NOT NULL) THEN
    RETURN;
  END IF;
  -- Items that no longer exist and haven't opened yet go; anything that has opened stays.
  DELETE FROM public.trip_schedule s
  WHERE s.trip_id = p_trip AND s.kind IN ('phase', 'call_night', 'crowning') AND s.user_id IS NULL
    AND s.opens_at > v_now
    AND NOT EXISTS (SELECT 1 FROM trip_private.desired_schedule(p_trip) d WHERE d.kind = s.kind AND d.slot = s.slot);
  -- Add new items; move items that haven't finished yet.
  INSERT INTO public.trip_schedule AS s (trip_id, kind, slot, day, opens_at, closes_at, ref_id)
  SELECT p_trip, d.kind, d.slot, d.day, d.opens_at, d.closes_at, d.ref_id FROM trip_private.desired_schedule(p_trip) d
  ON CONFLICT (trip_id, kind, slot, user_id) DO UPDATE
    SET day = excluded.day, opens_at = excluded.opens_at, closes_at = excluded.closes_at,
        ref_id = excluded.ref_id, updated_at = v_now
    WHERE (s.closes_at IS NULL OR s.closes_at > v_now)
      AND (s.day, s.opens_at, s.closes_at, s.ref_id) IS DISTINCT FROM (excluded.day, excluded.opens_at, excluded.closes_at, excluded.ref_id);
END
$$;
REVOKE ALL ON FUNCTION trip_private.plan_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.plan_trip(uuid) TO service_role;

CREATE FUNCTION trip_private.replan_trip() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'trips' THEN
    PERFORM trip_private.plan_trip(NEW.id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM trip_private.plan_trip(OLD.trip_id);
  ELSE
    PERFORM trip_private.plan_trip(NEW.trip_id);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION trip_private.replan_trip() FROM PUBLIC;
CREATE TRIGGER trips_replan AFTER UPDATE OF start_date, end_date, preflight_days, preflight_skipped, home_timezone,
  trip_timezone, arrived_at, crowning_at, room, setup_completed_at ON public.trips
  FOR EACH ROW EXECUTE FUNCTION trip_private.replan_trip();
CREATE TRIGGER call_nights_replan AFTER INSERT OR UPDATE OR DELETE ON public.call_nights
  FOR EACH ROW EXECUTE FUNCTION trip_private.replan_trip();

-- ---------------------------------------------------------------------------------------------
-- Call nights (M2-06, R-204): up to 4, each inside Pre-Flight, with an optional call link and an
-- optional 2nd link for a split call. Nights that have passed are kept; the rest are replaced.
CREATE FUNCTION trip_private.set_call_nights(p_trip uuid, p_nights jsonb) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n jsonb; v_at timestamptz; w record; v_count int := 0;
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set call nights'; END IF;
  IF jsonb_typeof(coalesce(p_nights, '[]')) <> 'array' THEN RAISE EXCEPTION 'Check the call nights'; END IF;
  SELECT * INTO w FROM trip_private.trip_phase_windows(p_trip) x WHERE x.phase = 'preflight';
  DELETE FROM public.call_nights WHERE trip_id = p_trip AND starts_at > now();
  FOR n IN SELECT * FROM jsonb_array_elements(coalesce(p_nights, '[]')) LOOP
    BEGIN
      v_at := (n->>'startsAt')::timestamptz;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'Pick a date and time for each call night';
    END;
    IF v_at IS NULL THEN RAISE EXCEPTION 'Pick a date and time for each call night'; END IF;
    CONTINUE WHEN v_at <= now() AND EXISTS (SELECT 1 FROM public.call_nights WHERE trip_id = p_trip AND starts_at = v_at);
    IF v_at <= now() THEN RAISE EXCEPTION 'Call nights need to be in the future'; END IF;
    IF w.ends_at <= w.starts_at OR v_at < w.starts_at OR v_at >= w.ends_at THEN
      RAISE EXCEPTION 'Call nights happen during Pre-Flight, before takeoff day' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.call_nights (trip_id, starts_at, call_link, second_link, created_by)
    VALUES (p_trip, v_at, nullif(btrim(n->>'callLink'), ''), nullif(btrim(n->>'secondLink'), ''), auth.uid());
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_call_nights(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.set_call_nights(uuid, jsonb) TO authenticated, service_role;
CREATE FUNCTION public.set_call_nights(p_trip uuid, p_nights jsonb) RETURNS int
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_call_nights(p_trip, p_nights) $$;
REVOKE ALL ON FUNCTION public.set_call_nights(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_call_nights(uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Setup drafts (M2-05): the wizard saves after each screen so a refresh keeps the answers. One per
-- player; the trip itself is created when setup is finished. Off-app players' names never come
-- here (R-006): they stay on the Captain's device.
CREATE TABLE public.trip_drafts (
  user_id uuid PRIMARY KEY,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 20000
                             AND NOT data ? 'offlineNames'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own draft" ON public.trip_drafts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.trip_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trip_drafts TO authenticated;
GRANT ALL ON public.trip_drafts TO service_role;

CREATE FUNCTION trip_private.save_trip_draft(p_data jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  INSERT INTO public.trip_drafts (user_id, data) VALUES (auth.uid(), p_data)
  ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = now();
END $$;
CREATE FUNCTION trip_private.discard_trip_draft() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.trip_drafts WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION trip_private.save_trip_draft(jsonb), trip_private.discard_trip_draft() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.save_trip_draft(jsonb), trip_private.discard_trip_draft() TO authenticated, service_role;
CREATE FUNCTION public.save_trip_draft(p_data jsonb) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.save_trip_draft(p_data) $$;
CREATE FUNCTION public.discard_trip_draft() RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.discard_trip_draft() $$;
REVOKE ALL ON FUNCTION public.save_trip_draft(jsonb), public.discard_trip_draft() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_trip_draft(jsonb), public.discard_trip_draft() TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Create a trip in any room from the setup wizard (M2-05, R-201 – R-207). Whoever creates it is the
-- Captain (21+, R-904). Room limits are checked again by the triggers on every write.
-- p_setup keys: room, playMode, name, destination, country, state, city, lat, lng, placeId,
-- cultures, focuses, startDate, endDate, vibe, hasMinors, preflightDays, preflightSkipped,
-- callNights [{startsAt, callLink, secondLink}], crowningAt, crowningPlace, crowningCallLink,
-- homeTz, tripTz.
CREATE FUNCTION trip_private.create_trip_v2(p_setup jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s jsonb := coalesce(p_setup, '{}');
  v_room text := s->>'room';
  r jsonb := trip_private.room_rules(s->>'room');
  v_mode text := coalesce(s->>'playMode', 'crew');
  v_home text := btrim(coalesce(s->>'homeTz', ''));
  v_trip_tz text;
  v_start date;
  v_end date;
  v_today date;
  v_crowning timestamptz;
  v_vibe text := coalesce(s->>'vibe', 'chill');
  v_minors boolean := coalesce((s->>'hasMinors')::boolean, false);
  v_id uuid;
  v_season record;
  v_zone text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF coalesce(trip_private.age_of(auth.uid()), 0) < 21 THEN RAISE EXCEPTION 'Captains are 21+. Ask your crew''s Captain to invite you.'; END IF;
  IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'TripJunkies is invite-only during the private beta'; END IF;
  IF r IS NULL THEN RAISE EXCEPTION 'Choose a room'; END IF;
  IF NOT (r->'modes') ? v_mode THEN RAISE EXCEPTION 'Choose who''s playing'; END IF;
  IF length(btrim(coalesce(s->>'name', ''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Give your trip a name'; END IF;
  IF length(btrim(coalesce(s->>'destination', ''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Choose where you''re going'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_home) THEN RAISE EXCEPTION 'Check your home time zone'; END IF;
  v_trip_tz := CASE WHEN (r->>'atHome')::boolean THEN v_home ELSE coalesce(nullif(btrim(s->>'tripTz'), ''), v_home) END;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_trip_tz) THEN RAISE EXCEPTION 'Check the trip time zone'; END IF;
  BEGIN
    v_start := (s->>'startDate')::date;
    v_end := (s->>'endDate')::date;
    v_crowning := (s->>'crowningAt')::timestamptz;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'Check your dates';
  END;
  IF v_start IS NULL OR v_end IS NULL OR v_end < v_start THEN RAISE EXCEPTION 'Tap your first and last day'; END IF;
  v_today := (now() AT TIME ZONE v_home)::date;
  IF v_end < v_today OR v_start > v_today + 365 THEN RAISE EXCEPTION 'Choose dates that are still ahead of you (within a year)'; END IF;
  -- At home, Home Missions are the day before, so the room is made at least a day ahead; same-day
  -- plans use the one-night Game Night (R-110).
  IF (r->>'takeoff') = 'home_missions' AND v_start <= v_today THEN
    RAISE EXCEPTION 'At-home experiences start tomorrow at the earliest. For tonight, start a Game Night.';
  END IF;
  IF v_vibe NOT IN ('family', 'chill', 'party') THEN RAISE EXCEPTION 'Choose a vibe'; END IF;
  IF v_minors AND v_vibe = 'party' THEN RAISE EXCEPTION 'Trips with players under 18 can''t use the party vibe'; END IF;
  IF (r->>'pointsEnabled')::boolean AND v_crowning IS NULL THEN
    RAISE EXCEPTION 'Pick the % (date and time)', lower(r->>'crowningLabel');
  END IF;

  INSERT INTO public.trips (
    name, destination, start_date, end_date, home_timezone, trip_timezone, join_code,
    room, play_mode, preflight_days, preflight_skipped, cultures, focuses,
    passport_country, passport_state, passport_city, dest_lat, dest_lng, dest_place_id,
    vibe, has_minors, crowning_at, crowning_place, crowning_call_link, max_squad,
    join_code_enabled, setup_completed_at,
    -- read by the screens that predate the engine (replaced in M2-09 / M3)
    kind, play_arrangement, season_rule)
  VALUES (
    btrim(s->>'name'), btrim(s->>'destination'), v_start, v_end, v_home, v_trip_tz, public.new_trip_code(),
    v_room, v_mode, coalesce((s->>'preflightDays')::int, 0), coalesce((s->>'preflightSkipped')::boolean, false),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(s->'cultures')), '{}'),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(s->'focuses')), '{}'),
    nullif(upper(btrim(s->>'country')), ''), nullif(btrim(s->>'state'), ''), nullif(btrim(s->>'city'), ''),
    (s->>'lat')::double precision, (s->>'lng')::double precision, nullif(btrim(s->>'placeId'), ''),
    v_vibe, v_minors, v_crowning, nullif(btrim(s->>'crowningPlace'), ''), nullif(btrim(s->>'crowningCallLink'), ''),
    greatest(2, (r->>'maxCrew')::int), v_mode = 'crew', NULL,
    CASE WHEN (r->>'atHome')::boolean THEN 'at_home' ELSE 'trip' END,
    CASE v_mode WHEN 'crew' THEN 'online' ELSE v_mode END, 'a2c')
  RETURNING id INTO v_id;
  INSERT INTO public.trip_members (trip_id, user_id, role, status, approved_at)
  VALUES (v_id, auth.uid(), 'captain', 'approved', now());

  -- The crowning / finale night falls inside Trip Season's days (R-205).
  IF v_crowning IS NOT NULL THEN
    SELECT * INTO v_season FROM trip_private.trip_phase_windows(v_id) x WHERE x.phase = 'trip_season';
    v_zone := v_season.tz;
    IF (v_crowning AT TIME ZONE v_zone)::date NOT BETWEEN v_start AND v_end THEN
      RAISE EXCEPTION 'The % has to be on one of the trip days', lower(r->>'crowningLabel');
    END IF;
  END IF;

  IF jsonb_array_length(coalesce(s->'callNights', '[]')) > 0 THEN
    PERFORM trip_private.set_call_nights(v_id, s->'callNights');
  END IF;
  UPDATE public.trips SET setup_completed_at = now() WHERE id = v_id;  -- plans the schedule
  DELETE FROM public.trip_drafts WHERE user_id = auth.uid();
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION trip_private.create_trip_v2(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.create_trip_v2(jsonb) TO authenticated, service_role;
CREATE FUNCTION public.create_trip_v2(p_setup jsonb) RETURNS uuid
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.create_trip_v2(p_setup) $$;
REVOKE ALL ON FUNCTION public.create_trip_v2(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trip_v2(jsonb) TO authenticated, service_role;
