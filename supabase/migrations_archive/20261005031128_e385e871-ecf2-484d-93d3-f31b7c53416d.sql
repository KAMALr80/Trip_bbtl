CREATE OR REPLACE FUNCTION trip_private.games_live(p_trip uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RETURN false; END IF;
  RETURN trip_private.lab_bypass(p_trip) OR EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND NOT n.skipped AND trip_private.night_open(p_trip, n.week_number));
END $$;
REVOKE ALL ON FUNCTION trip_private.games_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.games_live(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.games_live(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.games_live(p_trip) $$;
REVOKE ALL ON FUNCTION public.games_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.games_live(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid, p_category text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_id bigint; v_game integer; v_category text; v_week integer; BEGIN IF p_category='spicy' THEN PERFORM trip_private.require_feature(p_trip,'party_cards'); END IF;
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF NOT (trip_private.is_leader(p_trip) OR trip_private.lab_bypass(p_trip) OR EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND host_id=auth.uid() AND NOT skipped AND starts_at BETWEEN now()-interval '4 hours' AND now()+interval '2 hours')) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can draw cards'; END IF;
IF p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
IF NOT trip_private.games_live(p_trip) THEN RAISE EXCEPTION 'Games open only while your game night is live'; END IF;
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

CREATE OR REPLACE FUNCTION trip_private.spin_next_game(p_trip uuid)
 RETURNS TABLE(game_number integer, week_number integer, spin_time timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_target integer; v_current integer; v_game integer; v_used integer[]; v_now timestamptz:=clock_timestamp(); BEGIN PERFORM trip_private.require_feature(p_trip, 'spin_wheel');
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF NOT trip_private.trip_open(p_trip) THEN RAISE EXCEPTION 'This trip has ended'; END IF;
SELECT n.week_number INTO v_current FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at<=v_now ORDER BY n.starts_at DESC LIMIT 1;
SELECT n.week_number INTO v_target FROM public.game_nights n WHERE n.trip_id=p_trip AND n.game_number IS NULL AND n.starts_at>v_now AND NOT n.skipped AND (v_current IS NULL OR n.week_number>v_current) ORDER BY n.week_number LIMIT 1;
IF v_target IS NULL THEN RAISE EXCEPTION 'No upcoming week needs a game'; END IF;
-- Quest step gate applies only when someone has a quest marked done for this night; nights with no presented quests (incl. the pre-quest app) spin as before.
IF v_current IS NOT NULL AND trip_private.night_open(p_trip,v_current)
   AND EXISTS (SELECT 1 FROM public.season_quests q WHERE q.trip_id=p_trip AND q.quest_kind='preflight' AND q.night_week=v_current AND q.status='pending')
   AND NOT EXISTS (SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number=v_current AND f.quest_step_at IS NOT NULL) THEN RAISE EXCEPTION 'Present your quests before spinning for next week'; END IF;
IF v_target=1 THEN RAISE EXCEPTION 'The Captain chooses the first game'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid() AND m.status='approved' AND (m.role IN ('captain','co_captain') OR m.user_id=(SELECT n.host_id FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=coalesce(v_current,1)))) THEN RAISE EXCEPTION 'Only a leader or this week''s host can spin'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=v_target-1 AND n.game_number IS NOT NULL) THEN RAISE EXCEPTION 'Choose the previous week''s game first'; END IF;
INSERT INTO public.trip_play_state(trip_id) VALUES(p_trip) ON CONFLICT DO NOTHING;
SELECT coalesce(s.used_games,'{}'::integer[]) INTO v_used FROM public.trip_play_state s WHERE s.trip_id=p_trip FOR UPDATE;
SELECT g.number INTO v_game FROM public.game_catalog g WHERE NOT(g.number=ANY(v_used)) ORDER BY random() LIMIT 1;
IF v_game IS NULL THEN SELECT g.number INTO v_game FROM public.game_catalog g WHERE g.number<>(SELECT n.game_number FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=v_target-1) ORDER BY random() LIMIT 1; v_used:='{}'; END IF;
IF v_game IS NULL THEN RAISE EXCEPTION 'No game available'; END IF;
UPDATE public.game_nights n SET game_number=v_game WHERE n.trip_id=p_trip AND n.week_number=v_target AND n.game_number IS NULL;
IF NOT FOUND THEN RAISE EXCEPTION 'That week already has a game'; END IF;
UPDATE public.trip_play_state s SET used_games=array_append(v_used,v_game),spin_game=v_game,spin_week=v_target,spin_at=v_now WHERE s.trip_id=p_trip;
INSERT INTO public.game_pick_log(trip_id,week_number,game_number,actor,method) VALUES(p_trip,v_target,v_game,auth.uid(),'surprise');
RETURN QUERY SELECT v_game,v_target,v_now; END $function$;