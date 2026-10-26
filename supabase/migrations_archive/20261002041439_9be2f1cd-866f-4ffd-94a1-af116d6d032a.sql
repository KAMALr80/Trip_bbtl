ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;

CREATE TABLE public.sandbox_bots (
  user_id uuid PRIMARY KEY,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sandbox_bots TO authenticated;
GRANT ALL ON public.sandbox_bots TO service_role;
ALTER TABLE public.sandbox_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Founder reads bots" ON public.sandbox_bots FOR SELECT TO authenticated USING (trip_private.is_app_admin());

CREATE TABLE public.sandbox_trips (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  size int NOT NULL, days int NOT NULL, window_days int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sandbox_trips TO authenticated;
GRANT ALL ON public.sandbox_trips TO service_role;
ALTER TABLE public.sandbox_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Founder reads sandbox trips" ON public.sandbox_trips FOR SELECT TO authenticated USING (trip_private.is_app_admin());

-- Exclusions from founder stats / passport / badges
DROP POLICY "App owner reads feedback" ON public.trip_feedback;
CREATE POLICY "App owner reads feedback" ON public.trip_feedback FOR SELECT TO authenticated
  USING (trip_private.is_app_admin() AND NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.is_sandbox));

CREATE OR REPLACE FUNCTION trip_private.my_unlocked_trips() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT count(*)::int FROM public.trips WHERE unlocked_by = auth.uid() AND unlocked_at IS NOT NULL AND NOT is_sandbox $$;

CREATE OR REPLACE FUNCTION trip_private.my_passport() RETURNS TABLE(trip_id uuid, stamps integer, crowns integer, junkie boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
SELECT m.trip_id,
  coalesce((SELECT x.game_stamps + x.trip_stamps FROM trip_private.trip_totals(m.trip_id) x WHERE x.user_id=auth.uid()),0),
  (SELECT count(*)::int FROM public.season_champions c WHERE c.trip_id=m.trip_id AND c.user_id=auth.uid()),
  coalesce((SELECT (x.game_stamps+x.trip_stamps) > 0 AND (x.game_stamps+x.trip_stamps) > coalesce((SELECT max(y.game_stamps+y.trip_stamps) FROM trip_private.trip_totals(m.trip_id) y WHERE y.user_id<>auth.uid()),0) FROM trip_private.trip_totals(m.trip_id) x WHERE x.user_id=auth.uid()), false)
FROM public.trip_members m JOIN public.trips tt ON tt.id=m.trip_id AND NOT tt.is_sandbox WHERE m.user_id=auth.uid() $function$;

-- Guard
CREATE OR REPLACE FUNCTION trip_private.lab_guard(p_trip uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Test Lab is founder-only'; END IF;
  IF p_trip IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND is_sandbox) THEN RAISE EXCEPTION 'Test Lab only works on sandbox trips'; END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_become(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_card(p_trip uuid, p_user uuid, p_name text, p_n int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pp public.player_profiles;
BEGIN
  SELECT * INTO pp FROM public.player_profiles WHERE user_id=p_user;
  IF FOUND THEN
    INSERT INTO public.trip_player_cards(trip_id,user_id,real_name,game_name,avatar_style,avatar_seed,hometown,occupation,fun_fact,pronouns)
    VALUES (p_trip,p_user,pp.real_name,pp.game_name,CASE WHEN pp.avatar_style='photo' THEN 'street' ELSE pp.avatar_style END,pp.avatar_seed,pp.hometown,pp.occupation,pp.fun_fact,pp.pronouns) ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.trip_player_cards(trip_id,user_id,real_name,game_name,avatar_style,avatar_seed,hometown,fun_fact)
    VALUES (p_trip,p_user,p_name,p_name,(ARRAY['street','crew','hero'])[1 + (p_n % 3)],p_name || '-' || p_n,'Botville','I am a test bot 🤖') ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_itinerary(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; d date; i int := 0; n int; days jsonb := '[]'::jsonb; fl jsonb; city text; mid int;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  n := t.end_date - t.start_date + 1; mid := CASE WHEN n >= 7 THEN n/2 ELSE -1 END;
  DELETE FROM public.trip_day_tags WHERE trip_id=p_trip;
  d := t.start_date;
  WHILE d <= t.end_date LOOP
    city := CASE WHEN mid > 0 AND i >= mid THEN 'Phuket' ELSE 'Bangkok' END;
    fl := CASE WHEN i = 0 THEN jsonb_build_array(jsonb_build_object('date',d,'from','LAX','to','BKK'))
               WHEN i = n-1 THEN jsonb_build_array(jsonb_build_object('date',d,'from',CASE WHEN mid>0 THEN 'HKT' ELSE 'BKK' END,'to','LAX'))
               WHEN i = mid THEN jsonb_build_array(jsonb_build_object('date',d,'from','BKK','to','HKT'))
               ELSE '[]'::jsonb END;
    days := days || jsonb_build_object('date',d,'city',city,'note','Sandbox day ' || (i+1),
      'stays', jsonb_build_array(jsonb_build_object('name', city || ' sandbox stay','checkIn',d,'checkOut',d+1)),
      'flights', fl,
      'spots', jsonb_build_array(jsonb_build_object('name', CASE WHEN i%2=0 THEN 'Night market' ELSE 'Rooftop bar' END,'address', city)));
    INSERT INTO public.trip_day_tags(trip_id,day_date,tag) VALUES (p_trip,d,CASE WHEN jsonb_array_length(fl)>0 THEN 'Travel' WHEN i%2=0 THEN 'Explore' ELSE 'Party' END);
    d := d + 1; i := i + 1;
  END LOOP;
  INSERT INTO public.trip_itineraries(trip_id,days) VALUES (p_trip,days) ON CONFLICT (trip_id) DO UPDATE SET days=excluded.days, updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_teams(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int; nteams int; ids uuid[] := '{}'; v uuid; m record; k int := 0;
BEGIN
  SELECT count(*) INTO n FROM public.trip_members WHERE trip_id=p_trip;
  DELETE FROM public.trip_teams WHERE trip_id=p_trip;
  IF n < 13 THEN RETURN; END IF;
  nteams := CASE WHEN n > 20 THEN 4 ELSE 3 END;
  FOR k IN 1..nteams LOOP
    INSERT INTO public.trip_teams(trip_id,name,color) VALUES (p_trip,(ARRAY['Team Neon','Team Wave','Team Lime','Team Sun'])[k],(ARRAY['orange','blue','green','yellow'])[k]) RETURNING id INTO v;
    ids := ids || v;
  END LOOP;
  k := 0;
  FOR m IN SELECT user_id FROM public.trip_members WHERE trip_id=p_trip ORDER BY joined_at, user_id LOOP
    INSERT INTO public.trip_team_members(trip_id,user_id,team_id) VALUES (p_trip,m.user_id,ids[1 + (k % nteams)]);
    UPDATE public.trip_teams SET host_id=m.user_id WHERE id=ids[1 + (k % nteams)] AND host_id IS NULL;
    k := k + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_create(p_size int, p_days int, p_window int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_trip uuid; me uuid := auth.uid(); today date := (now() AT TIME ZONE 'America/Los_Angeles')::date; b record; k int := 0; v_start date;
BEGIN
  PERFORM trip_private.lab_guard(NULL);
  IF p_size NOT IN (4,10,15,25) OR p_days NOT IN (3,7,21) OR p_window NOT IN (1,10,45,84) THEN RAISE EXCEPTION 'Pick one of the presets'; END IF;
  IF (SELECT count(*) FROM public.sandbox_bots WHERE trip_id IS NULL) < p_size - 1 THEN RAISE EXCEPTION 'Not enough bots ready'; END IF;
  v_start := today + p_window;
  INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,join_code,is_sandbox)
  VALUES ('🧪 Sandbox · ' || p_size || ' ppl · ' || p_days || 'd','Thailand (sandbox)',v_start,v_start + p_days - 1,'America/Los_Angeles',public.new_trip_code(),true) RETURNING id INTO v_trip;
  INSERT INTO public.sandbox_trips(trip_id,size,days,window_days) VALUES (v_trip,p_size,p_days,p_window);
  INSERT INTO public.trip_members(trip_id,user_id,role) VALUES (v_trip,me,'captain');
  PERFORM trip_private.lab_card(v_trip, me, 'Founder', 0);
  FOR b IN SELECT user_id, name FROM public.sandbox_bots WHERE trip_id IS NULL ORDER BY created_at, user_id LIMIT p_size - 1 LOOP
    k := k + 1;
    UPDATE public.sandbox_bots SET trip_id=v_trip WHERE user_id=b.user_id;
    INSERT INTO public.trip_members(trip_id,user_id,role) VALUES (v_trip,b.user_id,'player');
    PERFORM trip_private.lab_card(v_trip, b.user_id, b.name, k);
  END LOOP;
  PERFORM trip_private.lab_itinerary(v_trip);
  PERFORM trip_private.lab_teams(v_trip);
  BEGIN
    PERFORM trip_private.apply_game_plan(v_trip,'recommended',extract(dow FROM v_start - 1)::int,time '18:00',NULL,1);
  EXCEPTION WHEN others THEN
    INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES (v_trip,1,((v_start - 1) + time '18:00') AT TIME ZONE 'America/Los_Angeles',me) ON CONFLICT DO NOTHING;
    UPDATE public.trips SET game_start = v_start - 1 WHERE id=v_trip;
  END;
  BEGIN PERFORM trip_private.ensure_weekly_questions(v_trip); EXCEPTION WHEN others THEN NULL; END;
  RETURN v_trip;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_shift(p_trip uuid, p_target text, p_day int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; today date; off interval := interval '0'; v_days int; wk int; n_count int; ts timestamptz; me uuid := auth.uid();
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  today := (now() AT TIME ZONE t.home_timezone)::date;
  SELECT count(*) INTO n_count FROM public.game_nights WHERE trip_id=p_trip;
  IF p_target = 'before' THEN
    off := ((today + 3) - coalesce(t.game_start, (SELECT min((starts_at AT TIME ZONE t.home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip), t.start_date - 1)) * interval '1 day';
  ELSIF p_target IN ('kickoff','buildup','takeoff') THEN
    IF n_count = 0 THEN RAISE EXCEPTION 'This sandbox has no game nights'; END IF;
    wk := CASE p_target WHEN 'kickoff' THEN (SELECT min(week_number) FROM public.game_nights WHERE trip_id=p_trip)
                        WHEN 'takeoff' THEN (SELECT max(week_number) FROM public.game_nights WHERE trip_id=p_trip)
                        ELSE (SELECT week_number FROM public.game_nights WHERE trip_id=p_trip ORDER BY week_number OFFSET greatest(0,(n_count-1)/2) LIMIT 1) END;
    SELECT starts_at INTO ts FROM public.game_nights WHERE trip_id=p_trip AND week_number=wk;
    off := (now() - interval '2 minutes') - ts;
  ELSIF p_target IN ('day','rest','surprise') THEN
    off := (today - (t.start_date + greatest(1, least(coalesce(p_day,1), t.end_date - t.start_date + 1)) - 1)) * interval '1 day';
  ELSIF p_target = 'end' THEN off := (today - t.end_date) * interval '1 day';
  ELSIF p_target IN ('feedback','wrapped') THEN off := (today - 1 - t.end_date) * interval '1 day';
  ELSE RAISE EXCEPTION 'Unknown time travel target'; END IF;
  v_days := round(extract(epoch FROM off) / 86400.0)::int;

  UPDATE public.trips SET start_date = start_date + v_days, end_date = end_date + v_days, game_start = game_start + v_days,
    rest_days = ARRAY(SELECT x + v_days FROM unnest(rest_days) x),
    ended_at = CASE WHEN p_target IN ('end','feedback','wrapped') THEN now() ELSE NULL END,
    surprise_mode = CASE WHEN p_target='surprise' THEN true WHEN p_target='day' THEN false ELSE surprise_mode END
  WHERE id=p_trip;
  UPDATE public.game_nights SET starts_at = starts_at + off WHERE trip_id=p_trip;
  UPDATE public.weekly_questions SET drops_at = drops_at + off WHERE trip_id=p_trip;
  UPDATE public.season_settings SET crowning_at = crowning_at + off WHERE trip_id=p_trip AND crowning_at IS NOT NULL;
  DELETE FROM public.trip_day_games WHERE trip_id=p_trip;
  DELETE FROM public.bingo_marks WHERE trip_id=p_trip; DELETE FROM public.quest_posts WHERE trip_id=p_trip;
  DELETE FROM public.trivia_answers WHERE trip_id=p_trip; DELETE FROM public.secret_missions WHERE trip_id=p_trip;
  DELETE FROM public.mission_votes WHERE trip_id=p_trip; DELETE FROM public.photo_posts WHERE trip_id=p_trip;
  DELETE FROM public.day_votes WHERE trip_id=p_trip; DELETE FROM public.airport_claims WHERE trip_id=p_trip;
  DELETE FROM public.trip_item_alternatives WHERE trip_id=p_trip;
  PERFORM trip_private.lab_itinerary(p_trip);
  IF p_target = 'rest' THEN
    UPDATE public.trips SET surprise_mode=false, rest_days = array_append(array_remove(rest_days, today), today) WHERE id=p_trip;
  END IF;
  IF p_target IN ('kickoff','buildup','takeoff') THEN
    UPDATE public.game_nights SET host_id = me WHERE trip_id=p_trip AND week_number=wk;
    DELETE FROM public.host_penalties WHERE trip_id=p_trip AND week_number=wk;
  END IF;
  IF p_target = 'feedback' THEN DELETE FROM public.trip_feedback WHERE trip_id=p_trip AND user_id=me; END IF;
  IF p_target = 'wrapped' THEN INSERT INTO public.trip_feedback(trip_id,user_id,skipped) VALUES (p_trip,me,true) ON CONFLICT DO NOTHING; END IF;
  BEGIN PERFORM trip_private.ensure_weekly_questions(p_trip); EXCEPTION WHEN others THEN NULL; END;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_role(p_trip uuid, p_role text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); bot uuid; t public.trips;
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  SELECT user_id INTO bot FROM public.trip_members WHERE trip_id=p_trip AND user_id<>me ORDER BY joined_at, user_id LIMIT 1;
  IF p_role = 'captain' THEN
    UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id<>me AND role='captain';
    UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=me;
  ELSIF p_role IN ('player','host','late') THEN
    UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=me;
    UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=bot;
    IF p_role = 'host' THEN
      UPDATE public.game_nights SET host_id=me WHERE trip_id=p_trip AND week_number=(SELECT min(week_number) FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now() - interval '3 hours');
    ELSIF p_role = 'late' THEN
      IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND starts_at <= now() AND NOT skipped) THEN
        RAISE EXCEPTION 'Time travel to Build-up night first, so game night 1 has been played';
      END IF;
      DELETE FROM public.trip_team_members WHERE trip_id=p_trip AND user_id=me;
      DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=me;
      DELETE FROM trip_private.trip_join_grants WHERE trip_id=p_trip AND user_id=me;
      PERFORM trip_private.join_trip(t.join_code);
      PERFORM trip_private.lab_card(p_trip, me, 'Founder', 0);
    END IF;
  ELSE RAISE EXCEPTION 'Unknown role'; END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_as(p_trip uuid, p_action text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
  t public.trips; b record; r record; wk int; ok int := 0; fail int := 0; last_err text := ''; pair int[]; cnt int[] := ARRAY[0,0]; pick int; v uuid; host uuid; s public.host_swaps; k int := 0;
  answers text[] := ARRAY['Street food at midnight 🍜','Getting lost on purpose','Karaoke until sunrise','The beach, obviously 🏖️','A tuk-tuk race','Matching outfits day','Sunset boat ride','Trying every mango sticky rice'];
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  IF p_action = 'qotw' THEN
    SELECT min(week_number) INTO wk FROM public.weekly_questions WHERE trip_id=p_trip AND drops_at <= now() AND revealed_at IS NULL;
    IF wk IS NULL THEN RAISE EXCEPTION 'No open Question of the Week right now — time travel to a week after a question drops'; END IF;
    FOR b IN SELECT m.user_id FROM public.trip_members m JOIN public.sandbox_bots sb ON sb.user_id=m.user_id WHERE m.trip_id=p_trip LOOP
      k := k + 1;
      BEGIN PERFORM trip_private.lab_become(b.user_id); PERFORM public.answer_weekly_question(p_trip, wk, answers[1 + (k % 8)], (ARRAY['😂','🔥','✈️','🌴'])[1 + (k % 4)]); ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
    END LOOP;
  ELSIF p_action IN ('vote','tie') THEN
    SELECT min(week_number) INTO wk FROM public.weekly_questions WHERE trip_id=p_trip AND phase='vote';
    IF wk IS NOT NULL THEN
      SELECT array_agg(idx ORDER BY idx) INTO pair FROM (SELECT DISTINCT idx FROM trip_private.ordered_answers(p_trip, wk) ORDER BY idx LIMIT 2) z;
      FOR b IN SELECT m.user_id FROM public.trip_members m JOIN public.sandbox_bots sb ON sb.user_id=m.user_id WHERE m.trip_id=p_trip LOOP
        BEGIN
          PERFORM trip_private.lab_become(b.user_id);
          IF p_action='tie' AND array_length(pair,1) = 2 THEN
            pick := NULL;
            FOR r IN SELECT q.idx, q.mine FROM public.qotw_answers(p_trip, wk) q WHERE q.idx = ANY(pair) LOOP
              IF NOT r.mine AND (pick IS NULL OR cnt[array_position(pair, r.idx)] < cnt[array_position(pair, pick)]) THEN pick := r.idx; END IF;
            END LOOP;
          ELSE
            SELECT q.idx INTO pick FROM public.qotw_answers(p_trip, wk) q WHERE NOT q.mine ORDER BY random() LIMIT 1;
          END IF;
          IF pick IS NOT NULL THEN
            PERFORM public.vote_weekly_answer(p_trip, wk, pick); ok := ok + 1;
            IF pick = ANY(pair) THEN cnt[array_position(pair, pick)] := cnt[array_position(pair, pick)] + 1; END IF;
          END IF;
        EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
      END LOOP;
    END IF;
    k := 0;
    FOR r IN SELECT id, jsonb_array_length(options) n FROM public.live_votes WHERE trip_id=p_trip AND status='open' LOOP
      FOR b IN SELECT m.user_id FROM public.trip_members m JOIN public.sandbox_bots sb ON sb.user_id=m.user_id WHERE m.trip_id=p_trip LOOP
        k := k + 1;
        BEGIN PERFORM trip_private.lab_become(b.user_id);
          PERFORM public.cast_live_vote(r.id, CASE WHEN p_action='tie' THEN k % 2 ELSE floor(random()*greatest(r.n,1))::int END); ok := ok + 1;
        EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
      END LOOP;
    END LOOP;
    IF wk IS NULL AND k = 0 THEN RAISE EXCEPTION 'Nothing to vote on — start Question of the Week voting or a live vote first'; END IF;
  ELSIF p_action = 'turn' THEN
    FOR r IN SELECT room, week_number FROM public.game_night_turns WHERE trip_id=p_trip AND active LOOP
      host := coalesce((SELECT tt.host_id FROM public.trip_teams tt WHERE r.room <> 'all' AND tt.id::text = r.room),
                       (SELECT host_id FROM public.game_nights WHERE trip_id=p_trip AND week_number=r.week_number), trip_private.captain_of(p_trip));
      BEGIN PERFORM trip_private.lab_become(host); PERFORM public.next_room_turn(p_trip, r.room); ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
    END LOOP;
    IF ok + fail = 0 THEN RAISE EXCEPTION 'No card rounds running — start the rounds on game night first'; END IF;
  ELSIF p_action IN ('swap_accept','swap_decline') THEN
    SELECT * INTO s FROM public.host_swaps WHERE trip_id=p_trip AND status='open' ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'No open host swap — tap "Swap my host night" as the host first'; END IF;
    IF p_action = 'swap_decline' THEN
      UPDATE public.host_swaps SET status='cancelled', updated_at=now() WHERE id=s.id; ok := 1;
    ELSE
      v := CASE WHEN s.to_user IS NOT NULL THEN s.to_user ELSE (SELECT m.user_id FROM public.trip_members m JOIN public.sandbox_bots sb ON sb.user_id=m.user_id WHERE m.trip_id=p_trip AND m.user_id<>s.from_user ORDER BY random() LIMIT 1) END;
      IF NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=v) THEN RAISE EXCEPTION 'That swap was offered to a real person, not a bot'; END IF;
      PERFORM trip_private.lab_become(v); PERFORM public.respond_host_swap(s.id, 'accept'); ok := 1;
    END IF;
  ELSIF p_action = 'skip' THEN
    SELECT min(week_number) INTO wk FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now() - interval '3 hours';
    IF wk IS NULL THEN RAISE EXCEPTION 'No upcoming game night'; END IF;
    SELECT m.user_id INTO v FROM public.trip_members m JOIN public.sandbox_bots sb ON sb.user_id=m.user_id WHERE m.trip_id=p_trip AND m.role='player'
      AND NOT EXISTS (SELECT 1 FROM public.game_nights g WHERE g.trip_id=p_trip AND g.week_number=wk AND g.host_id=m.user_id) ORDER BY random() LIMIT 1;
    PERFORM trip_private.lab_become(v); PERFORM public.use_night_pass(p_trip, wk); ok := 1;
  ELSIF p_action = 'noshow' THEN
    SELECT min(week_number) INTO wk FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now() - interval '3 hours' AND NOT EXISTS (SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number=game_nights.week_number);
    IF wk IS NULL THEN RAISE EXCEPTION 'No upcoming game night to no-show'; END IF;
    SELECT m.user_id INTO v FROM public.trip_members m JOIN public.sandbox_bots sb ON sb.user_id=m.user_id WHERE m.trip_id=p_trip AND m.role='player' ORDER BY random() LIMIT 1;
    UPDATE public.game_nights SET host_id=v, starts_at = now() - interval '20 minutes' WHERE trip_id=p_trip AND week_number=wk;
    ok := 1;
  ELSIF p_action = 'paid' THEN
    FOR r IN SELECT cs.item_id, cs.user_id, cs.share_cents - cs.paid_cents due FROM public.cost_shares cs JOIN public.sandbox_bots sb ON sb.user_id=cs.user_id WHERE cs.trip_id=p_trip AND cs.paid_cents < cs.share_cents AND cs.reported_at IS NULL LOOP
      BEGIN PERFORM trip_private.lab_become(r.user_id); PERFORM public.report_cost_payment(r.item_id, r.due, (ARRAY['Zelle','Cash App','Venmo'])[1 + floor(random()*3)::int]); ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
    END LOOP;
    IF ok + fail = 0 THEN RAISE EXCEPTION 'No unpaid bot shares — add a cost in Captain Tools first'; END IF;
  ELSIF p_action = 'join' THEN
    SELECT user_id INTO v FROM public.sandbox_bots WHERE trip_id IS NULL ORDER BY created_at LIMIT 1;
    IF v IS NULL THEN RAISE EXCEPTION 'No spare bot ready'; END IF;
    PERFORM trip_private.lab_become(v); PERFORM public.join_trip(t.join_code);
    PERFORM trip_private.lab_become(me);
    UPDATE public.sandbox_bots SET trip_id=p_trip WHERE user_id=v;
    PERFORM trip_private.lab_card(p_trip, v, (SELECT name FROM public.sandbox_bots WHERE user_id=v), 7);
    ok := 1;
  ELSIF p_action = 'feedback' THEN
    FOR b IN SELECT m.user_id FROM public.trip_members m JOIN public.sandbox_bots sb ON sb.user_id=m.user_id WHERE m.trip_id=p_trip LOOP
      k := k + 1;
      BEGIN PERFORM trip_private.lab_become(b.user_id);
        PERFORM public.submit_trip_feedback(p_trip, false, 6 + (k % 5), (ARRAY['game_nights','qotw','bingo','photos','wrapped','other'])[1 + (k % 6)], NULL, (ARRAY['Best squad ever 💖','Same time next year?','Bangkok forever 🌃'])[1 + (k % 3)]); ok := ok + 1;
      EXCEPTION WHEN others THEN fail := fail + 1; last_err := SQLERRM; END;
    END LOOP;
  ELSE RAISE EXCEPTION 'Unknown bot action'; END IF;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims,''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub,''), true);
  RETURN ok || ' done' || CASE WHEN fail > 0 THEN ' · ' || fail || ' skipped (' || last_err || ')' ELSE '' END;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_delete(p_trip uuid) RETURNS uuid[] LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ids uuid[];
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT coalesce(array_agg(user_id),'{}') INTO ids FROM public.sandbox_bots WHERE trip_id=p_trip;
  DELETE FROM trip_private.trip_join_grants WHERE trip_id=p_trip;
  DELETE FROM public.sandbox_bots WHERE trip_id=p_trip;
  DELETE FROM public.trips WHERE id=p_trip AND is_sandbox;
  RETURN ids;
END $$;

REVOKE ALL ON FUNCTION trip_private.lab_become(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.lab_create(int,int,int), trip_private.lab_shift(uuid,text,int), trip_private.lab_role(uuid,text), trip_private.lab_as(uuid,text), trip_private.lab_delete(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION trip_private.lab_create(int,int,int), trip_private.lab_shift(uuid,text,int), trip_private.lab_role(uuid,text), trip_private.lab_as(uuid,text), trip_private.lab_delete(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.lab_create(p_size int, p_days int, p_window int) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.lab_create(p_size,p_days,p_window) $$;
CREATE OR REPLACE FUNCTION public.lab_shift(p_trip uuid, p_target text, p_day int) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.lab_shift(p_trip,p_target,p_day) $$;
CREATE OR REPLACE FUNCTION public.lab_role(p_trip uuid, p_role text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.lab_role(p_trip,p_role) $$;
CREATE OR REPLACE FUNCTION public.lab_as(p_trip uuid, p_action text) RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.lab_as(p_trip,p_action) $$;
CREATE OR REPLACE FUNCTION public.lab_delete(p_trip uuid) RETURNS uuid[] LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.lab_delete(p_trip) $$;
REVOKE EXECUTE ON FUNCTION public.lab_create(int,int,int), public.lab_shift(uuid,text,int), public.lab_role(uuid,text), public.lab_as(uuid,text), public.lab_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_create(int,int,int), public.lab_shift(uuid,text,int), public.lab_role(uuid,text), public.lab_as(uuid,text), public.lab_delete(uuid) TO authenticated;