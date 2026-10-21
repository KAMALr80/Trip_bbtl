CREATE TABLE public.game_night_moments (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, week_number integer NOT NULL, stage text NOT NULL CHECK (stage IN ('warmup','showdown','final')), round_number integer NOT NULL DEFAULT 1 CHECK (round_number BETWEEN 1 AND 2), prompt_id bigint REFERENCES public.game_format_prompts(id), actor_id uuid, theme text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id,week_number,stage,round_number), FOREIGN KEY (trip_id,week_number) REFERENCES public.game_nights(trip_id,week_number) ON DELETE CASCADE);
GRANT SELECT ON public.game_night_moments TO authenticated;
GRANT ALL ON public.game_night_moments TO service_role;
ALTER TABLE public.game_night_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY game_night_moments_approved ON public.game_night_moments FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id,auth.uid()));
CREATE TABLE public.game_night_reactions (trip_id uuid NOT NULL, week_number integer NOT NULL, card_id bigint NOT NULL REFERENCES public.game_cards(id), user_id uuid NOT NULL, emoji text NOT NULL CHECK (emoji IN ('❤️','😂','🔥','👏','✨')), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(trip_id,week_number,card_id,user_id), FOREIGN KEY(trip_id,week_number) REFERENCES public.game_nights(trip_id,week_number) ON DELETE CASCADE);
GRANT SELECT ON public.game_night_reactions TO authenticated;
GRANT ALL ON public.game_night_reactions TO service_role;
ALTER TABLE public.game_night_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY game_night_reactions_approved ON public.game_night_reactions FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id,auth.uid()));
CREATE TABLE public.game_night_card_skips (trip_id uuid NOT NULL, week_number integer NOT NULL, user_id uuid NOT NULL, used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 2), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(trip_id,week_number,user_id), FOREIGN KEY(trip_id,week_number) REFERENCES public.game_nights(trip_id,week_number) ON DELETE CASCADE);
GRANT SELECT ON public.game_night_card_skips TO authenticated;
GRANT ALL ON public.game_night_card_skips TO service_role;
ALTER TABLE public.game_night_card_skips ENABLE ROW LEVEL SECURITY;
CREATE POLICY game_night_card_skips_own ON public.game_night_card_skips FOR SELECT TO authenticated USING (user_id=auth.uid() AND trip_private.is_trip_member(trip_id,auth.uid()));
CREATE OR REPLACE FUNCTION trip_private.night_format_action(p_trip uuid,p_week integer,p_action text,p_value text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE n public.game_nights; f public.game_night_flow; picked public.game_format_prompts; v_count int; v_actor uuid; v_theme text; v_id bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Approved trip members only'; END IF;
 SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR n.skipped OR NOT trip_private.night_open(p_trip,p_week) THEN RAISE EXCEPTION 'This game night is not open'; END IF;
 SELECT * INTO f FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week;
 IF p_action='react' THEN
  IF f.phase<>'cards' OR p_value NOT IN ('❤️','😂','🔥','👏','✨') THEN RAISE EXCEPTION 'Card reactions open during cards only'; END IF;
  SELECT draw_card_id INTO v_id FROM public.trip_play_state WHERE trip_id=p_trip;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Draw a card first'; END IF;
  INSERT INTO public.game_night_reactions(trip_id,week_number,card_id,user_id,emoji) VALUES(p_trip,p_week,v_id,auth.uid(),p_value) ON CONFLICT(trip_id,week_number,card_id,user_id) DO UPDATE SET emoji=excluded.emoji;
  RETURN jsonb_build_object('ok',true);
 ELSIF p_action='skip' THEN
  IF f.phase<>'cards' THEN RAISE EXCEPTION 'Skips open during cards only'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_night_turns WHERE trip_id=p_trip AND week_number=p_week AND active AND player_order[turn_index+1]=auth.uid()) THEN RAISE EXCEPTION 'Wait for your turn'; END IF;
  INSERT INTO public.game_night_card_skips(trip_id,week_number,user_id,used) VALUES(p_trip,p_week,auth.uid(),1) ON CONFLICT(trip_id,week_number,user_id) DO UPDATE SET used=public.game_night_card_skips.used+1 WHERE public.game_night_card_skips.used<2 RETURNING used INTO v_count;
  IF v_count IS NULL THEN RAISE EXCEPTION 'You have used both skips tonight'; END IF;
  RETURN jsonb_build_object('used',v_count);
 ELSIF p_action='warmup' THEN
  IF f.first_player IS NULL THEN RAISE EXCEPTION 'Spin the warm-up first'; END IF;
  SELECT * INTO picked FROM public.game_format_prompts WHERE format='wheel' ORDER BY md5(p_trip::text||p_week::text||id::text) LIMIT 1;
  INSERT INTO public.game_night_moments(trip_id,week_number,stage,prompt_id,actor_id) VALUES(p_trip,p_week,'warmup',picked.id,f.first_player) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok',true);
 ELSIF p_action IN ('showdown','final') THEN
  IF NOT (trip_private.is_leader(p_trip) OR n.host_id=auth.uid()) THEN RAISE EXCEPTION 'Host or leader only'; END IF;
  IF f.phase<>'finale' THEN RAISE EXCEPTION 'Finish the cards first'; END IF;
  IF p_action='showdown' THEN
    SELECT count(*) INTO v_count FROM public.game_night_moments WHERE trip_id=p_trip AND week_number=p_week AND stage='showdown';
    IF v_count>=2 THEN RAISE EXCEPTION 'Both showdowns are already open'; END IF;
    SELECT * INTO picked FROM public.game_format_prompts WHERE format='vote' ORDER BY md5(p_trip::text||p_week::text||v_count::text||id::text) LIMIT 1;
    INSERT INTO public.game_night_moments(trip_id,week_number,stage,round_number,prompt_id) VALUES(p_trip,p_week,'showdown',v_count+1,picked.id);
    RETURN jsonb_build_object('round',v_count+1,'prompt',picked.prompt);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_night_moments WHERE trip_id=p_trip AND week_number=p_week AND stage='showdown' AND round_number=2) THEN RAISE EXCEPTION 'Play both showdowns first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_votes WHERE trip_id=p_trip AND week_number=p_week AND status='revealed') THEN RAISE EXCEPTION 'Reveal a showdown vote first'; END IF;
  SELECT host_id INTO v_actor FROM public.game_nights WHERE trip_id=p_trip AND starts_at>n.starts_at AND NOT skipped ORDER BY starts_at LIMIT 1;
  SELECT x INTO v_theme FROM unnest(ARRAY['Wear your funniest shirt','Bring a snack from your culture','Dress like the destination','Bring a baby photo you are comfortable sharing','Wear your brightest color','Show your favorite travel keepsake']) AS x ORDER BY md5(p_trip::text||p_week::text||x) LIMIT 1;
  INSERT INTO public.game_night_moments(trip_id,week_number,stage,actor_id,theme) VALUES(p_trip,p_week,'final',v_actor,v_theme) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('host',v_actor,'theme',v_theme);
 ELSE RAISE EXCEPTION 'Unknown game action'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION trip_private.night_format_action(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.night_format_action(uuid,integer,text,text) TO authenticated;
CREATE FUNCTION public.night_format_action(p_trip uuid,p_week integer,p_action text,p_value text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.night_format_action(p_trip,p_week,p_action,p_value) $$;
REVOKE ALL ON FUNCTION public.night_format_action(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.night_format_action(uuid,integer,text,text) TO authenticated;