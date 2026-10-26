CREATE OR REPLACE FUNCTION trip_private.create_at_home_a2c(p_pack text,p_days integer,p_start date,p_vibe text,p_tz text,p_format text,p_place text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; t public.trips; v_final timestamptz; v_mid date;
BEGIN
 IF p_days NOT BETWEEN 2 AND 7 OR p_format NOT IN ('finale','two_nights') THEN RAISE EXCEPTION 'Choose 2–7 days and a finale format'; END IF;
 IF p_format='two_nights' AND p_days<4 THEN RAISE EXCEPTION 'Two game nights need at least four days'; END IF;
 IF length(trim(coalesce(p_place,''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Set a place for the finale'; END IF;
 v_id:=trip_private.create_at_home(p_pack,'d'||p_days::text,p_start,p_vibe,p_tz);
 SELECT * INTO t FROM public.trips WHERE id=v_id;
 v_final:=(t.end_date+time '19:00') AT TIME ZONE t.home_timezone;
 UPDATE public.trips SET season_rule='a2c',finale_format=p_format,finale_place=trim(p_place),finale_at=v_final,game_start=greatest(t.start_date-7,(now() AT TIME ZONE t.home_timezone)::date) WHERE id=v_id AND season_rule='legacy';
 IF p_format='two_nights' THEN
   v_mid:=t.start_date+(p_days/2)-1;
   INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_id,1,(v_mid+time '19:00') AT TIME ZONE t.home_timezone,auth.uid());
   INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_id,2,v_final,auth.uid());
 ELSE
   INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_id,1,v_final,auth.uid());
 END IF;
 RETURN v_id;
END $$;