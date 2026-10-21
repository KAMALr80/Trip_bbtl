CREATE OR REPLACE FUNCTION trip_private.create_trip_a2c(p_name text,p_destination text,p_start_date date,p_end_date date,p_home_timezone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_today date;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF coalesce(trip_private.age_of(auth.uid()),0)<21 THEN RAISE EXCEPTION 'Captains are 21+. Ask your crew''s Captain to invite you.'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'TripJunkies is invite-only during the private beta'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100 OR length(trim(coalesce(p_destination,''))) NOT BETWEEN 1 AND 120 OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date<p_start_date OR length(trim(coalesce(p_home_timezone,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Check your trip details'; END IF;
 v_today:=(now() AT TIME ZONE p_home_timezone)::date;
 IF p_end_date<v_today OR p_start_date>v_today+365 THEN RAISE EXCEPTION 'Choose a trip that is still underway or ahead of you'; END IF;
 -- A new, already-underway Trip cannot inherit a past Pre-Flight window.
 IF p_start_date<v_today AND p_end_date-v_today>30 THEN RAISE EXCEPTION 'Trip is too long'; END IF;
 INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,join_code,season_rule)
 VALUES(trim(p_name),trim(p_destination),p_start_date,p_end_date,trim(p_home_timezone),public.new_trip_code(),'a2c') RETURNING id INTO v_id;
 INSERT INTO public.trip_members(trip_id,user_id,role) VALUES(v_id,auth.uid(),'captain');
 RETURN v_id;
END $$;