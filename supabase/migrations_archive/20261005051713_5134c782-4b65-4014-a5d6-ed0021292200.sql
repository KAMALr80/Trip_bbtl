CREATE OR REPLACE FUNCTION trip_private.set_preflight_a2c(p_trip uuid,p_start date,p_weekday integer,p_time time)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; today_local date; final_day date; first_day date; first_at timestamptz; call_at timestamptz; total integer:=0;
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
   call_at:=(final_day+p_time) AT TIME ZONE t.home_timezone;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   IF final_day-p_start>=6 THEN
     first_day:=p_start+((p_weekday-extract(dow FROM p_start)::int+7)%7);
     IF first_day>=final_day THEN first_day:=p_start+greatest(1,(final_day-p_start)/2); END IF;
     first_at:=(first_day+p_time) AT TIME ZONE t.home_timezone;
     IF first_at<=now() THEN first_at:=now()+interval '10 minutes'; END IF;
     IF first_at<call_at THEN
       INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,1,first_at,auth.uid());
       total:=1;
     END IF;
   END IF;
   UPDATE public.trips SET game_start=p_start,game_plan='recommended' WHERE id=p_trip AND season_rule='a2c';
 END IF;
 INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,total+1,call_at,auth.uid());
 RETURN total+1;
END $$;