-- M3-02 content library and M3-03 schedule planner for every content kind (dev-docs/03 §9).
-- plan_trip now also lays out Daily Discovery, Daily Cards, sealed quests, Showcase, Airport / Home
-- Missions, Surprise Drops, trip quests and Window Seat quests + journal prompts, and deals content
-- to each. Content text stays hidden until the item opens (my_schedule).
-- rollback: DROP FUNCTION public.my_schedule(uuid), trip_private.my_schedule(uuid, timestamptz),
--   trip_private.fill_schedule_content(uuid), trip_private.pick_content(uuid, text, text, text),
--   trip_private.content_kinds(text, text),
--   trip_private.content_fits(public.content_items, public.trips), trip_private.tailor_text(text, public.trips),
--   trip_private.schedule_hash(text); DROP TRIGGER trip_members_replan ON public.trip_members;
--   restore desired_schedule / plan_trip from 20261026120000; ALTER TABLE public.trip_schedule DROP COLUMN variant;
--   restore its kind check and SELECT grant; DROP TABLE public.content_items.

-- ---------------------------------------------------------------------------------------------
-- Content library (M3-02). Tags decide where an item can go: rooms, modes (trip | at_home | solo,
-- R-007), focus (R-363), culture, vibe, min_age, alcohol. {destination}, {city}, {country} and
-- {culture} are filled in when the schedule is planned. Seeded by scripts/content/build-seed.py.
CREATE TABLE public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('daily_discovery', 'daily_card', 'sealed_quest', 'showcase', 'airport_mission',
    'home_mission', 'drop_bingo', 'drop_scavenger', 'drop_speed', 'drop_photo', 'trip_quest', 'ws_quest',
    'journal_prompt', 'wrapup_question', 'flight_game')),
  rooms text[] NOT NULL CHECK (rooms <@ ARRAY['trip', 'window_seat', 'explore_culture', 'show_culture', 'game_night']),
  modes text[] NOT NULL CHECK (modes <@ ARRAY['trip', 'at_home', 'solo'] AND cardinality(modes) > 0),
  focus text CHECK (focus IN ('food', 'music', 'language', 'fashion', 'holidays', 'history', 'art', 'games',
    'manners', 'folklore', 'film')),
  culture text,
  vibe text,
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  min_age int NOT NULL DEFAULT 13 CHECK (min_age IN (13, 18, 21)),
  alcohol boolean NOT NULL DEFAULT false,
  title text CHECK (length(title) <= 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  insight text CHECK (length(insight) <= 500),
  choices text[] NOT NULL DEFAULT '{}' CHECK (cardinality(choices) <= 6),   -- a question's options
  answer int CHECK (answer >= 0 AND answer < cardinality(choices)),         -- index of the right one, if any
  items text[] NOT NULL DEFAULT '{}' CHECK (cardinality(items) <= 16),      -- Bingo squares, Scavenger finds
  locale text NOT NULL DEFAULT 'en',
  source text NOT NULL DEFAULT 'curated',
  source_ref text NOT NULL DEFAULT gen_random_uuid()::text,
  reviewed boolean NOT NULL DEFAULT false,   -- founder has checked the wording (M1-11 candidates start false)
  review_note text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_ref),
  CHECK (trip_private.content_text_safe(coalesce(title, '') || ' ' || body || ' ' || coalesce(insight, '')
                                        || ' ' || array_to_string(items, ' ') || ' ' || array_to_string(choices, ' ')))
);
CREATE INDEX content_items_kind_idx ON public.content_items (kind) WHERE active;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
-- No client access: players see content only through my_schedule, once an item opens.
REVOKE ALL ON public.content_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.content_items TO service_role;

-- ---------------------------------------------------------------------------------------------
-- trip_schedule for the content kinds. variant: question / fact days for Daily Discovery, the game
-- of a Surprise Drop, the mission slot. content_item_id and tailored_text are not readable by
-- clients; my_schedule returns the text once the item opens.
ALTER TABLE public.trip_schedule DROP CONSTRAINT trip_schedule_kind_check;
ALTER TABLE public.trip_schedule ADD CONSTRAINT trip_schedule_kind_check CHECK (kind IN ('phase', 'call_night', 'crowning',
  'daily_discovery', 'daily_card', 'sealed_quest', 'showcase', 'airport_mission', 'home_mission', 'surprise_drop',
  'trip_quest', 'ws_quest', 'journal_prompt'));
ALTER TABLE public.trip_schedule
  ADD COLUMN variant text,
  ADD CONSTRAINT trip_schedule_content_fk FOREIGN KEY (content_item_id) REFERENCES public.content_items(id),
  ADD CONSTRAINT trip_schedule_text_safe CHECK (trip_private.content_text_safe(tailored_text));
REVOKE SELECT ON public.trip_schedule FROM authenticated;
GRANT SELECT (id, trip_id, kind, slot, user_id, day, opens_at, closes_at, ref_id, points, revealed_at, variant,
              created_at, updated_at) ON public.trip_schedule TO authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers. schedule_hash gives the planner stable "random" choices: the same trip always gets the
-- same drop days, open times and content (M3-03: deterministic given a seed; the seed is the trip id).
CREATE FUNCTION trip_private.schedule_hash(p_text text) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT abs(hashtextextended(p_text, 0)) $$;

CREATE FUNCTION trip_private.tailor_text(p_text text, t public.trips) RETURNS text
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT replace(replace(replace(replace(p_text,
    '{destination}', coalesce(nullif(t.passport_city, ''), nullif(split_part(t.destination, ',', 1), ''), 'your destination')),
    '{city}', coalesce(nullif(t.passport_city, ''), nullif(split_part(t.destination, ',', 1), ''), 'your city')),
    '{country}', coalesce(nullif(btrim(reverse(split_part(reverse(t.destination), ',', 1))), ''), 'the country')),
    '{culture}', coalesce(t.cultures[1], nullif(btrim(reverse(split_part(reverse(t.destination), ',', 1))), ''), 'this culture'))
$$;

-- Does this item suit this trip? Room, mode (an at-home room never gets an at-a-place item, R-007),
-- focuses and culture (R-361), age (has_minors: 13+ items only), and no alcohol items in the schedule.
CREATE FUNCTION trip_private.content_fits(c public.content_items, t public.trips) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT c.active AND t.room = ANY (c.rooms)
    AND CASE WHEN (trip_private.room_rules(t.room)->>'atHome')::boolean THEN 'at_home' = ANY (c.modes)
             ELSE 'trip' = ANY (c.modes) OR ('solo' = ANY (c.modes) AND (t.play_mode = 'solo' OR t.room = 'window_seat')) END
    AND (c.focus IS NULL OR cardinality(t.focuses) = 0 OR c.focus = ANY (t.focuses))
    AND (c.culture IS NULL OR lower(c.culture) = ANY (SELECT lower(x) FROM unnest(t.cultures) x)
         OR lower(t.destination) LIKE '%' || lower(c.culture) || '%')
    AND c.min_age <= CASE WHEN t.has_minors THEN 13 ELSE 18 END
    AND NOT c.alcohol
$$;

-- Which library kinds can fill a schedule kind.
CREATE FUNCTION trip_private.content_kinds(p_kind text, p_variant text) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_kind
    WHEN 'surprise_drop' THEN ARRAY['drop_' || p_variant]
    WHEN 'trip_quest' THEN ARRAY['trip_quest', 'ws_quest', 'sealed_quest']
    WHEN 'ws_quest' THEN ARRAY['ws_quest', 'trip_quest']
    ELSE ARRAY[p_kind] END
$$;

-- Deal one item: the least-used fitting item in this trip (so nobody repeats while there's fresh
-- content), preferring the trip's vibe, the variant's shape (question days need choices) and a
-- focus match; ties broken by the stable hash.
CREATE FUNCTION trip_private.pick_content(p_trip uuid, p_kind text, p_variant text, p_seed text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT c.id
  FROM public.trips t
  JOIN public.content_items c ON c.kind = ANY (trip_private.content_kinds(p_kind, p_variant)) AND trip_private.content_fits(c, t)
  WHERE t.id = p_trip
    AND (p_kind <> 'daily_discovery' OR (p_variant = 'question') = (cardinality(c.choices) > 0))
    AND (p_kind <> 'surprise_drop' OR p_variant IN ('speed', 'photo') OR cardinality(c.items) > 0)
  ORDER BY (SELECT count(*) FROM public.trip_schedule s WHERE s.trip_id = p_trip AND s.content_item_id = c.id),
           (c.vibe IS NOT NULL AND c.vibe = t.vibe) DESC,
           (c.focus IS NOT NULL AND c.focus = ANY (t.focuses)) DESC,
           (c.culture IS NOT NULL) DESC,
           trip_private.schedule_hash(p_seed || c.id::text)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION trip_private.pick_content(uuid, text, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- The schedule a trip should have right now. Content kinds only for rooms with play (not the
-- one-night Game Night); per-player items for every approved player.
DROP FUNCTION trip_private.desired_schedule(uuid);
CREATE FUNCTION trip_private.desired_schedule(p_trip uuid)
RETURNS TABLE(kind text, slot text, user_id uuid, day date, opens_at timestamptz, closes_at timestamptz,
              ref_id uuid, variant text, points int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.trips;
  r jsonb;
  v_home boolean;
  pre record; tko record; ssn record;
  v_seed text := p_trip::text;
  v_players uuid[];
  v_d date;
  v_i int;
  v_days date[];
  v_drops int;
  v_types text[];
  v_last_night timestamptz;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip;
  IF NOT FOUND THEN RETURN; END IF;
  r := trip_private.room_rules(t.room);
  v_home := (r->>'atHome')::boolean;

  -- Phase markers, call nights and the crowning night (M2-12).
  RETURN QUERY
    SELECT 'phase'::text, w.phase, NULL::uuid, (w.starts_at AT TIME ZONE w.tz)::date, w.starts_at, w.ends_at,
           NULL::uuid, NULL::text, NULL::int
    FROM trip_private.trip_phase_windows(p_trip) w WHERE w.ends_at > w.starts_at;
  RETURN QUERY
    SELECT 'call_night'::text, c.id::text, NULL::uuid, (c.starts_at AT TIME ZONE t.home_timezone)::date, c.starts_at,
           c.starts_at + interval '3 hours', c.id, NULL::text, NULL::int
    FROM public.call_nights c WHERE c.trip_id = p_trip;
  IF t.crowning_at IS NOT NULL THEN
    RETURN QUERY SELECT 'crowning'::text, ''::text, NULL::uuid,
      (t.crowning_at AT TIME ZONE CASE WHEN v_home THEN t.home_timezone ELSE coalesce(t.trip_timezone, t.home_timezone) END)::date,
      t.crowning_at, t.crowning_at + interval '4 hours', NULL::uuid, NULL::text, NULL::int;
  END IF;

  IF t.room = 'game_night' THEN RETURN; END IF;

  SELECT * INTO pre FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'preflight';
  SELECT * INTO tko FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'takeoff';
  SELECT * INTO ssn FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'trip_season';
  SELECT coalesce(array_agg(m.user_id ORDER BY m.user_id), '{}') INTO v_players
  FROM public.trip_members m WHERE m.trip_id = p_trip AND m.status = 'approved';

  -- Pre-Flight: Daily Discovery (Home) and Daily Card (Play) every day; question days every other
  -- day from day 1 (Q22). Sealed quests 3 days before each call night (R-321); one Showcase each.
  IF pre.ends_at > pre.starts_at THEN
    v_i := 0;
    FOR v_d IN SELECT generate_series((pre.starts_at AT TIME ZONE pre.tz)::date, (pre.ends_at AT TIME ZONE pre.tz)::date - 1, interval '1 day')::date LOOP
      RETURN QUERY SELECT 'daily_discovery'::text, v_d::text, NULL::uuid, v_d, v_d::timestamp AT TIME ZONE pre.tz,
        (v_d + 1)::timestamp AT TIME ZONE pre.tz, NULL::uuid, CASE WHEN v_i % 2 = 0 THEN 'question' ELSE 'fact' END, NULL::int;
      RETURN QUERY SELECT 'daily_card'::text, v_d::text, NULL::uuid, v_d, v_d::timestamp AT TIME ZONE pre.tz,
        (v_d + 1)::timestamp AT TIME ZONE pre.tz, NULL::uuid, NULL::text, NULL::int;
      v_i := v_i + 1;
    END LOOP;
    IF t.play_mode <> 'offline' THEN
      RETURN QUERY
        SELECT 'sealed_quest'::text, c.id::text, p.uid, (greatest(c.starts_at - interval '3 days', pre.starts_at) AT TIME ZONE pre.tz)::date,
               greatest(c.starts_at - interval '3 days', pre.starts_at), c.starts_at + interval '3 hours', c.id, NULL::text, NULL::int
        FROM public.call_nights c CROSS JOIN unnest(v_players) p(uid)
        WHERE c.trip_id = p_trip AND c.starts_at >= pre.starts_at AND c.starts_at < pre.ends_at;
      SELECT max(c.starts_at) + interval '3 hours' INTO v_last_night FROM public.call_nights c WHERE c.trip_id = p_trip;
      RETURN QUERY
        SELECT 'showcase'::text, ''::text, p.uid, (pre.starts_at AT TIME ZONE pre.tz)::date, pre.starts_at,
               greatest(coalesce(v_last_night, pre.ends_at), pre.ends_at), NULL::uuid, NULL::text, 20
        FROM unnest(v_players) p(uid);
    END IF;
  END IF;

  IF t.play_mode = 'offline' THEN RETURN; END IF;

  -- Takeoff: 3 Airport Missions (Home Missions at home), 4 points each, proof until Trip Season
  -- starts; 12 in all (R-331 – R-333).
  IF tko.ends_at > tko.starts_at AND r->>'takeoff' <> 'none' THEN
    RETURN QUERY
      SELECT CASE WHEN v_home THEN 'home_mission' ELSE 'airport_mission' END, n::text, p.uid,
             (tko.starts_at AT TIME ZONE tko.tz)::date, tko.starts_at, ssn.starts_at, NULL::uuid, n::text, 4
      FROM unnest(v_players) p(uid) CROSS JOIN generate_series(1, 3) n;
  END IF;

  IF NOT (ssn.ends_at > ssn.starts_at) THEN RETURN; END IF;
  SELECT array_agg(d::date ORDER BY d) INTO v_days
  FROM generate_series((ssn.starts_at AT TIME ZONE ssn.tz)::date, (ssn.ends_at AT TIME ZONE ssn.tz)::date - 1, interval '1 day') d;

  -- Trip Season: Daily Discovery every day (R-341), question days every other day from day 1.
  FOR v_i IN 1..coalesce(cardinality(v_days), 0) LOOP
    v_d := v_days[v_i];
    RETURN QUERY SELECT 'daily_discovery'::text, v_d::text, NULL::uuid, v_d,
      greatest(v_d::timestamp AT TIME ZONE ssn.tz, ssn.starts_at), (v_d + 1)::timestamp AT TIME ZONE ssn.tz,
      NULL::uuid, CASE WHEN v_i % 2 = 1 THEN 'question' ELSE 'fact' END, NULL::int;
  END LOOP;

  IF v_home THEN RETURN; END IF;

  -- Surprise Drops (R-342, Q27): about one every 2–3 days (4-day trip ≈ 2, 10-day ≈ 4–5) on
  -- stored random days after arrival day, opening at a random time 9–11 AM trip time for 24h.
  -- The four games take turns so two drops in a row are different.
  v_drops := least(greatest(cardinality(v_days) - 1, 0), round((t.end_date - t.start_date + 1) * 0.45)::int);
  SELECT array_agg(g ORDER BY trip_private.schedule_hash(v_seed || g)) INTO v_types
  FROM unnest(ARRAY['bingo', 'scavenger', 'speed', 'photo']) g;
  RETURN QUERY
    WITH picked AS (
      SELECT d, row_number() OVER (ORDER BY d) AS n
      FROM (SELECT d FROM unnest(v_days[2:]) d ORDER BY trip_private.schedule_hash(v_seed || d::text) LIMIT v_drops) x
    )
    SELECT 'surprise_drop'::text, d::text, NULL::uuid, d,
           (d + time '09:00' + make_interval(mins => (trip_private.schedule_hash(v_seed || 'open' || d::text) % 121)::int)) AT TIME ZONE ssn.tz,
           (d + time '09:00' + make_interval(mins => (trip_private.schedule_hash(v_seed || 'open' || d::text) % 121)::int)) AT TIME ZONE ssn.tz + interval '24 hours',
           NULL::uuid, v_types[((n - 1) % 4) + 1], NULL::int
    FROM picked;

  -- Trip quest per player when Trip Season opens, presented at the crowning night (R-344, Q25).
  IF t.room = 'trip' THEN
    RETURN QUERY SELECT 'trip_quest'::text, ''::text, p.uid, v_days[1], ssn.starts_at,
      greatest(coalesce(t.crowning_at + interval '4 hours', ssn.ends_at), ssn.ends_at), NULL::uuid, NULL::text, 10
      FROM unnest(v_players) p(uid);
  END IF;

  -- Window Seat: a quest every day (5 pts) and an evening journal prompt (2 pts), per player (R-351).
  IF t.room = 'window_seat' THEN
    RETURN QUERY
      SELECT 'ws_quest'::text, d::text, p.uid, d, greatest((d + time '08:00') AT TIME ZONE ssn.tz, ssn.starts_at),
             (d + 1)::timestamp AT TIME ZONE ssn.tz, NULL::uuid, NULL::text, 5
      FROM unnest(v_days) d CROSS JOIN unnest(v_players) p(uid);
    RETURN QUERY
      SELECT 'journal_prompt'::text, d::text, p.uid, d, greatest((d + time '17:00') AT TIME ZONE ssn.tz, ssn.starts_at),
             (d + 1 + time '12:00') AT TIME ZONE ssn.tz, NULL::uuid, NULL::text, 2
      FROM unnest(v_days) d CROSS JOIN unnest(v_players) p(uid);
  END IF;
END
$$;
REVOKE ALL ON FUNCTION trip_private.desired_schedule(uuid) FROM PUBLIC;

-- Deal content to every open-ended row that has none yet, in time order, so each pick sees the
-- earlier ones (no repeats while the pool lasts). Points for Daily Discovery / Card follow the
-- item: 2 when it has a right answer (1 for answering, +1 if right), else 1; fact days score 0.
CREATE FUNCTION trip_private.fill_schedule_content(p_trip uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.trips;
  s record;
  v_item uuid;
  c public.content_items;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip;
  FOR s IN
    SELECT * FROM public.trip_schedule x
    WHERE x.trip_id = p_trip AND x.content_item_id IS NULL AND x.kind NOT IN ('phase', 'call_night', 'crowning')
      AND (x.closes_at IS NULL OR x.closes_at > now())
    ORDER BY x.opens_at, x.kind, x.slot, x.user_id
  LOOP
    v_item := trip_private.pick_content(p_trip, s.kind, s.variant,
                                        p_trip::text || s.kind || s.slot || coalesce(s.user_id::text, ''));
    CONTINUE WHEN v_item IS NULL;
    SELECT * INTO c FROM public.content_items WHERE id = v_item;
    UPDATE public.trip_schedule
    SET content_item_id = v_item,
        tailored_text = trip_private.tailor_text(c.body, t),
        points = CASE
          WHEN s.kind = 'daily_discovery' AND s.variant = 'fact' THEN NULL
          WHEN s.kind IN ('daily_discovery', 'daily_card') THEN CASE WHEN c.answer IS NOT NULL THEN 2 ELSE 1 END
          WHEN s.kind = 'sealed_quest' THEN CASE coalesce(c.difficulty, 'medium') WHEN 'easy' THEN 5 WHEN 'hard' THEN 15 ELSE 10 END
          ELSE s.points END,
        updated_at = now()
    WHERE id = s.id;
  END LOOP;
END
$$;
REVOKE ALL ON FUNCTION trip_private.fill_schedule_content(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION trip_private.plan_trip(p_trip uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_now timestamptz := now();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip AND rules_version = 2 AND setup_completed_at IS NOT NULL) THEN
    RETURN;
  END IF;
  -- Items that no longer belong and haven't opened yet go; anything that has opened stays.
  DELETE FROM public.trip_schedule s
  WHERE s.trip_id = p_trip AND s.opens_at > v_now
    AND NOT EXISTS (SELECT 1 FROM trip_private.desired_schedule(p_trip) d
                    WHERE d.kind = s.kind AND d.slot = s.slot AND d.user_id IS NOT DISTINCT FROM s.user_id);
  -- Add new items; move items that haven't finished yet. A Surprise Drop whose game changed is dealt again.
  INSERT INTO public.trip_schedule AS s (trip_id, kind, slot, user_id, day, opens_at, closes_at, ref_id, variant, points)
  SELECT p_trip, d.kind, d.slot, d.user_id, d.day, d.opens_at, d.closes_at, d.ref_id, d.variant, d.points
  FROM trip_private.desired_schedule(p_trip) d
  ON CONFLICT (trip_id, kind, slot, user_id) DO UPDATE
    SET day = excluded.day, opens_at = excluded.opens_at, closes_at = excluded.closes_at, ref_id = excluded.ref_id,
        variant = excluded.variant,
        points = CASE WHEN s.variant IS DISTINCT FROM excluded.variant OR s.content_item_id IS NULL THEN excluded.points ELSE s.points END,
        content_item_id = CASE WHEN s.variant IS DISTINCT FROM excluded.variant THEN NULL ELSE s.content_item_id END,
        tailored_text = CASE WHEN s.variant IS DISTINCT FROM excluded.variant THEN NULL ELSE s.tailored_text END,
        updated_at = v_now
    WHERE (s.closes_at IS NULL OR s.closes_at > v_now)
      AND (s.day, s.opens_at, s.closes_at, s.ref_id, s.variant)
          IS DISTINCT FROM (excluded.day, excluded.opens_at, excluded.closes_at, excluded.ref_id, excluded.variant);
  -- Items that haven't opened are dealt again if the trip changed under them (room, mode, culture,
  -- focuses, minors).
  UPDATE public.trip_schedule s SET content_item_id = NULL, tailored_text = NULL, updated_at = v_now
  FROM public.content_items c, public.trips t
  WHERE s.trip_id = p_trip AND t.id = p_trip AND c.id = s.content_item_id AND s.opens_at > v_now
    AND NOT trip_private.content_fits(c, t);
  PERFORM trip_private.fill_schedule_content(p_trip);
END
$$;

-- Replan on every answer that changes what the schedule holds.
DROP TRIGGER trips_replan ON public.trips;
CREATE TRIGGER trips_replan AFTER UPDATE OF start_date, end_date, preflight_days, preflight_skipped, home_timezone,
  trip_timezone, arrived_at, crowning_at, room, setup_completed_at, play_mode, cultures, focuses, destination,
  passport_city, has_minors, vibe ON public.trips
  FOR EACH ROW EXECUTE FUNCTION trip_private.replan_trip();

-- Per-player items follow the roster: an approved late joiner gets theirs, a player who leaves
-- loses the ones that haven't opened.
CREATE TRIGGER trip_members_replan AFTER INSERT OR UPDATE OF status OR DELETE ON public.trip_members
  FOR EACH ROW EXECUTE FUNCTION trip_private.replan_trip();

-- ---------------------------------------------------------------------------------------------
-- What a player sees: the crew's items and their own, with the text only once an item has opened
-- (sealed quests show "Opens in 2 days" until then). Never the answer key.
CREATE FUNCTION trip_private.my_schedule(p_trip uuid, p_at timestamptz DEFAULT NULL)
RETURNS TABLE(id uuid, kind text, slot text, user_id uuid, day date, opens_at timestamptz, closes_at timestamptz,
              ref_id uuid, variant text, points int, is_open boolean, title text, body text, insight text,
              choices text[], items text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; v_at timestamptz := coalesce(p_at, now());
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  -- Looking ahead (Test Lab time travel) is for leaders only, so players can't peek at drops.
  IF v_at > now() + interval '1 minute' AND NOT trip_private.is_leader(p_trip) THEN v_at := now(); END IF;
  SELECT * INTO t FROM public.trips WHERE trips.id = p_trip;
  RETURN QUERY
    SELECT s.id, s.kind, s.slot, s.user_id, s.day, s.opens_at, s.closes_at, s.ref_id, s.variant, s.points,
           s.opens_at <= v_at,
           CASE WHEN s.opens_at <= v_at THEN trip_private.tailor_text(c.title, t) END,
           CASE WHEN s.opens_at <= v_at THEN s.tailored_text END,
           CASE WHEN s.opens_at <= v_at THEN trip_private.tailor_text(c.insight, t) END,
           CASE WHEN s.opens_at <= v_at THEN c.choices END,
           CASE WHEN s.opens_at <= v_at THEN c.items END
    FROM public.trip_schedule s
    LEFT JOIN public.content_items c ON c.id = s.content_item_id
    WHERE s.trip_id = p_trip AND (s.user_id IS NULL OR s.user_id = auth.uid())
    ORDER BY s.opens_at, s.kind, s.slot;
END
$$;
REVOKE ALL ON FUNCTION trip_private.my_schedule(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.my_schedule(uuid, timestamptz) TO authenticated, service_role;

CREATE FUNCTION public.my_schedule(p_trip uuid, p_at timestamptz DEFAULT NULL)
RETURNS TABLE(id uuid, kind text, slot text, user_id uuid, day date, opens_at timestamptz, closes_at timestamptz,
              ref_id uuid, variant text, points int, is_open boolean, title text, body text, insight text,
              choices text[], items text[])
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.my_schedule(p_trip, p_at) $$;
REVOKE ALL ON FUNCTION public.my_schedule(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_schedule(uuid, timestamptz) TO authenticated, service_role;
