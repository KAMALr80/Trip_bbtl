-- M3-01: the points ledger (dev-docs/03 §7). Every way to earn points writes one row here through
-- trip_private.award_points; standings are the sum of approved rows. Values live in points_rules so
-- the founder can tune them (Q4) without a code change.
-- rollback: DROP FUNCTION public.trip_standings(uuid, text), trip_private.trip_standings(uuid, text),
--   trip_private.standings(uuid, text), trip_private.set_points_status(uuid, uuid, text, uuid, text),
--   trip_private.award_points(uuid, uuid, text, text, uuid, int, text, timestamptz, uuid);
--   DROP TABLE public.points_ledger, public.points_rules;

-- ---------------------------------------------------------------------------------------------
-- What each source is worth (R-502, Q4 defaults). season: the season the points count toward, or
-- 'any' when the caller decides (a game night counts toward the season it falls in). cap_group /
-- cap_per_trip: a per-player cap shared by every source in the group (Airport and Home Missions,
-- 12, R-332). per_day: at most this many awards per player per local day (Daily Card / Discovery).
CREATE TABLE public.points_rules (
  source text PRIMARY KEY,
  season text NOT NULL CHECK (season IN ('preflight', 'trip_season', 'any')),
  points_min int NOT NULL CHECK (points_min >= 0),
  points_max int NOT NULL,
  cap_group text,
  cap_per_trip int CHECK (cap_per_trip > 0),
  per_day int CHECK (per_day > 0),
  label text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (points_max >= points_min),
  CHECK ((cap_group IS NULL) = (cap_per_trip IS NULL))
);
ALTER TABLE public.points_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "everyone signed in reads the points table" ON public.points_rules FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.points_rules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.points_rules TO authenticated;
GRANT ALL ON public.points_rules TO service_role;

INSERT INTO public.points_rules (source, season, points_min, points_max, cap_group, cap_per_trip, per_day, label) VALUES
  -- 1 for answering, +1 if correct on question days (Q4, Q22)
  ('daily_discovery',     'any',         1,  2,  NULL,       NULL, 1,    'Daily Discovery'),
  ('daily_card',          'preflight',   1,  2,  NULL,       NULL, 1,    'Daily Card'),
  -- easy 5 / medium 10 / hard 15; +5 if opened within 3h of the drop, as its own row (R-322)
  ('sealed_quest',        'preflight',   5,  15, NULL,       NULL, NULL, 'Sealed quest'),
  ('sealed_speed',        'preflight',   5,  5,  NULL,       NULL, NULL, 'Opened within 3 hours'),
  ('showcase',            'preflight',   20, 20, NULL,       NULL, NULL, 'Showcase'),
  -- Airport / Home Missions: up to 12 in all, counted in Trip Season (R-332)
  ('airport_mission',     'trip_season', 1,  4,  'missions', 12,   NULL, 'Airport Mission'),
  ('home_mission',        'trip_season', 1,  4,  'missions', 12,   NULL, 'Home Mission'),
  ('game_night_present',  'any',         20, 20, NULL,       NULL, NULL, 'Showed up and presented'),
  ('award_best_overall',  'any',         10, 10, NULL,       NULL, NULL, 'Best Overall'),
  ('award_most_creative', 'any',         5,  5,  NULL,       NULL, NULL, 'Most Creative'),
  ('award_best_story',    'any',         5,  5,  NULL,       NULL, NULL, 'Best Story'),
  -- 10 for completing + up to 23 bonus from the game's own scoring (Q4)
  ('surprise_drop',       'trip_season', 10, 33, NULL,       NULL, NULL, 'Surprise Drop'),
  ('trip_quest',          'trip_season', 10, 10, NULL,       NULL, NULL, 'Trip quest'),
  ('ws_quest',            'any',         5,  5,  NULL,       NULL, NULL, 'Daily quest'),
  ('ws_journal',          'any',         2,  2,  NULL,       NULL, NULL, 'Journal');

-- ---------------------------------------------------------------------------------------------
-- The ledger. No client writes; players read their own rows ("why do I have 47 points?"), and
-- everyone else's totals only through trip_standings.
CREATE TABLE public.points_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  season text NOT NULL CHECK (season IN ('preflight', 'trip_season')),
  source text NOT NULL REFERENCES public.points_rules(source),
  source_ref uuid,                        -- the quest / proof / session / schedule row it is for
  points int NOT NULL CHECK (points >= 0),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'void')),
  earned_at timestamptz NOT NULL DEFAULT now(),   -- "earliest finish" tie-break (R-506)
  created_by uuid,                                 -- who triggered it: the player, a voter, NULL = system
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Replays (offline outbox, double taps, cron re-runs) can't double-count.
  UNIQUE NULLS NOT DISTINCT (trip_id, user_id, source, source_ref)
);
CREATE INDEX points_ledger_standings_idx ON public.points_ledger (trip_id, season, user_id) WHERE status = 'approved';
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own points" ON public.points_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND trip_private.is_trip_member(trip_id, auth.uid()));
REVOKE ALL ON public.points_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.points_ledger TO authenticated;
GRANT ALL ON public.points_ledger TO service_role;
CREATE TRIGGER points_ledger_archive_guard BEFORE INSERT OR UPDATE ON public.points_ledger
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- ---------------------------------------------------------------------------------------------
-- award_points: the only way points are written. Called by other trip_private functions after
-- their own identity checks; it checks the trip, the player and the rules itself.
-- Returns the ledger row id (the existing one on a replay), or NULL when nothing is awarded:
-- a room without points (Game Night), off-app play (R-006), a sandbox trip, or a cap already reached.
-- Points above the per-trip cap are trimmed to what's left (R-332).
CREATE FUNCTION trip_private.award_points(
  p_trip uuid, p_user uuid, p_season text, p_source text, p_source_ref uuid, p_points int,
  p_status text DEFAULT 'approved', p_earned_at timestamptz DEFAULT now(), p_created_by uuid DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.points_rules;
  t public.trips;
  v_id bigint;
  v_points int := p_points;
  v_used int;
  v_tz text;
  v_day date;
BEGIN
  SELECT * INTO r FROM public.points_rules WHERE source = p_source;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown points source %', p_source; END IF;
  IF p_season NOT IN ('preflight', 'trip_season') OR (r.season <> 'any' AND r.season <> p_season) THEN
    RAISE EXCEPTION '% points count toward %, not %', r.label, r.season, p_season;
  END IF;
  IF p_points IS NULL OR p_points < r.points_min OR p_points > r.points_max THEN
    RAISE EXCEPTION '% is worth % to % points, not %', r.label, r.points_min, r.points_max, p_points;
  END IF;
  IF p_status NOT IN ('pending', 'approved') THEN RAISE EXCEPTION 'New points are pending or approved'; END IF;

  SELECT * INTO t FROM public.trips WHERE id = p_trip;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trip not found'; END IF;
  IF NOT trip_private.is_trip_member(p_trip, p_user) THEN RAISE EXCEPTION 'Only players in this trip earn its points'; END IF;
  IF NOT coalesce((trip_private.room_rules(t.room)->>'pointsEnabled')::boolean, false)
     OR t.play_mode = 'offline' OR t.is_sandbox IS TRUE THEN
    RETURN NULL;
  END IF;

  -- One writer per player at a time, so two awards can't both squeeze under a cap.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_trip::text || p_user::text, 0));

  SELECT id INTO v_id FROM public.points_ledger
  WHERE trip_id = p_trip AND user_id = p_user AND source = p_source AND source_ref IS NOT DISTINCT FROM p_source_ref;
  IF FOUND THEN RETURN v_id; END IF;

  IF r.per_day IS NOT NULL THEN
    SELECT tz INTO v_tz FROM trip_private.trip_phase(p_trip, p_earned_at);
    v_tz := coalesce(v_tz, t.home_timezone);
    v_day := (p_earned_at AT TIME ZONE v_tz)::date;
    IF (SELECT count(*) FROM public.points_ledger l
        WHERE l.trip_id = p_trip AND l.user_id = p_user AND l.source = p_source
          AND l.status IN ('pending', 'approved') AND (l.earned_at AT TIME ZONE v_tz)::date = v_day) >= r.per_day THEN
      RETURN NULL;
    END IF;
  END IF;

  IF r.cap_group IS NOT NULL THEN
    SELECT coalesce(sum(l.points), 0) INTO v_used
    FROM public.points_ledger l JOIN public.points_rules g ON g.source = l.source
    WHERE l.trip_id = p_trip AND l.user_id = p_user AND g.cap_group = r.cap_group AND l.status IN ('pending', 'approved');
    v_points := least(v_points, r.cap_per_trip - v_used);
    IF v_points <= 0 THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.points_ledger (trip_id, user_id, season, source, source_ref, points, status, earned_at, created_by)
  VALUES (p_trip, p_user, p_season, p_source, p_source_ref, v_points, p_status, p_earned_at, p_created_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION trip_private.award_points(uuid, uuid, text, text, uuid, int, text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.award_points(uuid, uuid, text, text, uuid, int, text, timestamptz, uuid) TO service_role;

-- Move a row along: pending → approved / rejected (Crew Check, R-411), approved → void (a reopened
-- Game Night, R-404), void → approved (closed again). Anything else is refused. Returns whether the
-- row changed; a missing row or a repeat is false, so callers can replay safely.
CREATE FUNCTION trip_private.set_points_status(p_trip uuid, p_user uuid, p_source text, p_source_ref uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_old text;
BEGIN
  SELECT status INTO v_old FROM public.points_ledger
  WHERE trip_id = p_trip AND user_id = p_user AND source = p_source AND source_ref IS NOT DISTINCT FROM p_source_ref
  FOR UPDATE;
  IF NOT FOUND OR v_old = p_status THEN RETURN false; END IF;
  IF NOT ((v_old = 'pending' AND p_status IN ('approved', 'rejected'))
          OR (v_old = 'approved' AND p_status = 'void')
          OR (v_old = 'void' AND p_status = 'approved')) THEN
    RAISE EXCEPTION 'Points can''t go from % to %', v_old, p_status;
  END IF;
  UPDATE public.points_ledger SET status = p_status, updated_at = now()
  WHERE trip_id = p_trip AND user_id = p_user AND source = p_source AND source_ref IS NOT DISTINCT FROM p_source_ref;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION trip_private.set_points_status(uuid, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.set_points_status(uuid, uuid, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Standings for one season: every approved player, with 0 if they haven't scored. Order and rank
-- follow the tie-break (R-506, Q7): points, then Showcase points, then whoever reached their total
-- first (the earliest earned_at of their last approved row). Players with no points share last place.
CREATE FUNCTION trip_private.standings(p_trip uuid, p_season text)
RETURNS TABLE(user_id uuid, points int, rank int, showcase_points int, last_earned_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH totals AS (
    SELECT m.user_id,
           coalesce(sum(l.points), 0)::int AS points,
           coalesce(sum(l.points) FILTER (WHERE l.source = 'showcase'), 0)::int AS showcase_points,
           max(l.earned_at) AS last_earned_at
    FROM public.trip_members m
    LEFT JOIN public.points_ledger l
      ON l.trip_id = m.trip_id AND l.user_id = m.user_id AND l.season = p_season AND l.status = 'approved'
    WHERE m.trip_id = p_trip AND m.status = 'approved'
    GROUP BY m.user_id
  )
  SELECT t.user_id, t.points,
         (rank() OVER (ORDER BY t.points DESC, t.showcase_points DESC, t.last_earned_at ASC NULLS LAST))::int,
         t.showcase_points, t.last_earned_at
  FROM totals t
  ORDER BY 3, t.user_id
$$;
REVOKE ALL ON FUNCTION trip_private.standings(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.standings(uuid, text) TO service_role;

CREATE FUNCTION trip_private.trip_standings(p_trip uuid, p_season text)
RETURNS TABLE(user_id uuid, points int, rank int, showcase_points int, last_earned_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF p_season NOT IN ('preflight', 'trip_season') THEN RAISE EXCEPTION 'Pick preflight or trip_season'; END IF;
  RETURN QUERY SELECT * FROM trip_private.standings(p_trip, p_season);
END
$$;
REVOKE ALL ON FUNCTION trip_private.trip_standings(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.trip_standings(uuid, text) TO authenticated, service_role;

CREATE FUNCTION public.trip_standings(p_trip uuid, p_season text)
RETURNS TABLE(user_id uuid, points int, rank int, showcase_points int, last_earned_at timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.trip_standings(p_trip, p_season) $$;
REVOKE ALL ON FUNCTION public.trip_standings(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trip_standings(uuid, text) TO authenticated, service_role;
