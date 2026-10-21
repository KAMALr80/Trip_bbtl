ALTER TABLE public.trips ADD COLUMN season_rule text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.trips ADD COLUMN finale_format text;
ALTER TABLE public.trips ADD COLUMN finale_place text;
ALTER TABLE public.trips ADD COLUMN finale_at timestamptz;

CREATE OR REPLACE FUNCTION trip_private.season_timing(p_trip uuid)
RETURNS TABLE(mode text, preflight_start date, cutoff timestamptz, reveal_at timestamptz, drop_count integer, finale_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; local_today date; days_left integer; days_total integer;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.season_rule <> 'a2c' THEN RAISE EXCEPTION 'This room uses its original season'; END IF;
 local_today := (now() AT TIME ZONE t.home_timezone)::date;
 days_left := t.start_date-local_today;
 days_total := t.start_date-coalesce(t.game_start,local_today);
 IF t.kind='trip' THEN
   mode := CASE WHEN days_left<=0 THEN 'trip_season' WHEN days_left=1 THEN 'quick_start' ELSE 'preflight' END;
   preflight_start := greatest(local_today,t.start_date-10);
   cutoff := CASE WHEN days_left=1 THEN (t.start_date::timestamp AT TIME ZONE t.home_timezone) ELSE ((t.start_date-1)::timestamp AT TIME ZONE t.home_timezone) END;
   reveal_at := ((t.start_date-1+time '20:00') AT TIME ZONE t.home_timezone);
   drop_count := CASE WHEN days_left<=0 THEN 0 WHEN days_left=1 THEN 1 WHEN days_total<7 THEN 2 ELSE 3 END;
   finale_at := reveal_at;
 ELSE
   mode := 'at_home'; preflight_start := t.game_start;
   finale_at := t.finale_at;
   cutoff := t.finale_at;
   reveal_at := t.finale_at;
   drop_count := CASE WHEN t.end_date-t.start_date<6 THEN 2 ELSE 3 END;
 END IF;
 RETURN NEXT;
END $$;
CREATE OR REPLACE FUNCTION public.season_timing(p_trip uuid)
RETURNS TABLE(mode text, preflight_start date, cutoff timestamptz, reveal_at timestamptz, drop_count integer, finale_at timestamptz)
LANGUAGE sql STABLE SET search_path=public AS $$ SELECT * FROM trip_private.season_timing(p_trip) $$;
REVOKE ALL ON FUNCTION trip_private.season_timing(uuid), public.season_timing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.season_timing(uuid), public.season_timing(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.preview_ten_day_drops(p_trip uuid)
RETURNS TABLE(drop_no integer, drop_at timestamptz, cutoff timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; first_day date; last_day date; n integer; i integer;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.kind <> 'trip' THEN RETURN; END IF;
 last_day := t.start_date-2;
 first_day := greatest(coalesce(t.game_start,t.start_date-10), t.start_date-10);
 n := CASE WHEN t.start_date-first_day<7 THEN 2 ELSE 3 END;
 cutoff := ((t.start_date-1)::timestamp AT TIME ZONE t.home_timezone);
 FOR i IN 1..n LOOP
   drop_no := i;
   drop_at := ((first_day + ((last_day-first_day)*i/n) + time '09:00') AT TIME ZONE t.home_timezone);
   RETURN NEXT;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.preview_ten_day_drops(p_trip uuid)
RETURNS TABLE(drop_no integer, drop_at timestamptz, cutoff timestamptz)
LANGUAGE sql STABLE SET search_path=public AS $$ SELECT * FROM trip_private.preview_ten_day_drops(p_trip) $$;
REVOKE ALL ON FUNCTION trip_private.preview_ten_day_drops(uuid), public.preview_ten_day_drops(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.preview_ten_day_drops(uuid), public.preview_ten_day_drops(uuid) TO authenticated, service_role;