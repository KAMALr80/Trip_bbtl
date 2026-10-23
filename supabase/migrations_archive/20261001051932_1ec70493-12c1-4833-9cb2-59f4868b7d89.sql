CREATE TABLE public.stamp_settings(trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE, here_stamps integer NOT NULL DEFAULT 1 CHECK (here_stamps BETWEEN 0 AND 10), win_stamps integer NOT NULL DEFAULT 3 CHECK (win_stamps BETWEEN 0 AND 10), host_stamps integer NOT NULL DEFAULT 1 CHECK (host_stamps BETWEEN 0 AND 10), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.stamp_settings TO authenticated; GRANT ALL ON public.stamp_settings TO service_role;
ALTER TABLE public.stamp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view stamp values" ON public.stamp_settings FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id, auth.uid()));
CREATE TRIGGER set_stamp_settings_updated_at BEFORE UPDATE ON public.stamp_settings FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.game_scores(trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, week_number integer NOT NULL, user_id uuid NOT NULL, here boolean NOT NULL DEFAULT false, won boolean NOT NULL DEFAULT false, correct_guesses integer CHECK (correct_guesses BETWEEN 0 AND 999), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(trip_id, week_number, user_id));
GRANT SELECT ON public.game_scores TO authenticated; GRANT ALL ON public.game_scores TO service_role;
ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view scores" ON public.game_scores FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id, auth.uid()));
CREATE TRIGGER set_game_scores_updated_at BEFORE UPDATE ON public.game_scores FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.age_guesses(trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, week_number integer NOT NULL, user_id uuid NOT NULL, guess numeric NOT NULL CHECK (guess BETWEEN 0 AND 120), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(trip_id, week_number, user_id));
GRANT SELECT, INSERT, UPDATE ON public.age_guesses TO authenticated; GRANT ALL ON public.age_guesses TO service_role;
ALTER TABLE public.age_guesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players view own guess" ON public.age_guesses FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Players add own guess" ON public.age_guesses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND trip_private.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Players change own guess" ON public.age_guesses FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND trip_private.is_trip_member(trip_id, auth.uid()));
CREATE TRIGGER set_age_guesses_updated_at BEFORE UPDATE ON public.age_guesses FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.live_votes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('most_likely','would_you_rather','custom','best_answer')), prompt text NOT NULL CHECK (length(prompt) BETWEEN 1 AND 200), options jsonb NOT NULL, week_number integer, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','revealed')), ballot_count integer NOT NULL DEFAULT 0, results jsonb, created_by uuid NOT NULL, revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.live_votes TO authenticated; GRANT ALL ON public.live_votes TO service_role;
ALTER TABLE public.live_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view live votes" ON public.live_votes FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id, auth.uid()));
CREATE INDEX live_votes_trip_idx ON public.live_votes(trip_id, created_at DESC);
CREATE TRIGGER set_live_votes_updated_at BEFORE UPDATE ON public.live_votes FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.live_vote_ballots(vote_id uuid NOT NULL REFERENCES public.live_votes(id) ON DELETE CASCADE, user_id uuid NOT NULL, option_index integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(vote_id, user_id));
GRANT SELECT ON public.live_vote_ballots TO authenticated; GRANT ALL ON public.live_vote_ballots TO service_role;
ALTER TABLE public.live_vote_ballots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players view own ballot" ON public.live_vote_ballots FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER set_live_vote_ballots_updated_at BEFORE UPDATE ON public.live_vote_ballots FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE OR REPLACE FUNCTION trip_private.current_week(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT week_number FROM public.game_nights WHERE trip_id=p_trip AND starts_at <= now() + interval '12 hours' ORDER BY starts_at DESC LIMIT 1 $fn$;

CREATE OR REPLACE FUNCTION trip_private.can_run_night(p_trip uuid, p_week integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid() AND (m.role IN ('captain','co_captain') OR EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=p_week AND n.host_id=auth.uid()))) $fn$;

CREATE OR REPLACE FUNCTION trip_private.post_live_vote(p_trip uuid, p_kind text, p_prompt text, p_options jsonb, p_week integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_week integer := coalesce(p_week, trip_private.current_week(p_trip)); v_opts jsonb; v_id uuid; BEGIN
IF NOT trip_private.can_run_night(p_trip, v_week) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can post a vote'; END IF;
IF length(trim(coalesce(p_prompt,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Add a prompt'; END IF;
IF p_kind IN ('most_likely','best_answer') THEN
  SELECT jsonb_agg(jsonb_build_object('label', coalesce(c.game_name, nullif(p.display_name,''), 'Player'), 'user_id', m.user_id) ORDER BY m.joined_at) INTO v_opts FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=p_trip;
  IF jsonb_array_length(v_opts) < 2 THEN RAISE EXCEPTION 'You need at least 2 members to vote'; END IF;
ELSIF p_kind IN ('would_you_rather','custom') THEN
  IF jsonb_typeof(p_options)<>'array' OR (p_kind='would_you_rather' AND jsonb_array_length(p_options)<>2) OR jsonb_array_length(p_options) NOT BETWEEN 2 AND 4 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_options) o(v) WHERE length(trim(v)) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Add 2 to 4 short options'; END IF;
  SELECT jsonb_agg(jsonb_build_object('label', trim(v))) INTO v_opts FROM jsonb_array_elements_text(p_options) o(v);
ELSE RAISE EXCEPTION 'Unknown vote type'; END IF;
INSERT INTO public.live_votes(trip_id,kind,prompt,options,week_number,created_by) VALUES (p_trip,p_kind,trim(p_prompt),v_opts,v_week,auth.uid()) RETURNING id INTO v_id; RETURN v_id; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.cast_live_vote(p_vote uuid, p_option integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v public.live_votes; BEGIN
SELECT * INTO v FROM public.live_votes WHERE id=p_vote FOR UPDATE;
IF v.id IS NULL OR NOT trip_private.is_trip_member(v.trip_id, auth.uid()) THEN RAISE EXCEPTION 'Vote not found'; END IF;
IF v.status<>'open' THEN RAISE EXCEPTION 'This vote is closed'; END IF;
IF p_option < 0 OR p_option >= jsonb_array_length(v.options) THEN RAISE EXCEPTION 'Pick an option'; END IF;
IF v.options->p_option->>'user_id' = auth.uid()::text THEN RAISE EXCEPTION 'Nice try! You can''t vote for yourself'; END IF;
INSERT INTO public.live_vote_ballots(vote_id,user_id,option_index) VALUES (p_vote,auth.uid(),p_option) ON CONFLICT (vote_id,user_id) DO UPDATE SET option_index=EXCLUDED.option_index;
UPDATE public.live_votes SET ballot_count=(SELECT count(*) FROM public.live_vote_ballots WHERE vote_id=p_vote) WHERE id=p_vote; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.reveal_live_vote(p_vote uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v public.live_votes; v_counts jsonb; v_max integer; BEGIN
SELECT * INTO v FROM public.live_votes WHERE id=p_vote FOR UPDATE;
IF v.id IS NULL OR NOT trip_private.can_run_night(v.trip_id, v.week_number) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can reveal'; END IF;
IF v.status='revealed' THEN RETURN; END IF;
SELECT jsonb_agg((SELECT count(*) FROM public.live_vote_ballots b WHERE b.vote_id=p_vote AND b.option_index=i) ORDER BY i) INTO v_counts FROM generate_series(0, jsonb_array_length(v.options)-1) i;
UPDATE public.live_votes SET status='revealed', results=v_counts, revealed_at=now() WHERE id=p_vote;
IF v.kind='best_answer' AND v.week_number IS NOT NULL THEN
  SELECT max(x::int) INTO v_max FROM jsonb_array_elements_text(v_counts) x;
  IF v_max > 0 THEN
    INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won) SELECT v.trip_id, v.week_number, (v.options->(i::int-1)->>'user_id')::uuid, true, true FROM jsonb_array_elements_text(v_counts) WITH ORDINALITY t(c,i) WHERE c::int=v_max ON CONFLICT (trip_id,week_number,user_id) DO UPDATE SET won=true, here=true;
  END IF;
END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.save_game_scores(p_trip uuid, p_week integer, p_rows jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.can_run_night(p_trip, p_week) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can score'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week) THEN RAISE EXCEPTION 'No game night that week'; END IF;
IF jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Bad scores'; END IF;
INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won,correct_guesses)
SELECT p_trip, p_week, (r->>'user_id')::uuid, coalesce((r->>'here')::boolean,false), coalesce((r->>'won')::boolean,false), nullif(r->>'correct_guesses','')::int
FROM jsonb_array_elements(p_rows) r WHERE EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=(r->>'user_id')::uuid)
ON CONFLICT (trip_id,week_number,user_id) DO UPDATE SET here=EXCLUDED.here, won=EXCLUDED.won, correct_guesses=EXCLUDED.correct_guesses; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.resolve_age_guesses(p_trip uuid, p_week integer, p_answer numeric) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_best numeric; v_n integer; BEGIN
IF NOT trip_private.can_run_night(p_trip, p_week) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can pick the winner'; END IF;
SELECT min(abs(guess-p_answer)) INTO v_best FROM public.age_guesses WHERE trip_id=p_trip AND week_number=p_week;
IF v_best IS NULL THEN RAISE EXCEPTION 'No guesses yet'; END IF;
INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won) SELECT p_trip,p_week,user_id,true,true FROM public.age_guesses WHERE trip_id=p_trip AND week_number=p_week AND abs(guess-p_answer)=v_best ON CONFLICT (trip_id,week_number,user_id) DO UPDATE SET won=true, here=true;
GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.set_stamp_values(p_trip uuid, p_here integer, p_win integer, p_host integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can change stamp values'; END IF;
INSERT INTO public.stamp_settings(trip_id,here_stamps,win_stamps,host_stamps) VALUES (p_trip,p_here,p_win,p_host) ON CONFLICT (trip_id) DO UPDATE SET here_stamps=EXCLUDED.here_stamps, win_stamps=EXCLUDED.win_stamps, host_stamps=EXCLUDED.host_stamps; END $fn$;

GRANT EXECUTE ON FUNCTION trip_private.current_week(uuid), trip_private.can_run_night(uuid,integer), trip_private.post_live_vote(uuid,text,text,jsonb,integer), trip_private.cast_live_vote(uuid,integer), trip_private.reveal_live_vote(uuid), trip_private.save_game_scores(uuid,integer,jsonb), trip_private.resolve_age_guesses(uuid,integer,numeric), trip_private.set_stamp_values(uuid,integer,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_live_vote(p_trip uuid, p_kind text, p_prompt text, p_options jsonb, p_week integer) RETURNS uuid LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.post_live_vote(p_trip,p_kind,p_prompt,p_options,p_week) $fn$;
CREATE OR REPLACE FUNCTION public.cast_live_vote(p_vote uuid, p_option integer) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.cast_live_vote(p_vote,p_option) $fn$;
CREATE OR REPLACE FUNCTION public.reveal_live_vote(p_vote uuid) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.reveal_live_vote(p_vote) $fn$;
CREATE OR REPLACE FUNCTION public.save_game_scores(p_trip uuid, p_week integer, p_rows jsonb) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.save_game_scores(p_trip,p_week,p_rows) $fn$;
CREATE OR REPLACE FUNCTION public.resolve_age_guesses(p_trip uuid, p_week integer, p_answer numeric) RETURNS integer LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.resolve_age_guesses(p_trip,p_week,p_answer) $fn$;
CREATE OR REPLACE FUNCTION public.set_stamp_values(p_trip uuid, p_here integer, p_win integer, p_host integer) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.set_stamp_values(p_trip,p_here,p_win,p_host) $fn$;
REVOKE ALL ON FUNCTION public.post_live_vote(uuid,text,text,jsonb,integer), public.cast_live_vote(uuid,integer), public.reveal_live_vote(uuid), public.save_game_scores(uuid,integer,jsonb), public.resolve_age_guesses(uuid,integer,numeric), public.set_stamp_values(uuid,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_live_vote(uuid,text,text,jsonb,integer), public.cast_live_vote(uuid,integer), public.reveal_live_vote(uuid), public.save_game_scores(uuid,integer,jsonb), public.resolve_age_guesses(uuid,integer,numeric), public.set_stamp_values(uuid,integer,integer,integer) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_votes, public.game_scores, public.stamp_settings;