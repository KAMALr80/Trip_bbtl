CREATE OR REPLACE FUNCTION trip_private.night_flow_action(p_trip uuid,p_week integer,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_flow public.game_night_flow; v_first uuid; v_category text; v_order uuid[]; BEGIN
IF NOT trip_private.can_run_turns(p_trip,p_week) THEN RAISE EXCEPTION 'Only the host or a trip leader can run this night'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week AND game_number IS NOT NULL) THEN RAISE EXCEPTION 'This week needs a featured game first'; END IF;
IF p_action='warmup' THEN
 IF EXISTS (SELECT 1 FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week AND first_player IS NOT NULL) THEN RAISE EXCEPTION 'Warm-up already spun'; END IF;
 SELECT user_id INTO v_first FROM public.trip_members WHERE trip_id=p_trip ORDER BY random() LIMIT 1;
 SELECT category INTO v_category FROM unnest(ARRAY['travel','food','childhood','deep']::text[]) category ORDER BY random() LIMIT 1;
 IF trip_private.is_approved_adult(p_trip,auth.uid()) AND random()<0.2 THEN v_category:='spicy'; END IF;
 INSERT INTO public.game_night_flow(trip_id,week_number,phase,first_player,category) VALUES(p_trip,p_week,'warmup',v_first,v_category) ON CONFLICT(trip_id,week_number) DO UPDATE SET first_player=excluded.first_player,category=excluded.category;
ELSIF p_action='cards' THEN
 SELECT * INTO v_flow FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR v_flow.phase<>'warmup' OR v_flow.first_player IS NULL THEN RAISE EXCEPTION 'Spin the warm-up first'; END IF;
 SELECT array_agg(user_id ORDER BY CASE WHEN user_id=v_flow.first_player THEN 0 ELSE 1 END,joined_at,user_id) INTO v_order FROM public.trip_members WHERE trip_id=p_trip;
 INSERT INTO public.game_night_turns(trip_id,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,p_week,2,v_order,0,1,true) ON CONFLICT(trip_id) DO UPDATE SET week_number=excluded.week_number,cards_per_person=2,player_order=excluded.player_order,turn_index=0,card_number=1,active=true;
 UPDATE public.game_night_flow SET phase='cards',rounds_target=2 WHERE trip_id=p_trip AND week_number=p_week;
ELSIF p_action='add_round' THEN
 SELECT * INTO v_flow FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR v_flow.phase<>'cards' OR v_flow.rounds_target>=5 THEN RAISE EXCEPTION 'No more rounds can be added'; END IF;
 UPDATE public.game_night_turns SET cards_per_person=cards_per_person+1,active=true WHERE trip_id=p_trip AND week_number=p_week;
 UPDATE public.game_night_flow SET rounds_target=rounds_target+1 WHERE trip_id=p_trip AND week_number=p_week;
ELSIF p_action='finale' THEN
 UPDATE public.game_night_flow SET phase='finale' WHERE trip_id=p_trip AND week_number=p_week AND phase='cards';
 IF NOT FOUND THEN RAISE EXCEPTION 'Start the card rounds first'; END IF;
 UPDATE public.game_night_turns SET active=false WHERE trip_id=p_trip AND week_number=p_week;
ELSE RAISE EXCEPTION 'Unknown game-night action'; END IF;
END $fn$;
DROP POLICY IF EXISTS "Approved adults see featured spicy cards" ON public.game_cards;
CREATE POLICY "Approved adults see featured spicy cards" ON public.game_cards FOR SELECT TO authenticated USING (category='spicy' AND trip_id IS NULL AND EXISTS (SELECT 1 FROM public.trip_members m JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.game_number=game_cards.game_number WHERE m.user_id=auth.uid() AND trip_private.is_approved_adult(m.trip_id,auth.uid())));
CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid,p_category text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_id bigint; v_week integer; v_game integer; BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
SELECT n.week_number,n.game_number INTO v_week,v_game FROM public.game_nights n JOIN public.game_night_flow f ON f.trip_id=n.trip_id AND f.week_number=n.week_number AND f.phase='cards' WHERE n.trip_id=p_trip ORDER BY n.starts_at DESC LIMIT 1;
IF v_week IS NOT NULL AND p_category IN ('travel','food','childhood','deep','spicy') THEN
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND game_number=v_game AND trip_id IS NULL ORDER BY random() LIMIT 1;
ELSE
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND (trip_id IS NULL OR trip_id=p_trip) ORDER BY random() LIMIT 1;
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'No cards in this category'; END IF;
INSERT INTO public.trip_play_state(trip_id,draw_card_id,draw_category,draw_at) VALUES(p_trip,v_id,p_category,clock_timestamp()) ON CONFLICT(trip_id) DO UPDATE SET draw_card_id=EXCLUDED.draw_card_id,draw_category=EXCLUDED.draw_category,draw_at=EXCLUDED.draw_at;
RETURN v_id; END $fn$;