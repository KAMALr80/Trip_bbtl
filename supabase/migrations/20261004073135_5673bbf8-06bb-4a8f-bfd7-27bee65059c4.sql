CREATE OR REPLACE FUNCTION trip_private.pick_night_game(p_trip uuid, p_week integer, p_game integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_night public.game_nights; v_used integer[];
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
 IF NOT trip_private.trip_open(p_trip) THEN RAISE EXCEPTION 'This trip has ended'; END IF;
 PERFORM trip_private.require_feature(p_trip,'spin_wheel');
 SELECT * INTO v_night FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR v_night.skipped OR v_night.starts_at <= now() OR v_night.game_locked OR (v_night.game_number IS NOT NULL AND v_night.game_revealed) THEN RAISE EXCEPTION 'Choose an upcoming, unassigned or unrevealed night'; END IF;
 IF NOT (trip_private.is_leader(p_trip) OR v_night.host_id=auth.uid()) THEN RAISE EXCEPTION 'Only a leader or this night''s host can choose'; END IF;
 IF p_game IS NULL OR NOT EXISTS(SELECT 1 FROM public.game_catalog WHERE number=p_game) THEN RAISE EXCEPTION 'Choose a catalog game'; END IF;
 IF p_game IS NOT DISTINCT FROM v_night.game_number THEN RETURN; END IF;
 INSERT INTO public.trip_play_state(trip_id) VALUES(p_trip) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.trip_play_state WHERE trip_id=p_trip FOR UPDATE;
 SELECT coalesce(array_agg(DISTINCT game_number),'{}'::integer[]) INTO v_used FROM public.game_nights WHERE trip_id=p_trip AND week_number<>p_week AND game_number IS NOT NULL;
 IF p_game=ANY(v_used) AND EXISTS(SELECT 1 FROM public.game_catalog WHERE NOT(number=ANY(v_used))) THEN RAISE EXCEPTION 'Pick a game this Trip has not played yet'; END IF;
 UPDATE public.game_nights SET game_number=p_game WHERE trip_id=p_trip AND week_number=p_week;
 UPDATE public.trip_play_state SET used_games=array_append(v_used,p_game), spin_game=CASE WHEN spin_week=p_week THEN p_game ELSE spin_game END WHERE trip_id=p_trip;
 INSERT INTO public.game_pick_log(trip_id,week_number,game_number,actor,method) VALUES(p_trip,p_week,p_game,auth.uid(),'picked');
END $fn$;
CREATE OR REPLACE FUNCTION trip_private.surprise_night_game(p_trip uuid, p_week integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_used integer[]; v_game integer; v_n public.game_nights;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 SELECT * INTO v_n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR v_n.skipped OR v_n.starts_at<=now() OR v_n.game_locked OR (v_n.game_number IS NOT NULL AND v_n.game_revealed) OR NOT(trip_private.is_leader(p_trip) OR v_n.host_id=auth.uid()) THEN RAISE EXCEPTION 'Only the host or a leader can choose an upcoming, unassigned or unrevealed night'; END IF;
 SELECT coalesce(array_agg(DISTINCT game_number),'{}'::integer[]) INTO v_used FROM public.game_nights WHERE trip_id=p_trip AND week_number<>p_week AND game_number IS NOT NULL;
 SELECT number INTO v_game FROM public.game_catalog WHERE NOT(number=ANY(v_used)) AND number IS DISTINCT FROM v_n.game_number ORDER BY random() LIMIT 1;
 IF v_game IS NULL THEN SELECT number INTO v_game FROM public.game_catalog WHERE number IS DISTINCT FROM v_n.game_number ORDER BY random() LIMIT 1; END IF;
 IF v_game IS NULL THEN RAISE EXCEPTION 'No other game available'; END IF;
 PERFORM trip_private.pick_night_game(p_trip,p_week,v_game);
 UPDATE public.game_pick_log SET method='surprise' WHERE id=(SELECT max(id) FROM public.game_pick_log WHERE trip_id=p_trip AND week_number=p_week AND actor=auth.uid());
 RETURN v_game;
END $fn$;
CREATE OR REPLACE FUNCTION trip_private.set_bingo_needs_photo(p_trip uuid, p_required boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 UPDATE public.trips SET bingo_needs_photo=coalesce(p_required,true) WHERE id=p_trip;
END $function$;