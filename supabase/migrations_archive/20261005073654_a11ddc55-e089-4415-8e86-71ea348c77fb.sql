ALTER TABLE public.trips ADD COLUMN play_arrangement text, ADD COLUMN departure_confirmed_at timestamptz;
ALTER TABLE public.trips ADD CONSTRAINT trips_play_arrangement_check CHECK (play_arrangement IS NULL OR play_arrangement IN ('solo','online','offline'));
CREATE OR REPLACE FUNCTION trip_private.create_trip_play_mode(p_name text,p_destination text,p_start_date date,p_end_date date,p_home_timezone text,p_mode text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
 IF p_mode NOT IN ('solo','online','offline') THEN RAISE EXCEPTION 'Choose who is playing'; END IF;
 v_id:=trip_private.create_trip_a2c(p_name,p_destination,p_start_date,p_end_date,p_home_timezone);
 UPDATE public.trips SET play_arrangement=p_mode, join_code_enabled=(p_mode='online'), game_start=CASE WHEN p_start_date <= (now() AT TIME ZONE p_home_timezone)::date+1 THEN NULL ELSE greatest((now() AT TIME ZONE p_home_timezone)::date,p_start_date-10) END, game_plan=CASE WHEN p_start_date <= (now() AT TIME ZONE p_home_timezone)::date+1 THEN 'date_driven' ELSE NULL END WHERE id=v_id AND season_rule='a2c' AND is_sandbox=false;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION trip_private.create_trip_play_mode(text,text,date,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.create_trip_play_mode(text,text,date,date,text,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.create_trip_play_mode(p_name text,p_destination text,p_start_date date,p_end_date date,p_home_timezone text,p_mode text) RETURNS uuid LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.create_trip_play_mode(p_name,p_destination,p_start_date,p_end_date,p_home_timezone,p_mode) $$;
REVOKE ALL ON FUNCTION public.create_trip_play_mode(text,text,date,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_trip_play_mode(text,text,date,date,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.create_window_play_mode(p_mode text,p_title text,p_country text,p_region text,p_city text,p_start date,p_days int,p_vibe text,p_types text[],p_prep int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_exp uuid; v_trip uuid;
BEGIN
 IF p_mode NOT IN ('solo','group','offline') THEN RAISE EXCEPTION 'Choose who is playing'; END IF;
 v_exp:=trip_private.create_culture_a2e('inspire',CASE WHEN p_mode='offline' THEN 'group' ELSE p_mode END,p_title,p_country,p_region,p_city,p_start,p_days,NULL,p_vibe,p_types,p_prep,NULL,NULL,false);
 IF p_mode<>'solo' THEN
  SELECT trip_id INTO v_trip FROM public.culture_experiences WHERE id=v_exp AND creator_id=auth.uid() AND a2e_kind='inspire';
  IF v_trip IS NULL THEN RAISE EXCEPTION 'Could not create your room'; END IF;
  UPDATE public.trips SET play_arrangement=CASE WHEN p_mode='offline' THEN 'offline' ELSE 'online' END, join_code_enabled=(p_mode='group'), game_start=CASE WHEN p_start <= (now() AT TIME ZONE home_timezone)::date+1 THEN NULL ELSE greatest((now() AT TIME ZONE home_timezone)::date,p_start-10) END, game_plan=CASE WHEN p_start <= (now() AT TIME ZONE home_timezone)::date+1 THEN 'date_driven' ELSE NULL END WHERE id=v_trip AND season_rule='a2c' AND a2e_room=true AND is_sandbox=false;
 END IF;
 RETURN v_exp;
END $$;
REVOKE ALL ON FUNCTION trip_private.create_window_play_mode(text,text,text,text,text,date,int,text,text[],int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.create_window_play_mode(text,text,text,text,text,date,int,text,text[],int) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.create_window_play_mode(p_mode text,p_title text,p_country text,p_region text,p_city text,p_start date,p_days int,p_vibe text,p_types text[],p_prep int) RETURNS uuid LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.create_window_play_mode(p_mode,p_title,p_country,p_region,p_city,p_start,p_days,p_vibe,p_types,p_prep) $$;
REVOKE ALL ON FUNCTION public.create_window_play_mode(text,text,text,text,text,date,int,text,text[],int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_window_play_mode(text,text,text,text,text,date,int,text,text[],int) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.confirm_departure(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can confirm departure'; END IF;
 UPDATE public.trips SET departure_confirmed_at=now() WHERE id=p_trip AND play_arrangement IS NOT NULL AND is_sandbox=false AND departure_confirmed_at IS NULL AND start_date <= (now() AT TIME ZONE home_timezone)::date;
 IF NOT FOUND THEN RAISE EXCEPTION 'Departure can only be confirmed on or after your first trip day'; END IF;
END $$;
REVOKE ALL ON FUNCTION trip_private.confirm_departure(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.confirm_departure(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.confirm_departure(p_trip uuid) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.confirm_departure(p_trip) $$;
REVOKE ALL ON FUNCTION public.confirm_departure(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_departure(uuid) TO authenticated;