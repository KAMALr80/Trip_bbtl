CREATE OR REPLACE FUNCTION trip_private.quest_cutoff(p_trip uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN t.season_rule='a2c' AND t.kind='trip' AND t.start_date=(now() AT TIME ZONE t.home_timezone)::date+1
   THEN (t.start_date::timestamp AT TIME ZONE t.home_timezone)
  WHEN t.season_rule='a2c' AND t.kind='at_home' THEN t.finale_at
  WHEN t.kind='trip' THEN ((t.start_date-1)::timestamp AT TIME ZONE t.home_timezone)
  ELSE coalesce((SELECT max(n.starts_at) FROM public.game_nights n WHERE n.trip_id=t.id AND NOT n.skipped),
                ((t.end_date + time '18:00') AT TIME ZONE t.home_timezone)) END
 FROM public.trips t WHERE t.id=p_trip $$;
CREATE OR REPLACE FUNCTION trip_private.sealed_drops(p_trip uuid) RETURNS TABLE(drop_no int, drop_at timestamptz, value int, cutoff timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; v_cut timestamptz; v_cutd date; v_start date; v_days int; v_n int;
BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT FOUND OR t.kind NOT IN ('trip','at_home') THEN RETURN; END IF;
 v_cut := trip_private.quest_cutoff(p_trip);
 v_cutd := (v_cut AT TIME ZONE t.home_timezone)::date;
 IF t.season_rule='a2c' THEN
   IF t.kind='trip' THEN
     IF t.start_date <= (now() AT TIME ZONE t.home_timezone)::date THEN RETURN; END IF;
     IF t.start_date = (now() AT TIME ZONE t.home_timezone)::date+1 THEN
       drop_no:=1; drop_at:=now()-interval '1 minute'; value:=10; cutoff:=v_cut; RETURN NEXT; RETURN;
     END IF;
     v_start := greatest(coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date), t.start_date-10);
     v_n := CASE WHEN t.start_date-v_start<7 THEN 2 ELSE 3 END;
   ELSE
     v_start := t.start_date;
     v_n := CASE WHEN t.end_date-t.start_date<6 THEN 2 ELSE 3 END;
   END IF;
   RETURN QUERY WITH d AS (
     SELECT gs::date AS day FROM generate_series(v_start,least(t.start_date-2,v_cutd),interval '1 day') gs
     WHERE ((gs::date+time '10:00') AT TIME ZONE t.home_timezone)+interval '27 hours'<=v_cut
     ORDER BY md5(p_trip::text||gs::date::text) LIMIT v_n),
   o AS (SELECT d.day,(row_number() OVER (ORDER BY d.day))::int rn FROM d)
   SELECT o.rn, ((o.day+time '10:00') AT TIME ZONE t.home_timezone),
     CASE WHEN abs(hashtext(p_trip::text||o.rn::text)) % 2=0 THEN 5 ELSE 10 END, v_cut FROM o ORDER BY o.rn;
   RETURN;
 END IF;
 IF t.kind='trip' THEN
   v_start := greatest(coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date),v_cutd-14);
 ELSE v_start := t.start_date; END IF;
 v_days := v_cutd-v_start;
 IF t.kind='trip' THEN v_n := CASE WHEN v_days<7 THEN 2 WHEN v_days<11 THEN 3 ELSE 4 END;
 ELSE v_n := CASE WHEN v_days<=3 THEN 1 WHEN v_days<=5 THEN 2 ELSE 3 END; END IF;
 RETURN QUERY WITH d AS (SELECT gs::date AS day FROM generate_series(v_start,v_cutd,interval '1 day') gs
 WHERE ((gs::date+time '10:00') AT TIME ZONE t.home_timezone)+interval '27 hours'<=v_cut
 ORDER BY md5(p_trip::text||gs::date::text) LIMIT v_n),
 o AS (SELECT d.day,(row_number() OVER (ORDER BY d.day))::int rn FROM d)
 SELECT o.rn,((o.day+time '10:00') AT TIME ZONE t.home_timezone),
 CASE WHEN abs(hashtext(p_trip::text||o.rn::text)) % 2=0 THEN 5 ELSE 10 END,v_cut FROM o ORDER BY o.rn;
END $$;
CREATE OR REPLACE FUNCTION trip_private.set_preflight_a2c(p_trip uuid, p_start date, p_weekday integer, p_time time)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; today_local date; final_day date; call_day date; call_at timestamptz; total int:=0;
BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set Pre-Flight'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.season_rule<>'a2c' OR t.kind<>'trip' THEN RAISE EXCEPTION 'This room uses its original plan'; END IF;
 today_local := (now() AT TIME ZONE t.home_timezone)::date;
 IF p_time IS NULL OR p_weekday NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'Choose a night and time'; END IF;
 IF t.start_date<=today_local THEN RETURN 0; END IF;
 IF t.start_date=today_local+1 THEN
   call_day:=today_local;
   call_at:=(call_day+p_time) AT TIME ZONE t.home_timezone;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   IF call_at >= (t.start_date::timestamp AT TIME ZONE t.home_timezone) THEN RAISE EXCEPTION 'No call time remains before departure'; END IF;
   UPDATE public.trips SET game_start=today_local,game_plan='quick_start' WHERE id=p_trip;
 ELSE
   IF p_start IS NULL OR p_start<greatest(today_local,t.start_date-10) OR p_start>t.start_date-2 THEN RAISE EXCEPTION 'Choose a date within ten days of departure'; END IF;
   final_day:=t.start_date-2;
   call_day:=p_start+((p_weekday-extract(dow FROM p_start)::int+7)%7);
   IF call_day>=final_day THEN call_day:=final_day; END IF;
   call_at:=(call_day+p_time) AT TIME ZONE t.home_timezone;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   IF call_at < (final_day::timestamp AT TIME ZONE t.home_timezone) - interval '6 days' AND final_day-call_day>=6 THEN
     INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id)
       VALUES(p_trip,1,call_at,auth.uid()) ON CONFLICT (trip_id,week_number) DO NOTHING;
     total:=1;
     call_day:=final_day; call_at:=(final_day+p_time) AT TIME ZONE t.home_timezone;
   END IF;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   UPDATE public.trips SET game_start=p_start,game_plan='recommended' WHERE id=p_trip;
 END IF;
 INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id)
   VALUES(p_trip,total+1,call_at,auth.uid()) ON CONFLICT (trip_id,week_number) DO NOTHING;
 RETURN total+1;
END $$;
CREATE OR REPLACE FUNCTION public.set_preflight_a2c(p_trip uuid,p_start date,p_weekday integer,p_time time)
RETURNS integer LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.set_preflight_a2c(p_trip,p_start,p_weekday,p_time) $$;
REVOKE ALL ON FUNCTION trip_private.set_preflight_a2c(uuid,date,integer,time),public.set_preflight_a2c(uuid,date,integer,time) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.set_preflight_a2c(uuid,date,integer,time),public.set_preflight_a2c(uuid,date,integer,time) TO authenticated,service_role;