CREATE OR REPLACE FUNCTION trip_private.sealed_drops(p_trip uuid) RETURNS TABLE(drop_no integer,drop_at timestamptz,value integer,cutoff timestamptz)
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

CREATE OR REPLACE FUNCTION trip_private.preview_ten_day_drops(p_trip uuid)
RETURNS TABLE(drop_no integer,drop_at timestamptz,cutoff timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; first_day date; v_cut timestamptz; v_base timestamptz; v_window interval; n integer; i integer;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.kind <> 'trip' THEN RETURN; END IF;
 first_day:=greatest(coalesce(t.game_start,t.start_date-10),t.start_date-10);
 n:=CASE WHEN t.start_date-first_day<7 THEN 2 ELSE 3 END;
 v_cut:=((t.start_date-1)::timestamp AT TIME ZONE t.home_timezone);
 v_base:=(first_day+time '09:00') AT TIME ZONE t.home_timezone;
 v_window:=v_cut-v_base;
 IF v_window<=interval '1 hour' THEN RETURN; END IF;
 FOR i IN 1..n LOOP
   drop_no:=i; drop_at:=v_base+(v_window*(i-1)::double precision/n); cutoff:=v_cut; RETURN NEXT;
 END LOOP;
END $$;