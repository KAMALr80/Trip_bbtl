CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid,p_category text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_id bigint; v_game integer; v_category text; BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
IF p_category IN ('travel','food','childhood','deep','spicy') THEN
 SELECT n.game_number,f.category INTO v_game,v_category FROM public.game_night_flow f JOIN public.game_nights n ON n.trip_id=f.trip_id AND n.week_number=f.week_number WHERE f.trip_id=p_trip AND f.phase='cards' AND n.starts_at<=clock_timestamp()+interval '12 hours' AND n.starts_at>=clock_timestamp()-interval '12 hours' ORDER BY n.starts_at DESC LIMIT 1;
 IF v_game IS NULL OR v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Draw from tonight''s category during card rounds'; END IF;
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND game_number=v_game AND trip_id IS NULL ORDER BY random() LIMIT 1;
ELSE
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND game_number IS NULL AND (trip_id IS NULL OR trip_id=p_trip) ORDER BY random() LIMIT 1;
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'No cards in this category'; END IF;
INSERT INTO public.trip_play_state(trip_id,draw_card_id,draw_category,draw_at) VALUES(p_trip,v_id,p_category,clock_timestamp()) ON CONFLICT(trip_id) DO UPDATE SET draw_card_id=EXCLUDED.draw_card_id,draw_category=EXCLUDED.draw_category,draw_at=EXCLUDED.draw_at;
RETURN v_id; END $fn$;
CREATE OR REPLACE FUNCTION trip_private.skip_card(p_trip uuid,p_category text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_id bigint; BEGIN
IF p_category IN ('travel','food','childhood','deep','spicy') AND NOT EXISTS (SELECT 1 FROM public.game_night_flow f JOIN public.game_nights n ON n.trip_id=f.trip_id AND n.week_number=f.week_number WHERE f.trip_id=p_trip AND f.phase='cards' AND f.category=p_category AND n.starts_at BETWEEN clock_timestamp()-interval '12 hours' AND clock_timestamp()+interval '12 hours') THEN RAISE EXCEPTION 'No active card round'; END IF;
PERFORM trip_private.use_skip(p_trip,'card','',NULL);
RETURN trip_private.draw_game_card(p_trip,p_category); END $fn$;