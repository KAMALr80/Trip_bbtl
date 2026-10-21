DROP POLICY IF EXISTS "Account avatar upload" ON storage.objects;

CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid, p_category text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_id bigint; v_game integer; v_category text; v_week integer; BEGIN IF p_category='spicy' THEN PERFORM trip_private.require_feature(p_trip,'party_cards'); END IF;
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF NOT (trip_private.is_leader(p_trip) OR trip_private.lab_bypass(p_trip) OR EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND host_id=auth.uid() AND NOT skipped AND starts_at BETWEEN now()-interval '4 hours' AND now()+interval '2 hours')) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can draw cards'; END IF;
IF p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
IF p_category IN ('travel','food','childhood','deep','spicy') THEN
 SELECT n.game_number,f.category,n.week_number INTO v_game,v_category,v_week FROM public.game_night_flow f JOIN public.game_nights n ON n.trip_id=f.trip_id AND n.week_number=f.week_number WHERE f.trip_id=p_trip AND f.phase='cards' AND n.starts_at<=clock_timestamp()+interval '12 hours' AND n.starts_at>=clock_timestamp()-interval '12 hours' ORDER BY n.starts_at DESC LIMIT 1;
 IF v_game IS NULL OR v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Draw from tonight''s category during card rounds'; END IF;
 IF NOT trip_private.night_open(p_trip, v_week) THEN RAISE EXCEPTION 'Cards draw only while the game night is live'; END IF;
 SELECT c.id INTO v_id FROM public.game_cards c
  WHERE (c.category=p_category AND c.game_number=v_game AND (c.trip_id IS NULL OR c.trip_id=p_trip))
     OR (c.game_number IS NULL AND c.trip_id IS NULL AND c.category IN (p_category, CASE WHEN p_category='spicy' THEN 'spicy' ELSE 'get-to-know' END))
  ORDER BY NOT trip_private.in_slice(p_trip, c.id::text), EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='card' AND s.item_key=c.id::text),
           (c.game_number IS NULL),
           EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id IN (SELECT trip_private.captain_trip_ids(p_trip)) AND s.kind='card' AND s.item_key=c.id::text),
           random() LIMIT 1;
ELSE
 SELECT c.id INTO v_id FROM public.game_cards c WHERE c.category=p_category AND c.game_number IS NULL AND (c.trip_id IS NULL OR c.trip_id=p_trip)
  ORDER BY NOT trip_private.in_slice(p_trip, c.id::text), EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='card' AND s.item_key=c.id::text),
           EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id IN (SELECT trip_private.captain_trip_ids(p_trip)) AND s.kind='card' AND s.item_key=c.id::text),
           random() LIMIT 1;
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'No cards in this category'; END IF;
INSERT INTO public.content_seen(trip_id,kind,item_key) VALUES (p_trip,'card',v_id::text) ON CONFLICT DO NOTHING;
INSERT INTO public.trip_play_state(trip_id,draw_card_id,draw_category,draw_at) VALUES(p_trip,v_id,p_category,clock_timestamp()) ON CONFLICT(trip_id) DO UPDATE SET draw_card_id=EXCLUDED.draw_card_id,draw_category=EXCLUDED.draw_category,draw_at=EXCLUDED.draw_at;
RETURN v_id; END $function$;

CREATE OR REPLACE FUNCTION trip_private.extend_draw_timer(p_trip uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.trip_play_state%ROWTYPE; n integer;
BEGIN
  IF NOT (trip_private.is_leader(p_trip) OR trip_private.lab_bypass(p_trip) OR EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND host_id=auth.uid() AND NOT skipped AND starts_at BETWEEN now()-interval '4 hours' AND now()+interval '2 hours')) THEN
    RAISE EXCEPTION 'Only the host, Captain or Co-Captain can extend the timer';
  END IF;
  SELECT * INTO s FROM public.trip_play_state WHERE trip_id=p_trip FOR UPDATE;
  IF NOT FOUND OR s.timer_label IS DISTINCT FROM '20-sec Draw' OR s.timer_ends_at IS NULL OR s.timer_ends_at <= now() THEN
    RAISE EXCEPTION 'Start the drawing timer first';
  END IF;
  n := COALESCE(s.timer_secs, 20);
  IF n < 20 OR n >= 60 THEN RAISE EXCEPTION 'The drawing timer has reached its extra-time limit'; END IF;
  UPDATE public.trip_play_state SET timer_secs=n+10, timer_ends_at=s.timer_ends_at + interval '10 seconds', updated_at=now() WHERE trip_id=p_trip;
  RETURN n+10;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.mix_ai_quota(p_trip uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_used int; v_remaining int; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT trip_private.has_beta_access() OR coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION 'Sign in with an eligible account first'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
  SELECT count(*)::int INTO v_used FROM public.ai_usage WHERE user_id=auth.uid() AND kind='arcade_mix' AND created_at >= date_trunc('day', now());
  IF v_used >= 10 THEN RAISE EXCEPTION 'That is today''s AI limit. Come back tomorrow.'; END IF;
  IF v_used >= 3 THEN
    IF p_trip IS NULL OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'After three free mixes, choose a trip with AI credits.'; END IF;
    IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'LEADER_ONLY: Only the Captain or Co-Captain can spend trip AI credits.'; END IF;
    PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
    SELECT remaining INTO v_remaining FROM trip_private.credit_status(p_trip);
    IF coalesce(v_remaining,0) < 1 THEN RAISE EXCEPTION 'OUT_OF_CREDITS: This trip has no AI credits left.'; END IF;
  END IF;
  INSERT INTO public.ai_usage(user_id,trip_id,kind,credits) VALUES(auth.uid(),CASE WHEN v_used >= 3 THEN p_trip ELSE NULL END,'arcade_mix',CASE WHEN v_used >= 3 THEN 1 ELSE 0 END) RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.mission_action(p_trip uuid, p_action text, p_slot integer, p_claim uuid, p_layover boolean)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_kind text; v_m public.security_missions; v_c public.mission_claims; v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=v_uid AND status='approved') THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF p_action = 'reveal' THEN
    IF p_slot IS NULL OR p_slot < 1 OR p_slot > 5 THEN RAISE EXCEPTION 'Pick a mission slot'; END IF;
    IF p_slot > 3 AND NOT coalesce(p_layover,false) THEN RAISE EXCEPTION 'Missions 4 and 5 are for layovers'; END IF;
    IF EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND slot=p_slot) THEN RAISE EXCEPTION 'Mission already revealed'; END IF;
    IF p_slot > 1 AND NOT EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND slot=p_slot-1 AND status<>'revealed') THEN RAISE EXCEPTION 'Finish the mission before this one'; END IF;
    SELECT CASE WHEN kind IN ('at_home','cultural_inspiration') THEN 'home' ELSE 'trip' END INTO v_kind FROM public.trips WHERE id=p_trip;
    SELECT * INTO v_m FROM public.security_missions m
      WHERE m.kind=v_kind AND (m.trip_id IS NULL OR m.trip_id=p_trip)
        AND NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.user_id=v_uid AND c.mission_id=m.id)
      ORDER BY md5(m.id::text || v_uid::text || p_trip::text) LIMIT 1;
    IF v_m.id IS NULL THEN RAISE EXCEPTION 'No more missions — try More missions'; END IF;
    INSERT INTO public.mission_claims(trip_id,user_id,slot,mission_id,category,mission_text,points)
      VALUES (p_trip,v_uid,p_slot,v_m.id,v_m.category,v_m.text,CASE WHEN p_slot<=3 THEN 2 ELSE 3 END) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO v_c FROM public.mission_claims WHERE id=p_claim AND trip_id=p_trip FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF p_action IN ('complete','skip') THEN
    IF v_c.user_id <> v_uid THEN RAISE EXCEPTION 'Not your mission'; END IF;
    IF v_c.status <> 'revealed' THEN RAISE EXCEPTION 'Already answered'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='complete' THEN 'pending' ELSE 'skipped' END, updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  ELSIF p_action IN ('verify','decline') THEN
    IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can verify'; END IF;
    IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;
    IF v_c.user_id = v_uid THEN RAISE EXCEPTION 'Add a Co-Captain to verify your own missions'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='verify' THEN 'released' ELSE 'declined' END, verified_by=v_uid, decided_at=now(), updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $function$;