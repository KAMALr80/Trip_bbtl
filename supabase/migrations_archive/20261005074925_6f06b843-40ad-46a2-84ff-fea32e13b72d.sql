CREATE OR REPLACE FUNCTION trip_private.create_trip_play_mode_v2(p_name text,p_destination text,p_start_date date,p_end_date date,p_home_timezone text,p_mode text,p_country text,p_types text[] DEFAULT '{}'::text[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_exp uuid; v_days integer;
BEGIN
 IF p_mode='solo' AND coalesce(p_country,'') !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Choose a destination country'; END IF;
 IF p_mode='solo' AND (coalesce(array_length(p_types,1),0)>2 OR EXISTS (SELECT 1 FROM unnest(p_types) t WHERE t NOT IN ('foodie','explorer','chill','culture','photographer','shopper','night_owl')) OR ('night_owl'=ANY(p_types) AND trip_private.age_of(auth.uid())<21)) THEN RAISE EXCEPTION 'Choose up to two age-appropriate traveler types'; END IF;
 v_id:=trip_private.create_trip_play_mode(p_name,p_destination,p_start_date,p_end_date,p_home_timezone,p_mode);
 IF p_mode='solo' THEN
  v_days:=p_end_date-p_start_date+1;
  INSERT INTO public.culture_experiences(creator_id,track,title,country,start_date,days,play_mode,vibe,traveler_types,prep_days,a2e_kind)
  VALUES(auth.uid(),'travel',trim(p_name),upper(p_country),p_start_date,v_days,'solo','chill',coalesce(p_types,'{}'::text[]),0,'inspire') RETURNING id INTO v_exp;
  UPDATE public.trips SET solo_experience_id=v_exp WHERE id=v_id AND play_arrangement='solo' AND season_rule='a2c' AND is_sandbox=false AND EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=v_id AND user_id=auth.uid() AND role='captain');
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION trip_private.create_trip_play_mode_v2(text,text,date,date,text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.create_trip_play_mode_v2(text,text,date,date,text,text,text,text[]) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.create_trip_play_mode_v3(p_name text,p_destination text,p_start_date date,p_end_date date,p_home_timezone text,p_mode text,p_country text,p_types text[]) RETURNS uuid LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.create_trip_play_mode_v2(p_name,p_destination,p_start_date,p_end_date,p_home_timezone,p_mode,p_country,p_types) $$;
REVOKE ALL ON FUNCTION public.create_trip_play_mode_v3(text,text,date,date,text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_trip_play_mode_v3(text,text,date,date,text,text,text,text[]) TO authenticated;