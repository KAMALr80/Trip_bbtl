ALTER TABLE public.weekly_questions
  ADD COLUMN phase text NOT NULL DEFAULT 'hidden' CHECK (phase IN ('hidden','reading','voting','tie','revealed')),
  ADD COLUMN read_index integer NOT NULL DEFAULT 0,
  ADD COLUMN winner_id uuid,
  ADD COLUMN tie_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN tie_spin_at timestamptz;
UPDATE public.weekly_questions SET phase='revealed' WHERE revealed_at IS NOT NULL;

CREATE TABLE public.weekly_answer_votes (
  trip_id uuid NOT NULL,
  week_number integer NOT NULL,
  voter_id uuid NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, week_number, voter_id),
  FOREIGN KEY (trip_id, week_number) REFERENCES public.weekly_questions(trip_id, week_number) ON DELETE CASCADE
);
GRANT SELECT ON public.weekly_answer_votes TO authenticated;
GRANT ALL ON public.weekly_answer_votes TO service_role;
ALTER TABLE public.weekly_answer_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players see only their own vote" ON public.weekly_answer_votes FOR SELECT TO authenticated USING (voter_id = auth.uid());

ALTER TABLE public.trip_members ADD COLUMN start_stamps integer NOT NULL DEFAULT 0, ADD COLUMN joined_week integer;

ALTER TABLE public.season_settings
  ADD COLUMN crowning_mode text NOT NULL DEFAULT 'custom' CHECK (crowning_mode IN ('takeoff','departure','custom')),
  ADD COLUMN prize_note text NOT NULL DEFAULT '';

-- ordered anonymous answers
CREATE OR REPLACE FUNCTION trip_private.ordered_answers(p_trip uuid, p_week integer)
RETURNS TABLE(idx integer, user_id uuid, answer text, emoji text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (row_number() OVER (ORDER BY md5(a.user_id::text || p_trip::text || p_week::text)) - 1)::int, a.user_id, a.answer, a.emoji
  FROM public.weekly_answers a WHERE a.trip_id=p_trip AND a.week_number=p_week $$;

CREATE OR REPLACE FUNCTION trip_private.qotw_answers(p_trip uuid, p_week integer)
RETURNS TABLE(idx integer, answer text, emoji text, mine boolean, user_id uuid, votes integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.weekly_questions; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT * INTO q FROM public.weekly_questions w WHERE w.trip_id=p_trip AND w.week_number=p_week;
IF NOT FOUND OR q.phase='hidden' THEN RETURN; END IF;
RETURN QUERY SELECT o.idx, o.answer, o.emoji, o.user_id=auth.uid(),
  CASE WHEN q.revealed_at IS NOT NULL THEN o.user_id ELSE NULL END,
  CASE WHEN q.revealed_at IS NOT NULL THEN (SELECT count(*)::int FROM public.weekly_answer_votes v WHERE v.trip_id=p_trip AND v.week_number=p_week AND v.target_id=o.user_id) ELSE NULL END
  FROM trip_private.ordered_answers(p_trip, p_week) o
  WHERE q.phase <> 'reading' OR o.idx <= q.read_index ORDER BY o.idx; END $$;

CREATE OR REPLACE FUNCTION trip_private.qotw_finalize(p_trip uuid, p_week integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_max integer; v_ids uuid[]; BEGIN
WITH c AS (SELECT o.user_id, (SELECT count(*) FROM public.weekly_answer_votes v WHERE v.trip_id=p_trip AND v.week_number=p_week AND v.target_id=o.user_id)::int n FROM trip_private.ordered_answers(p_trip,p_week) o)
SELECT max(n) INTO v_max FROM c;
SELECT array_agg(o.user_id) INTO v_ids FROM trip_private.ordered_answers(p_trip,p_week) o
  WHERE (SELECT count(*) FROM public.weekly_answer_votes v WHERE v.trip_id=p_trip AND v.week_number=p_week AND v.target_id=o.user_id) = coalesce(v_max,0);
IF v_ids IS NULL OR cardinality(v_ids)=0 THEN
  UPDATE public.weekly_questions SET phase='revealed', revealed_at=coalesce(revealed_at,now()) WHERE trip_id=p_trip AND week_number=p_week;
ELSIF cardinality(v_ids)=1 THEN
  UPDATE public.weekly_questions SET phase='revealed', winner_id=v_ids[1], revealed_at=coalesce(revealed_at,now()) WHERE trip_id=p_trip AND week_number=p_week;
ELSE
  UPDATE public.weekly_questions SET phase='tie', tie_ids=v_ids, revealed_at=coalesce(revealed_at,now()) WHERE trip_id=p_trip AND week_number=p_week;
END IF; END $$;

CREATE OR REPLACE FUNCTION trip_private.qotw_action(p_trip uuid, p_week integer, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.weekly_questions; v_n integer; BEGIN
IF NOT trip_private.can_run_turns(p_trip, p_week) THEN RAISE EXCEPTION 'Only the host or a trip leader can run this'; END IF;
IF (SELECT starts_at FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week) > now() + interval '30 minutes' THEN RAISE EXCEPTION 'This happens at the start of game night'; END IF;
SELECT * INTO q FROM public.weekly_questions WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'No question this week'; END IF;
SELECT count(*) INTO v_n FROM public.weekly_answers WHERE trip_id=p_trip AND week_number=p_week;
IF p_action='read' THEN
  IF q.phase<>'hidden' OR q.drops_at > now() THEN RETURN; END IF;
  IF v_n=0 THEN UPDATE public.weekly_questions SET phase='revealed', revealed_at=now() WHERE trip_id=p_trip AND week_number=p_week;
  ELSE UPDATE public.weekly_questions SET phase='reading', read_index=0 WHERE trip_id=p_trip AND week_number=p_week; END IF;
ELSIF p_action='next' THEN
  IF q.phase<>'reading' THEN RETURN; END IF;
  IF q.read_index+1 >= v_n THEN UPDATE public.weekly_questions SET phase='voting' WHERE trip_id=p_trip AND week_number=p_week;
  ELSE UPDATE public.weekly_questions SET read_index=q.read_index+1 WHERE trip_id=p_trip AND week_number=p_week; END IF;
ELSIF p_action='end_voting' THEN
  IF q.phase<>'voting' THEN RETURN; END IF;
  PERFORM trip_private.qotw_finalize(p_trip, p_week);
ELSIF p_action='break_tie' THEN
  IF q.phase<>'tie' THEN RETURN; END IF;
  UPDATE public.weekly_questions SET phase='revealed', winner_id=q.tie_ids[1 + floor(random()*cardinality(q.tie_ids))::int], tie_spin_at=now() WHERE trip_id=p_trip AND week_number=p_week;
ELSE RAISE EXCEPTION 'Unknown action'; END IF; END $$;

CREATE OR REPLACE FUNCTION trip_private.vote_weekly_answer(p_trip uuid, p_week integer, p_idx integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_target uuid; v_n integer; v_members integer; v_votes integer; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF (SELECT phase FROM public.weekly_questions WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE) IS DISTINCT FROM 'voting' THEN RAISE EXCEPTION 'Voting is closed'; END IF;
SELECT o.user_id INTO v_target FROM trip_private.ordered_answers(p_trip,p_week) o WHERE o.idx=p_idx;
IF v_target IS NULL THEN RAISE EXCEPTION 'That answer was not found'; END IF;
IF v_target = auth.uid() THEN RAISE EXCEPTION 'You can''t vote for your own answer'; END IF;
INSERT INTO public.weekly_answer_votes(trip_id,week_number,voter_id,target_id) VALUES (p_trip,p_week,auth.uid(),v_target)
  ON CONFLICT (trip_id,week_number,voter_id) DO UPDATE SET target_id=EXCLUDED.target_id, created_at=now();
SELECT count(*) INTO v_n FROM public.weekly_answers WHERE trip_id=p_trip AND week_number=p_week;
SELECT count(*) INTO v_members FROM public.trip_members WHERE trip_id=p_trip;
SELECT count(*) INTO v_votes FROM public.weekly_answer_votes WHERE trip_id=p_trip AND week_number=p_week;
IF v_n = 1 THEN v_members := v_members - 1; END IF;
IF v_votes >= v_members THEN PERFORM trip_private.qotw_finalize(p_trip,p_week); END IF; END $$;

CREATE OR REPLACE FUNCTION trip_private.reveal_weekly_question(p_trip uuid, p_week integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM trip_private.qotw_action(p_trip,p_week,'read'); END $$;

DROP FUNCTION IF EXISTS public.weekly_question_status(uuid);
DROP FUNCTION IF EXISTS trip_private.weekly_question_status(uuid);
CREATE FUNCTION trip_private.weekly_question_status(p_trip uuid)
RETURNS TABLE(week_number integer, prompt text, source text, drops_at timestamptz, revealed_at timestamptz, starts_at timestamptz, answered integer, players integer, phase text, read_index integer, winner_id uuid, tie_ids uuid[], tie_spin_at timestamptz, votes integer, my_vote integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN QUERY SELECT q.week_number, CASE WHEN q.drops_at <= now() OR trip_private.is_leader(p_trip) THEN q.prompt ELSE NULL END, CASE WHEN trip_private.is_leader(p_trip) THEN q.source ELSE NULL END, q.drops_at, q.revealed_at, n.starts_at,
 (SELECT count(*)::int FROM public.weekly_answers a WHERE a.trip_id=p_trip AND a.week_number=q.week_number), (SELECT count(*)::int FROM public.trip_members m WHERE m.trip_id=p_trip),
 q.phase, q.read_index, q.winner_id, CASE WHEN q.revealed_at IS NOT NULL THEN q.tie_ids ELSE '{}'::uuid[] END, q.tie_spin_at,
 (SELECT count(*)::int FROM public.weekly_answer_votes v WHERE v.trip_id=p_trip AND v.week_number=q.week_number),
 (SELECT o.idx FROM public.weekly_answer_votes v JOIN trip_private.ordered_answers(p_trip,q.week_number) o ON o.user_id=v.target_id WHERE v.trip_id=p_trip AND v.week_number=q.week_number AND v.voter_id=auth.uid())
 FROM public.weekly_questions q JOIN public.game_nights n ON n.trip_id=q.trip_id AND n.week_number=q.week_number WHERE q.trip_id=p_trip ORDER BY q.week_number; END $$;
CREATE FUNCTION public.weekly_question_status(p_trip uuid)
RETURNS TABLE(week_number integer, prompt text, source text, drops_at timestamptz, revealed_at timestamptz, starts_at timestamptz, answered integer, players integer, phase text, read_index integer, winner_id uuid, tie_ids uuid[], tie_spin_at timestamptz, votes integer, my_vote integer)
LANGUAGE sql SET search_path=public AS $$ SELECT * FROM trip_private.weekly_question_status(p_trip) $$;

CREATE FUNCTION public.qotw_answers(p_trip uuid, p_week integer) RETURNS TABLE(idx integer, answer text, emoji text, mine boolean, user_id uuid, votes integer)
LANGUAGE sql STABLE SET search_path=public AS $$ SELECT * FROM trip_private.qotw_answers(p_trip,p_week) $$;
CREATE FUNCTION public.qotw_action(p_trip uuid, p_week integer, p_action text) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.qotw_action(p_trip,p_week,p_action) $$;
CREATE FUNCTION public.vote_weekly_answer(p_trip uuid, p_week integer, p_idx integer) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.vote_weekly_answer(p_trip,p_week,p_idx) $$;

-- game season stamps (shared by crowning + late joiners)
CREATE OR REPLACE FUNCTION trip_private.game_stamps(p_trip uuid)
RETURNS TABLE(user_id uuid, stamps integer, mx integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
g AS (SELECT m.user_id,
  sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
  sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
  FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now() AND NOT n.skipped
  LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
  WHERE m.trip_id=p_trip GROUP BY m.user_id),
qw AS (SELECT (3*count(*))::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
qa AS (SELECT a.user_id, (count(*) + 2*count(*) FILTER (WHERE q.winner_id=a.user_id))::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id)
SELECT m.user_id, (coalesce(g.stamps,0)+coalesce(qa.n,0)+m.start_stamps)::int, (coalesce(g.mx,0)+qw.total)::int
FROM public.trip_members m CROSS JOIN qw LEFT JOIN g ON g.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id WHERE m.trip_id=p_trip $$;

CREATE OR REPLACE FUNCTION trip_private.effective_crowning(p_trip uuid, p_season text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT CASE s.crowning_mode
  WHEN 'takeoff' THEN coalesce(s.crowning_at, (SELECT n.starts_at + interval '3 hours' FROM public.game_nights n WHERE n.trip_id=p_trip AND NOT n.skipped AND (n.starts_at AT TIME ZONE t.home_timezone)::date < t.start_date ORDER BY n.starts_at DESC LIMIT 1))
  WHEN 'departure' THEN (t.start_date + time '08:00') AT TIME ZONE t.home_timezone
  ELSE s.crowning_at END
FROM public.season_settings s JOIN public.trips t ON t.id=s.trip_id WHERE s.trip_id=p_trip AND s.season=p_season $$;

CREATE OR REPLACE FUNCTION trip_private.takeoff_week(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT n.week_number FROM public.game_nights n JOIN public.trips t ON t.id=n.trip_id WHERE n.trip_id=p_trip AND NOT n.skipped AND (n.starts_at AT TIME ZONE t.home_timezone)::date < t.start_date ORDER BY n.starts_at DESC LIMIT 1 $$;

CREATE OR REPLACE FUNCTION trip_private.finalize_season(p_trip uuid, p_season text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE st public.season_settings; v_at timestamptz; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT * INTO st FROM public.season_settings WHERE trip_id=p_trip AND season=p_season;
v_at := trip_private.effective_crowning(p_trip, p_season);
IF NOT FOUND OR v_at IS NULL OR v_at > now() THEN RETURN; END IF;
IF EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RETURN; END IF;
IF p_season = 'trip' THEN
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  SELECT p_trip, 'trip', r.user_id, r.score, r.stamps FROM (SELECT t.user_id, t.stamps, CASE WHEN t.max_stamps > 0 THEN round(t.stamps*100.0/t.max_stamps)::int ELSE 0 END score FROM trip_private.trip_season(p_trip) t) r
  WHERE r.stamps > 0 AND (SELECT count(*) FROM trip_private.trip_season(p_trip) o WHERE (CASE WHEN o.max_stamps>0 THEN round(o.stamps*100.0/o.max_stamps)::int ELSE 0 END, o.stamps) > (r.score, r.stamps)) < st.winners;
ELSE
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  WITH r AS (SELECT g.user_id, g.stamps, CASE WHEN g.mx>0 THEN round(g.stamps*100.0/g.mx)::int ELSE 0 END score FROM trip_private.game_stamps(p_trip) g)
  SELECT p_trip, 'game', r.user_id, r.score, r.stamps FROM r WHERE r.stamps > 0 AND (SELECT count(*) FROM r o WHERE (o.score,o.stamps) > (r.score,r.stamps)) < st.winners;
END IF; END $$;

DROP FUNCTION IF EXISTS public.season_info(uuid);
DROP FUNCTION IF EXISTS trip_private.season_info(uuid);
CREATE FUNCTION trip_private.season_info(p_trip uuid)
RETURNS TABLE(season text, winners integer, prize text, crowning_at timestamptz, crowning_label text, revealed boolean, crowning_mode text, prize_note text, takeoff_week integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
RETURN QUERY SELECT s.season, s.winners,
  CASE WHEN trip_private.is_leader(p_trip) OR coalesce(e.at <= now(), false) THEN s.prize ELSE NULL END,
  e.at, s.crowning_label, coalesce(e.at <= now(), false), s.crowning_mode,
  CASE WHEN trip_private.is_leader(p_trip) OR coalesce(e.at <= now(), false) THEN s.prize_note ELSE NULL END,
  trip_private.takeoff_week(p_trip)
FROM public.season_settings s CROSS JOIN LATERAL (SELECT trip_private.effective_crowning(p_trip, s.season) at) e WHERE s.trip_id = p_trip; END $$;
CREATE FUNCTION public.season_info(p_trip uuid)
RETURNS TABLE(season text, winners integer, prize text, crowning_at timestamptz, crowning_label text, revealed boolean, crowning_mode text, prize_note text, takeoff_week integer)
LANGUAGE sql STABLE SET search_path=public AS $$ SELECT * FROM trip_private.season_info(p_trip) $$;

DROP FUNCTION IF EXISTS public.set_season(uuid,text,integer,text,timestamptz,text);
DROP FUNCTION IF EXISTS trip_private.set_season(uuid,text,integer,text,timestamptz,text);
CREATE FUNCTION trip_private.set_season(p_trip uuid, p_season text, p_winners integer, p_prize text, p_crowning_at timestamptz, p_label text, p_mode text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_mode text := coalesce(nullif(p_mode,''),'custom'); BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set prizes'; END IF;
IF EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RAISE EXCEPTION 'This season is already crowned'; END IF;
IF p_season='trip' THEN v_mode := 'custom'; END IF;
IF v_mode NOT IN ('takeoff','departure','custom') THEN RAISE EXCEPTION 'Unknown crowning option'; END IF;
IF v_mode='custom' AND p_crowning_at IS NULL THEN RAISE EXCEPTION 'Pick a crowning date and time'; END IF;
INSERT INTO public.season_settings(trip_id, season, winners, prize, crowning_at, crowning_label, crowning_mode, prize_note)
VALUES (p_trip, p_season, p_winners, trim(coalesce(p_prize,'')), CASE WHEN v_mode='custom' THEN p_crowning_at END, trim(coalesce(p_label,'')), v_mode, left(trim(coalesce(p_note,'')),300))
ON CONFLICT (trip_id, season) DO UPDATE SET winners=EXCLUDED.winners, prize=EXCLUDED.prize, crowning_at=EXCLUDED.crowning_at, crowning_label=EXCLUDED.crowning_label, crowning_mode=EXCLUDED.crowning_mode, prize_note=EXCLUDED.prize_note; END $$;
CREATE FUNCTION public.set_season(p_trip uuid, p_season text, p_winners integer, p_prize text, p_crowning_at timestamptz, p_label text, p_mode text, p_note text)
RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.set_season(p_trip,p_season,p_winners,p_prize,p_crowning_at,p_label,p_mode,p_note) $$;

-- live crowning at Takeoff Night
CREATE OR REPLACE FUNCTION trip_private.crown_now(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_week integer := trip_private.takeoff_week(p_trip); BEGIN
IF v_week IS NULL OR NOT trip_private.can_run_turns(p_trip, v_week) THEN RAISE EXCEPTION 'Only the host or a trip leader can crown the champion'; END IF;
IF (SELECT starts_at FROM public.game_nights WHERE trip_id=p_trip AND week_number=v_week) > now() + interval '30 minutes' THEN RAISE EXCEPTION 'The crowning happens on Takeoff Night'; END IF;
UPDATE public.season_settings SET crowning_at=now() WHERE trip_id=p_trip AND season='game' AND crowning_mode='takeoff' AND crowning_at IS NULL;
END $$;
CREATE FUNCTION public.crown_now(p_trip uuid) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.crown_now(p_trip) $$;

-- default Game Season row: Takeoff Night
CREATE OR REPLACE FUNCTION trip_private.default_game_season() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
INSERT INTO public.season_settings(trip_id, season, winners, prize, crowning_label, crowning_mode) VALUES (NEW.id, 'game', 1, '', 'Takeoff Night', 'takeoff') ON CONFLICT (trip_id, season) DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER trips_default_game_season AFTER INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION trip_private.default_game_season();
INSERT INTO public.season_settings(trip_id, season, winners, prize, crowning_label, crowning_mode)
SELECT t.id, 'game', 1, '', 'Takeoff Night', 'takeoff' FROM public.trips t ON CONFLICT (trip_id, season) DO NOTHING;

-- late joiners start at the group's average
CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips%ROWTYPE; v_avg integer; v_week integer; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 SELECT * INTO t FROM public.trips WHERE join_code = upper(trim(coalesce(p_code,''))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'That invite code was not found'; END IF;
 IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
 IF (SELECT count(*) FROM public.trip_members WHERE trip_id = t.id) >= 30 THEN RAISE EXCEPTION 'This trip is full'; END IF;
 IF EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=t.id AND NOT skipped AND starts_at <= now()) THEN
   SELECT coalesce(floor(avg(g.stamps)),0)::int INTO v_avg FROM trip_private.game_stamps(t.id) g;
   SELECT coalesce(min(week_number) FILTER (WHERE starts_at > now()), max(week_number)+1) INTO v_week FROM public.game_nights WHERE trip_id=t.id;
 END IF;
 INSERT INTO public.trip_members(trip_id,user_id,start_stamps,joined_week) VALUES(t.id,auth.uid(),coalesce(v_avg,0),v_week);
 RETURN t.id;
END $$;