ALTER TABLE public.trips ADD COLUMN solo_experience_id uuid REFERENCES public.culture_experiences(id) ON DELETE SET NULL;
CREATE OR REPLACE FUNCTION trip_private.create_trip_play_mode_v2(p_name text,p_destination text,p_start_date date,p_end_date date,p_home_timezone text,p_mode text,p_country text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_exp uuid; v_days integer;
BEGIN
 IF p_mode='solo' AND coalesce(p_country,'') !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Choose a destination country'; END IF;
 v_id:=trip_private.create_trip_play_mode(p_name,p_destination,p_start_date,p_end_date,p_home_timezone,p_mode);
 IF p_mode='solo' THEN
  v_days:=p_end_date-p_start_date+1;
  INSERT INTO public.culture_experiences(creator_id,track,title,country,start_date,days,play_mode,vibe,traveler_types,prep_days,a2e_kind)
  VALUES(auth.uid(),'travel',p_name,upper(p_country),p_start_date,v_days,'solo','chill','{}',0,'inspire') RETURNING id INTO v_exp;
  UPDATE public.trips SET solo_experience_id=v_exp WHERE id=v_id AND play_arrangement='solo' AND season_rule='a2c' AND is_sandbox=false AND EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=v_id AND user_id=auth.uid() AND role='captain');
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION trip_private.create_trip_play_mode_v2(text,text,date,date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.create_trip_play_mode_v2(text,text,date,date,text,text,text) TO authenticated,service_role;