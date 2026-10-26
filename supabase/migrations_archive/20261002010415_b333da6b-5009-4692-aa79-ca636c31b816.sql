ALTER TABLE public.game_nights ADD COLUMN game_locked boolean NOT NULL DEFAULT false, ADD COLUMN game_revealed boolean NOT NULL DEFAULT true;
ALTER TABLE public.game_catalog DROP CONSTRAINT game_catalog_number_check;
ALTER TABLE public.game_catalog ADD CONSTRAINT game_catalog_number_check CHECK (number BETWEEN 1 AND 15);
ALTER TABLE public.game_nights DROP CONSTRAINT game_nights_game_number_check;
ALTER TABLE public.game_nights ADD CONSTRAINT game_nights_game_number_check CHECK (game_number BETWEEN 1 AND 15);
INSERT INTO public.game_catalog(number,name,how_to_play,twist,how_to_win,prep) VALUES
(13,'Who Said It','Read a mystery statement and guess which squad member said it.','Ask for the story behind the answer.','Most correct guesses.','None.'),
(14,'Never Have I Ever','Read a clean travel or life prompt. Everyone shares if they have done it.','Tell the story if you want to.','Vote for the most memorable story.','None.'),
(15,'Hot Takes','Share your opinion on a playful debate and defend it.','See who can change a mind.','Vote for the best defense.','None.') ON CONFLICT (number) DO NOTHING;
ALTER TABLE public.game_cards ADD COLUMN game_number integer REFERENCES public.game_catalog(number);
ALTER TABLE public.game_cards DROP CONSTRAINT game_cards_category_check;
ALTER TABLE public.game_cards ADD CONSTRAINT game_cards_category_check CHECK (category IN ('get-to-know','two-truths','childhood','songs','destination-trivia','phrases','most-likely','would-you-rather','camera-roll','emoji','travel','food','deep','spicy'));
INSERT INTO public.game_cards(category,game_number,prompt) VALUES
('travel',1,'Tell two truths and one lie about a trip you have taken.'),('food',1,'Tell two truths and one lie about a food adventure.'),('childhood',1,'Tell two truths and one lie about your childhood.'),('deep',1,'Tell two truths and one lie about a moment that changed you.'),
('travel',8,'Who is most likely to find a hidden gem on the trip?'),('food',8,'Who is most likely to order the most adventurous dish?'),('childhood',8,'Who is most likely to still know every word of their childhood theme song?'),('deep',8,'Who is most likely to keep the squad together for years?'),
('travel',12,'Would you rather take the scenic route or arrive first?'),('food',12,'Would you rather try every street-food stall or one unforgettable restaurant?'),('childhood',12,'Would you rather revisit your favorite childhood place or discover a new one?'),('deep',12,'Would you rather know where you will be in ten years or be surprised?'),
('travel',13,'Who said their dream trip would involve getting lost on purpose?'),('food',13,'Who said they would travel across town for the perfect snack?'),('childhood',13,'Who said they had a very unusual childhood hobby?'),('deep',13,'Who said a small kindness changed their life?'),
('travel',14,'Never have I ever missed a turn and found something better.'),('food',14,'Never have I ever ordered a dish without knowing what it was.'),('childhood',14,'Never have I ever kept a childhood souvenir.'),('deep',14,'Never have I ever changed my mind about a big dream.'),
('travel',15,'Hot take: the best trip days are the unplanned ones.'),('food',15,'Hot take: breakfast is the best meal to try somewhere new.'),('childhood',15,'Hot take: childhood games are still the best games.'),('deep',15,'Hot take: a good friend tells you the hard truth.'),
('spicy',1,'Sip or skip: tell two truths and one lie about a memorable night out.'),('spicy',8,'Sip or skip: who is most likely to close down the dance floor?'),('spicy',12,'Sip or skip: would you rather dance until sunrise or leave early for brunch?'),('spicy',13,'Sip or skip: who said they once stayed out past sunrise?'),('spicy',14,'Sip or skip: never have I ever danced all night.'),('spicy',15,'Sip or skip: hot take — the afterparty is better than the party.');
CREATE TABLE public.game_night_flow (trip_id uuid NOT NULL, week_number integer NOT NULL, phase text NOT NULL DEFAULT 'warmup' CHECK (phase IN ('warmup','cards','finale')), first_player uuid, category text CHECK (category IN ('travel','food','childhood','deep','spicy')), rounds_target integer NOT NULL DEFAULT 2 CHECK (rounds_target BETWEEN 1 AND 5), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(trip_id,week_number), FOREIGN KEY(trip_id,week_number) REFERENCES public.game_nights(trip_id,week_number) ON DELETE CASCADE);
GRANT SELECT ON public.game_night_flow TO authenticated;
GRANT ALL ON public.game_night_flow TO service_role;
ALTER TABLE public.game_night_flow ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trip members see night flow" ON public.game_night_flow FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id,auth.uid()));
CREATE TRIGGER game_night_flow_updated BEFORE UPDATE ON public.game_night_flow FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE OR REPLACE FUNCTION trip_private.night_flow_action(p_trip uuid,p_week integer,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_flow public.game_night_flow; v_first uuid; v_category text; v_order uuid[]; BEGIN
IF NOT trip_private.can_run_turns(p_trip,p_week) THEN RAISE EXCEPTION 'Only the host or a trip leader can run this night'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week AND game_number IS NOT NULL) THEN RAISE EXCEPTION 'This week needs a featured game first'; END IF;
IF p_action='warmup' THEN
 IF EXISTS (SELECT 1 FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week AND first_player IS NOT NULL) THEN RAISE EXCEPTION 'Warm-up already spun'; END IF;
 SELECT user_id INTO v_first FROM public.trip_members WHERE trip_id=p_trip ORDER BY random() LIMIT 1;
 SELECT category INTO v_category FROM unnest(ARRAY['travel','food','childhood','deep']::text[]) category ORDER BY random() LIMIT 1;
 IF (SELECT enabled FROM public.trip_adult_settings WHERE trip_id=p_trip) AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND NOT trip_private.is_approved_adult(p_trip,m.user_id)) AND random()<0.2 THEN v_category:='spicy'; END IF;
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
CREATE OR REPLACE FUNCTION public.night_flow_action(p_trip uuid,p_week integer,p_action text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $fn$ SELECT trip_private.night_flow_action(p_trip,p_week,p_action) $fn$;
REVOKE ALL ON FUNCTION trip_private.night_flow_action(uuid,integer,text),public.night_flow_action(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.night_flow_action(uuid,integer,text),public.night_flow_action(uuid,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.week_game_action(p_trip uuid,p_week integer,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_old integer; v_new integer; v_used integer[]; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Captain only'; END IF;
IF p_action IN ('lock','unlock','hide','reveal') THEN
 UPDATE public.game_nights SET game_locked=CASE WHEN p_action='lock' THEN true WHEN p_action='unlock' THEN false ELSE game_locked END,game_revealed=CASE WHEN p_action='hide' THEN false WHEN p_action='reveal' THEN true ELSE game_revealed END WHERE trip_id=p_trip AND week_number=p_week AND game_number IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pick this week''s game first'; END IF;
ELSIF p_action='reroll' THEN
 IF p_week=1 THEN RAISE EXCEPTION 'Week 1 stays Two Truths and a Trip'; END IF;
 SELECT game_number INTO v_old FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week AND starts_at>now() AND NOT game_locked FOR UPDATE;
 IF v_old IS NULL THEN RAISE EXCEPTION 'That game is locked or the night already started'; END IF;
 INSERT INTO public.trip_play_state(trip_id) VALUES(p_trip) ON CONFLICT DO NOTHING;
 SELECT used_games INTO v_used FROM public.trip_play_state WHERE trip_id=p_trip FOR UPDATE;
 SELECT g.number INTO v_new FROM public.game_catalog g WHERE g.number=ANY(ARRAY[1,8,12,13,14,15]) AND g.number<>v_old AND NOT(g.number=ANY(v_used)) ORDER BY random() LIMIT 1;
 IF v_new IS NULL THEN SELECT g.number INTO v_new FROM public.game_catalog g WHERE g.number=ANY(ARRAY[1,8,12,13,14,15]) AND g.number<>v_old AND g.number<>(SELECT game_number FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week-1) ORDER BY random() LIMIT 1; END IF;
 IF v_new IS NULL THEN RAISE EXCEPTION 'No other game available'; END IF;
 UPDATE public.game_nights SET game_number=v_new WHERE trip_id=p_trip AND week_number=p_week;
 UPDATE public.trip_play_state SET used_games=array_append(array_remove(v_used,v_old),v_new),spin_game=v_new,spin_week=p_week,spin_at=clock_timestamp() WHERE trip_id=p_trip;
ELSE RAISE EXCEPTION 'Unknown game action'; END IF;
END $fn$;
CREATE OR REPLACE FUNCTION public.week_game_action(p_trip uuid,p_week integer,p_action text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $fn$ SELECT trip_private.week_game_action(p_trip,p_week,p_action) $fn$;
REVOKE ALL ON FUNCTION trip_private.week_game_action(uuid,integer,text),public.week_game_action(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.week_game_action(uuid,integer,text),public.week_game_action(uuid,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.spin_next_game(p_trip uuid) RETURNS TABLE(game_number integer,week_number integer,spin_time timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_target integer; v_current integer; v_game integer; v_used integer[]; v_now timestamptz:=clock_timestamp(); BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
SELECT n.week_number INTO v_current FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at<=v_now ORDER BY n.starts_at DESC LIMIT 1;
SELECT n.week_number INTO v_target FROM public.game_nights n WHERE n.trip_id=p_trip AND n.game_number IS NULL AND n.starts_at>v_now AND (v_current IS NULL OR n.week_number>v_current) ORDER BY n.week_number LIMIT 1;
IF v_target IS NULL THEN RAISE EXCEPTION 'No upcoming week needs a game'; END IF;
IF v_target=1 THEN RAISE EXCEPTION 'The Captain chooses the first game'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid() AND (m.role IN ('captain','co_captain') OR m.user_id=(SELECT n.host_id FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=coalesce(v_current,1)))) THEN RAISE EXCEPTION 'Only a leader or this week''s host can spin'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=v_target-1 AND n.game_number IS NOT NULL) THEN RAISE EXCEPTION 'Choose the previous week''s game first'; END IF;
INSERT INTO public.trip_play_state(trip_id) VALUES(p_trip) ON CONFLICT DO NOTHING;
SELECT s.used_games INTO v_used FROM public.trip_play_state s WHERE s.trip_id=p_trip FOR UPDATE;
SELECT g.number INTO v_game FROM public.game_catalog g WHERE g.number=ANY(ARRAY[1,8,12,13,14,15]) AND NOT(g.number=ANY(v_used)) ORDER BY random() LIMIT 1;
IF v_game IS NULL THEN SELECT g.number INTO v_game FROM public.game_catalog g WHERE g.number=ANY(ARRAY[1,8,12,13,14,15]) AND g.number<>(SELECT game_number FROM public.game_nights WHERE trip_id=p_trip AND week_number=v_target-1) ORDER BY random() LIMIT 1; v_used:='{}'; END IF;
UPDATE public.game_nights n SET game_number=v_game WHERE n.trip_id=p_trip AND n.week_number=v_target AND n.game_number IS NULL;
IF NOT FOUND THEN RAISE EXCEPTION 'That week already has a game'; END IF;
UPDATE public.trip_play_state s SET used_games=array_append(v_used,v_game),spin_game=v_game,spin_week=v_target,spin_at=v_now WHERE s.trip_id=p_trip;
RETURN QUERY SELECT v_game,v_target,v_now; END $fn$;
CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid,p_category text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_id bigint; v_week integer; v_game integer; BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
SELECT n.week_number,n.game_number INTO v_week,v_game FROM public.game_nights n JOIN public.game_night_flow f ON f.trip_id=n.trip_id AND f.week_number=n.week_number AND f.phase='cards' WHERE n.trip_id=p_trip ORDER BY n.starts_at DESC LIMIT 1;
IF v_week IS NOT NULL AND p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
IF v_week IS NOT NULL AND p_category IN ('travel','food','childhood','deep','spicy') THEN
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND game_number=v_game AND trip_id IS NULL ORDER BY random() LIMIT 1;
ELSE
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND (trip_id IS NULL OR trip_id=p_trip) ORDER BY random() LIMIT 1;
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'No cards in this category'; END IF;
INSERT INTO public.trip_play_state(trip_id,draw_card_id,draw_category,draw_at) VALUES(p_trip,v_id,p_category,clock_timestamp()) ON CONFLICT(trip_id) DO UPDATE SET draw_card_id=EXCLUDED.draw_card_id,draw_category=EXCLUDED.draw_category,draw_at=EXCLUDED.draw_at;
RETURN v_id; END $fn$;
CREATE OR REPLACE FUNCTION trip_private.reveal_live_vote(p_vote uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v public.live_votes; v_counts jsonb; v_max integer; v_finale boolean; BEGIN
SELECT * INTO v FROM public.live_votes WHERE id=p_vote FOR UPDATE;
IF v.id IS NULL OR NOT trip_private.can_run_night(v.trip_id,v.week_number) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can reveal'; END IF;
IF v.status='revealed' THEN RETURN; END IF;
SELECT jsonb_agg((SELECT count(*) FROM public.live_vote_ballots b WHERE b.vote_id=p_vote AND b.option_index=i) ORDER BY i) INTO v_counts FROM generate_series(0,jsonb_array_length(v.options)-1) i;
UPDATE public.live_votes SET status='revealed',results=v_counts,revealed_at=now() WHERE id=p_vote;
SELECT EXISTS(SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=v.trip_id AND f.week_number=v.week_number AND f.phase='finale') INTO v_finale;
IF (v.kind='best_answer' OR (v.kind='most_likely' AND v_finale)) AND v.week_number IS NOT NULL THEN
 SELECT max(x::int) INTO v_max FROM jsonb_array_elements_text(v_counts) x;
 IF v_max>0 THEN
 INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won) SELECT v.trip_id,v.week_number,(v.options->(i::int-1)->>'user_id')::uuid,true,true FROM jsonb_array_elements_text(v_counts) WITH ORDINALITY t(c,i) WHERE c::int=v_max ON CONFLICT(trip_id,week_number,user_id) DO UPDATE SET won=true,here=true;
 END IF;
END IF; END $fn$;