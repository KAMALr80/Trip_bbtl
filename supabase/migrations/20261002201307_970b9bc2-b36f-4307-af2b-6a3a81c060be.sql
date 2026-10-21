DROP POLICY game_night_moments_approved ON public.game_night_moments;
CREATE POLICY game_night_moments_approved ON public.game_night_moments FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=game_night_moments.trip_id AND m.user_id=auth.uid() AND m.status='approved'));
DROP POLICY game_night_reactions_approved ON public.game_night_reactions;
CREATE POLICY game_night_reactions_approved ON public.game_night_reactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=game_night_reactions.trip_id AND m.user_id=auth.uid() AND m.status='approved'));
DROP POLICY game_night_card_skips_own ON public.game_night_card_skips;
CREATE POLICY game_night_card_skips_own ON public.game_night_card_skips FOR SELECT TO authenticated USING (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=game_night_card_skips.trip_id AND m.user_id=auth.uid() AND m.status='approved'));
CREATE OR REPLACE FUNCTION trip_private.night_format_action(p_trip uuid,p_week integer,p_action text,p_value text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE n public.game_nights; f public.game_night_flow; picked public.game_format_prompts; v_count integer; v_actor uuid; v_theme text; v_id bigint; v_card public.game_cards; v_vote uuid; v_category text; v_next public.game_nights;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'Approved trip members only'; END IF;
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
  SELECT c.* INTO v_card FROM public.trip_play_state s JOIN public.game_cards c ON c.id=s.draw_card_id WHERE s.trip_id=p_trip FOR UPDATE OF s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Draw a card first'; END IF;
  v_category := coalesce(f.category,'travel');
  IF v_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
  INSERT INTO public.game_night_card_skips(trip_id,week_number,user_id,used) VALUES(p_trip,p_week,auth.uid(),1) ON CONFLICT(trip_id,week_number,user_id) DO UPDATE SET used=public.game_night_card_skips.used+1 WHERE public.game_night_card_skips.used<2 RETURNING used INTO v_count;
  IF v_count IS NULL THEN RAISE EXCEPTION 'You have used both skips tonight'; END IF;
  SELECT c.id INTO v_id FROM public.game_cards c WHERE ((c.category=v_category AND c.game_number=n.game_number AND (c.trip_id IS NULL OR c.trip_id=p_trip)) OR (c.game_number IS NULL AND c.trip_id IS NULL AND c.category IN (v_category, CASE WHEN v_category='spicy' THEN 'spicy' ELSE 'get-to-know' END))) AND c.id<>v_card.id ORDER BY EXISTS (SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='card' AND s.item_key=c.id::text), random() LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'No replacement cards available'; END IF;
  INSERT INTO public.content_seen(trip_id,kind,item_key) VALUES(p_trip,'card',v_id::text) ON CONFLICT DO NOTHING;
  UPDATE public.trip_play_state SET draw_card_id=v_id,draw_category=v_category,draw_at=clock_timestamp() WHERE trip_id=p_trip;
  RETURN jsonb_build_object('used',v_count,'card_id',v_id);
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
    IF v_count>0 AND EXISTS (SELECT 1 FROM public.live_votes WHERE trip_id=p_trip AND week_number=p_week AND status='open') THEN RAISE EXCEPTION 'Reveal the current vote first'; END IF;
    SELECT * INTO picked FROM public.game_format_prompts WHERE format='vote' ORDER BY md5(p_trip::text||p_week::text||v_count::text||id::text) LIMIT 1;
    v_vote := trip_private.post_live_vote(p_trip,'most_likely',picked.prompt,'[]'::jsonb,p_week);
    INSERT INTO public.game_night_moments(trip_id,week_number,stage,round_number,prompt_id) VALUES(p_trip,p_week,'showdown',v_count+1,picked.id);
    RETURN jsonb_build_object('round',v_count+1,'vote_id',v_vote);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_night_moments WHERE trip_id=p_trip AND week_number=p_week AND stage='showdown' AND round_number=2) THEN RAISE EXCEPTION 'Play both showdowns first'; END IF;
  IF EXISTS (SELECT 1 FROM public.live_votes WHERE trip_id=p_trip AND week_number=p_week AND status='open') THEN RAISE EXCEPTION 'Reveal the showdown votes first'; END IF;
  SELECT * INTO v_next FROM public.game_nights WHERE trip_id=p_trip AND starts_at>n.starts_at AND NOT skipped ORDER BY starts_at LIMIT 1;
  v_actor := v_next.host_id;
  SELECT x INTO v_theme FROM unnest(ARRAY['Wear your funniest shirt','Bring a snack from your culture','Dress like the destination','Bring a baby photo you are comfortable sharing','Wear your brightest color','Show your favorite travel keepsake']) AS x ORDER BY random() LIMIT 1;
  INSERT INTO public.game_night_moments(trip_id,week_number,stage,actor_id,theme) VALUES(p_trip,p_week,'final',v_actor,v_theme) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('host',v_actor,'theme',v_theme);
 ELSE RAISE EXCEPTION 'Unknown game action'; END IF;
END $fn$;