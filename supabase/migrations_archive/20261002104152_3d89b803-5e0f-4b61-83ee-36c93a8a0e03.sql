CREATE OR REPLACE FUNCTION trip_private.night_open(p_trip uuid, p_week integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=p_week AND NOT n.skipped
   AND clock_timestamp() <= n.starts_at + interval '3 hours 30 minutes'
   AND (clock_timestamp() >= n.starts_at - interval '15 minutes'
        OR EXISTS (SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number=p_week AND f.first_player IS NOT NULL))) $$;
REVOKE ALL ON FUNCTION trip_private.night_open(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.night_open(uuid,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.save_game_scores(p_trip uuid, p_week integer, p_rows jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
IF NOT trip_private.can_run_night(p_trip, p_week) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can score'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week) THEN RAISE EXCEPTION 'No game night that week'; END IF;
IF NOT trip_private.night_open(p_trip, p_week) THEN RAISE EXCEPTION 'Scores only count while the game night is live'; END IF;
IF jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Bad scores'; END IF;
INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won,correct_guesses)
SELECT p_trip, p_week, (r->>'user_id')::uuid, coalesce((r->>'here')::boolean,false), coalesce((r->>'won')::boolean,false), nullif(r->>'correct_guesses','')::int
FROM jsonb_array_elements(p_rows) r WHERE EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=(r->>'user_id')::uuid)
ON CONFLICT (trip_id,week_number,user_id) DO UPDATE SET here=EXCLUDED.here, won=EXCLUDED.won, correct_guesses=EXCLUDED.correct_guesses; END $function$;

CREATE OR REPLACE FUNCTION trip_private.cast_live_vote(p_vote uuid, p_option integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v public.live_votes; BEGIN
SELECT * INTO v FROM public.live_votes WHERE id=p_vote FOR UPDATE;
IF v.id IS NULL OR NOT trip_private.is_trip_member(v.trip_id, auth.uid()) THEN RAISE EXCEPTION 'Vote not found'; END IF;
IF v.status<>'open' THEN RAISE EXCEPTION 'This vote is closed'; END IF;
IF v.week_number IS NOT NULL AND EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=v.trip_id AND week_number=v.week_number) AND NOT trip_private.night_open(v.trip_id, v.week_number) THEN RAISE EXCEPTION 'Voting is open only while the game night is live'; END IF;
IF p_option < 0 OR p_option >= jsonb_array_length(v.options) THEN RAISE EXCEPTION 'Pick an option'; END IF;
IF v.options->p_option->>'user_id' = auth.uid()::text THEN RAISE EXCEPTION 'Nice try! You can''t vote for yourself'; END IF;
INSERT INTO public.live_vote_ballots(vote_id,user_id,option_index) VALUES (p_vote,auth.uid(),p_option) ON CONFLICT (vote_id,user_id) DO UPDATE SET option_index=EXCLUDED.option_index;
UPDATE public.live_votes SET ballot_count=(SELECT count(*) FROM public.live_vote_ballots WHERE vote_id=p_vote) WHERE id=p_vote; END $function$;

CREATE OR REPLACE FUNCTION trip_private.reveal_live_vote(p_vote uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v public.live_votes; v_counts jsonb; v_max integer; v_finale boolean; BEGIN
SELECT * INTO v FROM public.live_votes WHERE id=p_vote FOR UPDATE;
IF v.id IS NULL OR NOT trip_private.can_run_night(v.trip_id,v.week_number) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can reveal'; END IF;
IF v.status='revealed' THEN RETURN; END IF;
SELECT jsonb_agg((SELECT count(*) FROM public.live_vote_ballots b WHERE b.vote_id=p_vote AND b.option_index=i) ORDER BY i) INTO v_counts FROM generate_series(0,jsonb_array_length(v.options)-1) i;
UPDATE public.live_votes SET status='revealed',results=v_counts,revealed_at=now() WHERE id=p_vote;
SELECT EXISTS(SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=v.trip_id AND f.week_number=v.week_number AND f.phase='finale') INTO v_finale;
-- Wins are scored only while the night is live (plus the late-vote grace).
IF (v.kind='best_answer' OR (v.kind='most_likely' AND v_finale)) AND v.week_number IS NOT NULL AND trip_private.night_open(v.trip_id, v.week_number) THEN
 SELECT max(x::int) INTO v_max FROM jsonb_array_elements_text(v_counts) x;
 IF v_max>0 THEN
 INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won) SELECT v.trip_id,v.week_number,(v.options->(i::int-1)->>'user_id')::uuid,true,true FROM jsonb_array_elements_text(v_counts) WITH ORDINALITY t(c,i) WHERE c::int=v_max ON CONFLICT(trip_id,week_number,user_id) DO UPDATE SET won=true,here=true;
 END IF;
END IF; END $function$;

CREATE OR REPLACE FUNCTION trip_private.post_live_vote(p_trip uuid, p_kind text, p_prompt text, p_options jsonb, p_week integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_week integer := coalesce(p_week, trip_private.current_week(p_trip)); v_opts jsonb; v_id uuid; BEGIN
IF NOT trip_private.can_run_night(p_trip, v_week) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can post a vote'; END IF;
IF v_week IS NOT NULL AND EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=v_week) AND NOT trip_private.night_open(p_trip, v_week) THEN RAISE EXCEPTION 'Votes open only while the game night is live'; END IF;
IF length(trim(coalesce(p_prompt,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Add a prompt'; END IF;
IF p_kind IN ('most_likely','best_answer') THEN
  SELECT jsonb_agg(jsonb_build_object('label', coalesce(c.game_name, nullif(p.display_name,''), 'Player'), 'user_id', m.user_id) ORDER BY m.joined_at) INTO v_opts FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=p_trip;
  IF jsonb_array_length(v_opts) < 2 THEN RAISE EXCEPTION 'You need at least 2 members to vote'; END IF;
ELSIF p_kind IN ('would_you_rather','custom') THEN
  IF jsonb_typeof(p_options)<>'array' OR (p_kind='would_you_rather' AND jsonb_array_length(p_options)<>2) OR jsonb_array_length(p_options) NOT BETWEEN 2 AND 4 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_options) o(v) WHERE length(trim(v)) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Add 2 to 4 short options'; END IF;
  SELECT jsonb_agg(jsonb_build_object('label', trim(v))) INTO v_opts FROM jsonb_array_elements_text(p_options) o(v);
ELSE RAISE EXCEPTION 'Unknown vote type'; END IF;
INSERT INTO public.live_votes(trip_id,kind,prompt,options,week_number,created_by) VALUES (p_trip,p_kind,trim(p_prompt),v_opts,v_week,auth.uid()) RETURNING id INTO v_id; RETURN v_id; END $function$;

CREATE OR REPLACE FUNCTION trip_private.start_game_turns(p_trip uuid, p_week integer, p_cards integer, p_random boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_order uuid[]; BEGIN IF NOT trip_private.can_run_turns(p_trip,p_week) THEN RAISE EXCEPTION 'Host or leader only'; END IF;
IF NOT trip_private.night_open(p_trip,p_week) THEN RAISE EXCEPTION 'Turns run only while the game night is live'; END IF;
IF p_cards NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Choose 1 to 5 cards'; END IF; SELECT array_agg(user_id ORDER BY CASE WHEN p_random THEN random() ELSE 0 END,joined_at,user_id) INTO v_order FROM public.trip_members WHERE status='approved' AND trip_id=p_trip; IF cardinality(v_order)<1 THEN RAISE EXCEPTION 'No players'; END IF;
DELETE FROM public.game_night_turns WHERE trip_id=p_trip AND room<>'all';
INSERT INTO public.game_night_turns(trip_id,room,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,'all',p_week,p_cards,v_order,0,1,true) ON CONFLICT(trip_id,room) DO UPDATE SET week_number=excluded.week_number,cards_per_person=excluded.cards_per_person,player_order=excluded.player_order,turn_index=0,card_number=1,active=true; END $function$;

CREATE OR REPLACE FUNCTION trip_private.next_room_turn(p_trip uuid, p_room text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v public.game_night_turns; BEGIN
SELECT * INTO v FROM public.game_night_turns WHERE trip_id=p_trip AND room=coalesce(p_room,'all') FOR UPDATE;
IF NOT FOUND OR NOT v.active THEN RAISE EXCEPTION 'No active round'; END IF;
IF NOT (trip_private.can_run_turns(p_trip,v.week_number) OR EXISTS (SELECT 1 FROM public.trip_teams WHERE trip_id=p_trip AND id::text=v.room AND host_id=auth.uid())) THEN RAISE EXCEPTION 'Host or leader only'; END IF;
IF NOT trip_private.night_open(p_trip,v.week_number) THEN RAISE EXCEPTION 'Turns run only while the game night is live'; END IF;
IF v.turn_index+1 >= cardinality(v.player_order) THEN
  IF v.card_number>=v.cards_per_person THEN UPDATE public.game_night_turns SET active=false WHERE trip_id=p_trip AND room=v.room;
  ELSE UPDATE public.game_night_turns SET turn_index=0,card_number=card_number+1 WHERE trip_id=p_trip AND room=v.room; END IF;
ELSE UPDATE public.game_night_turns SET turn_index=turn_index+1 WHERE trip_id=p_trip AND room=v.room; END IF; END $function$;

CREATE OR REPLACE FUNCTION trip_private.night_flow_action(p_trip uuid, p_week integer, p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_flow public.game_night_flow; v_first uuid; v_category text; v_order uuid[]; v_cards int; tm record; BEGIN
IF NOT trip_private.can_run_turns(p_trip,p_week) THEN RAISE EXCEPTION 'Only the host or a trip leader can run this night'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week AND game_number IS NOT NULL AND (trip_private.is_leader(p_trip) OR starts_at BETWEEN clock_timestamp()-interval '12 hours' AND clock_timestamp()+interval '12 hours')) THEN RAISE EXCEPTION 'This night can start near its scheduled call time'; END IF;
IF EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week AND (skipped OR clock_timestamp() > starts_at + interval '3 hours 30 minutes')) THEN RAISE EXCEPTION 'This game night is over'; END IF;
IF p_action<>'warmup' AND NOT trip_private.night_open(p_trip,p_week) THEN RAISE EXCEPTION 'This only works while the game night is live'; END IF;
UPDATE public.game_nights SET host_checked_in_at=coalesce(host_checked_in_at,now()) WHERE trip_id=p_trip AND week_number=p_week AND host_id=auth.uid();
IF p_week > 1 AND NOT trip_private.is_unlocked(p_trip) THEN RAISE EXCEPTION 'Your Captain can unlock the full trip'; END IF;
IF p_action='warmup' THEN
 PERFORM trip_private.night_no_show_check(p_trip,p_week);
 IF EXISTS (SELECT 1 FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week AND first_player IS NOT NULL) THEN RAISE EXCEPTION 'Warm-up already spun'; END IF;
 SELECT user_id INTO v_first FROM public.trip_members WHERE status='approved' AND trip_id=p_trip ORDER BY random() LIMIT 1;
 SELECT category INTO v_category FROM unnest(ARRAY['travel','food','childhood','deep']::text[]) category ORDER BY random() LIMIT 1;
 IF (SELECT enabled FROM public.trip_adult_settings WHERE trip_id=p_trip) AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.status='approved' AND m.trip_id=p_trip AND NOT trip_private.is_approved_adult(p_trip,m.user_id)) AND random()<0.2 THEN v_category:='spicy'; END IF;
 INSERT INTO public.game_night_flow(trip_id,week_number,phase,first_player,category) VALUES(p_trip,p_week,'warmup',v_first,v_category) ON CONFLICT(trip_id,week_number) DO UPDATE SET first_player=excluded.first_player,category=excluded.category;
ELSIF p_action='cards' THEN
 SELECT * INTO v_flow FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR v_flow.phase<>'warmup' OR v_flow.first_player IS NULL THEN RAISE EXCEPTION 'Spin the warm-up first'; END IF;
 v_cards := trip_private.room_rounds(p_trip);
 DELETE FROM public.game_night_turns WHERE trip_id=p_trip;
 IF (SELECT count(*) FROM public.trip_members WHERE status='approved' AND trip_id=p_trip) > 12 AND EXISTS (SELECT 1 FROM public.trip_teams WHERE trip_id=p_trip) THEN
   FOR tm IN SELECT id FROM public.trip_teams WHERE trip_id=p_trip LOOP
     SELECT array_agg(x.user_id ORDER BY CASE WHEN x.user_id=v_flow.first_player THEN 0 ELSE 1 END, m.joined_at, x.user_id) INTO v_order FROM public.trip_team_members x JOIN public.trip_members m ON m.trip_id=x.trip_id AND m.user_id=x.user_id AND m.status='approved' WHERE x.trip_id=p_trip AND x.team_id=tm.id;
     IF coalesce(cardinality(v_order),0) > 0 THEN INSERT INTO public.game_night_turns(trip_id,room,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,tm.id::text,p_week,v_cards,v_order,0,1,true); END IF;
   END LOOP;
   SELECT array_agg(m.user_id ORDER BY m.joined_at) INTO v_order FROM public.trip_members m WHERE m.status='approved' AND m.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.trip_team_members x WHERE x.trip_id=p_trip AND x.user_id=m.user_id);
   IF coalesce(cardinality(v_order),0) > 0 THEN INSERT INTO public.game_night_turns(trip_id,room,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,'all',p_week,v_cards,v_order,0,1,true); END IF;
 ELSE
   SELECT array_agg(user_id ORDER BY CASE WHEN user_id=v_flow.first_player THEN 0 ELSE 1 END,joined_at,user_id) INTO v_order FROM public.trip_members WHERE status='approved' AND trip_id=p_trip;
   INSERT INTO public.game_night_turns(trip_id,room,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,'all',p_week,v_cards,v_order,0,1,true);
 END IF;
 UPDATE public.game_night_flow SET phase='cards',rounds_target=v_cards WHERE trip_id=p_trip AND week_number=p_week;
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
END $function$;

CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid, p_category text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_id bigint; v_game integer; v_category text; v_week integer; BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
IF p_category IN ('travel','food','childhood','deep','spicy') THEN
 SELECT n.game_number,f.category,n.week_number INTO v_game,v_category,v_week FROM public.game_night_flow f JOIN public.game_nights n ON n.trip_id=f.trip_id AND n.week_number=f.week_number WHERE f.trip_id=p_trip AND f.phase='cards' AND n.starts_at<=clock_timestamp()+interval '12 hours' AND n.starts_at>=clock_timestamp()-interval '12 hours' ORDER BY n.starts_at DESC LIMIT 1;
 IF v_game IS NULL OR v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Draw from tonight''s category during card rounds'; END IF;
 IF NOT trip_private.night_open(p_trip, v_week) THEN RAISE EXCEPTION 'Cards draw only while the game night is live'; END IF;
 SELECT c.id INTO v_id FROM public.game_cards c
  WHERE (c.category=p_category AND c.game_number=v_game AND (c.trip_id IS NULL OR c.trip_id=p_trip))
     OR (c.game_number IS NULL AND c.trip_id IS NULL AND c.category IN (p_category, CASE WHEN p_category='spicy' THEN 'spicy' ELSE 'get-to-know' END))
  ORDER BY EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='card' AND s.item_key=c.id::text),
           (c.game_number IS NULL),
           EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id IN (SELECT trip_private.captain_trip_ids(p_trip)) AND s.kind='card' AND s.item_key=c.id::text),
           random() LIMIT 1;
ELSE
 SELECT c.id INTO v_id FROM public.game_cards c WHERE c.category=p_category AND c.game_number IS NULL AND (c.trip_id IS NULL OR c.trip_id=p_trip)
  ORDER BY EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='card' AND s.item_key=c.id::text),
           EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id IN (SELECT trip_private.captain_trip_ids(p_trip)) AND s.kind='card' AND s.item_key=c.id::text),
           random() LIMIT 1;
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'No cards in this category'; END IF;
INSERT INTO public.content_seen(trip_id,kind,item_key) VALUES (p_trip,'card',v_id::text) ON CONFLICT DO NOTHING;
INSERT INTO public.trip_play_state(trip_id,draw_card_id,draw_category,draw_at) VALUES(p_trip,v_id,p_category,clock_timestamp()) ON CONFLICT(trip_id) DO UPDATE SET draw_card_id=EXCLUDED.draw_card_id,draw_category=EXCLUDED.draw_category,draw_at=EXCLUDED.draw_at;
RETURN v_id; END $function$;

CREATE OR REPLACE FUNCTION trip_private.end_trip(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE tr public.trips; today date; traveler record; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain' AND status='approved') THEN RAISE EXCEPTION 'Only the Captain can end the trip'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip FOR UPDATE; today := (now() AT TIME ZONE tr.home_timezone)::date;
IF tr.ended_at IS NOT NULL THEN RETURN; END IF;
IF today < tr.end_date OR today > tr.end_date + 1 THEN RAISE EXCEPTION 'You can end the trip from its last day until a day after'; END IF;
UPDATE public.trips SET ended_at = now() WHERE id=p_trip;
IF tr.is_sandbox THEN RETURN; END IF;
IF tr.kind = 'at_home' THEN
  INSERT INTO public.postcard_stickers(user_id,trip_id,pack) SELECT user_id, p_trip, tr.at_home_pack FROM public.trip_members WHERE trip_id=p_trip AND status='approved' ON CONFLICT DO NOTHING;
ELSE
  FOR traveler IN SELECT user_id FROM public.trip_members WHERE trip_id=p_trip AND status='approved' LOOP
    PERFORM trip_private.sync_passport(traveler.user_id);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.orders WHERE trip_id=p_trip AND status IN ('beta_free','paid'))
     AND (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip AND status='approved') >= 3
     AND NOT EXISTS (SELECT 1 FROM public.reward_codes WHERE user_id=auth.uid() AND used_at IS NULL AND expires_at > now()) THEN
    INSERT INTO public.reward_codes(user_id,code,cents,source_trip,expires_at) VALUES (auth.uid(), 'CAPT-' || upper(substr(md5(gen_random_uuid()::text),1,6)), 200, p_trip, now() + interval '90 days');
  END IF;
END IF;
END $function$;

ALTER TABLE public.season_champions ADD COLUMN IF NOT EXISTS tie_ids uuid[];

CREATE OR REPLACE FUNCTION trip_private.finalize_season(p_trip uuid, p_season text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE st public.season_settings; v_at timestamptz; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF NOT coalesce((SELECT season_scoring FROM public.trips WHERE id=p_trip), true) THEN RETURN; END IF;
SELECT * INTO st FROM public.season_settings WHERE trip_id=p_trip AND season=p_season;
IF NOT FOUND THEN RETURN; END IF;
v_at := trip_private.effective_crowning(p_trip, p_season);
IF v_at IS NULL OR v_at > now() THEN RETURN; END IF;
PERFORM pg_advisory_xact_lock(hashtext('crown' || p_trip::text || p_season));
IF EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RETURN; END IF;
IF p_season = 'trip' THEN
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  WITH r AS (SELECT t.user_id, t.stamps, least(100, CASE WHEN t.max_stamps > 0 THEN round(t.stamps*100.0/t.max_stamps)::int ELSE 0 END) score FROM trip_private.trip_season(p_trip) t)
  SELECT p_trip, 'trip', r.user_id, r.score, r.stamps FROM r WHERE r.stamps > 0 AND (SELECT count(*) FROM r o WHERE (o.score, o.stamps) > (r.score, r.stamps)) < st.winners;
ELSE
  -- Ranked by score, then nights attended; remaining ties are broken once here by a server spin.
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps, tie_ids)
  WITH r AS (SELECT * FROM trip_private.game_board(p_trip) WHERE stamps > 0),
  k AS (SELECT r.*, (SELECT count(*) FROM r o WHERE (o.score,o.attended) > (r.score,r.attended)) ahead,
               (SELECT array_agg(o.user_id ORDER BY o.user_id) FROM r o WHERE o.score=r.score AND o.attended=r.attended) grp,
               row_number() OVER (ORDER BY r.score DESC, r.attended DESC, random()) rn FROM r)
  SELECT p_trip, 'game', k.user_id, k.score, k.stamps, CASE WHEN cardinality(k.grp) > 1 AND k.ahead + cardinality(k.grp) > st.winners THEN k.grp END
  FROM k WHERE k.rn <= st.winners;
END IF; END $function$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['content_seen','content_variants','content_topups','content_feedback','at_home_activities','at_home_answers','at_home_votes'] LOOP
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('DROP POLICY IF EXISTS "No direct access" ON public.%I', t);
  EXECUTE format('CREATE POLICY "No direct access" ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)', t);
 END LOOP; END $$;