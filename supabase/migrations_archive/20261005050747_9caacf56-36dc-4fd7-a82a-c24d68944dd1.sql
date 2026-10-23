CREATE OR REPLACE FUNCTION trip_private.sealed_drops(p_trip uuid) RETURNS TABLE(drop_no integer, drop_at timestamptz, value integer, cutoff timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; v_cut timestamptz; v_cutd date; v_start date; v_days int; v_n int; v_base timestamptz; v_window interval; i int;
BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT FOUND OR t.kind NOT IN ('trip','at_home') THEN RETURN; END IF;
 v_cut:=trip_private.quest_cutoff(p_trip); v_cutd:=(v_cut AT TIME ZONE t.home_timezone)::date;
 IF t.season_rule='a2c' THEN
   IF t.kind='trip' AND t.start_date <= (t.created_at AT TIME ZONE t.home_timezone)::date THEN RETURN; END IF;
   IF t.kind='trip' AND t.game_plan='quick_start' THEN
     drop_no:=1; drop_at:=t.created_at-interval '1 minute'; value:=10; cutoff:=v_cut; RETURN NEXT; RETURN;
   END IF;
   IF t.kind='trip' THEN
     v_start:=greatest(coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date),t.start_date-10);
     v_n:=CASE WHEN t.start_date-v_start<7 THEN 2 ELSE 3 END;
     v_base:=greatest(t.created_at,(v_start+time '09:00') AT TIME ZONE t.home_timezone);
   ELSE
     v_n:=CASE WHEN t.end_date-t.start_date<6 THEN 2 ELSE 3 END;
     v_base:=(t.start_date+time '09:00') AT TIME ZONE t.home_timezone;
   END IF;
   v_window:=v_cut-v_base;
   IF v_window<=interval '1 hour' THEN RETURN; END IF;
   FOR i IN 1..v_n LOOP
     drop_no:=i; drop_at:=v_base+(v_window*(i-1)::double precision/v_n); cutoff:=v_cut;
     value:=CASE WHEN hashtext(p_trip::text||i::text)::bigint%2=0 THEN 5 ELSE 10 END;
     RETURN NEXT;
   END LOOP;
   RETURN;
 END IF;
 v_start:=CASE WHEN t.kind='trip' THEN greatest(coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date),v_cutd-14) ELSE t.start_date END;
 v_days:=v_cutd-v_start;
 v_n:=CASE WHEN t.kind='trip' THEN CASE WHEN v_days<7 THEN 2 WHEN v_days<11 THEN 3 ELSE 4 END ELSE CASE WHEN v_days<=3 THEN 1 WHEN v_days<=5 THEN 2 ELSE 3 END END;
 RETURN QUERY WITH d AS (SELECT gs::date AS day FROM generate_series(v_start,v_cutd,interval '1 day') gs
 WHERE ((gs::date+time '10:00') AT TIME ZONE t.home_timezone)+interval '27 hours'<=v_cut
 ORDER BY md5(p_trip::text||gs::date::text) LIMIT v_n),o AS (SELECT d.day,(row_number() OVER (ORDER BY d.day))::int rn FROM d)
 SELECT o.rn,((o.day+time '10:00') AT TIME ZONE t.home_timezone),CASE WHEN abs(hashtext(p_trip::text||o.rn::text))%2=0 THEN 5 ELSE 10 END,v_cut FROM o ORDER BY o.rn;
END $$;
CREATE OR REPLACE FUNCTION trip_private.set_preflight_a2c(p_trip uuid,p_start date,p_weekday integer,p_time time)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; today_local date; final_day date; first_day date; call_at timestamptz; total integer:=0;
BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set Pre-Flight'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.season_rule<>'a2c' OR t.kind<>'trip' THEN RAISE EXCEPTION 'This room uses its original plan'; END IF;
 today_local:=(now() AT TIME ZONE t.home_timezone)::date;
 IF p_time IS NULL OR p_weekday NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'Choose a night and time'; END IF;
 IF t.start_date<=today_local THEN RETURN 0; END IF;
 IF EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip) THEN RAISE EXCEPTION 'This Trip already has game nights'; END IF;
 IF t.start_date=today_local+1 THEN
   call_at:=(today_local+p_time) AT TIME ZONE t.home_timezone;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   IF call_at >= (t.start_date::timestamp AT TIME ZONE t.home_timezone) THEN RAISE EXCEPTION 'No call time remains before departure'; END IF;
   UPDATE public.trips SET game_start=today_local,game_plan='quick_start' WHERE id=p_trip AND season_rule='a2c';
 ELSE
   IF p_start IS NULL OR p_start<greatest(today_local,t.start_date-10) OR p_start>t.start_date-2 THEN RAISE EXCEPTION 'Choose a date within ten days of departure'; END IF;
   final_day:=t.start_date-2;
   IF final_day-p_start>=6 THEN
     first_day:=p_start+((p_weekday-extract(dow FROM p_start)::int+7)%7);
     IF first_day>=final_day THEN first_day:=p_start+greatest(1,(final_day-p_start)/2); END IF;
     call_at:=(first_day+p_time) AT TIME ZONE t.home_timezone;
     IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
     INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,1,call_at,auth.uid());
     total:=1;
   END IF;
   call_at:=(final_day+p_time) AT TIME ZONE t.home_timezone;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   UPDATE public.trips SET game_start=p_start,game_plan='recommended' WHERE id=p_trip AND season_rule='a2c';
 END IF;
 INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,total+1,call_at,auth.uid());
 RETURN total+1;
END $$;
CREATE OR REPLACE FUNCTION trip_private.season_timing(p_trip uuid)
RETURNS TABLE(mode text,preflight_start date,cutoff timestamptz,reveal_at timestamptz,drop_count integer,finale_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; local_today date; days_total integer;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.season_rule<>'a2c' THEN RAISE EXCEPTION 'This room uses its original season'; END IF;
 local_today:=(now() AT TIME ZONE t.home_timezone)::date;
 days_total:=t.start_date-coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date);
 IF t.kind='trip' THEN
   mode:=CASE WHEN t.start_date<=local_today THEN 'trip_season' WHEN t.game_plan='quick_start' THEN 'quick_start' ELSE 'preflight' END;
   preflight_start:=greatest(coalesce(t.game_start,local_today),t.start_date-10);
   cutoff:=trip_private.quest_cutoff(p_trip);
   reveal_at:=((t.start_date-1+time '20:00') AT TIME ZONE t.home_timezone);
   drop_count:=CASE WHEN t.start_date<=(t.created_at AT TIME ZONE t.home_timezone)::date THEN 0 WHEN t.game_plan='quick_start' THEN 1 WHEN days_total<7 THEN 2 ELSE 3 END;
   finale_at:=reveal_at;
 ELSE
   mode:='at_home';preflight_start:=t.game_start;finale_at:=t.finale_at;cutoff:=t.finale_at;reveal_at:=t.finale_at;
   drop_count:=CASE WHEN t.end_date-t.start_date<6 THEN 2 ELSE 3 END;
 END IF;
 RETURN NEXT;
END $$;