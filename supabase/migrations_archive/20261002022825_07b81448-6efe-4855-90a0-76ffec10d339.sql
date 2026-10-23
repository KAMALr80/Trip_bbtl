
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS schedule_every integer NOT NULL DEFAULT 1 CHECK (schedule_every BETWEEN 1 AND 2),
  ADD COLUMN IF NOT EXISTS surprise_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rest_days date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS game_days_every integer CHECK (game_days_every BETWEEN 1 AND 2),
  ADD COLUMN IF NOT EXISTS big_group boolean NOT NULL DEFAULT false;
ALTER TABLE public.trip_teams ADD COLUMN IF NOT EXISTS call_link text CHECK (call_link IS NULL OR (call_link ~ '^https://' AND length(call_link) <= 500)),
  ADD COLUMN IF NOT EXISTS host_id uuid;
ALTER TABLE public.trip_members ADD COLUMN IF NOT EXISTS trip_start_stamps integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_closed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION trip_private.check_trip_length() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $fn$ BEGIN
 IF NEW.end_date - NEW.start_date + 1 NOT BETWEEN 2 AND 30 THEN RAISE EXCEPTION 'Trips can be 2 to 30 days long'; END IF; RETURN NEW; END $fn$;
DROP TRIGGER IF EXISTS trips_check_length ON public.trips;
CREATE TRIGGER trips_check_length BEFORE INSERT OR UPDATE OF start_date, end_date ON public.trips FOR EACH ROW EXECUTE FUNCTION trip_private.check_trip_length();

CREATE TABLE IF NOT EXISTS trip_private.trip_join_grants (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, user_id uuid NOT NULL, start_stamps integer NOT NULL DEFAULT 0, joined_week integer, trip_start_stamps integer NOT NULL DEFAULT 0, season_closed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, user_id));
ALTER TABLE trip_private.trip_join_grants ENABLE ROW LEVEL SECURITY;
INSERT INTO trip_private.trip_join_grants(trip_id,user_id,start_stamps,joined_week) SELECT trip_id,user_id,start_stamps,joined_week FROM public.trip_members ON CONFLICT DO NOTHING;

-- Schedule planner
CREATE OR REPLACE FUNCTION trip_private.plan_nights(p_trip uuid, p_first timestamptz, p_every integer, p_count integer)
RETURNS TABLE(n integer, starts_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE t public.trips; v_local timestamp; v_days int; v_max int; v_gap interval; i int := 0; BEGIN
SELECT * INTO t FROM public.trips WHERE id=p_trip;
v_local := p_first AT TIME ZONE t.home_timezone;
v_days := t.start_date - (now() AT TIME ZONE t.home_timezone)::date;
p_every := greatest(1, least(2, coalesce(p_every,1)));
IF v_days <= 6 THEN v_max := 1; v_gap := interval '7 days';
ELSIF v_days <= 13 THEN v_max := 2; v_gap := make_interval(days => greatest(2, (t.start_date - v_local::date)/2));
ELSE v_max := 12; v_gap := make_interval(days => 7*p_every);
  IF v_days >= 85 THEN WHILE v_local::date < t.start_date - 84 LOOP v_local := v_local + interval '7 days'; END LOOP; END IF;
END IF;
IF p_count IS NOT NULL THEN v_max := greatest(0, least(v_max, p_count)); END IF;
WHILE i < v_max AND v_local::date < t.start_date LOOP
  i := i+1; n := i; starts_at := v_local AT TIME ZONE t.home_timezone; RETURN NEXT; v_local := v_local + v_gap;
END LOOP; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.confirm_game_nights(p_trip uuid,p_option integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_start timestamptz; t public.trips; v_host uuid; v_count integer; p record; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can confirm'; END IF;
SELECT (options->>p_option)::timestamptz INTO v_start FROM public.game_night_polls WHERE trip_id=p_trip AND confirmed_option IS NULL;
IF v_start IS NULL OR v_start <= now() THEN RAISE EXCEPTION 'Choose a future option'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip;
IF (v_start AT TIME ZONE t.home_timezone)::date >= t.start_date THEN RAISE EXCEPTION 'Time must be before the trip'; END IF;
SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id=p_trip; IF v_count=0 THEN RAISE EXCEPTION 'Trip has no members'; END IF;
DELETE FROM public.game_nights WHERE trip_id=p_trip;
FOR p IN SELECT * FROM trip_private.plan_nights(p_trip, v_start, t.schedule_every, NULL) LOOP
  SELECT user_id INTO v_host FROM public.trip_members WHERE trip_id=p_trip ORDER BY joined_at,user_id LIMIT 1 OFFSET ((p.n-1)%v_count);
  INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,p.n,p.starts_at,v_host);
END LOOP;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip) THEN RAISE EXCEPTION 'Pick a time before the trip'; END IF;
UPDATE public.game_night_polls SET confirmed_option=p_option WHERE trip_id=p_trip; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.reschedule_preview(p_trip uuid, p_every integer, p_count integer)
RETURNS TABLE(week_number integer, starts_at timestamptz, played boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_played int; v_anchor timestamptz; v_last timestamptz; BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can change the schedule'; END IF;
SELECT count(*), max(n.starts_at) INTO v_played, v_last FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at <= now();
RETURN QUERY SELECT n.week_number, n.starts_at, true FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at <= now() ORDER BY n.week_number;
SELECT min(n.starts_at) INTO v_anchor FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at > now();
IF v_anchor IS NULL AND v_last IS NOT NULL THEN v_anchor := v_last + make_interval(days => 7*greatest(1,least(2,coalesce(p_every,1)))); END IF;
IF v_anchor IS NULL THEN RETURN; END IF;
RETURN QUERY SELECT (v_played + p.n)::int, p.starts_at, false FROM trip_private.plan_nights(p_trip, v_anchor, p_every, greatest(0, least(12, coalesce(p_count,12)) - v_played)) p;
END $fn$;

CREATE OR REPLACE FUNCTION trip_private.apply_reschedule(p_trip uuid, p_every integer, p_count integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE r record; v_count int; v_host uuid; v_max int; t public.trips; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can confirm a new schedule'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip;
CREATE TEMP TABLE IF NOT EXISTS _plan(week_number int, starts_at timestamptz, played boolean) ON COMMIT DROP; DELETE FROM _plan;
INSERT INTO _plan SELECT * FROM trip_private.reschedule_preview(p_trip, p_every, p_count);
IF NOT EXISTS (SELECT 1 FROM _plan) THEN RAISE EXCEPTION 'A season needs at least 1 game night before the trip'; END IF;
SELECT max(week_number) INTO v_max FROM _plan; SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id=p_trip;
DELETE FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number > v_max;
DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number > v_max AND q.drops_at > now();
DELETE FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number > v_max AND n.starts_at > now();
FOR r IN SELECT * FROM _plan WHERE NOT played LOOP
  IF EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=r.week_number) THEN
    UPDATE public.game_nights n SET starts_at=r.starts_at WHERE n.trip_id=p_trip AND n.week_number=r.week_number AND n.starts_at IS DISTINCT FROM r.starts_at;
    IF FOUND THEN DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=r.week_number AND q.drops_at > now() AND q.source='pool';
      UPDATE public.weekly_questions q SET drops_at=least(q.drops_at, r.starts_at - interval '1 day') WHERE q.trip_id=p_trip AND q.week_number=r.week_number AND q.drops_at > now(); END IF;
  ELSE
    SELECT user_id INTO v_host FROM public.trip_members WHERE trip_id=p_trip ORDER BY joined_at,user_id LIMIT 1 OFFSET ((r.week_number-1)%greatest(v_count,1));
    INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,r.week_number,r.starts_at,v_host);
  END IF;
END LOOP;
UPDATE public.trips SET schedule_every=greatest(1,least(2,coalesce(p_every,1))) WHERE id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN (SELECT count(*) FROM _plan)::int; END $fn$;

-- QOTW: sprint seasons (nights less than a week apart) drop the day after the previous night
CREATE OR REPLACE FUNCTION trip_private.ensure_weekly_questions(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE n record; tz text; d date; BEGIN
SELECT home_timezone INTO tz FROM public.trips WHERE id=p_trip;
FOR n IN SELECT cur.week_number, cur.starts_at cur_start, prev.starts_at prev_start FROM public.game_nights cur JOIN public.game_nights prev ON prev.trip_id=cur.trip_id AND prev.week_number=cur.week_number-1
  WHERE cur.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=cur.week_number) LOOP
  d := (n.prev_start AT TIME ZONE tz)::date;
  IF n.cur_start - n.prev_start < interval '7 days' THEN d := d + 1; ELSE d := d + (8 - extract(isodow FROM d)::int); END IF;
  INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, n.week_number, trip_private.pick_weekly_prompt(p_trip), (d + time '09:00') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
END LOOP; END $fn$;

-- Skip passes scale with the season
CREATE OR REPLACE FUNCTION trip_private.skip_limit(p_trip uuid, p_season text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
SELECT CASE WHEN p_season='trip' THEN 3 ELSE least(3, greatest(1, (SELECT count(*)::int FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped)/4)) END $fn$;
CREATE OR REPLACE FUNCTION trip_private.use_skip(p_trip uuid, p_kind text, p_ref text, p_new text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE tr public.trips; s text; used int; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF NOT trip_private.trip_open(p_trip) THEN RAISE EXCEPTION 'This trip has ended — it''s read-only now'; END IF;
IF p_kind NOT IN ('card','quest','mission','bingo') THEN RAISE EXCEPTION 'Unknown skip'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip;
s := CASE WHEN (now() AT TIME ZONE tr.home_timezone)::date >= tr.start_date THEN 'trip' ELSE 'game' END;
IF s = 'game' AND p_kind <> 'card' THEN RAISE EXCEPTION 'That skip works during the trip'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(p_trip::text || auth.uid()::text));
SELECT count(*) INTO used FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND season=s;
IF used >= trip_private.skip_limit(p_trip, s) THEN RAISE EXCEPTION 'No skip passes left this season'; END IF;
IF EXISTS (SELECT 1 FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND kind=p_kind AND ref=coalesce(p_ref,'') AND p_kind <> 'card') THEN RAISE EXCEPTION 'Already skipped'; END IF;
IF p_kind = 'mission' THEN
  IF p_new IS NULL OR length(p_new) > 300 THEN RAISE EXCEPTION 'Missing new mission'; END IF;
  UPDATE public.secret_missions SET mission = p_new WHERE trip_id=p_trip AND user_id=auth.uid() AND day_date=(now() AT TIME ZONE tr.home_timezone)::date AND revealed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No open mission to skip'; END IF;
END IF;
INSERT INTO public.skip_passes(trip_id, user_id, season, kind, ref) VALUES (p_trip, auth.uid(), s, p_kind, CASE WHEN p_kind='card' THEN gen_random_uuid()::text ELSE coalesce(p_ref,'') END);
RETURN s; END $fn$;

-- Game stamps: closed-season joiners are off the season board
CREATE OR REPLACE FUNCTION trip_private.game_stamps(p_trip uuid)
RETURNS TABLE(user_id uuid, stamps integer, mx integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
g AS (SELECT m.user_id,
  sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
  sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
  FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now() AND NOT n.skipped
  LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
  WHERE m.trip_id=p_trip GROUP BY m.user_id),
qw AS (SELECT (3*count(*))::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
qa AS (SELECT a.user_id, (count(*) + 2*count(*) FILTER (WHERE q.winner_id=a.user_id))::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id)
SELECT m.user_id, (coalesce(g.stamps,0)+coalesce(qa.n,0)+m.start_stamps)::int, (coalesce(g.mx,0)+qw.total)::int
FROM public.trip_members m CROSS JOIN qw LEFT JOIN g ON g.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id WHERE m.trip_id=p_trip AND NOT m.season_closed $$;

-- Trip season adds late-joiner trip-day start stamps
CREATE OR REPLACE FUNCTION trip_private.trip_season(p_trip uuid) RETURNS TABLE(user_id uuid, stamps integer, today_stamps integer, max_stamps integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_today date := trip_private.trip_today(p_trip); v_max integer; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT coalesce(sum(CASE WHEN coalesce(g.tag,dt.tag)='Travel' THEN 10 ELSE 30 END),0)::int INTO v_max
FROM public.trips t CROSS JOIN LATERAL generate_series(t.start_date, least(t.end_date, v_today), interval '1 day') s(d)
LEFT JOIN public.trip_day_games g ON g.trip_id=t.id AND g.day_date=s.d::date LEFT JOIN public.trip_day_tags dt ON dt.trip_id=t.id AND dt.day_date=s.d::date WHERE t.id=p_trip;
RETURN QUERY
WITH raw AS (
  SELECT b.user_id u, b.day_date d, (count(*) + CASE WHEN count(*)>=9 THEN 4 ELSE 0 END)::int pts FROM public.bingo_marks b WHERE b.trip_id=p_trip GROUP BY 1,2
  UNION ALL SELECT q.user_id, q.day_date, 2 FROM public.quest_posts q WHERE q.trip_id=p_trip AND (SELECT count(*) FROM public.quest_thumbs th WHERE th.post_id=q.id AND th.user_id<>q.user_id) >= 2
  UNION ALL SELECT a.user_id, a.day_date, count(*)::int FROM public.trivia_answers a WHERE a.trip_id=p_trip AND a.correct GROUP BY 1,2
  UNION ALL SELECT s.user_id, s.day_date, 3 FROM public.secret_missions s WHERE s.trip_id=p_trip AND s.revealed_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.mission_votes v WHERE v.trip_id=p_trip AND v.day_date=s.day_date AND v.owner_id=s.user_id AND NOT v.caught) AND NOT EXISTS (SELECT 1 FROM public.mission_votes v WHERE v.trip_id=p_trip AND v.day_date=s.day_date AND v.owner_id=s.user_id AND v.caught)
  UNION ALL SELECT v.voter_id, v.day_date, 1 FROM public.mission_votes v WHERE v.trip_id=p_trip AND v.caught
  UNION ALL SELECT w.choice_id, w.day_date, CASE WHEN w.kind='mvp' THEN 5 ELSE 3 END FROM (SELECT dv.day_date, dv.kind, dv.choice_id, count(*) c, max(count(*)) OVER (PARTITION BY dv.day_date, dv.kind) mc FROM public.day_votes dv WHERE dv.trip_id=p_trip AND dv.day_date < v_today GROUP BY 1,2,3) w WHERE w.c=w.mc
  UNION ALL SELECT c.user_id, c.day_date, (ARRAY[2,0,1,2,1])[c.mission+1] FROM public.airport_claims c WHERE c.trip_id=p_trip AND c.mission<>1
  UNION ALL SELECT x.user_id, x.day_date, 2 FROM (SELECT c.user_id, c.day_date, abs((split_part(c.guess,':',1)::int*60+split_part(c.guess,':',2)::int) - (split_part(g.wheels_up,':',1)::int*60+split_part(g.wheels_up,':',2)::int)) diff, min(abs((split_part(c.guess,':',1)::int*60+split_part(c.guess,':',2)::int) - (split_part(g.wheels_up,':',1)::int*60+split_part(g.wheels_up,':',2)::int))) OVER (PARTITION BY c.day_date) md FROM public.airport_claims c JOIN public.trip_day_games g ON g.trip_id=c.trip_id AND g.day_date=c.day_date WHERE c.trip_id=p_trip AND c.mission=1 AND c.guess IS NOT NULL AND g.wheels_up IS NOT NULL) x WHERE x.diff=x.md
), daily AS (
  SELECT r.u, r.d, least(sum(r.pts), CASE WHEN coalesce(g.tag,dt.tag)='Travel' THEN 10 ELSE 30 END)::int pts FROM raw r LEFT JOIN public.trip_day_games g ON g.trip_id=p_trip AND g.day_date=r.d LEFT JOIN public.trip_day_tags dt ON dt.trip_id=p_trip AND dt.day_date=r.d GROUP BY r.u, r.d, g.tag, dt.tag
)
SELECT m.user_id, (coalesce(sum(dl.pts),0)+m.trip_start_stamps)::int, coalesce(sum(dl.pts) FILTER (WHERE dl.d=v_today),0)::int, v_max FROM public.trip_members m LEFT JOIN daily dl ON dl.u=m.user_id WHERE m.trip_id=p_trip GROUP BY m.user_id, m.trip_start_stamps; END $fn$;

-- Join rules
CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips%ROWTYPE; gr trip_private.trip_join_grants%ROWTYPE; v_avg integer := 0; v_week integer; v_count integer; v_closed boolean; v_trip_avg integer := 0; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 SELECT * INTO t FROM public.trips WHERE join_code = upper(trim(coalesce(p_code,''))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'That invite code was not found'; END IF;
 IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
 SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;
 IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
 IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
 SELECT * INTO gr FROM trip_private.trip_join_grants WHERE trip_id=t.id AND user_id=auth.uid();
 IF FOUND THEN
   INSERT INTO public.trip_members(trip_id,user_id,start_stamps,joined_week,trip_start_stamps,season_closed) VALUES(t.id,auth.uid(),gr.start_stamps,gr.joined_week,gr.trip_start_stamps,gr.season_closed);
   RETURN t.id;
 END IF;
 v_closed := EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=t.id AND season='game') OR coalesce(trip_private.effective_crowning(t.id,'game') <= now(), false);
 IF NOT v_closed AND EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=t.id AND NOT skipped AND starts_at <= now()) THEN
   SELECT coalesce(floor(avg(g.stamps) FILTER (WHERE g.stamps > 0)),0)::int INTO v_avg FROM trip_private.game_stamps(t.id) g;
   SELECT coalesce(min(week_number) FILTER (WHERE starts_at > now()), max(week_number)+1) INTO v_week FROM public.game_nights WHERE trip_id=t.id;
 END IF;
 INSERT INTO public.trip_members(trip_id,user_id,start_stamps,joined_week,season_closed) VALUES(t.id,auth.uid(),v_avg,v_week,v_closed);
 IF v_closed AND (now() AT TIME ZONE t.home_timezone)::date > t.start_date THEN
   SELECT coalesce(floor(avg(s.stamps) FILTER (WHERE s.stamps > 0 AND s.user_id <> auth.uid())),0)::int INTO v_trip_avg FROM trip_private.trip_season(t.id) s;
   UPDATE public.trip_members SET trip_start_stamps=v_trip_avg WHERE trip_id=t.id AND user_id=auth.uid();
 END IF;
 INSERT INTO trip_private.trip_join_grants(trip_id,user_id,start_stamps,joined_week,trip_start_stamps,season_closed) VALUES(t.id,auth.uid(),v_avg,v_week,v_trip_avg,v_closed);
 RETURN t.id;
END $$;

-- Card rounds scale with room size
CREATE OR REPLACE FUNCTION trip_private.room_rounds(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
SELECT CASE WHEN ceil((SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip)::numeric / greatest(1,(SELECT count(*) FROM public.trip_teams WHERE trip_id=p_trip AND (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip) > 12))) <= 6 THEN 2 ELSE 1 END $fn$;

CREATE OR REPLACE FUNCTION trip_private.night_flow_action(p_trip uuid,p_week integer,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE v_flow public.game_night_flow; v_first uuid; v_category text; v_order uuid[]; v_cards int; BEGIN
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
 SELECT array_agg(user_id ORDER BY CASE WHEN user_id=v_flow.first_player THEN 0 ELSE 1 END,joined_at,user_id) INTO v_order FROM public.trip_members WHERE trip_id=p_trip;
 INSERT INTO public.game_night_turns(trip_id,week_number,cards_per_person,player_order,turn_index,card_number,active) VALUES(p_trip,p_week,v_cards,v_order,0,1,true) ON CONFLICT(trip_id) DO UPDATE SET week_number=excluded.week_number,cards_per_person=v_cards,player_order=excluded.player_order,turn_index=0,card_number=1,active=true;
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

-- Trip-day game days
CREATE OR REPLACE FUNCTION trip_private.game_day_status(p_trip uuid, p_date date) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE t public.trips; v_len int; v_idx int; v_tag text; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip;
IF p_date < t.start_date OR p_date > t.end_date THEN RETURN 'off'; END IF;
SELECT coalesce(g.tag, dt.tag) INTO v_tag FROM (SELECT 1) x LEFT JOIN public.trip_day_games g ON g.trip_id=p_trip AND g.day_date=p_date LEFT JOIN public.trip_day_tags dt ON dt.trip_id=p_trip AND dt.day_date=p_date;
IF v_tag='Travel' THEN RETURN 'travel'; END IF;
IF p_date = ANY(t.rest_days) THEN RETURN 'rest'; END IF;
IF t.surprise_mode THEN
  IF p_date > trip_private.trip_today(p_trip) AND NOT trip_private.is_leader(p_trip) THEN RETURN 'hidden'; END IF;
  RETURN CASE WHEN abs(hashtext(p_trip::text || p_date::text)) % 2 = 0 THEN 'surprise' ELSE 'rest' END;
END IF;
v_len := t.end_date - t.start_date + 1;
IF v_len <= 10 OR coalesce(t.game_days_every, 2) = 1 THEN RETURN 'game'; END IF;
SELECT count(*) INTO v_idx FROM generate_series(t.start_date, p_date - 1, interval '1 day') s(d)
  LEFT JOIN public.trip_day_games g ON g.trip_id=p_trip AND g.day_date=s.d::date LEFT JOIN public.trip_day_tags dt ON dt.trip_id=p_trip AND dt.day_date=s.d::date
  WHERE coalesce(g.tag,dt.tag) IS DISTINCT FROM 'Travel' AND NOT (s.d::date = ANY(t.rest_days));
RETURN CASE WHEN v_idx % 2 = 0 THEN 'game' ELSE 'rest' END; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.set_game_days(p_trip uuid, p_every integer, p_rest date[], p_surprise boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can change game days'; END IF;
IF p_every IS NOT NULL AND p_every NOT IN (1,2) THEN RAISE EXCEPTION 'Pick every day or every other day'; END IF;
UPDATE public.trips SET game_days_every=p_every, rest_days=coalesce((SELECT array_agg(DISTINCT d) FROM unnest(p_rest) d WHERE d BETWEEN start_date AND end_date),'{}'), surprise_mode=coalesce(p_surprise,false) WHERE id=p_trip; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.unlock_big_group(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can unlock Big Group'; END IF;
UPDATE public.trips SET big_group=true WHERE id=p_trip; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.set_team_room(p_trip uuid, p_team uuid, p_call text, p_host uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can set team rooms'; END IF;
IF p_call IS NOT NULL AND length(trim(p_call))>0 AND trim(p_call) !~ '^https://' THEN RAISE EXCEPTION 'Call links must start with https://'; END IF;
IF p_host IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trip_team_members WHERE trip_id=p_trip AND team_id=p_team AND user_id=p_host) THEN RAISE EXCEPTION 'The host must be on that team'; END IF;
UPDATE public.trip_teams SET call_link=nullif(trim(p_call),''), host_id=p_host WHERE id=p_team AND trip_id=p_trip;
IF NOT FOUND THEN RAISE EXCEPTION 'Team not found'; END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.skip_limit_for(p_trip uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
RETURN trip_private.skip_limit(p_trip,'game'); END $fn$;

REVOKE ALL ON FUNCTION trip_private.plan_nights(uuid,timestamptz,integer,integer), trip_private.reschedule_preview(uuid,integer,integer), trip_private.apply_reschedule(uuid,integer,integer), trip_private.skip_limit(uuid,text), trip_private.room_rounds(uuid), trip_private.game_day_status(uuid,date), trip_private.set_game_days(uuid,integer,date[],boolean), trip_private.unlock_big_group(uuid), trip_private.set_team_room(uuid,uuid,text,uuid), trip_private.skip_limit_for(uuid), trip_private.check_trip_length() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.reschedule_preview(uuid,integer,integer), trip_private.apply_reschedule(uuid,integer,integer), trip_private.game_day_status(uuid,date), trip_private.set_game_days(uuid,integer,date[],boolean), trip_private.unlock_big_group(uuid), trip_private.set_team_room(uuid,uuid,text,uuid), trip_private.skip_limit_for(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reschedule_preview(p_trip uuid, p_every integer, p_count integer) RETURNS TABLE(week_number integer, starts_at timestamptz, played boolean) LANGUAGE sql SET search_path=public AS $fn$ SELECT * FROM trip_private.reschedule_preview(p_trip,p_every,p_count) $fn$;
CREATE OR REPLACE FUNCTION public.apply_reschedule(p_trip uuid, p_every integer, p_count integer) RETURNS integer LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.apply_reschedule(p_trip,p_every,p_count) $fn$;
CREATE OR REPLACE FUNCTION public.game_day_status(p_trip uuid, p_date date) RETURNS text LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.game_day_status(p_trip,p_date) $fn$;
CREATE OR REPLACE FUNCTION public.set_game_days(p_trip uuid, p_every integer, p_rest date[], p_surprise boolean) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.set_game_days(p_trip,p_every,p_rest,p_surprise) $fn$;
CREATE OR REPLACE FUNCTION public.unlock_big_group(p_trip uuid) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.unlock_big_group(p_trip) $fn$;
CREATE OR REPLACE FUNCTION public.set_team_room(p_trip uuid, p_team uuid, p_call text, p_host uuid) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.set_team_room(p_trip,p_team,p_call,p_host) $fn$;
CREATE OR REPLACE FUNCTION public.skip_limit(p_trip uuid) RETURNS integer LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.skip_limit_for(p_trip) $fn$;
REVOKE ALL ON FUNCTION public.reschedule_preview(uuid,integer,integer), public.apply_reschedule(uuid,integer,integer), public.game_day_status(uuid,date), public.set_game_days(uuid,integer,date[],boolean), public.unlock_big_group(uuid), public.set_team_room(uuid,uuid,text,uuid), public.skip_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_preview(uuid,integer,integer), public.apply_reschedule(uuid,integer,integer), public.game_day_status(uuid,date), public.set_game_days(uuid,integer,date[],boolean), public.unlock_big_group(uuid), public.set_team_room(uuid,uuid,text,uuid), public.skip_limit(uuid) TO authenticated;
