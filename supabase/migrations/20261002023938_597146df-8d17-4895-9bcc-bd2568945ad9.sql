
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS game_plan text CHECK (game_plan IN ('recommended','short','custom'));
ALTER TABLE public.game_cards ADD COLUMN IF NOT EXISTS tone text NOT NULL DEFAULT 'light' CHECK (tone IN ('light','bold','deep','hype'));
ALTER TABLE public.weekly_question_pool ADD COLUMN IF NOT EXISTS tone text NOT NULL DEFAULT 'light' CHECK (tone IN ('light','bold','deep','hype'));
UPDATE public.game_cards SET tone = CASE category WHEN 'deep' THEN 'deep' WHEN 'spicy' THEN 'bold'
  WHEN 'travel' THEN CASE WHEN id%2=0 THEN 'hype' ELSE 'light' END
  WHEN 'food' THEN CASE WHEN id%2=0 THEN 'light' ELSE 'bold' END
  WHEN 'childhood' THEN (ARRAY['light','bold','deep'])[(id%3)+1]
  ELSE (ARRAY['light','bold','deep','hype'])[(id%4)+1] END;
UPDATE public.weekly_question_pool SET tone = CASE WHEN spicy THEN 'bold' ELSE (ARRAY['light','bold','deep','hype'])[(id%4)+1] END;

-- Season arc tones for a given week
CREATE OR REPLACE FUNCTION trip_private.arc_tones(p_trip uuid, p_week integer) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_n int; v_pos int; BEGIN
IF p_week >= 1000 THEN RETURN ARRAY['light','hype']; END IF;
SELECT count(*) INTO v_n FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped;
SELECT count(*) INTO v_pos FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped AND week_number <= p_week;
IF v_n <= 1 THEN RETURN ARRAY['light','hype']; END IF;
IF v_pos >= v_n THEN RETURN ARRAY['hype','deep']; END IF;
RETURN CASE ceil(v_pos*3.0/v_n)::int WHEN 1 THEN ARRAY['light'] WHEN 2 THEN ARRAY['bold'] ELSE ARRAY['deep','hype'] END; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid,p_category text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_id bigint; v_game integer; v_category text; v_week integer; v_tones text[]; BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
IF p_category IN ('travel','food','childhood','deep','spicy') THEN
 SELECT n.game_number,f.category,n.week_number INTO v_game,v_category,v_week FROM public.game_night_flow f JOIN public.game_nights n ON n.trip_id=f.trip_id AND n.week_number=f.week_number WHERE f.trip_id=p_trip AND f.phase='cards' AND n.starts_at<=clock_timestamp()+interval '12 hours' AND n.starts_at>=clock_timestamp()-interval '12 hours' ORDER BY n.starts_at DESC LIMIT 1;
 IF v_game IS NULL OR v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Draw from tonight''s category during card rounds'; END IF;
 v_tones := trip_private.arc_tones(p_trip, v_week);
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND game_number=v_game AND trip_id IS NULL ORDER BY CASE WHEN tone=ANY(v_tones) THEN random()*0.35 ELSE random() END LIMIT 1;
ELSE
 SELECT week_number INTO v_week FROM public.game_nights WHERE trip_id=p_trip AND starts_at <= clock_timestamp()+interval '12 hours' ORDER BY starts_at DESC LIMIT 1;
 v_tones := trip_private.arc_tones(p_trip, coalesce(v_week,1));
 SELECT id INTO v_id FROM public.game_cards WHERE category=p_category AND game_number IS NULL AND (trip_id IS NULL OR trip_id=p_trip) ORDER BY CASE WHEN tone=ANY(v_tones) THEN random()*0.35 ELSE random() END LIMIT 1;
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'No cards in this category'; END IF;
INSERT INTO public.trip_play_state(trip_id,draw_card_id,draw_category,draw_at) VALUES(p_trip,v_id,p_category,clock_timestamp()) ON CONFLICT(trip_id) DO UPDATE SET draw_card_id=EXCLUDED.draw_card_id,draw_category=EXCLUDED.draw_category,draw_at=EXCLUDED.draw_at;
RETURN v_id; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.pick_weekly_prompt(p_trip uuid, p_week integer) RETURNS text LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public AS $fn$
SELECT p.prompt FROM public.weekly_question_pool p WHERE (NOT p.spicy OR coalesce((SELECT enabled FROM public.trip_adult_settings WHERE trip_id=p_trip),false))
ORDER BY (p.prompt IN (SELECT prompt FROM public.weekly_questions WHERE trip_id=p_trip)), CASE WHEN p.tone = ANY(trip_private.arc_tones(p_trip,p_week)) THEN random()*0.35 ELSE random() END LIMIT 1 $fn$;

CREATE OR REPLACE FUNCTION trip_private.bonus_window(p_trip uuid) RETURNS interval LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
SELECT CASE WHEN start_date - (created_at AT TIME ZONE home_timezone)::date <= 13 THEN interval '2 days' ELSE interval '14 days' END FROM public.trips WHERE id=p_trip $fn$;

CREATE OR REPLACE FUNCTION trip_private.ensure_weekly_questions(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE n record; tz text; d date; t public.trips; v_lead int; v_first date; k int := 0; BEGIN
SELECT * INTO t FROM public.trips WHERE id=p_trip; tz := t.home_timezone;
FOR n IN SELECT cur.week_number, cur.starts_at cur_start, prev.starts_at prev_start FROM public.game_nights cur JOIN public.game_nights prev ON prev.trip_id=cur.trip_id AND prev.week_number=cur.week_number-1
  WHERE cur.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=cur.week_number) LOOP
  d := (n.prev_start AT TIME ZONE tz)::date;
  IF n.cur_start - n.prev_start < interval '7 days' THEN d := d + 1; ELSE d := d + (8 - extract(isodow FROM d)::int); END IF;
  INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, n.week_number, trip_private.pick_weekly_prompt(p_trip, n.week_number), (d + time '09:00') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
END LOOP;
v_lead := t.start_date - (t.created_at AT TIME ZONE tz)::date;
IF v_lead BETWEEN 3 AND 13 THEN
  d := (t.created_at AT TIME ZONE tz)::date + 1;
  WHILE d < t.start_date LOOP
    IF NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=1000+k)
       AND NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number<1000 AND abs((q.drops_at AT TIME ZONE tz)::date - d) <= 1) THEN
      INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, 1000+k, trip_private.pick_weekly_prompt(p_trip, 1000), (d + time '09:00') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
    END IF; k := k + 1; d := d + 2; END LOOP;
ELSIF v_lead >= 85 THEN
  SELECT min((starts_at AT TIME ZONE tz)::date) INTO v_first FROM public.game_nights WHERE trip_id=p_trip;
  d := (t.created_at AT TIME ZONE tz)::date; d := d + (8 - extract(isodow FROM d)::int);
  WHILE v_first IS NOT NULL AND d + 14 <= v_first LOOP
    IF NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=1000+k) THEN
      INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, 1000+k, trip_private.pick_weekly_prompt(p_trip, 1000), (d + time '09:00') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
    END IF; k := k + 1; d := d + 14; END LOOP;
END IF;
UPDATE public.weekly_questions SET phase='revealed', revealed_at=now() WHERE trip_id=p_trip AND week_number>=1000 AND revealed_at IS NULL AND drops_at + trip_private.bonus_window(p_trip) <= now();
END $fn$;

CREATE OR REPLACE FUNCTION trip_private.answer_weekly_question(p_trip uuid, p_week integer, p_answer text, p_emoji text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE q public.weekly_questions; s timestamptz; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND ended_at IS NOT NULL) THEN RAISE EXCEPTION 'This trip has ended'; END IF;
SELECT * INTO q FROM public.weekly_questions WHERE trip_id=p_trip AND week_number=p_week;
IF NOT FOUND OR q.drops_at > now() THEN RAISE EXCEPTION 'This question hasn''t dropped yet'; END IF;
IF p_week >= 1000 THEN s := q.drops_at + trip_private.bonus_window(p_trip); ELSE SELECT starts_at INTO s FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week; END IF;
IF q.revealed_at IS NOT NULL OR s <= now() THEN RAISE EXCEPTION 'Answers are locked for this question'; END IF;
IF length(trim(coalesce(p_answer,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Answers are 1 to 200 characters'; END IF;
INSERT INTO public.weekly_answers(trip_id, week_number, user_id, answer, emoji) VALUES (p_trip, p_week, auth.uid(), trim(p_answer), nullif(trim(coalesce(p_emoji,'')),''))
ON CONFLICT (trip_id, week_number, user_id) DO UPDATE SET answer=EXCLUDED.answer, emoji=EXCLUDED.emoji; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.weekly_question_status(p_trip uuid)
RETURNS TABLE(week_number integer, prompt text, source text, drops_at timestamptz, revealed_at timestamptz, starts_at timestamptz, answered integer, players integer, phase text, read_index integer, winner_id uuid, tie_ids uuid[], tie_spin_at timestamptz, votes integer, my_vote integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN QUERY SELECT q.week_number, CASE WHEN q.drops_at <= now() OR trip_private.is_leader(p_trip) THEN q.prompt ELSE NULL END, CASE WHEN trip_private.is_leader(p_trip) THEN q.source ELSE NULL END, q.drops_at, q.revealed_at, coalesce(n.starts_at, q.drops_at + trip_private.bonus_window(p_trip)),
 (SELECT count(*)::int FROM public.weekly_answers a WHERE a.trip_id=p_trip AND a.week_number=q.week_number), (SELECT count(*)::int FROM public.trip_members m WHERE m.trip_id=p_trip),
 q.phase, q.read_index, q.winner_id, CASE WHEN q.revealed_at IS NOT NULL THEN q.tie_ids ELSE '{}'::uuid[] END, q.tie_spin_at,
 (SELECT count(*)::int FROM public.weekly_answer_votes v WHERE v.trip_id=p_trip AND v.week_number=q.week_number),
 (SELECT o.idx FROM public.weekly_answer_votes v JOIN trip_private.ordered_answers(p_trip,q.week_number) o ON o.user_id=v.target_id WHERE v.trip_id=p_trip AND v.week_number=q.week_number AND v.voter_id=auth.uid())
 FROM public.weekly_questions q LEFT JOIN public.game_nights n ON n.trip_id=q.trip_id AND n.week_number=q.week_number WHERE q.trip_id=p_trip AND (n.week_number IS NOT NULL OR q.week_number >= 1000) ORDER BY q.drops_at; END $$;

CREATE OR REPLACE FUNCTION trip_private.game_stamps(p_trip uuid)
RETURNS TABLE(user_id uuid, stamps integer, mx integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
g AS (SELECT m.user_id,
  sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
  sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
  FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now() AND NOT n.skipped
  LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
  WHERE m.trip_id=p_trip GROUP BY m.user_id),
qw AS (SELECT (3*count(*) FILTER (WHERE week_number < 1000) + count(*) FILTER (WHERE week_number >= 1000))::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
qa AS (SELECT a.user_id, (count(*) + 2*count(*) FILTER (WHERE q.winner_id=a.user_id))::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id)
SELECT m.user_id, (coalesce(g.stamps,0)+coalesce(qa.n,0)+m.start_stamps)::int, (coalesce(g.mx,0)+qw.total)::int
FROM public.trip_members m CROSS JOIN qw LEFT JOIN g ON g.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id WHERE m.trip_id=p_trip AND NOT m.season_closed $$;

-- Per-room turn trackers
ALTER TABLE public.game_night_turns ADD COLUMN IF NOT EXISTS room text NOT NULL DEFAULT 'all';
ALTER TABLE public.game_night_turns DROP CONSTRAINT game_night_turns_pkey;
ALTER TABLE public.game_night_turns ADD PRIMARY KEY (trip_id, room);

CREATE OR REPLACE FUNCTION trip_private.start_game_turns(p_trip uuid,p_week integer,p_cards integer,p_random boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_order uuid[]; BEGIN IF NOT trip_private.can_run_turns(p_trip,p_week) THEN RAISE EXCEPTION 'Host or leader only'; END IF; IF p_cards NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Choose 1 to 5 cards'; END IF; SELECT array_agg(user_id ORDER BY CASE WHEN p_random THEN random() ELSE 0 END,joined_at,user_id) INTO v_order FROM public.trip_members WHERE trip_id=p_trip; IF cardinality(v_order)<1 THEN RAISE EXCEPTION 'No players'; END IF;
DELETE FROM public.game_night_turns WHERE trip_id=p_trip AND room<>'all';
INSERT INTO public.game_night_turns(trip_id,room,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,'all',p_week,p_cards,v_order,0,1,true) ON CONFLICT(trip_id,room) DO UPDATE SET week_number=excluded.week_number,cards_per_person=excluded.cards_per_person,player_order=excluded.player_order,turn_index=0,card_number=1,active=true; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.next_room_turn(p_trip uuid, p_room text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v public.game_night_turns; BEGIN
SELECT * INTO v FROM public.game_night_turns WHERE trip_id=p_trip AND room=coalesce(p_room,'all') FOR UPDATE;
IF NOT FOUND OR NOT v.active THEN RAISE EXCEPTION 'No active round'; END IF;
IF NOT (trip_private.can_run_turns(p_trip,v.week_number) OR EXISTS (SELECT 1 FROM public.trip_teams WHERE trip_id=p_trip AND id::text=v.room AND host_id=auth.uid())) THEN RAISE EXCEPTION 'Host or leader only'; END IF;
IF v.turn_index+1 >= cardinality(v.player_order) THEN
  IF v.card_number>=v.cards_per_person THEN UPDATE public.game_night_turns SET active=false WHERE trip_id=p_trip AND room=v.room;
  ELSE UPDATE public.game_night_turns SET turn_index=0,card_number=card_number+1 WHERE trip_id=p_trip AND room=v.room; END IF;
ELSE UPDATE public.game_night_turns SET turn_index=turn_index+1 WHERE trip_id=p_trip AND room=v.room; END IF; END $fn$;
CREATE OR REPLACE FUNCTION trip_private.next_game_turn(p_trip uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $fn$ SELECT trip_private.next_room_turn(p_trip,'all') $fn$;

CREATE OR REPLACE FUNCTION trip_private.night_flow_action(p_trip uuid,p_week integer,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_flow public.game_night_flow; v_first uuid; v_category text; v_order uuid[]; v_cards int; tm record; BEGIN
IF NOT trip_private.can_run_turns(p_trip,p_week) THEN RAISE EXCEPTION 'Only the host or a trip leader can run this night'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week AND game_number IS NOT NULL AND starts_at BETWEEN clock_timestamp()-interval '12 hours' AND clock_timestamp()+interval '12 hours') THEN RAISE EXCEPTION 'This night can start near its scheduled call time'; END IF;
IF p_action='warmup' THEN
 IF EXISTS (SELECT 1 FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week AND first_player IS NOT NULL) THEN RAISE EXCEPTION 'Warm-up already spun'; END IF;
 SELECT user_id INTO v_first FROM public.trip_members WHERE trip_id=p_trip ORDER BY random() LIMIT 1;
 SELECT category INTO v_category FROM unnest(ARRAY['travel','food','childhood','deep']::text[]) category ORDER BY random() LIMIT 1;
 IF (SELECT enabled FROM public.trip_adult_settings WHERE trip_id=p_trip) AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND NOT trip_private.is_approved_adult(p_trip,m.user_id)) AND random()<0.2 THEN v_category:='spicy'; END IF;
 INSERT INTO public.game_night_flow(trip_id,week_number,phase,first_player,category) VALUES(p_trip,p_week,'warmup',v_first,v_category) ON CONFLICT(trip_id,week_number) DO UPDATE SET first_player=excluded.first_player,category=excluded.category;
ELSIF p_action='cards' THEN
 SELECT * INTO v_flow FROM public.game_night_flow WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR v_flow.phase<>'warmup' OR v_flow.first_player IS NULL THEN RAISE EXCEPTION 'Spin the warm-up first'; END IF;
 v_cards := trip_private.room_rounds(p_trip);
 DELETE FROM public.game_night_turns WHERE trip_id=p_trip;
 IF (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip) > 12 AND EXISTS (SELECT 1 FROM public.trip_teams WHERE trip_id=p_trip) THEN
   FOR tm IN SELECT id FROM public.trip_teams WHERE trip_id=p_trip LOOP
     SELECT array_agg(x.user_id ORDER BY CASE WHEN x.user_id=v_flow.first_player THEN 0 ELSE 1 END, m.joined_at, x.user_id) INTO v_order FROM public.trip_team_members x JOIN public.trip_members m ON m.trip_id=x.trip_id AND m.user_id=x.user_id WHERE x.trip_id=p_trip AND x.team_id=tm.id;
     IF coalesce(cardinality(v_order),0) > 0 THEN INSERT INTO public.game_night_turns(trip_id,room,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,tm.id::text,p_week,v_cards,v_order,0,1,true); END IF;
   END LOOP;
   SELECT array_agg(m.user_id ORDER BY m.joined_at) INTO v_order FROM public.trip_members m WHERE m.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.trip_team_members x WHERE x.trip_id=p_trip AND x.user_id=m.user_id);
   IF coalesce(cardinality(v_order),0) > 0 THEN INSERT INTO public.game_night_turns(trip_id,room,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,'all',p_week,v_cards,v_order,0,1,true); END IF;
 ELSE
   SELECT array_agg(user_id ORDER BY CASE WHEN user_id=v_flow.first_player THEN 0 ELSE 1 END,joined_at,user_id) INTO v_order FROM public.trip_members WHERE trip_id=p_trip;
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
END $fn$;

-- Game plan picker
CREATE OR REPLACE FUNCTION trip_private.plan_game_nights(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer)
RETURNS TABLE(week_number integer, starts_at timestamptz, kept boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE t public.trips; tz text; v_today date; v_next timestamptz; v_kept int := 0; v_last date; v_takeoff date; v_dates date[] := '{}'; d date; v_lead int; v_cap int; i int; BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can plan game nights'; END IF;
IF p_plan NOT IN ('recommended','short','custom') THEN RAISE EXCEPTION 'Pick a game plan'; END IF;
IF p_weekday IS NULL OR p_weekday NOT BETWEEN 0 AND 6 OR p_time IS NULL THEN RAISE EXCEPTION 'Pick a day and time'; END IF;
p_every := CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END;
SELECT * INTO t FROM public.trips WHERE id=p_trip; tz := t.home_timezone; v_today := (now() AT TIME ZONE tz)::date;
SELECT min(n.starts_at) INTO v_next FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at > now();
RETURN QUERY SELECT n.week_number, n.starts_at, true FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at <= now() OR n.starts_at = v_next) ORDER BY n.week_number;
SELECT count(*), max((n.starts_at AT TIME ZONE tz)::date), coalesce(max(n.week_number),0) INTO v_kept, v_last, i FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at <= now() OR n.starts_at = v_next);
d := t.start_date - 1; v_takeoff := d - ((extract(dow FROM d)::int - p_weekday + 7) % 7);
v_lead := t.start_date - v_today; v_cap := 12 - v_kept;
IF p_plan = 'custom' THEN
  IF p_start IS NULL OR p_start < t.start_date - 84 OR p_start > t.start_date - 2 THEN RAISE EXCEPTION 'Pick a start date between 12 weeks and 2 days before departure'; END IF;
  d := greatest(p_start, v_today, coalesce(v_last + 1, v_today));
  d := d + ((p_weekday - extract(dow FROM d)::int + 7) % 7);
  WHILE d < t.start_date AND cardinality(v_dates) < v_cap LOOP v_dates := v_dates || d; d := d + 7*p_every; END LOOP;
  IF cardinality(v_dates) > 0 AND v_dates[cardinality(v_dates)] < v_takeoff THEN
    IF cardinality(v_dates) >= v_cap THEN v_dates[cardinality(v_dates)] := v_takeoff; ELSE v_dates := v_dates || v_takeoff; END IF; END IF;
ELSE
  v_cap := least(v_cap, CASE WHEN p_plan='short' THEN 4 WHEN v_lead <= 6 THEN 1 WHEN v_lead <= 13 THEN 2 ELSE 12 END);
  d := v_takeoff;
  WHILE cardinality(v_dates) < v_cap AND d > coalesce(v_last, v_today - 1) AND d >= v_today AND d >= t.start_date - 84 LOOP v_dates := d || v_dates; d := d - 7; END LOOP;
END IF;
FOREACH d IN ARRAY v_dates LOOP
  IF ((d + p_time) AT TIME ZONE tz) > now() AND (v_last IS NULL OR d > v_last) THEN i := i + 1; week_number := i; starts_at := (d + p_time) AT TIME ZONE tz; kept := false; RETURN NEXT; END IF;
END LOOP; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.apply_game_plan(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE r record; v_count int; v_host uuid; v_keep int; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can confirm a game plan'; END IF;
CREATE TEMP TABLE IF NOT EXISTS _gplan(week_number int, starts_at timestamptz, kept boolean) ON COMMIT DROP; DELETE FROM _gplan;
INSERT INTO _gplan SELECT * FROM trip_private.plan_game_nights(p_trip,p_plan,p_weekday,p_time,p_start,p_every);
IF NOT EXISTS (SELECT 1 FROM _gplan) THEN RAISE EXCEPTION 'A season needs at least 1 game night before the trip'; END IF;
SELECT coalesce(max(week_number) FILTER (WHERE kept),0) INTO v_keep FROM _gplan;
SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id=p_trip;
DELETE FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number > v_keep;
DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.drops_at > now() AND ((q.week_number > v_keep AND q.week_number < 1000) OR q.week_number >= 1000);
DELETE FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number > v_keep;
FOR r IN SELECT * FROM _gplan WHERE NOT kept ORDER BY week_number LOOP
  SELECT user_id INTO v_host FROM public.trip_members WHERE trip_id=p_trip ORDER BY joined_at,user_id LIMIT 1 OFFSET ((r.week_number-1)%greatest(v_count,1));
  INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,r.week_number,r.starts_at,v_host);
END LOOP;
UPDATE public.trips SET game_plan=p_plan, schedule_every=CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END WHERE id=p_trip;
UPDATE public.game_night_polls SET confirmed_option=coalesce(confirmed_option,0) WHERE trip_id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN (SELECT count(*) FROM _gplan)::int; END $fn$;

REVOKE ALL ON FUNCTION trip_private.arc_tones(uuid,integer), trip_private.pick_weekly_prompt(uuid,integer), trip_private.bonus_window(uuid), trip_private.next_room_turn(uuid,text), trip_private.plan_game_nights(uuid,text,integer,time,date,integer), trip_private.apply_game_plan(uuid,text,integer,time,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.next_room_turn(uuid,text), trip_private.plan_game_nights(uuid,text,integer,time,date,integer), trip_private.apply_game_plan(uuid,text,integer,time,date,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.next_room_turn(p_trip uuid, p_room text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.next_room_turn(p_trip,p_room) $fn$;
CREATE OR REPLACE FUNCTION public.plan_game_nights(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer) RETURNS TABLE(week_number integer, starts_at timestamptz, kept boolean) LANGUAGE sql SET search_path=public AS $fn$ SELECT * FROM trip_private.plan_game_nights(p_trip,p_plan,p_weekday,p_time,p_start,p_every) $fn$;
CREATE OR REPLACE FUNCTION public.apply_game_plan(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer) RETURNS integer LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.apply_game_plan(p_trip,p_plan,p_weekday,p_time,p_start,p_every) $fn$;
REVOKE ALL ON FUNCTION public.next_room_turn(uuid,text), public.plan_game_nights(uuid,text,integer,time,date,integer), public.apply_game_plan(uuid,text,integer,time,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_room_turn(uuid,text), public.plan_game_nights(uuid,text,integer,time,date,integer), public.apply_game_plan(uuid,text,integer,time,date,integer) TO authenticated;
