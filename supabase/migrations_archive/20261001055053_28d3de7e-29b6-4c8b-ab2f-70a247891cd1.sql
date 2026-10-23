CREATE TABLE public.trip_day_games (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, tag text NOT NULL CHECK (tag IN ('Party','Explore','Chill','Travel')), city text NOT NULL DEFAULT '', bingo jsonb NOT NULL DEFAULT '[]', bingo_mode text NOT NULL DEFAULT 'explorer', quests jsonb NOT NULL DEFAULT '[]', trivia jsonb NOT NULL DEFAULT '[]', photo_theme text NOT NULL DEFAULT '', airport jsonb NOT NULL DEFAULT '[]', wheels_up text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date));
GRANT SELECT ON public.trip_day_games TO authenticated; GRANT ALL ON public.trip_day_games TO service_role;
ALTER TABLE public.trip_day_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view day games" ON public.trip_day_games FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE TRIGGER set_trip_day_games_updated_at BEFORE UPDATE ON public.trip_day_games FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.trip_day_trivia_keys (trip_id uuid NOT NULL, day_date date NOT NULL, answers jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date), FOREIGN KEY (trip_id, day_date) REFERENCES public.trip_day_games(trip_id, day_date) ON DELETE CASCADE);
GRANT ALL ON public.trip_day_trivia_keys TO service_role;
ALTER TABLE public.trip_day_trivia_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bingo_marks (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, user_id uuid NOT NULL, square integer NOT NULL CHECK (square BETWEEN 0 AND 8), photo_path text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date, user_id, square));
GRANT SELECT ON public.bingo_marks TO authenticated; GRANT ALL ON public.bingo_marks TO service_role;
ALTER TABLE public.bingo_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view bingo" ON public.bingo_marks FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.quest_posts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, user_id uuid NOT NULL, quest integer NOT NULL CHECK (quest BETWEEN 0 AND 2), photo_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (trip_id, day_date, user_id, quest));
GRANT SELECT ON public.quest_posts TO authenticated; GRANT ALL ON public.quest_posts TO service_role;
ALTER TABLE public.quest_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view quests" ON public.quest_posts FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.quest_thumbs (post_id uuid NOT NULL REFERENCES public.quest_posts(id) ON DELETE CASCADE, trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (post_id, user_id));
GRANT SELECT ON public.quest_thumbs TO authenticated; GRANT ALL ON public.quest_thumbs TO service_role;
ALTER TABLE public.quest_thumbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view thumbs" ON public.quest_thumbs FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.trivia_answers (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, user_id uuid NOT NULL, question integer NOT NULL CHECK (question BETWEEN 0 AND 5), choice integer NOT NULL, correct boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date, user_id, question));
GRANT SELECT ON public.trivia_answers TO authenticated; GRANT ALL ON public.trivia_answers TO service_role;
ALTER TABLE public.trivia_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players view own trivia" ON public.trivia_answers FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.secret_missions (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, user_id uuid NOT NULL, mission text NOT NULL, revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date, user_id));
GRANT SELECT ON public.secret_missions TO authenticated; GRANT ALL ON public.secret_missions TO service_role;
ALTER TABLE public.secret_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or revealed missions" ON public.secret_missions FOR SELECT TO authenticated USING (user_id = auth.uid() OR (revealed_at IS NOT NULL AND public.is_trip_member(trip_id, auth.uid())));
CREATE TRIGGER set_secret_missions_updated_at BEFORE UPDATE ON public.secret_missions FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.mission_votes (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, owner_id uuid NOT NULL, voter_id uuid NOT NULL, caught boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date, owner_id, voter_id));
GRANT SELECT ON public.mission_votes TO authenticated; GRANT ALL ON public.mission_votes TO service_role;
ALTER TABLE public.mission_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view mission votes" ON public.mission_votes FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.photo_posts (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, user_id uuid NOT NULL, photo_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date, user_id));
GRANT SELECT ON public.photo_posts TO authenticated; GRANT ALL ON public.photo_posts TO service_role;
ALTER TABLE public.photo_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view photos" ON public.photo_posts FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.day_votes (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, kind text NOT NULL CHECK (kind IN ('photo','mvp')), voter_id uuid NOT NULL, choice_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date, kind, voter_id));
GRANT SELECT ON public.day_votes TO authenticated; GRANT ALL ON public.day_votes TO service_role;
ALTER TABLE public.day_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players view own day votes" ON public.day_votes FOR SELECT TO authenticated USING (voter_id = auth.uid());

CREATE TABLE public.airport_claims (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, user_id uuid NOT NULL, mission integer NOT NULL CHECK (mission BETWEEN 0 AND 4), photo_path text, guess text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, day_date, user_id, mission));
GRANT SELECT ON public.airport_claims TO authenticated; GRANT ALL ON public.airport_claims TO service_role;
ALTER TABLE public.airport_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view airport claims" ON public.airport_claims FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

-- helpers
CREATE OR REPLACE FUNCTION trip_private.trip_today(p_trip uuid) RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT (now() AT TIME ZONE home_timezone)::date FROM public.trips WHERE id=p_trip $fn$;
CREATE OR REPLACE FUNCTION trip_private.is_leader(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role IN ('captain','co_captain')) $fn$;
CREATE OR REPLACE FUNCTION trip_private.valid_photo(p_trip uuid, p_path text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$ SELECT p_path IS NULL OR (length(p_path) < 300 AND split_part(p_path,'/',1)=p_trip::text AND split_part(p_path,'/',2)=auth.uid()::text) $fn$;
CREATE OR REPLACE FUNCTION trip_private.play_day(p_trip uuid, p_date date) RETURNS public.trip_day_games LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ DECLARE g public.trip_day_games; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF p_date IS DISTINCT FROM trip_private.trip_today(p_trip) THEN RAISE EXCEPTION 'That day''s games are closed'; END IF;
SELECT * INTO g FROM public.trip_day_games WHERE trip_id=p_trip AND day_date=p_date;
IF NOT FOUND THEN RAISE EXCEPTION 'Today''s games aren''t ready yet'; END IF; RETURN g; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.mark_bingo(p_trip uuid, p_date date, p_square integer, p_photo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE g public.trip_day_games := trip_private.play_day(p_trip,p_date); BEGIN
IF g.tag='Travel' OR p_square NOT BETWEEN 0 AND 8 THEN RAISE EXCEPTION 'No bingo today'; END IF;
IF NOT trip_private.valid_photo(p_trip,p_photo) THEN RAISE EXCEPTION 'Photo upload failed'; END IF;
INSERT INTO public.bingo_marks(trip_id,day_date,user_id,square,photo_path) VALUES (p_trip,p_date,auth.uid(),p_square,p_photo) ON CONFLICT (trip_id,day_date,user_id,square) DO UPDATE SET photo_path=coalesce(excluded.photo_path,public.bingo_marks.photo_path); END $fn$;

CREATE OR REPLACE FUNCTION trip_private.post_quest(p_trip uuid, p_date date, p_quest integer, p_photo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE g public.trip_day_games := trip_private.play_day(p_trip,p_date); BEGIN
IF g.tag NOT IN ('Explore','Party') OR p_quest NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'No quests today'; END IF;
IF p_photo IS NULL OR NOT trip_private.valid_photo(p_trip,p_photo) THEN RAISE EXCEPTION 'Add a photo to post your quest'; END IF;
INSERT INTO public.quest_posts(trip_id,day_date,user_id,quest,photo_path) VALUES (p_trip,p_date,auth.uid(),p_quest,p_photo) ON CONFLICT (trip_id,day_date,user_id,quest) DO UPDATE SET photo_path=excluded.photo_path; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.thumb_quest(p_post uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE q public.quest_posts; BEGIN
SELECT * INTO q FROM public.quest_posts WHERE id=p_post; IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found'; END IF;
PERFORM trip_private.play_day(q.trip_id,q.day_date);
IF q.user_id=auth.uid() THEN RAISE EXCEPTION 'You can''t thumbs-up your own quest'; END IF;
INSERT INTO public.quest_thumbs(post_id,trip_id,user_id) VALUES (p_post,q.trip_id,auth.uid()) ON CONFLICT DO NOTHING; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.answer_trivia(p_trip uuid, p_date date, p_question integer, p_choice integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE g public.trip_day_games := trip_private.play_day(p_trip,p_date); v_ok boolean; BEGIN
IF g.tag<>'Chill' OR p_question NOT BETWEEN 0 AND 5 OR p_choice NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'No trivia today'; END IF;
IF EXISTS (SELECT 1 FROM public.trivia_answers WHERE trip_id=p_trip AND day_date=p_date AND user_id=auth.uid() AND question=p_question) THEN RAISE EXCEPTION 'Already answered'; END IF;
SELECT (answers->>p_question)::int = p_choice INTO v_ok FROM public.trip_day_trivia_keys WHERE trip_id=p_trip AND day_date=p_date;
v_ok := coalesce(v_ok,false);
INSERT INTO public.trivia_answers(trip_id,day_date,user_id,question,choice,correct) VALUES (p_trip,p_date,auth.uid(),p_question,p_choice,v_ok); RETURN v_ok; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.reveal_mission(p_trip uuid, p_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN PERFORM trip_private.play_day(p_trip,p_date);
UPDATE public.secret_missions SET revealed_at=now() WHERE trip_id=p_trip AND day_date=p_date AND user_id=auth.uid() AND revealed_at IS NULL;
IF NOT FOUND THEN RAISE EXCEPTION 'Nothing to reveal'; END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.vote_mission(p_trip uuid, p_date date, p_owner uuid, p_caught boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN PERFORM trip_private.play_day(p_trip,p_date);
IF p_owner=auth.uid() THEN RAISE EXCEPTION 'You can''t vote on your own mission'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.secret_missions WHERE trip_id=p_trip AND day_date=p_date AND user_id=p_owner AND revealed_at IS NOT NULL) THEN RAISE EXCEPTION 'That mission isn''t revealed yet'; END IF;
INSERT INTO public.mission_votes(trip_id,day_date,owner_id,voter_id,caught) VALUES (p_trip,p_date,p_owner,auth.uid(),coalesce(p_caught,false)) ON CONFLICT (trip_id,day_date,owner_id,voter_id) DO UPDATE SET caught=excluded.caught; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.post_photo(p_trip uuid, p_date date, p_photo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN PERFORM trip_private.play_day(p_trip,p_date);
IF p_photo IS NULL OR NOT trip_private.valid_photo(p_trip,p_photo) THEN RAISE EXCEPTION 'Add a photo'; END IF;
INSERT INTO public.photo_posts(trip_id,day_date,user_id,photo_path) VALUES (p_trip,p_date,auth.uid(),p_photo) ON CONFLICT (trip_id,day_date,user_id) DO UPDATE SET photo_path=excluded.photo_path; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.cast_day_vote(p_trip uuid, p_date date, p_kind text, p_choice uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN PERFORM trip_private.play_day(p_trip,p_date);
IF p_kind NOT IN ('photo','mvp') THEN RAISE EXCEPTION 'Unknown vote'; END IF;
IF p_choice=auth.uid() THEN RAISE EXCEPTION 'No voting for yourself'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_choice) THEN RAISE EXCEPTION 'Pick someone in this trip'; END IF;
IF p_kind='photo' AND NOT EXISTS (SELECT 1 FROM public.photo_posts WHERE trip_id=p_trip AND day_date=p_date AND user_id=p_choice) THEN RAISE EXCEPTION 'They haven''t posted a photo'; END IF;
INSERT INTO public.day_votes(trip_id,day_date,kind,voter_id,choice_id) VALUES (p_trip,p_date,p_kind,auth.uid(),p_choice) ON CONFLICT (trip_id,day_date,kind,voter_id) DO UPDATE SET choice_id=excluded.choice_id; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.claim_airport(p_trip uuid, p_date date, p_mission integer, p_photo text, p_guess text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE g public.trip_day_games := trip_private.play_day(p_trip,p_date); BEGIN
IF g.tag<>'Travel' OR NOT (g.airport @> to_jsonb(p_mission)) THEN RAISE EXCEPTION 'That mission isn''t on today'; END IF;
IF NOT trip_private.valid_photo(p_trip,p_photo) THEN RAISE EXCEPTION 'Photo upload failed'; END IF;
IF p_mission=1 THEN
  IF g.wheels_up IS NOT NULL THEN RAISE EXCEPTION 'Guessing is closed'; END IF;
  IF p_guess IS NULL OR p_guess !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Enter a time like 14:35'; END IF;
END IF;
INSERT INTO public.airport_claims(trip_id,day_date,user_id,mission,photo_path,guess) VALUES (p_trip,p_date,auth.uid(),p_mission,p_photo,CASE WHEN p_mission=1 THEN p_guess END) ON CONFLICT (trip_id,day_date,user_id,mission) DO UPDATE SET photo_path=coalesce(excluded.photo_path,public.airport_claims.photo_path), guess=coalesce(excluded.guess,public.airport_claims.guess); END $fn$;

CREATE OR REPLACE FUNCTION trip_private.set_wheels_up(p_trip uuid, p_date date, p_time text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can do this'; END IF;
IF p_time !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Enter a time like 14:35'; END IF;
UPDATE public.trip_day_games SET wheels_up=p_time WHERE trip_id=p_trip AND day_date=p_date; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.edit_trip_day(p_trip uuid, p_date date, p_bingo jsonb, p_quests jsonb, p_theme text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can edit games'; END IF;
IF jsonb_typeof(p_bingo)<>'array' OR jsonb_array_length(p_bingo) NOT IN (0,9) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_bingo) v WHERE length(trim(v)) NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'Bingo needs 9 short squares'; END IF;
IF jsonb_typeof(p_quests)<>'array' OR jsonb_array_length(p_quests) NOT IN (0,3) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_quests) v WHERE length(trim(v)) NOT BETWEEN 1 AND 160) THEN RAISE EXCEPTION 'Quests need 3 short tasks'; END IF;
IF length(coalesce(p_theme,'')) > 80 THEN RAISE EXCEPTION 'Keep the photo theme short'; END IF;
UPDATE public.trip_day_games SET bingo=p_bingo, quests=p_quests, photo_theme=coalesce(nullif(trim(p_theme),''),photo_theme) WHERE trip_id=p_trip AND day_date=p_date;
IF NOT FOUND THEN RAISE EXCEPTION 'Set up this day first'; END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.day_vote_results(p_trip uuid, p_date date) RETURNS TABLE(kind text, choice_id uuid, votes integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF p_date >= trip_private.trip_today(p_trip) THEN RETURN; END IF;
RETURN QUERY SELECT d.kind, d.choice_id, count(*)::int FROM public.day_votes d WHERE d.trip_id=p_trip AND d.day_date=p_date GROUP BY d.kind, d.choice_id; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.trip_season(p_trip uuid) RETURNS TABLE(user_id uuid, stamps integer, today_stamps integer, max_stamps integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_today date := trip_private.trip_today(p_trip); v_max integer; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT coalesce(sum(CASE WHEN coalesce(g.tag,dt.tag)='Travel' THEN 10 ELSE 30 END),0)::int INTO v_max
FROM public.trips t CROSS JOIN LATERAL generate_series(t.start_date, least(t.end_date, v_today), interval '1 day') s(d)
LEFT JOIN public.trip_day_games g ON g.trip_id=t.id AND g.day_date=s.d::date LEFT JOIN public.trip_day_tags dt ON dt.trip_id=t.id AND dt.day_date=s.d::date WHERE t.id=p_trip;
RETURN QUERY
WITH raw AS (
  SELECT b.user_id u, b.day_date d, (count(*) + CASE WHEN count(*)>=9 THEN 4 ELSE 0 END)::int pts FROM public.bingo_marks b WHERE b.trip_id=p_trip GROUP BY 1,2
  UNION ALL SELECT q.user_id, q.day_date, 2 FROM public.quest_posts q WHERE q.trip_id=p_trip AND (SELECT count(*) FROM public.quest_thumbs th WHERE th.post_id=q.id AND th.user_id<>q.user_id) >= 2
  UNION ALL SELECT a.user_id, a.day_date, count(*)::int FROM public.trivia_answers a WHERE a.trip_id=p_trip AND a.correct GROUP BY 1,2
  UNION ALL SELECT s.user_id, s.day_date, 3 FROM public.secret_missions s WHERE s.trip_id=p_trip AND s.revealed_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.mission_votes v WHERE v.trip_id=p_trip AND v.day_date=s.day_date AND v.owner_id=s.user_id AND NOT v.caught) AND NOT EXISTS (SELECT 1 FROM public.mission_votes v WHERE v.trip_id=p_trip AND v.day_date=s.day_date AND v.owner_id=s.user_id AND v.caught)
  UNION ALL SELECT v.voter_id, v.day_date, 1 FROM public.mission_votes v WHERE v.trip_id=p_trip AND v.caught
  UNION ALL SELECT w.choice_id, w.day_date, CASE WHEN w.kind='mvp' THEN 5 ELSE 3 END FROM (SELECT dv.day_date, dv.kind, dv.choice_id, count(*) c, max(count(*)) OVER (PARTITION BY dv.day_date, dv.kind) mc FROM public.day_votes dv WHERE dv.trip_id=p_trip AND dv.day_date < v_today GROUP BY 1,2,3) w WHERE w.c=w.mc
  UNION ALL SELECT c.user_id, c.day_date, (ARRAY[2,0,1,2,1])[c.mission+1] FROM public.airport_claims c WHERE c.trip_id=p_trip AND c.mission<>1
  UNION ALL SELECT x.user_id, x.day_date, 2 FROM (SELECT c.user_id, c.day_date, abs((split_part(c.guess,':',1)::int*60+split_part(c.guess,':',2)::int) - (split_part(g.wheels_up,':',1)::int*60+split_part(g.wheels_up,':',2)::int)) diff, min(abs((split_part(c.guess,':',1)::int*60+split_part(c.guess,':',2)::int) - (split_part(g.wheels_up,':',1)::int*60+split_part(g.wheels_up,':',2)::int))) OVER (PARTITION BY c.day_date) md FROM public.airport_claims c JOIN public.trip_day_games g ON g.trip_id=c.trip_id AND g.day_date=c.day_date WHERE c.trip_id=p_trip AND c.mission=1 AND c.guess IS NOT NULL AND g.wheels_up IS NOT NULL) x WHERE x.diff=x.md
), daily AS (
  SELECT r.u, r.d, least(sum(r.pts), CASE WHEN coalesce(g.tag,dt.tag)='Travel' THEN 10 ELSE 30 END)::int pts FROM raw r LEFT JOIN public.trip_day_games g ON g.trip_id=p_trip AND g.day_date=r.d LEFT JOIN public.trip_day_tags dt ON dt.trip_id=p_trip AND dt.day_date=r.d GROUP BY r.u, r.d, g.tag, dt.tag
)
SELECT m.user_id, coalesce(sum(dl.pts),0)::int, coalesce(sum(dl.pts) FILTER (WHERE dl.d=v_today),0)::int, v_max FROM public.trip_members m LEFT JOIN daily dl ON dl.u=m.user_id WHERE m.trip_id=p_trip GROUP BY m.user_id; END $fn$;

-- invoker wrappers
CREATE OR REPLACE FUNCTION public.mark_bingo(p_trip uuid, p_date date, p_square integer, p_photo text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.mark_bingo(p_trip,p_date,p_square,p_photo) $fn$;
CREATE OR REPLACE FUNCTION public.post_quest(p_trip uuid, p_date date, p_quest integer, p_photo text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.post_quest(p_trip,p_date,p_quest,p_photo) $fn$;
CREATE OR REPLACE FUNCTION public.thumb_quest(p_post uuid) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.thumb_quest(p_post) $fn$;
CREATE OR REPLACE FUNCTION public.answer_trivia(p_trip uuid, p_date date, p_question integer, p_choice integer) RETURNS boolean LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.answer_trivia(p_trip,p_date,p_question,p_choice) $fn$;
CREATE OR REPLACE FUNCTION public.reveal_mission(p_trip uuid, p_date date) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.reveal_mission(p_trip,p_date) $fn$;
CREATE OR REPLACE FUNCTION public.vote_mission(p_trip uuid, p_date date, p_owner uuid, p_caught boolean) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.vote_mission(p_trip,p_date,p_owner,p_caught) $fn$;
CREATE OR REPLACE FUNCTION public.post_photo(p_trip uuid, p_date date, p_photo text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.post_photo(p_trip,p_date,p_photo) $fn$;
CREATE OR REPLACE FUNCTION public.cast_day_vote(p_trip uuid, p_date date, p_kind text, p_choice uuid) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.cast_day_vote(p_trip,p_date,p_kind,p_choice) $fn$;
CREATE OR REPLACE FUNCTION public.claim_airport(p_trip uuid, p_date date, p_mission integer, p_photo text, p_guess text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.claim_airport(p_trip,p_date,p_mission,p_photo,p_guess) $fn$;
CREATE OR REPLACE FUNCTION public.set_wheels_up(p_trip uuid, p_date date, p_time text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.set_wheels_up(p_trip,p_date,p_time) $fn$;
CREATE OR REPLACE FUNCTION public.edit_trip_day(p_trip uuid, p_date date, p_bingo jsonb, p_quests jsonb, p_theme text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.edit_trip_day(p_trip,p_date,p_bingo,p_quests,p_theme) $fn$;
CREATE OR REPLACE FUNCTION public.day_vote_results(p_trip uuid, p_date date) RETURNS TABLE(kind text, choice_id uuid, votes integer) LANGUAGE sql STABLE SET search_path=public AS $fn$ SELECT * FROM trip_private.day_vote_results(p_trip,p_date) $fn$;
CREATE OR REPLACE FUNCTION public.trip_season(p_trip uuid) RETURNS TABLE(user_id uuid, stamps integer, today_stamps integer, max_stamps integer) LANGUAGE sql STABLE SET search_path=public AS $fn$ SELECT * FROM trip_private.trip_season(p_trip) $fn$;

REVOKE ALL ON FUNCTION public.mark_bingo(uuid,date,integer,text), public.post_quest(uuid,date,integer,text), public.thumb_quest(uuid), public.answer_trivia(uuid,date,integer,integer), public.reveal_mission(uuid,date), public.vote_mission(uuid,date,uuid,boolean), public.post_photo(uuid,date,text), public.cast_day_vote(uuid,date,text,uuid), public.claim_airport(uuid,date,integer,text,text), public.set_wheels_up(uuid,date,text), public.edit_trip_day(uuid,date,jsonb,jsonb,text), public.day_vote_results(uuid,date), public.trip_season(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_bingo(uuid,date,integer,text), public.post_quest(uuid,date,integer,text), public.thumb_quest(uuid), public.answer_trivia(uuid,date,integer,integer), public.reveal_mission(uuid,date), public.vote_mission(uuid,date,uuid,boolean), public.post_photo(uuid,date,text), public.cast_day_vote(uuid,date,text,uuid), public.claim_airport(uuid,date,integer,text,text), public.set_wheels_up(uuid,date,text), public.edit_trip_day(uuid,date,jsonb,jsonb,text), public.day_vote_results(uuid,date), public.trip_season(uuid) TO authenticated;
REVOKE ALL ON FUNCTION trip_private.trip_today(uuid), trip_private.is_leader(uuid), trip_private.valid_photo(uuid,text), trip_private.play_day(uuid,date), trip_private.mark_bingo(uuid,date,integer,text), trip_private.post_quest(uuid,date,integer,text), trip_private.thumb_quest(uuid), trip_private.answer_trivia(uuid,date,integer,integer), trip_private.reveal_mission(uuid,date), trip_private.vote_mission(uuid,date,uuid,boolean), trip_private.post_photo(uuid,date,text), trip_private.cast_day_vote(uuid,date,text,uuid), trip_private.claim_airport(uuid,date,integer,text,text), trip_private.set_wheels_up(uuid,date,text), trip_private.edit_trip_day(uuid,date,jsonb,jsonb,text), trip_private.day_vote_results(uuid,date), trip_private.trip_season(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.trip_today(uuid), trip_private.is_leader(uuid), trip_private.valid_photo(uuid,text), trip_private.play_day(uuid,date), trip_private.mark_bingo(uuid,date,integer,text), trip_private.post_quest(uuid,date,integer,text), trip_private.thumb_quest(uuid), trip_private.answer_trivia(uuid,date,integer,integer), trip_private.reveal_mission(uuid,date), trip_private.vote_mission(uuid,date,uuid,boolean), trip_private.post_photo(uuid,date,text), trip_private.cast_day_vote(uuid,date,text,uuid), trip_private.claim_airport(uuid,date,integer,text,text), trip_private.set_wheels_up(uuid,date,text), trip_private.edit_trip_day(uuid,date,jsonb,jsonb,text), trip_private.day_vote_results(uuid,date), trip_private.trip_season(uuid) TO authenticated;

CREATE POLICY "Members view trip game photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='trip-photos' AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id::text=split_part(name,'/',1) AND m.user_id=auth.uid()));
CREATE POLICY "Players upload own trip game photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='trip-photos' AND split_part(name,'/',2)=auth.uid()::text AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id::text=split_part(name,'/',1) AND m.user_id=auth.uid()));