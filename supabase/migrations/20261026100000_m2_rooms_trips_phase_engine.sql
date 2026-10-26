-- M2-01 / M2-02 / M2-03: room rules, the new trip columns, call nights, and the phase engine.
-- rollback: DROP FUNCTION public.trip_phase(uuid, timestamptz), trip_private.my_trip_phase(uuid, timestamptz),
--   trip_private.trip_phase(uuid, timestamptz), trip_private.phase_at(text, date, date, int, boolean, text, text,
--   timestamptz, boolean, timestamptz), trip_private.room_rules(text); DROP TABLE public.call_nights;
--   ALTER TABLE public.trips RENAME arrived_at TO departure_confirmed_at, DROP COLUMN room, ... (see below).

-- ---------------------------------------------------------------------------------------------
-- Room rules (M2-01). Same values as src/features/trip/rooms.ts; 13_room_rules.test.sql compares
-- both against supabase/tests/fixtures/rooms.json. Change all three together.
CREATE FUNCTION trip_private.room_rules(p_room text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_room
    WHEN 'trip' THEN '{"atHome":false,"contentTags":["trip"],"crowningLabel":"Crowning night","dailyQuest":false,"id":"trip","journal":false,"mainDays":{"max":14,"min":1},"maxCallNights":4,"maxCrew":12,"maxFocuses":0,"modes":["solo","crew","offline"],"photosKept":{"group":6,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":2,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"airport_missions","tripSeasonStart":"arrival_button"}'::jsonb
    WHEN 'window_seat' THEN '{"atHome":false,"contentTags":["trip","solo"],"crowningLabel":"Crowning night","dailyQuest":true,"id":"window_seat","journal":true,"mainDays":{"max":14,"min":1},"maxCallNights":4,"maxCrew":4,"maxFocuses":0,"modes":["solo","crew"],"photosKept":{"group":6,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":5,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"airport_missions","tripSeasonStart":"arrival_button"}'::jsonb
    WHEN 'explore_culture' THEN '{"atHome":true,"contentTags":["at_home"],"crowningLabel":"Finale night","dailyQuest":false,"id":"explore_culture","journal":false,"mainDays":{"max":7,"min":1},"maxCallNights":4,"maxCrew":12,"maxFocuses":2,"modes":["solo","crew","offline"],"photosKept":{"group":6,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":2,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"home_missions","tripSeasonStart":"first_experience_day"}'::jsonb
    WHEN 'show_culture' THEN '{"atHome":true,"contentTags":["at_home"],"crowningLabel":"Finale night","dailyQuest":false,"id":"show_culture","journal":false,"mainDays":{"max":7,"min":1},"maxCallNights":4,"maxCrew":12,"maxFocuses":0,"modes":["solo","crew","offline"],"photosKept":{"group":6,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":2,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"home_missions","tripSeasonStart":"first_experience_day"}'::jsonb
    WHEN 'game_night' THEN '{"atHome":true,"contentTags":["at_home","trip"],"crowningLabel":"Game night","dailyQuest":false,"id":"game_night","journal":false,"mainDays":{"max":1,"min":1},"maxCallNights":0,"maxCrew":12,"maxFocuses":0,"modes":["crew","offline"],"photosKept":{"group":0,"solo":0},"pointsEnabled":false,"postcardPicksPerPlayer":0,"preFlightDays":{"max":0,"min":0,"skippable":false},"takeoff":"none","tripSeasonStart":"first_experience_day"}'::jsonb
  END
$$;
REVOKE ALL ON FUNCTION trip_private.room_rules(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.room_rules(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- trips for the new engine (M2-02). The older columns (kind, a2e_room, play_arrangement,
-- season_rule, game_start, finale_*) stay for the screens that still read them; they go as those
-- screens are replaced. No trips exist yet (fresh start), so nothing is backfilled.
ALTER TABLE public.trips RENAME COLUMN departure_confirmed_at TO arrived_at;
ALTER TABLE public.trips
  ADD COLUMN room text NOT NULL DEFAULT 'trip' CHECK (room IN ('trip', 'window_seat', 'explore_culture', 'show_culture', 'game_night')),
  ADD COLUMN play_mode text NOT NULL DEFAULT 'crew' CHECK (play_mode IN ('solo', 'crew', 'offline')),
  ADD COLUMN preflight_days smallint NOT NULL DEFAULT 0 CHECK (preflight_days BETWEEN 0 AND 10),
  ADD COLUMN preflight_skipped boolean NOT NULL DEFAULT false,
  ADD COLUMN cultures text[] NOT NULL DEFAULT '{}' CHECK (cardinality(cultures) <= 2),
  ADD COLUMN focuses text[] NOT NULL DEFAULT '{}' CHECK (cardinality(focuses) <= 2),
  ADD COLUMN dest_lat double precision CHECK (dest_lat BETWEEN -90 AND 90),
  ADD COLUMN dest_lng double precision CHECK (dest_lng BETWEEN -180 AND 180),
  ADD COLUMN dest_place_id text CHECK (length(dest_place_id) <= 200),
  ADD COLUMN arrived_by uuid,
  ADD COLUMN crowning_at timestamptz,
  ADD COLUMN crowning_place text CHECK (length(crowning_place) <= 120),
  ADD COLUMN crowning_call_link text
    CHECK (crowning_call_link IS NULL OR (length(crowning_call_link) <= 500 AND crowning_call_link ~* '^https://')),
  ADD COLUMN locked_at timestamptz,
  -- NULL while the Captain is still in the setup wizard (phase 'setup'); older create paths fill it.
  ADD COLUMN setup_completed_at timestamptz DEFAULT now();

-- The two functions that read the renamed column.
CREATE OR REPLACE FUNCTION trip_private.confirm_departure(p_trip uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can confirm arrival'; END IF;
 UPDATE public.trips SET arrived_at=now(), arrived_by=auth.uid() WHERE id=p_trip AND play_arrangement IS NOT NULL AND is_sandbox=false AND arrived_at IS NULL AND start_date <= trip_private.trip_today(p_trip);
 IF NOT FOUND THEN RAISE EXCEPTION 'Arrival can only be confirmed once, on or after your first trip day'; END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.trip_season_start_at(p_trip uuid) RETURNS timestamp with time zone
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    t.arrived_at,
    (t.start_date + 1 + time '23:59') AT TIME ZONE coalesce(t.trip_timezone, t.home_timezone)
  )
  FROM public.trips t
  WHERE t.id = p_trip
$$;

-- ---------------------------------------------------------------------------------------------
-- Call nights (M2-02 table; M2-06 adds the write function). Up to 4 per trip, all in Pre-Flight.
CREATE TABLE public.call_nights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  call_link text CHECK (call_link IS NULL OR (length(call_link) <= 500 AND call_link ~* '^https://')),
  second_link text CHECK (second_link IS NULL OR (length(second_link) <= 500 AND second_link ~* '^https://')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, starts_at)
);
CREATE INDEX call_nights_trip_idx ON public.call_nights (trip_id, starts_at);
ALTER TABLE public.call_nights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read call nights" ON public.call_nights FOR SELECT TO authenticated
  USING (trip_private.is_trip_member(trip_id, auth.uid()));
REVOKE ALL ON public.call_nights FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.call_nights TO authenticated;
GRANT ALL ON public.call_nights TO service_role;
CREATE TRIGGER call_nights_archive_guard BEFORE INSERT OR UPDATE ON public.call_nights
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- ---------------------------------------------------------------------------------------------
-- Phase engine (M2-03, dev-docs/03 §6). phase_at is pure: everything comes in as arguments and the
-- instant is p_at, so tests and the Test Lab pass any moment. src/features/trip/phase.ts mirrors it
-- for display; 14_phase_engine.test.sql runs the shared cases in supabase/tests/fixtures/phases.json.
CREATE FUNCTION trip_private.phase_at(
  p_room text, p_start date, p_end date, p_preflight_days int, p_preflight_skipped boolean,
  p_home_tz text, p_trip_tz text, p_arrived_at timestamptz, p_setup_complete boolean, p_at timestamptz)
RETURNS TABLE(phase text, phase_starts_at timestamptz, phase_ends_at timestamptz, tz text, day_index int)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  r jsonb := trip_private.room_rules(p_room);
  v_at_home boolean;
  v_away text;
  v_pre int := CASE WHEN p_preflight_skipped THEN 0 ELSE greatest(0, coalesce(p_preflight_days, 0)) END;
  v_takeoff_day date;
  v_takeoff_start timestamptz;
  v_season_start timestamptz;
  v_season_end timestamptz;
  v_backup timestamptz;
  s timestamptz[];
  e timestamptz[];
  zones text[];
  names text[] := ARRAY['preflight', 'takeoff', 'trip_season', 'baggage_claim'];
  i int;
BEGIN
  IF r IS NULL THEN RAISE EXCEPTION 'Unknown room %', p_room; END IF;
  IF NOT p_setup_complete THEN
    RETURN QUERY SELECT 'setup'::text, NULL::timestamptz, NULL::timestamptz, p_home_tz, NULL::int;
    RETURN;
  END IF;
  v_at_home := (r->>'atHome')::boolean;
  v_away := CASE WHEN v_at_home THEN p_home_tz ELSE coalesce(p_trip_tz, p_home_tz) END;

  IF v_at_home THEN
    -- Home time only; Takeoff = Home Missions the day before; Trip Season = experience days.
    v_takeoff_day := CASE WHEN r->>'takeoff' = 'none' THEN p_start ELSE p_start - 1 END;
    v_takeoff_start := v_takeoff_day::timestamp AT TIME ZONE p_home_tz;
    v_season_start := p_start::timestamp AT TIME ZONE p_home_tz;
    v_season_end := (p_end + 1)::timestamp AT TIME ZONE p_home_tz;
    s := ARRAY[(v_takeoff_day - v_pre)::timestamp AT TIME ZONE p_home_tz, v_takeoff_start, v_season_start, v_season_end];
    e := ARRAY[v_takeoff_start, v_season_start, v_season_end, (p_end + 8)::timestamp AT TIME ZONE p_home_tz];
    zones := ARRAY[p_home_tz, p_home_tz, p_home_tz, p_home_tz];
  ELSE
    -- Home time until arrival; Trip Season from the tap or the backup (23:59 trip time, next night).
    v_takeoff_start := p_start::timestamp AT TIME ZONE p_home_tz;
    v_season_end := (p_end + 1)::timestamp AT TIME ZONE v_away;
    v_backup := ((p_start + 1) + time '23:59') AT TIME ZONE v_away;
    v_season_start := CASE WHEN p_arrived_at IS NULL THEN v_backup ELSE least(p_arrived_at, v_backup) END;
    v_season_start := least(greatest(v_season_start, v_takeoff_start), greatest(v_season_end, v_takeoff_start));
    s := ARRAY[(p_start - v_pre)::timestamp AT TIME ZONE p_home_tz, v_takeoff_start, v_season_start,
               greatest(v_season_end, v_season_start)];
    e := ARRAY[v_takeoff_start, v_season_start, greatest(v_season_end, v_season_start),
               greatest((p_end + 8)::timestamp AT TIME ZONE p_home_tz, v_season_end)];
    zones := ARRAY[p_home_tz, p_home_tz, v_away, p_home_tz];
  END IF;

  FOR i IN 1..4 LOOP
    IF e[i] > s[i] THEN
      IF p_at < s[i] THEN
        RETURN QUERY SELECT 'upcoming'::text, NULL::timestamptz, s[i], p_home_tz, NULL::int;
        RETURN;
      END IF;
      EXIT;
    END IF;
  END LOOP;
  FOR i IN 1..4 LOOP
    IF e[i] > s[i] AND p_at >= s[i] AND p_at < e[i] THEN
      RETURN QUERY SELECT names[i], s[i], e[i], zones[i],
        CASE WHEN i = 4  -- Baggage Claim days count from the day after the trip, in home time
          THEN greatest(1, (p_at AT TIME ZONE p_home_tz)::date - p_end)
          ELSE (p_at AT TIME ZONE zones[i])::date - (s[i] AT TIME ZONE zones[i])::date + 1 END;
      RETURN;
    END IF;
  END LOOP;
  RETURN QUERY SELECT 'archived'::text, e[4], NULL::timestamptz, p_home_tz, NULL::int;
END
$$;
REVOKE ALL ON FUNCTION trip_private.phase_at(text, date, date, int, boolean, text, text, timestamptz, boolean, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.phase_at(text, date, date, int, boolean, text, text, timestamptz, boolean, timestamptz) TO authenticated, service_role;

-- The phase of one trip. Server functions call this; it does no access check of its own.
CREATE FUNCTION trip_private.trip_phase(p_trip uuid, p_at timestamptz DEFAULT now())
RETURNS TABLE(phase text, phase_starts_at timestamptz, phase_ends_at timestamptz, tz text, day_index int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.*
  FROM public.trips t
  CROSS JOIN LATERAL trip_private.phase_at(t.room, t.start_date, t.end_date, t.preflight_days,
    t.preflight_skipped, t.home_timezone, t.trip_timezone, t.arrived_at,
    t.setup_completed_at IS NOT NULL, p_at) p
  WHERE t.id = p_trip
$$;
REVOKE ALL ON FUNCTION trip_private.trip_phase(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.trip_phase(uuid, timestamptz) TO service_role;

-- For members: the trip's phase now, or at any instant (Test Lab time travel, countdowns).
CREATE FUNCTION trip_private.my_trip_phase(p_trip uuid, p_at timestamptz)
RETURNS TABLE(phase text, phase_starts_at timestamptz, phase_ends_at timestamptz, tz text, day_index int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN QUERY SELECT * FROM trip_private.trip_phase(p_trip, coalesce(p_at, now()));
END
$$;
REVOKE ALL ON FUNCTION trip_private.my_trip_phase(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.my_trip_phase(uuid, timestamptz) TO authenticated, service_role;

CREATE FUNCTION public.trip_phase(p_trip uuid, p_at timestamptz DEFAULT NULL)
RETURNS TABLE(phase text, phase_starts_at timestamptz, phase_ends_at timestamptz, tz text, day_index int)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.my_trip_phase(p_trip, p_at) $$;
REVOKE ALL ON FUNCTION public.trip_phase(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trip_phase(uuid, timestamptz) TO authenticated, service_role;
