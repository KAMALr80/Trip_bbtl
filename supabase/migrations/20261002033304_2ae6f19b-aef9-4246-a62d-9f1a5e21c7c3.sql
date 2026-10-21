
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS game_start date;
UPDATE public.trips t SET game_start = coalesce(
  (SELECT min((n.starts_at AT TIME ZONE t.home_timezone)::date) FROM public.game_nights n WHERE n.trip_id=t.id),
  greatest((t.created_at AT TIME ZONE t.home_timezone)::date, t.start_date - 84));

-- 1) random picks again
CREATE OR REPLACE FUNCTION trip_private.pick_weekly_prompt(p_trip uuid, p_week integer)
 RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT trip_private.pick_weekly_prompt(p_trip) $f$;

CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid, p_category text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_id bigint; v_game integer; v_category text; BEGIN
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
RETURN v_id; END $function$;

DROP FUNCTION IF EXISTS trip_private.arc_tones(uuid, integer);
ALTER TABLE public.game_cards DROP COLUMN IF EXISTS tone;
ALTER TABLE public.weekly_question_pool DROP COLUMN IF EXISTS tone;

-- 2/3) start date drives the window
CREATE OR REPLACE FUNCTION trip_private.season_start(p_trip uuid)
 RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT coalesce(t.game_start, greatest((now() AT TIME ZONE t.home_timezone)::date, t.start_date - 84)) FROM public.trips t WHERE t.id=p_trip $f$;

CREATE OR REPLACE FUNCTION trip_private.bonus_window(p_trip uuid)
 RETURNS interval LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT interval '2 days' $f$;

-- poll-confirm path: window measured from the first night, never > 12 weeks out
CREATE OR REPLACE FUNCTION trip_private.plan_nights(p_trip uuid, p_first timestamp with time zone, p_every integer, p_count integer)
 RETURNS TABLE(n integer, starts_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; v_local timestamp; v_days int; v_max int; v_gap interval; i int := 0; BEGIN
SELECT * INTO t FROM public.trips WHERE id=p_trip;
v_local := p_first AT TIME ZONE t.home_timezone;
WHILE v_local::date < t.start_date - 84 LOOP v_local := v_local + interval '7 days'; END LOOP;
v_days := t.start_date - v_local::date;
p_every := greatest(1, least(2, coalesce(p_every,1)));
IF v_days < 7 THEN v_max := 1; v_gap := interval '7 days';
ELSIF v_days < 14 THEN v_max := 2; v_gap := make_interval(days => greatest(2, v_days/2));
ELSE v_max := 12; v_gap := make_interval(days => 7*p_every); END IF;
IF p_count IS NOT NULL THEN v_max := greatest(0, least(v_max, p_count)); END IF;
WHILE i < v_max AND v_local::date < t.start_date LOOP
  i := i+1; n := i; starts_at := v_local AT TIME ZONE t.home_timezone; RETURN NEXT; v_local := v_local + v_gap;
END LOOP; END $function$;

CREATE OR REPLACE FUNCTION trip_private.plan_game_nights(p_trip uuid, p_plan text, p_weekday integer, p_time time without time zone, p_start date, p_every integer)
 RETURNS TABLE(week_number integer, starts_at timestamp with time zone, kept boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; tz text; v_today date; v_next timestamptz; v_kept int := 0; v_last date; v_takeoff date; v_dates date[] := '{}'; d date; v_from date; v_window int; v_cap int; i int; BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can plan game nights'; END IF;
IF p_plan NOT IN ('recommended','short','custom') THEN RAISE EXCEPTION 'Pick a game plan'; END IF;
IF p_weekday IS NULL OR p_weekday NOT BETWEEN 0 AND 6 OR p_time IS NULL THEN RAISE EXCEPTION 'Pick a day and time'; END IF;
p_every := CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END;
SELECT * INTO t FROM public.trips WHERE id=p_trip; tz := t.home_timezone; v_today := (now() AT TIME ZONE tz)::date;
SELECT min(n.starts_at) INTO v_next FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at > now();
RETURN QUERY SELECT n.week_number, n.starts_at, true FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at <= now() OR n.starts_at = v_next) ORDER BY n.week_number;
SELECT count(*), max((n.starts_at AT TIME ZONE tz)::date), coalesce(max(n.week_number),0) INTO v_kept, v_last, i FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at <= now() OR n.starts_at = v_next);
IF p_plan='custom' THEN
  IF p_start IS NULL OR p_start < t.start_date - 84 OR p_start > t.start_date - 2 THEN RAISE EXCEPTION 'Pick a start date between 12 weeks and 2 days before departure'; END IF;
  v_from := greatest(p_start, v_today);
ELSE v_from := greatest(v_today, t.start_date - 84); END IF;
v_window := t.start_date - v_from;
v_cap := 12 - v_kept;
IF p_plan='short' THEN v_cap := least(v_cap, 4); END IF;
IF v_window < 7 THEN v_cap := least(v_cap, 1); ELSIF v_window < 14 THEN v_cap := least(v_cap, 2); END IF;
v_from := greatest(v_from, coalesce(v_last + 1, v_from));
-- Takeoff Night: last chosen weekday before departure, falling back to the eve of departure for tiny windows
d := t.start_date - 1; v_takeoff := d - ((extract(dow FROM d)::int - p_weekday + 7) % 7);
IF v_takeoff < v_from THEN v_takeoff := greatest(v_from, t.start_date - 1); END IF;
IF v_takeoff >= t.start_date THEN v_takeoff := t.start_date; END IF;
d := v_takeoff;
WHILE cardinality(v_dates) < v_cap AND d >= v_from LOOP v_dates := d || v_dates; d := d - 7*p_every; END LOOP;
FOREACH d IN ARRAY v_dates LOOP
  IF ((d + p_time) AT TIME ZONE tz) > now() AND (v_last IS NULL OR d > v_last) THEN i := i + 1; week_number := i; starts_at := (d + p_time) AT TIME ZONE tz; kept := false; RETURN NEXT; END IF;
END LOOP; END $function$;

CREATE OR REPLACE FUNCTION trip_private.apply_game_plan(p_trip uuid, p_plan text, p_weekday integer, p_time time without time zone, p_start date, p_every integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_count int; v_host uuid; v_keep int; t public.trips; v_today date; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can confirm a game plan'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip; v_today := (now() AT TIME ZONE t.home_timezone)::date;
CREATE TEMP TABLE IF NOT EXISTS _gplan(week_number int, starts_at timestamptz, kept boolean) ON COMMIT DROP; DELETE FROM _gplan;
INSERT INTO _gplan SELECT * FROM trip_private.plan_game_nights(p_trip,p_plan,p_weekday,p_time,p_start,p_every);
IF NOT EXISTS (SELECT 1 FROM _gplan) THEN RAISE EXCEPTION 'A season needs at least 1 game night before the trip'; END IF;
SELECT coalesce(max(week_number) FILTER (WHERE kept),0) INTO v_keep FROM _gplan;
SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id=p_trip;
DELETE FROM public.host_swaps s WHERE s.trip_id=p_trip AND s.week_number > v_keep AND s.status='open';
DELETE FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number > v_keep;
DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.drops_at > now() AND ((q.week_number > v_keep AND q.week_number < 1000) OR q.week_number >= 1000);
DELETE FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number > v_keep;
FOR r IN SELECT * FROM _gplan WHERE NOT kept ORDER BY week_number LOOP
  SELECT user_id INTO v_host FROM public.trip_members WHERE trip_id=p_trip ORDER BY joined_at,user_id LIMIT 1 OFFSET ((r.week_number-1)%greatest(v_count,1));
  INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,r.week_number,r.starts_at,v_host);
END LOOP;
UPDATE public.trips SET game_plan=p_plan, schedule_every=CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END,
  game_start = CASE WHEN p_plan='custom' THEN greatest(p_start, v_today)
                    WHEN p_plan='short' THEN least(coalesce(game_start, v_today), (SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip))
                    ELSE greatest(v_today, start_date - 84) END
  WHERE id=p_trip;
UPDATE public.trips SET game_start = least(game_start, (SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip)) WHERE id=p_trip;
UPDATE public.game_night_polls SET confirmed_option=coalesce(confirmed_option,0) WHERE trip_id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN (SELECT count(*) FROM _gplan)::int; END $function$;

-- poll confirm sets the start date from the first night
CREATE OR REPLACE FUNCTION trip_private.confirm_game_nights(p_trip uuid, p_option integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_start timestamptz; t public.trips; v_host uuid; v_count integer; p record; BEGIN
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
UPDATE public.trips SET game_start=(SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip) WHERE id=p_trip;
UPDATE public.game_night_polls SET confirmed_option=p_option WHERE trip_id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip); END $function$;

CREATE OR REPLACE FUNCTION trip_private.ensure_weekly_questions(p_trip uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE n record; tz text; d date; t public.trips; v_start date; v_nights int; k int := 0; BEGIN
SELECT * INTO t FROM public.trips WHERE id=p_trip; tz := t.home_timezone;
v_start := trip_private.season_start(p_trip);
SELECT count(*) INTO v_nights FROM public.game_nights WHERE trip_id=p_trip;
IF v_nights <= 1 THEN RETURN; END IF;
FOR n IN SELECT cur.week_number, cur.starts_at cur_start, prev.starts_at prev_start FROM public.game_nights cur JOIN public.game_nights prev ON prev.trip_id=cur.trip_id AND prev.week_number=cur.week_number-1
  WHERE cur.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=cur.week_number) LOOP
  d := (n.prev_start AT TIME ZONE tz)::date;
  IF n.cur_start - n.prev_start < interval '7 days' THEN d := d + 1; ELSE d := d + (8 - extract(isodow FROM d)::int); END IF;
  INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, n.week_number, trip_private.pick_weekly_prompt(p_trip), (d + time '09:00') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
END LOOP;
IF t.start_date - v_start < 14 THEN
  d := v_start + 1;
  WHILE d < t.start_date LOOP
    IF NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=1000+k)
       AND NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number<1000 AND abs((q.drops_at AT TIME ZONE tz)::date - d) <= 1) THEN
      INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, 1000+k, trip_private.pick_weekly_prompt(p_trip), (d + time '09:00') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
    END IF; k := k + 1; d := d + 2; END LOOP;
END IF;
UPDATE public.weekly_questions SET phase='revealed', revealed_at=now() WHERE trip_id=p_trip AND week_number>=1000 AND revealed_at IS NULL AND drops_at + trip_private.bonus_window(p_trip) <= now();
END $function$;

-- 5) host rules
CREATE TABLE public.host_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  from_user uuid NOT NULL,
  to_user uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','cancelled')),
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.host_swaps TO authenticated;
GRANT ALL ON public.host_swaps TO service_role;
ALTER TABLE public.host_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Involved members and leaders view host swaps" ON public.host_swaps FOR SELECT TO authenticated
USING (trip_private.is_trip_member(trip_id, auth.uid()) AND (from_user=auth.uid() OR to_user=auth.uid() OR to_user IS NULL OR accepted_by=auth.uid()
  OR EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=host_swaps.trip_id AND m.user_id=auth.uid() AND m.role IN ('captain','co_captain'))));

CREATE TABLE public.host_penalties (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  user_id uuid NOT NULL,
  stamps integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, week_number)
);
GRANT SELECT ON public.host_penalties TO authenticated;
GRANT ALL ON public.host_penalties TO service_role;
ALTER TABLE public.host_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or leader view hosting misses" ON public.host_penalties FOR SELECT TO authenticated
USING (trip_private.is_trip_member(trip_id, auth.uid()) AND (user_id=auth.uid()
  OR EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=host_penalties.trip_id AND m.user_id=auth.uid() AND m.role IN ('captain','co_captain'))));

ALTER TABLE public.skip_passes DROP CONSTRAINT IF EXISTS skip_passes_kind_check;
ALTER TABLE public.skip_passes ADD CONSTRAINT skip_passes_kind_check CHECK (kind IN ('card','quest','mission','bingo','respin','host','night'));

CREATE OR REPLACE FUNCTION trip_private.captain_of(p_trip uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT user_id FROM public.trip_members WHERE trip_id=p_trip AND role='captain' LIMIT 1 $f$;

CREATE OR REPLACE FUNCTION trip_private.request_host_swap(p_trip uuid, p_week integer, p_to uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE n public.game_nights; v_id uuid; BEGIN
SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week;
IF NOT FOUND OR n.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only this night''s host can swap it'; END IF;
IF n.starts_at - interval '2 hours' <= now() THEN RAISE EXCEPTION 'Swaps close 2 hours before game night'; END IF;
IF p_to IS NOT NULL AND (p_to=auth.uid() OR NOT trip_private.is_trip_member(p_trip,p_to)) THEN RAISE EXCEPTION 'Pick another player in this trip'; END IF;
UPDATE public.host_swaps SET status='cancelled', updated_at=now() WHERE trip_id=p_trip AND week_number=p_week AND status='open';
INSERT INTO public.host_swaps(trip_id,week_number,from_user,to_user) VALUES(p_trip,p_week,auth.uid(),p_to) RETURNING id INTO v_id;
RETURN v_id; END $f$;

CREATE OR REPLACE FUNCTION trip_private.respond_host_swap(p_swap uuid, p_action text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE s public.host_swaps; n public.game_nights; v_other int; BEGIN
SELECT * INTO s FROM public.host_swaps WHERE id=p_swap FOR UPDATE;
IF NOT FOUND OR s.status<>'open' THEN RAISE EXCEPTION 'This swap is no longer open'; END IF;
IF p_action='cancel' THEN
  IF s.from_user<>auth.uid() AND NOT trip_private.is_leader(s.trip_id) THEN RAISE EXCEPTION 'Only the host can cancel'; END IF;
  UPDATE public.host_swaps SET status='cancelled', updated_at=now() WHERE id=p_swap; RETURN;
END IF;
IF p_action<>'accept' THEN RAISE EXCEPTION 'Unknown action'; END IF;
IF auth.uid()=s.from_user OR NOT trip_private.is_trip_member(s.trip_id,auth.uid()) OR (s.to_user IS NOT NULL AND s.to_user<>auth.uid()) THEN RAISE EXCEPTION 'This swap isn''t for you'; END IF;
SELECT * INTO n FROM public.game_nights WHERE trip_id=s.trip_id AND week_number=s.week_number FOR UPDATE;
IF n.host_id IS DISTINCT FROM s.from_user THEN RAISE EXCEPTION 'The host already changed'; END IF;
IF n.starts_at - interval '2 hours' <= now() THEN RAISE EXCEPTION 'Swaps close 2 hours before game night'; END IF;
SELECT week_number INTO v_other FROM public.game_nights WHERE trip_id=s.trip_id AND host_id=auth.uid() AND starts_at > now() AND week_number<>s.week_number AND NOT skipped ORDER BY starts_at LIMIT 1;
UPDATE public.game_nights SET host_id=auth.uid() WHERE trip_id=s.trip_id AND week_number=s.week_number;
IF v_other IS NOT NULL THEN UPDATE public.game_nights SET host_id=s.from_user WHERE trip_id=s.trip_id AND week_number=v_other; END IF;
UPDATE public.host_swaps SET status='accepted', accepted_by=auth.uid(), updated_at=now() WHERE id=p_swap;
END $f$;

CREATE OR REPLACE FUNCTION trip_private.use_host_pass(p_trip uuid, p_week integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE n public.game_nights; used int; BEGIN
SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
IF NOT FOUND OR n.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only this night''s host can use a pass for it'; END IF;
IF n.starts_at <= now() THEN RAISE EXCEPTION 'Game night already started'; END IF;
IF trip_private.captain_of(p_trip)=auth.uid() THEN RAISE EXCEPTION 'You''re the backup host — hand it off with a swap instead'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(p_trip::text || auth.uid()::text));
SELECT count(*) INTO used FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND season='game';
IF used >= trip_private.skip_limit(p_trip,'game') THEN RAISE EXCEPTION 'No skip passes left this season'; END IF;
INSERT INTO public.skip_passes(trip_id,user_id,season,kind,ref) VALUES(p_trip,auth.uid(),'game','host',p_week::text);
UPDATE public.game_nights SET host_id=trip_private.captain_of(p_trip) WHERE trip_id=p_trip AND week_number=p_week;
UPDATE public.host_swaps SET status='cancelled', updated_at=now() WHERE trip_id=p_trip AND week_number=p_week AND status='open';
END $f$;

-- player night pass keeps attendance (no stamps earned)
CREATE OR REPLACE FUNCTION trip_private.use_night_pass(p_trip uuid, p_week integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE used int; BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week AND starts_at + interval '1 day' > now()) THEN RAISE EXCEPTION 'Pick an upcoming game night'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(p_trip::text || auth.uid()::text));
IF EXISTS (SELECT 1 FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND kind='night' AND ref=p_week::text) THEN RAISE EXCEPTION 'Already used'; END IF;
SELECT count(*) INTO used FROM public.skip_passes WHERE trip_id=p_trip AND user_id=auth.uid() AND season='game';
IF used >= trip_private.skip_limit(p_trip,'game') THEN RAISE EXCEPTION 'No skip passes left this season'; END IF;
INSERT INTO public.skip_passes(trip_id,user_id,season,kind,ref) VALUES(p_trip,auth.uid(),'game','night',p_week::text);
END $f$;

-- no-show: backup host may start after 15 minutes; the host loses 5
CREATE OR REPLACE FUNCTION trip_private.can_run_turns(p_trip uuid, p_week integer)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT EXISTS (SELECT 1 FROM public.game_nights n JOIN public.trip_members m ON m.trip_id=n.trip_id AND m.user_id=auth.uid() WHERE n.trip_id=p_trip AND n.week_number=p_week AND (n.host_id=auth.uid() OR m.role IN ('captain','co_captain'))) $f$;

CREATE OR REPLACE FUNCTION trip_private.night_no_show_check(p_trip uuid, p_week integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE n public.game_nights; BEGIN
SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week;
IF n.host_id IS NULL OR n.host_id=auth.uid() THEN RETURN; END IF;
IF clock_timestamp() < n.starts_at + interval '15 minutes' THEN RAISE EXCEPTION 'Give the host until 15 minutes after start, then you can take over'; END IF;
INSERT INTO public.host_penalties(trip_id,week_number,user_id) VALUES(p_trip,p_week,n.host_id) ON CONFLICT DO NOTHING;
END $f$;

DO $do$ DECLARE src text; BEGIN
  SELECT pg_get_functiondef('trip_private.night_flow_action(uuid,integer,text)'::regprocedure) INTO src;
  src := replace(src, E'IF p_action=''warmup'' THEN\n IF EXISTS', E'IF p_action=''warmup'' THEN\n PERFORM trip_private.night_no_show_check(p_trip,p_week);\n IF EXISTS');
  IF position('night_no_show_check' in src)=0 THEN RAISE EXCEPTION 'patch failed'; END IF;
  EXECUTE src;
END $do$;

CREATE OR REPLACE FUNCTION trip_private.game_stamps(p_trip uuid)
 RETURNS TABLE(user_id uuid, stamps integer, mx integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
g AS (SELECT m.user_id,
  sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
  sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
  FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now() AND NOT n.skipped
  LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
  WHERE m.trip_id=p_trip GROUP BY m.user_id),
qw AS (SELECT (3*count(*) FILTER (WHERE week_number < 1000) + count(*) FILTER (WHERE week_number >= 1000))::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
qa AS (SELECT a.user_id, (count(*) + 2*count(*) FILTER (WHERE q.winner_id=a.user_id))::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id),
pen AS (SELECT hp.user_id, sum(hp.stamps)::int n FROM public.host_penalties hp WHERE hp.trip_id=p_trip GROUP BY hp.user_id)
SELECT m.user_id, greatest(0, coalesce(g.stamps,0)+coalesce(qa.n,0)+m.start_stamps-coalesce(pen.n,0))::int, (coalesce(g.mx,0)+qw.total)::int
FROM public.trip_members m CROSS JOIN qw LEFT JOIN g ON g.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id LEFT JOIN pen ON pen.user_id=m.user_id WHERE m.trip_id=p_trip AND NOT m.season_closed $function$;

CREATE OR REPLACE FUNCTION public.request_host_swap(p_trip uuid, p_week integer, p_to uuid) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $f$ SELECT trip_private.request_host_swap(p_trip,p_week,p_to) $f$;
CREATE OR REPLACE FUNCTION public.respond_host_swap(p_swap uuid, p_action text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $f$ SELECT trip_private.respond_host_swap(p_swap,p_action) $f$;
CREATE OR REPLACE FUNCTION public.use_host_pass(p_trip uuid, p_week integer) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $f$ SELECT trip_private.use_host_pass(p_trip,p_week) $f$;
CREATE OR REPLACE FUNCTION public.use_night_pass(p_trip uuid, p_week integer) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $f$ SELECT trip_private.use_night_pass(p_trip,p_week) $f$;
REVOKE EXECUTE ON FUNCTION public.request_host_swap(uuid,integer,uuid), public.respond_host_swap(uuid,text), public.use_host_pass(uuid,integer), public.use_night_pass(uuid,integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.request_host_swap(uuid,integer,uuid), public.respond_host_swap(uuid,text), public.use_host_pass(uuid,integer), public.use_night_pass(uuid,integer) TO authenticated;
