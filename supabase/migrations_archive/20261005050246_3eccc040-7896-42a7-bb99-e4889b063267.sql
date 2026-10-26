CREATE OR REPLACE FUNCTION trip_private.create_trip_a2c(p_name text, p_destination text, p_start_date date, p_end_date date, p_home_timezone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_today date;
BEGIN
 v_today := (now() AT TIME ZONE p_home_timezone)::date;
 IF p_start_date IS NULL OR p_start_date < v_today THEN RAISE EXCEPTION 'Choose today or a future departure'; END IF;
 v_id := trip_private.create_trip(p_name,p_destination,p_start_date,p_end_date,p_home_timezone);
 UPDATE public.trips SET season_rule='a2c' WHERE id=v_id AND season_rule='legacy';
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.create_trip_a2c(p_name text, p_destination text, p_start_date date, p_end_date date, p_home_timezone text)
RETURNS uuid LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.create_trip_a2c(p_name,p_destination,p_start_date,p_end_date,p_home_timezone) $$;
REVOKE ALL ON FUNCTION trip_private.create_trip_a2c(text,text,date,date,text), public.create_trip_a2c(text,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.create_trip_a2c(text,text,date,date,text), public.create_trip_a2c(text,text,date,date,text) TO authenticated, service_role;