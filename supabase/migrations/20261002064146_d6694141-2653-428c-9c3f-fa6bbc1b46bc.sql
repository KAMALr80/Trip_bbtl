ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS season_scoring boolean NOT NULL DEFAULT true;
ALTER TABLE public.skip_passes DROP CONSTRAINT skip_passes_kind_check, ADD CONSTRAINT skip_passes_kind_check CHECK (kind = ANY (ARRAY['card','quest','mission','bingo','respin','host','night','captain']));
ALTER TABLE public.skip_passes DROP CONSTRAINT skip_passes_season_check, ADD CONSTRAINT skip_passes_season_check CHECK (season = ANY (ARRAY['game','trip','captain']));

CREATE OR REPLACE FUNCTION trip_private.captain_pass_limit(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT CASE WHEN count(*) <= 8 THEN 2 ELSE 3 END::int FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped AND week_number < 1000 $$;

CREATE OR REPLACE FUNCTION trip_private.use_captain_pass(p_trip uuid, p_week integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n public.game_nights; used int; BEGIN
IF trip_private.captain_of(p_trip) IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the Captain can use a Captain pass'; END IF;
SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
IF NOT FOUND OR n.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Captain passes are for nights you host'; END IF;
IF n.skipped THEN RAISE EXCEPTION 'This night is already skipped'; END IF;
IF clock_timestamp() >= n.starts_at + interval '15 minutes' OR EXISTS (SELECT 1 FROM public.host_penalties WHERE trip_id=p_trip AND week_number=p_week) THEN RAISE EXCEPTION 'Too late to use a pass for this night'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(p_trip::text || auth.uid()::text || 'captain'));
IF EXISTS (SELECT 1 FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND kind='captain' AND ref=p_week::text) THEN RAISE EXCEPTION 'Already used'; END IF;
SELECT count(*) INTO used FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND kind='captain';
IF used >= trip_private.captain_pass_limit(p_trip) THEN RAISE EXCEPTION 'No Captain passes left this season'; END IF;
INSERT INTO public.skip_passes(trip_id,user_id,season,kind,ref) VALUES(p_trip,auth.uid(),'captain','captain',p_week::text);
END $$;
CREATE OR REPLACE FUNCTION public.use_captain_pass(p_trip uuid, p_week integer) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.use_captain_pass(p_trip,p_week) $$;
CREATE OR REPLACE FUNCTION public.captain_pass_limit(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT CASE WHEN trip_private.is_trip_member(p_trip, auth.uid()) THEN trip_private.captain_pass_limit(p_trip) END $$;
REVOKE EXECUTE ON FUNCTION trip_private.captain_pass_limit(uuid), trip_private.use_captain_pass(uuid,integer), public.use_captain_pass(uuid,integer), public.captain_pass_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.captain_pass_limit(uuid), trip_private.use_captain_pass(uuid,integer), public.use_captain_pass(uuid,integer), public.captain_pass_limit(uuid) TO authenticated, service_role;

-- No-show: Captain -8, others -5 (score points); excused by a Captain pass
CREATE OR REPLACE FUNCTION trip_private.night_no_show_check(p_trip uuid, p_week integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n public.game_nights; BEGIN
 SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week;
 IF n.host_id IS NULL OR n.host_id=auth.uid() OR n.host_checked_in_at IS NOT NULL OR n.skipped THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM public.skip_passes WHERE trip_id=p_trip AND user_id=n.host_id AND kind='captain' AND ref=p_week::text) THEN RETURN; END IF;
 IF clock_timestamp() < n.starts_at + interval '15 minutes' THEN
   IF trip_private.is_leader(p_trip) THEN RETURN; END IF;
   RAISE EXCEPTION 'Give the host until 15 minutes after start, then you can take over';
 END IF;
 INSERT INTO public.host_penalties(trip_id,week_number,user_id,stamps) VALUES(p_trip,p_week,n.host_id, CASE WHEN n.host_id=trip_private.captain_of(p_trip) THEN 8 ELSE 5 END) ON CONFLICT DO NOTHING;
END $$;

-- Raw stamps (no penalties), Captain-pass nights excused; empty for trips that opt out of seasons
CREATE OR REPLACE FUNCTION trip_private.game_stamps(p_trip uuid) RETURNS TABLE(user_id uuid, stamps integer, mx integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
g AS (SELECT m.user_id,
  sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
  sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
  FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now() AND NOT n.skipped
  LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
  WHERE m.trip_id=p_trip AND m.status='approved'
    AND NOT EXISTS (SELECT 1 FROM public.skip_passes sp WHERE sp.trip_id=p_trip AND sp.user_id=m.user_id AND sp.kind='captain' AND sp.ref=n.week_number::text)
  GROUP BY m.user_id),
qw AS (SELECT (3*count(*) FILTER (WHERE week_number < 1000) + count(*) FILTER (WHERE week_number >= 1000))::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
qa AS (SELECT a.user_id, (count(*) + 2*count(*) FILTER (WHERE q.winner_id=a.user_id))::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id)
SELECT m.user_id, (coalesce(g.stamps,0)+coalesce(qa.n,0)+m.start_stamps)::int, (coalesce(g.mx,0)+qw.total)::int
FROM public.trip_members m JOIN public.trips t ON t.id=m.trip_id AND t.season_scoring CROSS JOIN qw LEFT JOIN g ON g.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id
WHERE m.trip_id=p_trip AND m.status='approved' AND NOT m.season_closed $$;

-- Score out of 100 (shared by finalize and the public read)
CREATE OR REPLACE FUNCTION trip_private.game_board(p_trip uuid) RETURNS TABLE(user_id uuid, stamps integer, mx integer, pen integer, attended integer, score integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH pen AS (SELECT hp.user_id, sum(hp.stamps)::int n FROM public.host_penalties hp JOIN public.game_nights gn ON gn.trip_id=hp.trip_id AND gn.week_number=hp.week_number AND NOT gn.skipped
   WHERE hp.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.skip_passes sp WHERE sp.trip_id=p_trip AND sp.user_id=hp.user_id AND sp.kind='captain' AND sp.ref=hp.week_number::text) GROUP BY hp.user_id),
att AS (SELECT s.user_id, count(*)::int n FROM public.game_scores s JOIN public.game_nights gn ON gn.trip_id=s.trip_id AND gn.week_number=s.week_number AND NOT gn.skipped AND gn.starts_at <= now() WHERE s.trip_id=p_trip AND s.here GROUP BY s.user_id)
SELECT g.user_id, g.stamps, g.mx, coalesce(pen.n,0), coalesce(att.n,0),
  least(100, greatest(0, (CASE WHEN g.mx>0 THEN round(g.stamps*100.0/g.mx) ELSE 0 END)::int - coalesce(pen.n,0)))::int
FROM trip_private.game_stamps(p_trip) g LEFT JOIN pen ON pen.user_id=g.user_id LEFT JOIN att ON att.user_id=g.user_id $$;
CREATE OR REPLACE FUNCTION public.game_board(p_trip uuid) RETURNS TABLE(user_id uuid, stamps integer, mx integer, pen integer, attended integer, score integer) LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF; RETURN QUERY SELECT * FROM trip_private.game_board(p_trip); END $$;
REVOKE EXECUTE ON FUNCTION trip_private.game_board(uuid), public.game_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.game_board(uuid), public.game_board(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.finalize_season(p_trip uuid, p_season text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE st public.season_settings; v_at timestamptz; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF NOT coalesce((SELECT season_scoring FROM public.trips WHERE id=p_trip), true) THEN RETURN; END IF;
SELECT * INTO st FROM public.season_settings WHERE trip_id=p_trip AND season=p_season;
IF NOT FOUND THEN RETURN; END IF;
v_at := trip_private.effective_crowning(p_trip, p_season);
IF v_at IS NULL OR v_at > now() THEN RETURN; END IF;
IF EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RETURN; END IF;
IF p_season = 'trip' THEN
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  WITH r AS (SELECT t.user_id, t.stamps, least(100, CASE WHEN t.max_stamps > 0 THEN round(t.stamps*100.0/t.max_stamps)::int ELSE 0 END) score FROM trip_private.trip_season(p_trip) t)
  SELECT p_trip, 'trip', r.user_id, r.score, r.stamps FROM r WHERE r.stamps > 0 AND (SELECT count(*) FROM r o WHERE (o.score, o.stamps) > (r.score, r.stamps)) < st.winners;
ELSE
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  WITH r AS (SELECT * FROM trip_private.game_board(p_trip))
  SELECT p_trip, 'game', r.user_id, r.score, r.stamps FROM r WHERE r.stamps > 0 AND (SELECT count(*) FROM r o WHERE (o.score,o.attended) > (r.score,r.attended)) < st.winners;
END IF; END $$;

CREATE OR REPLACE FUNCTION trip_private.my_passport() RETURNS TABLE(trip_id uuid, stamps integer, crowns integer, junkie boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT m.trip_id,
  coalesce((SELECT x.game_stamps + x.trip_stamps FROM trip_private.trip_totals(m.trip_id) x WHERE x.user_id=auth.uid()),0),
  (SELECT count(*)::int FROM public.season_champions c WHERE c.trip_id=m.trip_id AND c.user_id=auth.uid()),
  coalesce((SELECT (x.game_stamps+x.trip_stamps) > 0 AND (x.game_stamps+x.trip_stamps) > coalesce((SELECT max(y.game_stamps+y.trip_stamps) FROM trip_private.trip_totals(m.trip_id) y WHERE y.user_id<>auth.uid()),0) FROM trip_private.trip_totals(m.trip_id) x WHERE x.user_id=auth.uid()), false)
FROM public.trip_members m JOIN public.trips tt ON tt.id=m.trip_id AND NOT tt.is_sandbox AND tt.season_scoring WHERE m.user_id=auth.uid() $$;

CREATE OR REPLACE FUNCTION trip_private.my_unlocked_trips() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT count(*)::int FROM public.trips WHERE unlocked_by = auth.uid() AND unlocked_at IS NOT NULL AND NOT is_sandbox AND season_scoring $$;