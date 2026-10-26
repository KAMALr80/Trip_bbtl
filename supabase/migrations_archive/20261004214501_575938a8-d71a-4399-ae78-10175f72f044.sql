DROP FUNCTION public.plan_game_nights(uuid,text,integer,time,date,integer);
DROP FUNCTION public.apply_game_plan(uuid,text,integer,time,date,integer);
DROP FUNCTION public.set_preflight_start(uuid,date,text,integer,time,integer);
DROP FUNCTION trip_private.set_preflight_start(uuid,date,text,integer,time,integer);
DROP FUNCTION trip_private.apply_game_plan(uuid,text,integer,time,date,integer);
DROP FUNCTION trip_private.plan_game_nights(uuid,text,integer,time,date,integer);

CREATE FUNCTION trip_private.plan_game_nights(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer, p_count integer DEFAULT NULL)
 RETURNS TABLE(week_number integer, starts_at timestamptz, kept boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; tz text; v_today date; v_next timestamptz; v_last date; v_from date; v_final date; v_cap int; v_kept int; i int; d date; v_dates date[] := '{}'; BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can plan game nights'; END IF;
 IF p_plan NOT IN ('recommended','short','custom') OR p_weekday IS NULL OR p_weekday NOT BETWEEN 0 AND 6 OR p_time IS NULL THEN RAISE EXCEPTION 'Pick a game plan, day and time'; END IF;
 p_every := CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END;
 SELECT * INTO t FROM public.trips WHERE id=p_trip; tz := t.home_timezone; v_today := (now() AT TIME ZONE tz)::date;
 SELECT min(n.starts_at) INTO v_next FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at > now() AND NOT n.skipped;
 RETURN QUERY SELECT n.week_number,n.starts_at,true FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at<=now() OR n.skipped OR n.starts_at=v_next) ORDER BY n.week_number;
 SELECT count(*), max((n.starts_at AT TIME ZONE tz)::date), coalesce(max(n.week_number),0) INTO v_kept,v_last,i FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at<=now() OR n.skipped OR n.starts_at=v_next);
 v_from := greatest(coalesce(p_start,t.game_start,greatest(v_today,t.start_date-84)),v_today);
 IF v_from>t.start_date-2 THEN RAISE EXCEPTION 'Choose a start date before departure'; END IF;
 v_cap := 12-v_kept;
 IF p_plan='short' THEN v_cap := least(v_cap,4); END IF;
 IF p_plan='custom' AND p_count IS NOT NULL THEN v_cap := least(12-v_kept, least(greatest(p_count,1),12)); END IF;
 v_final := t.start_date-1;
 d := v_from+((p_weekday-extract(dow FROM v_from)::int+7)%7);
 WHILE d<v_final AND cardinality(v_dates)<greatest(v_cap-1,0) LOOP
   IF v_last IS NULL OR d>v_last THEN v_dates:=array_append(v_dates,d); END IF;
   d:=d+7*p_every;
 END LOOP;
 IF v_cap>0 AND (v_last IS NULL OR v_final>v_last) AND NOT v_final=ANY(v_dates) THEN v_dates:=array_append(v_dates,v_final); END IF;
 FOREACH d IN ARRAY v_dates LOOP
   IF ((d+p_time) AT TIME ZONE tz)>now() THEN i:=i+1; week_number:=i; starts_at:=(d+p_time) AT TIME ZONE tz; kept:=false; RETURN NEXT; END IF;
 END LOOP;
END $function$;

CREATE FUNCTION trip_private.apply_game_plan(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer, p_count integer DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v_count int; v_host uuid; v_keep int; t public.trips; v_today date; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE status='approved' AND trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can confirm a game plan'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip; v_today := (now() AT TIME ZONE t.home_timezone)::date;
CREATE TEMP TABLE IF NOT EXISTS _gplan(week_number int, starts_at timestamptz, kept boolean) ON COMMIT DROP; TRUNCATE _gplan;
INSERT INTO _gplan SELECT * FROM trip_private.plan_game_nights(p_trip,p_plan,p_weekday,p_time,p_start,p_every,p_count);
IF NOT EXISTS (SELECT 1 FROM _gplan) THEN RAISE EXCEPTION 'A season needs at least 1 game night before the trip'; END IF;
SELECT coalesce(max(week_number) FILTER (WHERE kept),0) INTO v_keep FROM _gplan;
SELECT count(*) INTO v_count FROM public.trip_members WHERE status='approved' AND trip_id=p_trip;
DELETE FROM public.host_swaps s WHERE s.trip_id=p_trip AND s.week_number > v_keep AND s.status='open';
DELETE FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number > v_keep;
DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.drops_at > now() AND ((q.week_number > v_keep AND q.week_number < 1000) OR q.week_number >= 1000);
DELETE FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number > v_keep;
FOR r IN SELECT * FROM _gplan WHERE NOT kept ORDER BY week_number LOOP
  SELECT user_id INTO v_host FROM public.trip_members WHERE status='approved' AND trip_id=p_trip ORDER BY coalesce(approved_at,joined_at),user_id LIMIT 1 OFFSET ((r.week_number-1)%greatest(v_count,1));
  INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,r.week_number,r.starts_at,v_host);
END LOOP;
UPDATE public.trips SET game_plan=p_plan, schedule_every=CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END,
  game_start = CASE WHEN p_plan='custom' THEN greatest(p_start, v_today)
                    WHEN p_plan='short' THEN coalesce((SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now()), v_today)
                    ELSE greatest(v_today, start_date - 84) END
  WHERE id=p_trip;
UPDATE public.trips SET game_start = least(game_start, (SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip)) WHERE id=p_trip;
UPDATE public.game_night_polls SET confirmed_option=coalesce(confirmed_option,0) WHERE trip_id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN (SELECT count(*) FROM _gplan)::int; END $function$;

CREATE FUNCTION trip_private.set_preflight_start(p_trip uuid, p_start date, p_plan text, p_weekday integer, p_time time, p_every integer, p_count integer DEFAULT NULL)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; v_today date; v_count int;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set Pre-Flight'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.kind='at_home' THEN RAISE EXCEPTION 'Choose a real trip'; END IF;
 v_today := (now() AT TIME ZONE t.home_timezone)::date;
 IF p_start IS NULL OR p_start < v_today OR p_start > t.start_date-2 THEN RAISE EXCEPTION 'Choose a Pre-Flight date before departure'; END IF;
 IF p_plan NOT IN ('recommended','short','custom') OR p_weekday NOT BETWEEN 0 AND 6 OR p_time IS NULL THEN RAISE EXCEPTION 'Choose a game plan, day and time'; END IF;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
 SELECT trip_private.apply_game_plan(p_trip,p_plan,p_weekday,p_time,p_start,p_every,p_count) INTO v_count;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
 RETURN v_count;
END $function$;

CREATE FUNCTION public.plan_game_nights(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer, p_count integer DEFAULT NULL)
 RETURNS TABLE(week_number integer, starts_at timestamptz, kept boolean) LANGUAGE sql SET search_path TO 'public'
AS $$ SELECT * FROM trip_private.plan_game_nights(p_trip,p_plan,p_weekday,p_time,p_start,p_every,p_count) $$;
CREATE FUNCTION public.apply_game_plan(p_trip uuid, p_plan text, p_weekday integer, p_time time, p_start date, p_every integer, p_count integer DEFAULT NULL)
 RETURNS integer LANGUAGE sql SET search_path TO 'public'
AS $$ SELECT trip_private.apply_game_plan(p_trip,p_plan,p_weekday,p_time,p_start,p_every,p_count) $$;
CREATE FUNCTION public.set_preflight_start(p_trip uuid, p_start date, p_plan text, p_weekday integer, p_time time, p_every integer, p_count integer DEFAULT NULL)
 RETURNS integer LANGUAGE sql SET search_path TO 'public'
AS $$ SELECT trip_private.set_preflight_start(p_trip,p_start,p_plan,p_weekday,p_time,p_every,p_count) $$;

REVOKE ALL ON FUNCTION trip_private.plan_game_nights(uuid,text,integer,time,date,integer,integer), trip_private.apply_game_plan(uuid,text,integer,time,date,integer,integer),
  public.plan_game_nights(uuid,text,integer,time,date,integer,integer), public.apply_game_plan(uuid,text,integer,time,date,integer,integer), public.set_preflight_start(uuid,date,text,integer,time,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.plan_game_nights(uuid,text,integer,time,date,integer,integer), trip_private.apply_game_plan(uuid,text,integer,time,date,integer,integer),
  public.plan_game_nights(uuid,text,integer,time,date,integer,integer), public.apply_game_plan(uuid,text,integer,time,date,integer,integer), public.set_preflight_start(uuid,date,text,integer,time,integer,integer) TO authenticated, service_role;