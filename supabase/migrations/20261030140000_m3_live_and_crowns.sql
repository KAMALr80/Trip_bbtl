-- M3-07 Game Night Live (R-401 – R-405) and M3-11 crowns (R-503 – R-508, Q5, Q7, Q10).
-- One screen for call nights and the crowning night: tap a crewmate after they present (first 👍 =
-- 20 pts, and their quest for the night counts as presented), vote the three awards in secret, and a
-- leader closes it. Crowns: Early Bird when Pre-Flight closes, Jet Setter at the crowning night's
-- close (or the Q10 fallback); solo players are crowned for reaching 60% of the planned points.
-- rollback: SELECT cron.unschedule('live-and-crowns'); DROP FUNCTION public.open_live(uuid, uuid, boolean),
--   public.live_present(uuid, uuid), public.live_vote_award(uuid, text, uuid), public.close_live(uuid),
--   public.reopen_live(uuid), public.live_state(uuid), public.solo_goal(uuid, text) and their trip_private
--   bodies, trip_private.tally_live(uuid), trip_private.close_live_session(uuid, boolean),
--   trip_private.crown_season(uuid, text, text), trip_private.live_and_crowns_due(); DROP TABLE
--   public.live_award_votes, public.live_presents, public.live_sessions, public.trip_crowns, public.trip_crownings.

-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  call_night_id uuid REFERENCES public.call_nights(id) ON DELETE SET NULL,
  is_crowning boolean NOT NULL DEFAULT false,
  season text NOT NULL CHECK (season IN ('preflight', 'trip_season')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,                       -- NULL when it closed itself at midnight
  closed_at timestamptz,
  auto_close_at timestamptz NOT NULL    -- local midnight (R-404)
);
-- At most one open session per trip: everyone votes on the same screen (R-405).
CREATE UNIQUE INDEX live_sessions_one_open ON public.live_sessions (trip_id) WHERE status = 'open';
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read live sessions" ON public.live_sessions FOR SELECT TO authenticated
  USING (trip_private.is_trip_member(trip_id, auth.uid()));
REVOKE ALL ON public.live_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.live_sessions TO authenticated;
GRANT ALL ON public.live_sessions TO service_role;
CREATE TRIGGER live_sessions_archive_guard BEFORE INSERT OR UPDATE ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

CREATE TABLE public.live_presents (
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  presenter_id uuid NOT NULL,
  voter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, presenter_id, voter_id),
  CHECK (presenter_id <> voter_id)
);
CREATE TABLE public.live_award_votes (
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  award text NOT NULL CHECK (award IN ('best_overall', 'most_creative', 'best_story')),
  voter_id uuid NOT NULL,
  nominee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, award, voter_id),
  CHECK (nominee_id <> voter_id)       -- no self-votes (Q7)
);
-- Votes are read only through live_state, so award ballots stay secret until Close.
ALTER TABLE public.live_presents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_award_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_presents, public.live_award_votes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.live_presents, public.live_award_votes TO service_role;

-- Crowns of the new engine (the older season_champions stays for the screens that read it, M3-16).
CREATE TABLE public.trip_crowns (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  season text NOT NULL CHECK (season IN ('preflight', 'trip_season')),
  user_id uuid NOT NULL,
  points int NOT NULL,
  solo_goal int,                       -- set for a solo crown (R-507)
  crowned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, season, user_id)
);
CREATE TABLE public.trip_crownings (    -- one row per decided season, even when nobody is crowned
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  season text NOT NULL CHECK (season IN ('preflight', 'trip_season')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  how text NOT NULL,                   -- 'preflight_close' | 'crowning_night' | 'fallback' | 'solo_goal'
  PRIMARY KEY (trip_id, season)
);
ALTER TABLE public.trip_crowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_crownings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read crowns" ON public.trip_crowns FOR SELECT TO authenticated
  USING (trip_private.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "members read crownings" ON public.trip_crownings FOR SELECT TO authenticated
  USING (trip_private.is_trip_member(trip_id, auth.uid()));
REVOKE ALL ON public.trip_crowns, public.trip_crownings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trip_crowns, public.trip_crownings TO authenticated;
GRANT ALL ON public.trip_crowns, public.trip_crownings TO service_role;
CREATE TRIGGER trip_crowns_archive_guard BEFORE INSERT OR UPDATE ON public.trip_crowns
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();
CREATE TRIGGER trip_crownings_archive_guard BEFORE INSERT OR UPDATE ON public.trip_crownings
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- ---------------------------------------------------------------------------------------------
-- Game Night Live.

-- Open (or join) the trip's live screen. Any player opens a call night; leaders open the crowning
-- night. Points go to the season the trip is in (Takeoff counts as Trip Season).
CREATE FUNCTION trip_private.open_live(p_trip uuid, p_call_night uuid, p_crowning boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; ph record; v_season text;
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT id INTO v_id FROM public.live_sessions WHERE trip_id = p_trip AND status = 'open';
  IF FOUND THEN RETURN v_id; END IF;
  IF p_crowning AND NOT trip_private.is_leader(p_trip) THEN
    RAISE EXCEPTION 'The Captain or Co-Captain opens the crowning night';
  END IF;
  IF p_call_night IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.call_nights WHERE id = p_call_night AND trip_id = p_trip) THEN
    RAISE EXCEPTION 'That call night isn''t in this trip';
  END IF;
  SELECT * INTO ph FROM trip_private.trip_phase(p_trip, now());
  v_season := CASE ph.phase WHEN 'preflight' THEN 'preflight' WHEN 'takeoff' THEN 'trip_season' WHEN 'trip_season' THEN 'trip_season' END;
  IF v_season IS NULL THEN RAISE EXCEPTION 'Game Night Live opens during Pre-Flight and Trip Season'; END IF;
  IF p_crowning AND v_season <> 'trip_season' THEN RAISE EXCEPTION 'The crowning night is in Trip Season'; END IF;
  IF EXISTS (SELECT 1 FROM public.trip_crownings WHERE trip_id = p_trip AND season = v_season) THEN
    RAISE EXCEPTION 'This season''s crown has already been decided';
  END IF;
  INSERT INTO public.live_sessions (trip_id, call_night_id, is_crowning, season, opened_by, auto_close_at)
  VALUES (p_trip, p_call_night, p_crowning, v_season, auth.uid(),
          ((now() AT TIME ZONE ph.tz)::date + 1)::timestamp AT TIME ZONE ph.tz)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- 👍 a crewmate after they present (R-402). The first 👍 gives them 20 points and counts the quest
-- they presented: their sealed quest for this call night, or their trip quest on the crowning night.
CREATE FUNCTION trip_private.live_present(p_session uuid, p_presenter uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions; s public.trip_schedule; v_first boolean;
BEGIN
  SELECT * INTO l FROM public.live_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_trip_member(l.trip_id, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF l.status <> 'open' THEN RAISE EXCEPTION 'This Game Night has closed'; END IF;
  IF p_presenter = auth.uid() THEN RAISE EXCEPTION 'You can''t tap your own avatar'; END IF;
  IF NOT trip_private.is_trip_member(l.trip_id, p_presenter) THEN RAISE EXCEPTION 'They aren''t in this trip'; END IF;
  v_first := NOT EXISTS (SELECT 1 FROM public.live_presents WHERE session_id = p_session AND presenter_id = p_presenter);
  INSERT INTO public.live_presents (session_id, presenter_id, voter_id) VALUES (p_session, p_presenter, auth.uid())
  ON CONFLICT DO NOTHING;
  IF NOT v_first THEN RETURN false; END IF;

  PERFORM trip_private.award_points(l.trip_id, p_presenter, l.season, 'game_night_present', l.id, 20, 'approved', now(), auth.uid());
  SELECT * INTO s FROM public.trip_schedule
  WHERE trip_id = l.trip_id AND user_id = p_presenter AND opens_at <= now()
    AND ((NOT l.is_crowning AND kind = 'sealed_quest' AND ref_id = l.call_night_id) OR (l.is_crowning AND kind = 'trip_quest'))
  LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.proofs (trip_id, user_id, schedule_id, source, body, crew_status, approved_by, approved_at, expires_at)
    VALUES (l.trip_id, p_presenter, s.id, CASE s.kind WHEN 'trip_quest' THEN 'trip_quest' ELSE 'sealed_quest' END,
            'Presented live', 'approved', auth.uid(), now(), now())
    ON CONFLICT (schedule_id, user_id, part) DO UPDATE
      SET crew_status = 'approved', approved_by = excluded.approved_by, approved_at = now()
      WHERE public.proofs.crew_status = 'waiting';
    IF s.points IS NOT NULL THEN
      IF trip_private.award_points(l.trip_id, p_presenter, CASE s.kind WHEN 'trip_quest' THEN 'trip_season' ELSE 'preflight' END,
                                   CASE s.kind WHEN 'trip_quest' THEN 'trip_quest' ELSE 'sealed_quest' END, s.id, s.points,
                                   'approved', now(), auth.uid()) IS NOT NULL THEN
        PERFORM trip_private.set_points_status(l.trip_id, p_presenter, CASE s.kind WHEN 'trip_quest' THEN 'trip_quest' ELSE 'sealed_quest' END,
                                               s.id, 'approved');
      END IF;
    END IF;
  END IF;
  RETURN true;
END
$$;

-- One secret pick per award per player; picking again changes it (R-403).
CREATE FUNCTION trip_private.live_vote_award(p_session uuid, p_award text, p_nominee uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions;
BEGIN
  SELECT * INTO l FROM public.live_sessions WHERE id = p_session;
  IF NOT FOUND OR NOT trip_private.is_trip_member(l.trip_id, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF l.status <> 'open' THEN RAISE EXCEPTION 'This Game Night has closed'; END IF;
  IF p_nominee = auth.uid() THEN RAISE EXCEPTION 'Vote for someone else'; END IF;
  IF NOT trip_private.is_trip_member(l.trip_id, p_nominee) THEN RAISE EXCEPTION 'They aren''t in this trip'; END IF;
  INSERT INTO public.live_award_votes (session_id, award, voter_id, nominee_id) VALUES (p_session, p_award, auth.uid(), p_nominee)
  ON CONFLICT (session_id, award, voter_id) DO UPDATE SET nominee_id = excluded.nominee_id, created_at = now();
END
$$;

-- Count the awards and write their points: every player tied for the most votes wins (Q7).
-- Winners from an earlier close who no longer win stay void.
CREATE FUNCTION trip_private.tally_live(p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions; w record; v_source text;
BEGIN
  SELECT * INTO l FROM public.live_sessions WHERE id = p_session;
  FOR w IN
    WITH counts AS (
      SELECT award, nominee_id, count(*) AS n FROM public.live_award_votes WHERE session_id = p_session GROUP BY award, nominee_id
    )
    SELECT c.award, c.nominee_id FROM counts c
    WHERE c.n = (SELECT max(n) FROM counts x WHERE x.award = c.award)
  LOOP
    v_source := 'award_' || w.award;
    IF NOT trip_private.set_points_status(l.trip_id, w.nominee_id, v_source, l.id, 'approved') THEN
      PERFORM trip_private.award_points(l.trip_id, w.nominee_id, l.season, v_source, l.id,
        (SELECT points_max FROM public.points_rules WHERE source = v_source), 'approved', now(), l.closed_by);
    END IF;
  END LOOP;
END
$$;

-- Close (R-404): leaders, or the midnight job (p_auto). The crowning night's close crowns Jet Setter.
CREATE FUNCTION trip_private.close_live_session(p_session uuid, p_auto boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions;
BEGIN
  UPDATE public.live_sessions SET status = 'closed', closed_at = now(), closed_by = CASE WHEN p_auto THEN NULL ELSE auth.uid() END
  WHERE id = p_session AND status = 'open' RETURNING * INTO l;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM trip_private.tally_live(p_session);
  IF l.is_crowning THEN PERFORM trip_private.crown_season(l.trip_id, 'trip_season', 'crowning_night'); END IF;
END
$$;

CREATE FUNCTION trip_private.close_live(p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions;
BEGIN
  SELECT * INTO l FROM public.live_sessions WHERE id = p_session;
  IF NOT FOUND OR NOT trip_private.is_leader(l.trip_id) THEN RAISE EXCEPTION 'The Captain or Co-Captain closes Game Night'; END IF;
  IF l.status <> 'open' THEN RAISE EXCEPTION 'This Game Night has already closed'; END IF;
  PERFORM trip_private.close_live_session(p_session, false);
END
$$;

-- Reopen if it closed too early (R-404): the award points go void until the next close. A crowning
-- night whose crown has been decided can't reopen.
CREATE FUNCTION trip_private.reopen_live(p_session uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions; ph record;
BEGIN
  SELECT * INTO l FROM public.live_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_leader(l.trip_id) THEN RAISE EXCEPTION 'The Captain or Co-Captain reopens Game Night'; END IF;
  IF l.status <> 'closed' THEN RAISE EXCEPTION 'This Game Night is still open'; END IF;
  IF EXISTS (SELECT 1 FROM public.trip_crownings WHERE trip_id = l.trip_id AND season = l.season) THEN
    RAISE EXCEPTION 'This season''s crown has already been decided';
  END IF;
  IF EXISTS (SELECT 1 FROM public.live_sessions WHERE trip_id = l.trip_id AND status = 'open') THEN
    RAISE EXCEPTION 'Another Game Night is open';
  END IF;
  SELECT * INTO ph FROM trip_private.trip_phase(l.trip_id, now());
  UPDATE public.points_ledger SET status = 'void', updated_at = now()
  WHERE trip_id = l.trip_id AND source_ref = l.id AND source LIKE 'award\_%' AND status = 'approved';
  UPDATE public.live_sessions SET status = 'open', closed_at = NULL, closed_by = NULL,
    auto_close_at = greatest(auto_close_at, ((now() AT TIME ZONE coalesce(ph.tz, 'UTC'))::date + 1)::timestamp AT TIME ZONE coalesce(ph.tz, 'UTC'))
  WHERE id = p_session;
END
$$;

-- What the live screen shows: each player's 👍 count and whether I tapped them, my own award
-- picks, and — only once closed — the winners.
CREATE FUNCTION trip_private.live_state(p_session uuid)
RETURNS TABLE(user_id uuid, thumbs int, i_tapped boolean, my_awards text[], won_awards text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions;
BEGIN
  SELECT * INTO l FROM public.live_sessions WHERE id = p_session;
  IF NOT FOUND OR NOT trip_private.is_trip_member(l.trip_id, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN QUERY
    SELECT m.user_id,
           (SELECT count(*)::int FROM public.live_presents p WHERE p.session_id = l.id AND p.presenter_id = m.user_id),
           EXISTS (SELECT 1 FROM public.live_presents p WHERE p.session_id = l.id AND p.presenter_id = m.user_id AND p.voter_id = auth.uid()),
           coalesce((SELECT array_agg(v.award ORDER BY v.award) FROM public.live_award_votes v
                     WHERE v.session_id = l.id AND v.voter_id = auth.uid() AND v.nominee_id = m.user_id), '{}'),
           CASE WHEN l.status = 'closed' THEN coalesce((SELECT array_agg(substr(x.source, 7) ORDER BY x.source) FROM public.points_ledger x
                     WHERE x.trip_id = l.trip_id AND x.source_ref = l.id AND x.user_id = m.user_id AND x.source LIKE 'award\_%'
                       AND x.status = 'approved'), '{}') ELSE '{}' END
    FROM public.trip_members m
    WHERE m.trip_id = l.trip_id AND m.status = 'approved'
    ORDER BY m.user_id;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Crowns.

-- Solo goal (R-507, Q5): 60% of the points the planned schedule offers in that season, without
-- speed bonuses. Daily items count their full value; per-player items count mine.
CREATE FUNCTION trip_private.solo_goal(p_trip uuid, p_season text) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT ceil(0.6 * coalesce(sum(s.points), 0))::int
  FROM public.trip_schedule s
  JOIN trip_private.trip_phase_windows(p_trip) w ON w.phase = CASE p_season WHEN 'preflight' THEN 'preflight' ELSE 'trip_season' END
  WHERE s.trip_id = p_trip AND s.points IS NOT NULL
    AND (s.user_id IS NULL OR s.user_id = (SELECT m.user_id FROM public.trip_members m WHERE m.trip_id = p_trip AND m.role = 'captain'))
    AND CASE WHEN s.kind IN ('airport_mission', 'home_mission') THEN p_season = 'trip_season'
             WHEN s.kind IN ('sealed_quest', 'showcase', 'daily_card') THEN p_season = 'preflight'
             ELSE s.opens_at >= w.starts_at AND s.opens_at < w.ends_at END
$$;

-- Decide a season once (idempotent). Groups: the top of the standings after the tie-break; an exact
-- tie crowns everyone tied. Nobody is crowned with 0 points, or for Early Bird when Pre-Flight was
-- skipped (R-105). Solo: crowned if the points reach the goal.
CREATE FUNCTION trip_private.crown_season(p_trip uuid, p_season text, p_how text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; v_goal int;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.trip_crownings WHERE trip_id = p_trip AND season = p_season) THEN RETURN; END IF;
  INSERT INTO public.trip_crownings (trip_id, season, how)
  VALUES (p_trip, p_season, CASE WHEN t.play_mode = 'solo' THEN 'solo_goal' ELSE p_how END);
  IF NOT coalesce((trip_private.room_rules(t.room)->>'pointsEnabled')::boolean, false) OR t.play_mode = 'offline' OR t.is_sandbox
     OR (p_season = 'preflight' AND (t.preflight_skipped OR t.preflight_days = 0)) THEN
    RETURN;
  END IF;
  IF t.play_mode = 'solo' THEN
    v_goal := trip_private.solo_goal(p_trip, p_season);
    INSERT INTO public.trip_crowns (trip_id, season, user_id, points, solo_goal)
    SELECT p_trip, p_season, s.user_id, s.points, v_goal FROM trip_private.standings(p_trip, p_season) s
    WHERE v_goal > 0 AND s.points >= v_goal;
  ELSE
    INSERT INTO public.trip_crowns (trip_id, season, user_id, points)
    SELECT p_trip, p_season, s.user_id, s.points FROM trip_private.standings(p_trip, p_season) s
    WHERE s.rank = 1 AND s.points > 0;
  END IF;
END
$$;

-- Every 5 minutes: close Game Nights past midnight (R-404); crown Early Bird once Pre-Flight has
-- closed (R-503); crown Jet Setter 4 hours after the crowning night if nobody closed it, or at 9 PM
-- trip time on the last trip day when no crowning night was set (Q10). Returns what it did.
CREATE FUNCTION trip_private.live_and_crowns_due() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.live_sessions WHERE status = 'open' AND auto_close_at <= now() LOOP
    PERFORM trip_private.close_live_session(r.id, true); n := n + 1;
  END LOOP;
  FOR r IN
    SELECT t.id FROM public.trips t
    JOIN trip_private.trip_phase_windows(t.id) w ON w.phase = 'preflight'
    WHERE t.rules_version = 2 AND t.setup_completed_at IS NOT NULL AND w.ends_at <= now()
      AND t.end_date >= current_date - 30
      AND NOT EXISTS (SELECT 1 FROM public.trip_crownings c WHERE c.trip_id = t.id AND c.season = 'preflight')
  LOOP
    PERFORM trip_private.crown_season(r.id, 'preflight', 'preflight_close'); n := n + 1;
  END LOOP;
  FOR r IN
    SELECT t.id FROM public.trips t
    WHERE t.rules_version = 2 AND t.setup_completed_at IS NOT NULL AND t.end_date >= current_date - 30
      AND now() >= coalesce(t.crowning_at + interval '4 hours',
            (t.end_date + time '21:00') AT TIME ZONE CASE WHEN (trip_private.room_rules(t.room)->>'atHome')::boolean
              THEN t.home_timezone ELSE coalesce(t.trip_timezone, t.home_timezone) END)
      AND NOT EXISTS (SELECT 1 FROM public.trip_crownings c WHERE c.trip_id = t.id AND c.season = 'trip_season')
      AND NOT EXISTS (SELECT 1 FROM public.live_sessions l WHERE l.trip_id = t.id AND l.status = 'open')
  LOOP
    PERFORM trip_private.crown_season(r.id, 'trip_season', 'fallback'); n := n + 1;
  END LOOP;
  RETURN n;
END
$$;
SELECT cron.schedule('live-and-crowns', '*/5 * * * *', 'SELECT trip_private.live_and_crowns_due();');

-- ---------------------------------------------------------------------------------------------
-- Grants and public wrappers.
REVOKE ALL ON FUNCTION trip_private.open_live(uuid, uuid, boolean), trip_private.live_present(uuid, uuid),
  trip_private.live_vote_award(uuid, text, uuid), trip_private.close_live(uuid), trip_private.reopen_live(uuid),
  trip_private.live_state(uuid), trip_private.tally_live(uuid), trip_private.close_live_session(uuid, boolean),
  trip_private.solo_goal(uuid, text), trip_private.crown_season(uuid, text, text), trip_private.live_and_crowns_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.open_live(uuid, uuid, boolean), trip_private.live_present(uuid, uuid),
  trip_private.live_vote_award(uuid, text, uuid), trip_private.close_live(uuid), trip_private.reopen_live(uuid),
  trip_private.live_state(uuid), trip_private.solo_goal(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.tally_live(uuid), trip_private.close_live_session(uuid, boolean),
  trip_private.crown_season(uuid, text, text), trip_private.live_and_crowns_due() TO service_role;

CREATE FUNCTION public.open_live(p_trip uuid, p_call_night uuid DEFAULT NULL, p_crowning boolean DEFAULT false) RETURNS uuid
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.open_live(p_trip, p_call_night, p_crowning) $$;
CREATE FUNCTION public.live_present(p_session uuid, p_presenter uuid) RETURNS boolean
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.live_present(p_session, p_presenter) $$;
CREATE FUNCTION public.live_vote_award(p_session uuid, p_award text, p_nominee uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.live_vote_award(p_session, p_award, p_nominee) $$;
CREATE FUNCTION public.close_live(p_session uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.close_live(p_session) $$;
CREATE FUNCTION public.reopen_live(p_session uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.reopen_live(p_session) $$;
CREATE FUNCTION public.live_state(p_session uuid)
RETURNS TABLE(user_id uuid, thumbs int, i_tapped boolean, my_awards text[], won_awards text[])
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.live_state(p_session) $$;
CREATE FUNCTION public.solo_goal(p_trip uuid, p_season text) RETURNS int
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN trip_private.solo_goal(p_trip, p_season);
END $$;
REVOKE ALL ON FUNCTION public.open_live(uuid, uuid, boolean), public.live_present(uuid, uuid), public.live_vote_award(uuid, text, uuid),
  public.close_live(uuid), public.reopen_live(uuid), public.live_state(uuid), public.solo_goal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_live(uuid, uuid, boolean), public.live_present(uuid, uuid), public.live_vote_award(uuid, text, uuid),
  public.close_live(uuid), public.reopen_live(uuid), public.live_state(uuid), public.solo_goal(uuid, text) TO authenticated, service_role;
