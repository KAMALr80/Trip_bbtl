CREATE TABLE public.weekly_question_pool (id serial PRIMARY KEY, prompt text NOT NULL UNIQUE, spicy boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.weekly_question_pool TO service_role;
ALTER TABLE public.weekly_question_pool ENABLE ROW LEVEL SECURITY;
INSERT INTO public.weekly_question_pool(prompt, spicy) VALUES
('What''s the one food you HAVE to try on this trip?',false),
('Window seat or aisle seat, and defend your answer.',false),
('What''s the best trip you''ve ever taken, in one sentence?',false),
('Would you rather lose your luggage or your phone for the whole trip?',false),
('What''s your most chaotic travel story?',false),
('What song should be the official trip anthem?',false),
('What''s one thing you always overpack?',false),
('Street food or fancy dinner: which wins?',false),
('What''s a childhood vacation memory you still think about?',false),
('Would you rather have a 6 AM flight or a 2 AM layover?',false),
('What''s your go-to airport snack?',false),
('Which squad member would survive longest lost in a foreign city?',false),
('What''s the weirdest food you''ve ever eaten?',false),
('Beach day or city day?',false),
('What''s one thing on your trip bucket list?',false),
('Would you rather only eat breakfast foods or only eat desserts all trip?',false),
('What''s your travel superpower?',false),
('What''s the best souvenir you''ve ever brought home?',false),
('If this trip were a movie, what would it be called?',false),
('What''s a food you hated as a kid but love now?',false),
('Would you rather plan every minute or wing the whole day?',false),
('What''s your favorite memory with someone in this squad?',false),
('What''s the first thing you do when you land somewhere new?',false),
('Spicy, sweet, or salty: pick a food personality.',false),
('What''s one phrase you want to learn before we go?',false),
('Would you rather swim with sharks or skydive?',false),
('What''s your most-used emoji, and why?',false),
('What''s the best meal you''ve ever had on vacation?',false),
('Who in the squad is most likely to miss the flight?',false),
('What''s one rule the squad should follow on this trip?',false),
('What''s your ideal lazy vacation day?',false),
('Would you rather have unlimited flights or unlimited hotel stays?',false),
('What''s the worst cocktail you''ve ever ordered?',true),
('What''s your signature move on a night out?',true),
('Best or worst hangover cure you swear by?',true),
('What drink should be the official trip drink?',true),
('What''s the latest you''ve ever stayed out on vacation?',true),
('What''s your most embarrassing night-out story you can share?',true);

CREATE TABLE public.weekly_questions (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, week_number integer NOT NULL, prompt text NOT NULL CHECK (length(prompt) BETWEEN 3 AND 200), source text NOT NULL DEFAULT 'pool' CHECK (source IN ('pool','custom')), drops_at timestamptz NOT NULL, revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, week_number));
GRANT ALL ON public.weekly_questions TO service_role;
ALTER TABLE public.weekly_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Questions are read through weekly_question_status" ON public.weekly_questions FOR SELECT TO authenticated USING (false);
CREATE TRIGGER set_weekly_questions_updated_at BEFORE UPDATE ON public.weekly_questions FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.weekly_answers (trip_id uuid NOT NULL, week_number integer NOT NULL, user_id uuid NOT NULL, answer text NOT NULL CHECK (length(trim(answer)) BETWEEN 1 AND 200), emoji text CHECK (emoji IS NULL OR length(emoji) <= 8), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, week_number, user_id), FOREIGN KEY (trip_id, week_number) REFERENCES public.weekly_questions(trip_id, week_number) ON DELETE CASCADE);
GRANT SELECT ON public.weekly_answers TO authenticated; GRANT ALL ON public.weekly_answers TO service_role;
ALTER TABLE public.weekly_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own answer or revealed answers in my trip" ON public.weekly_answers FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()) AND (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=weekly_answers.trip_id AND q.week_number=weekly_answers.week_number AND q.revealed_at IS NOT NULL)));
CREATE TRIGGER set_weekly_answers_updated_at BEFORE UPDATE ON public.weekly_answers FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE OR REPLACE FUNCTION trip_private.pick_weekly_prompt(p_trip uuid) RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $fn$
SELECT p.prompt FROM public.weekly_question_pool p WHERE (NOT p.spicy OR coalesce((SELECT enabled FROM public.trip_adult_settings WHERE trip_id=p_trip),false))
ORDER BY (p.prompt IN (SELECT prompt FROM public.weekly_questions WHERE trip_id=p_trip)), random() LIMIT 1 $fn$;

CREATE OR REPLACE FUNCTION trip_private.ensure_weekly_questions(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE n record; tz text; d date; BEGIN
SELECT home_timezone INTO tz FROM public.trips WHERE id=p_trip;
FOR n IN SELECT cur.week_number, prev.starts_at prev_start FROM public.game_nights cur JOIN public.game_nights prev ON prev.trip_id=cur.trip_id AND prev.week_number=cur.week_number-1
  WHERE cur.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=cur.week_number) LOOP
  d := (n.prev_start AT TIME ZONE tz)::date; d := d + (8 - extract(isodow FROM d)::int);
  INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, n.week_number, trip_private.pick_weekly_prompt(p_trip), (d + time '09:00') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
END LOOP; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.weekly_question_status(p_trip uuid) RETURNS TABLE(week_number integer, prompt text, source text, drops_at timestamptz, revealed_at timestamptz, starts_at timestamptz, answered integer, players integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN QUERY SELECT q.week_number, CASE WHEN q.drops_at <= now() OR trip_private.is_leader(p_trip) THEN q.prompt ELSE NULL END, CASE WHEN trip_private.is_leader(p_trip) THEN q.source ELSE NULL END, q.drops_at, q.revealed_at, n.starts_at,
 (SELECT count(*)::int FROM public.weekly_answers a WHERE a.trip_id=p_trip AND a.week_number=q.week_number), (SELECT count(*)::int FROM public.trip_members m WHERE m.trip_id=p_trip)
 FROM public.weekly_questions q JOIN public.game_nights n ON n.trip_id=q.trip_id AND n.week_number=q.week_number WHERE q.trip_id=p_trip ORDER BY q.week_number; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.set_weekly_question(p_trip uuid, p_week integer, p_prompt text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE q public.weekly_questions; BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can change the question'; END IF;
SELECT * INTO q FROM public.weekly_questions WHERE trip_id=p_trip AND week_number=p_week;
IF NOT FOUND THEN RAISE EXCEPTION 'That question isn''t scheduled yet'; END IF;
IF q.drops_at <= now() THEN RAISE EXCEPTION 'This question already dropped'; END IF;
IF p_prompt IS NULL OR length(trim(p_prompt))=0 THEN UPDATE public.weekly_questions SET prompt=trip_private.pick_weekly_prompt(p_trip), source='pool' WHERE trip_id=p_trip AND week_number=p_week;
ELSE IF length(trim(p_prompt)) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Keep it between 3 and 200 characters'; END IF;
 UPDATE public.weekly_questions SET prompt=trim(p_prompt), source='custom' WHERE trip_id=p_trip AND week_number=p_week; END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.answer_weekly_question(p_trip uuid, p_week integer, p_answer text, p_emoji text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE q public.weekly_questions; s timestamptz; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND ended_at IS NOT NULL) THEN RAISE EXCEPTION 'This trip has ended'; END IF;
SELECT * INTO q FROM public.weekly_questions WHERE trip_id=p_trip AND week_number=p_week;
IF NOT FOUND OR q.drops_at > now() THEN RAISE EXCEPTION 'This question hasn''t dropped yet'; END IF;
SELECT starts_at INTO s FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week;
IF q.revealed_at IS NOT NULL OR s <= now() THEN RAISE EXCEPTION 'Answers are locked for this week'; END IF;
IF length(trim(coalesce(p_answer,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Answers are 1 to 200 characters'; END IF;
INSERT INTO public.weekly_answers(trip_id, week_number, user_id, answer, emoji) VALUES (p_trip, p_week, auth.uid(), trim(p_answer), nullif(trim(coalesce(p_emoji,'')),''))
ON CONFLICT (trip_id, week_number, user_id) DO UPDATE SET answer=EXCLUDED.answer, emoji=EXCLUDED.emoji; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.reveal_weekly_question(p_trip uuid, p_week integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.can_run_turns(p_trip, p_week) THEN RAISE EXCEPTION 'Only the host or a trip leader can reveal answers'; END IF;
IF (SELECT starts_at FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week) > now() + interval '30 minutes' THEN RAISE EXCEPTION 'Reveal at the start of game night'; END IF;
UPDATE public.weekly_questions SET revealed_at=now() WHERE trip_id=p_trip AND week_number=p_week AND revealed_at IS NULL AND drops_at <= now(); END $fn$;

CREATE OR REPLACE FUNCTION trip_private.finalize_season(p_trip uuid, p_season text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE st public.season_settings; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT * INTO st FROM public.season_settings WHERE trip_id=p_trip AND season=p_season;
IF NOT FOUND OR st.crowning_at IS NULL OR st.crowning_at > now() THEN RETURN; END IF;
IF EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RETURN; END IF;
IF p_season = 'trip' THEN
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  SELECT p_trip, 'trip', r.user_id, r.score, r.stamps FROM (SELECT t.user_id, t.stamps, CASE WHEN t.max_stamps > 0 THEN round(t.stamps*100.0/t.max_stamps)::int ELSE 0 END score FROM trip_private.trip_season(p_trip) t) r
  WHERE r.stamps > 0 AND (SELECT count(*) FROM trip_private.trip_season(p_trip) o WHERE (CASE WHEN o.max_stamps>0 THEN round(o.stamps*100.0/o.max_stamps)::int ELSE 0 END, o.stamps) > (r.score, r.stamps)) < st.winners;
ELSE
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
  g AS (SELECT m.user_id,
    sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
    sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
    FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now()
    LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
    WHERE m.trip_id=p_trip GROUP BY m.user_id),
  qw AS (SELECT count(*)::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
  qa AS (SELECT a.user_id, count(*)::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id),
  r AS (SELECT g.user_id, (coalesce(g.stamps,0)+coalesce(qa.n,0))::int stamps, CASE WHEN g.mx+qw.total>0 THEN round((coalesce(g.stamps,0)+coalesce(qa.n,0))*100.0/(g.mx+qw.total))::int ELSE 0 END score FROM g CROSS JOIN qw LEFT JOIN qa ON qa.user_id=g.user_id)
  SELECT p_trip, 'game', r.user_id, r.score, r.stamps FROM r WHERE r.stamps > 0 AND (SELECT count(*) FROM r o WHERE (o.score,o.stamps) > (r.score,r.stamps)) < st.winners;
END IF; END $fn$;

REVOKE ALL ON FUNCTION trip_private.pick_weekly_prompt(uuid), trip_private.ensure_weekly_questions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION trip_private.weekly_question_status(uuid), trip_private.set_weekly_question(uuid,integer,text), trip_private.answer_weekly_question(uuid,integer,text,text), trip_private.reveal_weekly_question(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.weekly_question_status(uuid), trip_private.set_weekly_question(uuid,integer,text), trip_private.answer_weekly_question(uuid,integer,text,text), trip_private.reveal_weekly_question(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.weekly_question_status(p_trip uuid) RETURNS TABLE(week_number integer, prompt text, source text, drops_at timestamptz, revealed_at timestamptz, starts_at timestamptz, answered integer, players integer) LANGUAGE sql SET search_path=public AS $fn$ SELECT * FROM trip_private.weekly_question_status(p_trip) $fn$;
CREATE OR REPLACE FUNCTION public.set_weekly_question(p_trip uuid, p_week integer, p_prompt text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.set_weekly_question(p_trip, p_week, p_prompt) $fn$;
CREATE OR REPLACE FUNCTION public.answer_weekly_question(p_trip uuid, p_week integer, p_answer text, p_emoji text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.answer_weekly_question(p_trip, p_week, p_answer, p_emoji) $fn$;
CREATE OR REPLACE FUNCTION public.reveal_weekly_question(p_trip uuid, p_week integer) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.reveal_weekly_question(p_trip, p_week) $fn$;
REVOKE ALL ON FUNCTION public.weekly_question_status(uuid), public.set_weekly_question(uuid,integer,text), public.answer_weekly_question(uuid,integer,text,text), public.reveal_weekly_question(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weekly_question_status(uuid), public.set_weekly_question(uuid,integer,text), public.answer_weekly_question(uuid,integer,text,text), public.reveal_weekly_question(uuid,integer) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_answers;