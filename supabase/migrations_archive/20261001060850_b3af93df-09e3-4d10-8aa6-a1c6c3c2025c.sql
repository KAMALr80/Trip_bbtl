ALTER TABLE public.trips ADD COLUMN ended_at timestamptz;

CREATE TABLE public.skip_passes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, user_id uuid NOT NULL, season text NOT NULL CHECK (season IN ('game','trip')), kind text NOT NULL CHECK (kind IN ('card','quest','mission','bingo','respin')), ref text NOT NULL DEFAULT '' CHECK (length(ref) <= 80), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (trip_id, user_id, kind, ref));
GRANT SELECT ON public.skip_passes TO authenticated; GRANT ALL ON public.skip_passes TO service_role;
ALTER TABLE public.skip_passes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view skip passes" ON public.skip_passes FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE OR REPLACE FUNCTION trip_private.trip_open(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT ended_at IS NULL AND (now() AT TIME ZONE home_timezone) < (end_date + 3)::timestamp FROM public.trips WHERE id=p_trip $fn$;

CREATE OR REPLACE FUNCTION trip_private.guard_open_trip() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE t uuid; BEGIN
IF TG_TABLE_NAME = 'live_vote_ballots' THEN SELECT trip_id INTO t FROM public.live_votes WHERE id = coalesce(NEW.vote_id, OLD.vote_id);
ELSIF TG_OP = 'DELETE' THEN t := OLD.trip_id; ELSE t := NEW.trip_id; END IF;
IF t IS NOT NULL AND NOT coalesce(trip_private.trip_open(t), true) THEN RAISE EXCEPTION 'This trip has ended — it''s read-only now'; END IF;
RETURN coalesce(NEW, OLD); END $fn$;

DO $do$ DECLARE tbl text; BEGIN
FOREACH tbl IN ARRAY ARRAY['bingo_marks','quest_posts','quest_thumbs','trivia_answers','secret_missions','mission_votes','photo_posts','day_votes','airport_claims','live_votes','live_vote_ballots','game_scores','game_cards','trip_play_state','photo_reactions','photo_reports','skip_passes','age_guesses','game_night_votes','game_night_polls','game_nights','trip_day_games','trip_teams','trip_team_members','season_settings'] LOOP
  EXECUTE format('CREATE TRIGGER guard_open_trip BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION trip_private.guard_open_trip()', tbl);
END LOOP; END $do$;

CREATE OR REPLACE FUNCTION trip_private.end_trip(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE tr public.trips; today date; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can end the trip'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip; today := (now() AT TIME ZONE tr.home_timezone)::date;
IF tr.ended_at IS NOT NULL THEN RETURN; END IF;
IF today < tr.end_date OR today > tr.end_date + 1 THEN RAISE EXCEPTION 'You can end the trip from its last day until a day after'; END IF;
UPDATE public.trips SET ended_at = now() WHERE id=p_trip; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.use_skip(p_trip uuid, p_kind text, p_ref text, p_new text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE tr public.trips; s text; used int; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF NOT trip_private.trip_open(p_trip) THEN RAISE EXCEPTION 'This trip has ended — it''s read-only now'; END IF;
IF p_kind NOT IN ('card','quest','mission','bingo') THEN RAISE EXCEPTION 'Unknown skip'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip;
s := CASE WHEN (now() AT TIME ZONE tr.home_timezone)::date >= tr.start_date THEN 'trip' ELSE 'game' END;
IF s = 'game' AND p_kind <> 'card' THEN RAISE EXCEPTION 'That skip works during the trip'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(p_trip::text || auth.uid()::text));
SELECT count(*) INTO used FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND season=s;
IF used >= 3 THEN RAISE EXCEPTION 'No skip passes left this season'; END IF;
IF EXISTS (SELECT 1 FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND kind=p_kind AND ref=coalesce(p_ref,'') AND p_kind <> 'card') THEN RAISE EXCEPTION 'Already skipped'; END IF;
IF p_kind = 'mission' THEN
  IF p_new IS NULL OR length(p_new) > 300 THEN RAISE EXCEPTION 'Missing new mission'; END IF;
  UPDATE public.secret_missions SET mission = p_new WHERE trip_id=p_trip AND user_id=auth.uid() AND day_date=(now() AT TIME ZONE tr.home_timezone)::date AND revealed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open mission to skip'; END IF;
END IF;
INSERT INTO public.skip_passes(trip_id, user_id, season, kind, ref) VALUES (p_trip, auth.uid(), s, p_kind, CASE WHEN p_kind='card' THEN gen_random_uuid()::text ELSE coalesce(p_ref,'') END);
RETURN s; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.skip_card(p_trip uuid, p_category text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
PERFORM trip_private.use_skip(p_trip, 'card', '', NULL); RETURN trip_private.draw_game_card(p_trip, p_category); END $fn$;

CREATE OR REPLACE FUNCTION trip_private.respin_game(p_trip uuid) RETURNS TABLE(game_number integer, week_number integer, spin_time timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_week int; v_host uuid; v_game int; tr public.trips; used int; BEGIN
IF NOT trip_private.trip_open(p_trip) THEN RAISE EXCEPTION 'This trip has ended — it''s read-only now'; END IF;
SELECT n.week_number, n.host_id INTO v_week, v_host FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at<=clock_timestamp() ORDER BY n.starts_at DESC LIMIT 1;
IF v_week IS NULL OR v_host IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only this week''s host can use a pass to re-spin'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip;
IF (now() AT TIME ZONE tr.home_timezone)::date >= tr.start_date THEN RAISE EXCEPTION 'Game nights are over'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(p_trip::text || auth.uid()::text));
SELECT count(*) INTO used FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND season='game';
IF used >= 3 THEN RAISE EXCEPTION 'No skip passes left this season'; END IF;
IF EXISTS (SELECT 1 FROM public.skip_passes WHERE trip_id=p_trip AND kind='respin' AND ref=v_week::text) THEN RAISE EXCEPTION 'This week already had its re-spin'; END IF;
SELECT n.game_number INTO v_game FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=v_week+1;
IF v_game IS NULL THEN RAISE EXCEPTION 'Spin the wheel first'; END IF;
UPDATE public.game_nights n SET game_number=NULL WHERE n.trip_id=p_trip AND n.week_number=v_week+1;
UPDATE public.trip_play_state s SET used_games=array_remove(s.used_games, v_game) WHERE s.trip_id=p_trip;
INSERT INTO public.skip_passes(trip_id, user_id, season, kind, ref) VALUES (p_trip, auth.uid(), 'game', 'respin', v_week::text);
RETURN QUERY SELECT * FROM trip_private.spin_next_game(p_trip); END $fn$;

REVOKE ALL ON FUNCTION trip_private.trip_open(uuid), trip_private.end_trip(uuid), trip_private.use_skip(uuid,text,text,text), trip_private.skip_card(uuid,text), trip_private.respin_game(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.trip_open(uuid), trip_private.end_trip(uuid), trip_private.use_skip(uuid,text,text,text), trip_private.skip_card(uuid,text), trip_private.respin_game(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.end_trip(p_trip uuid) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.end_trip(p_trip) $fn$;
CREATE OR REPLACE FUNCTION public.use_skip(p_trip uuid, p_kind text, p_ref text, p_new text) RETURNS text LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.use_skip(p_trip,p_kind,p_ref,p_new) $fn$;
CREATE OR REPLACE FUNCTION public.skip_card(p_trip uuid, p_category text) RETURNS bigint LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.skip_card(p_trip,p_category) $fn$;
CREATE OR REPLACE FUNCTION public.respin_game(p_trip uuid) RETURNS TABLE(game_number integer, week_number integer, spin_time timestamptz) LANGUAGE sql SET search_path=public AS $fn$ SELECT * FROM trip_private.respin_game(p_trip) $fn$;
REVOKE ALL ON FUNCTION public.end_trip(uuid), public.use_skip(uuid,text,text,text), public.skip_card(uuid,text), public.respin_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_trip(uuid), public.use_skip(uuid,text,text,text), public.skip_card(uuid,text), public.respin_game(uuid) TO authenticated;