CREATE OR REPLACE FUNCTION trip_private.quest_cutoff(p_trip uuid) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN t.season_rule='a2c' AND t.kind='trip' AND t.game_plan='quick_start' THEN (t.start_date::timestamp AT TIME ZONE t.home_timezone)
 WHEN t.season_rule='a2c' AND t.kind='at_home' THEN t.finale_at
 WHEN t.kind='trip' THEN ((t.start_date-1)::timestamp AT TIME ZONE t.home_timezone)
 ELSE coalesce((SELECT max(n.starts_at) FROM public.game_nights n WHERE n.trip_id=t.id AND NOT n.skipped), ((t.end_date+time '18:00') AT TIME ZONE t.home_timezone)) END
 FROM public.trips t WHERE t.id=p_trip $$;
CREATE OR REPLACE FUNCTION trip_private.sealed_drops(p_trip uuid) RETURNS TABLE(drop_no int,drop_at timestamptz,value int,cutoff timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; v_cut timestamptz; v_cutd date; v_start date; v_days int; v_n int;
BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT FOUND OR t.kind NOT IN ('trip','at_home') THEN RETURN; END IF;
 v_cut:=trip_private.quest_cutoff(p_trip); v_cutd:=(v_cut AT TIME ZONE t.home_timezone)::date;
 IF t.season_rule='a2c' THEN
   IF t.kind='trip' AND t.start_date <= (now() AT TIME ZONE t.home_timezone)::date THEN RETURN; END IF;
   IF t.kind='trip' AND t.game_plan='quick_start' THEN
     drop_no:=1;drop_at:=(t.created_at-interval '1 minute');value:=10;cutoff:=v_cut;RETURN NEXT;RETURN;
   END IF;
   v_start:=CASE WHEN t.kind='trip' THEN greatest(coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date),t.start_date-10) ELSE t.start_date END;
   v_n:=CASE WHEN t.kind='trip' THEN CASE WHEN t.start_date-v_start<7 THEN 2 ELSE 3 END WHEN t.end_date-t.start_date<6 THEN 2 ELSE 3 END;
   IF t.kind='at_home' THEN
     RETURN QUERY WITH d AS (SELECT gs::date AS day FROM generate_series(v_start,t.end_date,interval '1 day') gs
       WHERE ((gs::date+time '10:00') AT TIME ZONE t.home_timezone)+interval '27 hours'<=v_cut
       ORDER BY md5(p_trip::text||gs::date::text) LIMIT v_n),
       o AS (SELECT d.day,(row_number() OVER (ORDER BY d.day))::int rn FROM d)
       SELECT o.rn,((o.day+time '10:00') AT TIME ZONE t.home_timezone),CASE WHEN abs(hashtext(p_trip::text||o.rn::text))%2=0 THEN 5 ELSE 10 END,v_cut FROM o ORDER BY o.rn;
   ELSE
     RETURN QUERY WITH d AS (SELECT gs::date AS day FROM generate_series(v_start,t.start_date-2,interval '1 day') gs
       WHERE ((gs::date+time '10:00') AT TIME ZONE t.home_timezone)+interval '27 hours'<=v_cut
       ORDER BY md5(p_trip::text||gs::date::text) LIMIT v_n),
       o AS (SELECT d.day,(row_number() OVER (ORDER BY d.day))::int rn FROM d)
       SELECT o.rn,((o.day+time '10:00') AT TIME ZONE t.home_timezone),CASE WHEN abs(hashtext(p_trip::text||o.rn::text))%2=0 THEN 5 ELSE 10 END,v_cut FROM o ORDER BY o.rn;
   END IF;
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