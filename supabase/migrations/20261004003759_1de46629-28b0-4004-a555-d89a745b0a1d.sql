ALTER TABLE public.game_nights ADD COLUMN place text;
ALTER TABLE public.game_nights ADD CONSTRAINT game_nights_place_length CHECK (char_length(place) <= 80);
ALTER TABLE public.home_day_sessions ADD COLUMN place text;
ALTER TABLE public.home_day_sessions ADD CONSTRAINT home_day_sessions_place_length CHECK (char_length(place) <= 80);

CREATE OR REPLACE FUNCTION trip_private.set_game_night_place(p_trip uuid, p_week integer, p_place text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can set the meeting place'; END IF;
 IF char_length(coalesce(p_place,'')) > 80 THEN RAISE EXCEPTION 'Place must be 80 characters or less'; END IF;
 UPDATE public.game_nights SET place = nullif(trim(p_place),'') WHERE trip_id=p_trip AND week_number=p_week AND starts_at>now() AND NOT skipped;
 IF NOT FOUND THEN RAISE EXCEPTION 'This game night can no longer be changed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.set_game_night_place(p_trip uuid, p_week integer, p_place text)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_game_night_place(p_trip,p_week,p_place) $$;
REVOKE ALL ON FUNCTION public.set_game_night_place(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_game_night_place(uuid,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.set_home_day_place(p_trip uuid, p_day date, p_place text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set the meeting place'; END IF;
 IF char_length(coalesce(p_place,'')) > 80 THEN RAISE EXCEPTION 'Place must be 80 characters or less'; END IF;
 UPDATE public.home_day_sessions SET place=nullif(trim(p_place),'') WHERE trip_id=p_trip AND day_date=p_day AND starts_at>now() AND step='card';
 IF NOT FOUND THEN RAISE EXCEPTION 'This Game Day can no longer be changed'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.set_home_day_place(p_trip uuid, p_day date, p_place text)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_home_day_place(p_trip,p_day,p_place) $$;
REVOKE ALL ON FUNCTION public.set_home_day_place(uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_home_day_place(uuid,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.set_preflight_start(p_trip uuid, p_start date, p_plan text, p_weekday integer, p_time time without time zone, p_every integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; v_today date; v_count int;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set Pre-Flight'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.kind='at_home' THEN RAISE EXCEPTION 'Choose a real trip'; END IF;
 v_today := (now() AT TIME ZONE t.home_timezone)::date;
 IF p_start IS NULL OR p_start < v_today OR p_start > t.start_date-2 THEN RAISE EXCEPTION 'Choose a Pre-Flight date before departure'; END IF;
 IF p_plan NOT IN ('recommended','short','custom') OR p_weekday NOT BETWEEN 0 AND 6 OR p_time IS NULL THEN RAISE EXCEPTION 'Choose a game plan, day and time'; END IF;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
 SELECT trip_private.apply_game_plan(p_trip,p_plan,p_weekday,p_time,p_start,p_every) INTO v_count;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
 RETURN v_count;
END $$;
CREATE OR REPLACE FUNCTION public.set_preflight_start(p_trip uuid, p_start date, p_plan text, p_weekday integer, p_time time without time zone, p_every integer)
RETURNS integer LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_preflight_start(p_trip,p_start,p_plan,p_weekday,p_time,p_every) $$;
REVOKE ALL ON FUNCTION public.set_preflight_start(uuid,date,text,integer,time without time zone,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_preflight_start(uuid,date,text,integer,time without time zone,integer) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.set_home_ready_start(p_trip uuid, p_start date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set Get Ready'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.kind NOT IN ('at_home','cultural_inspiration') OR p_start IS NULL OR p_start < (now() AT TIME ZONE t.home_timezone)::date OR p_start > t.start_date-1 THEN RAISE EXCEPTION 'Choose a Get Ready date before Day 1'; END IF;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
END $$;
CREATE OR REPLACE FUNCTION public.set_home_ready_start(p_trip uuid, p_start date)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_home_ready_start(p_trip,p_start) $$;
REVOKE ALL ON FUNCTION public.set_home_ready_start(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_home_ready_start(uuid,date) TO authenticated;