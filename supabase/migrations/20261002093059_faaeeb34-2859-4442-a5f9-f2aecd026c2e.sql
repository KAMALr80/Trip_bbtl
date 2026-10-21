CREATE OR REPLACE FUNCTION trip_private.sync_passport(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; home text; country text; state_name text; city_name text; k text; last_part text;
BEGIN
 IF p_user IS NULL OR (p_user <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON b.trip_id=a.trip_id AND b.status='approved' WHERE a.user_id=auth.uid() AND a.status='approved' AND b.user_id=p_user)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 DELETE FROM public.passport_stamps s WHERE s.user_id=p_user AND NOT EXISTS (SELECT 1 FROM public.trip_members m JOIN public.trips t ON t.id=m.trip_id WHERE m.user_id=p_user AND m.status='approved' AND m.trip_id=s.trip_id AND t.kind='trip' AND NOT t.is_sandbox AND (t.ended_at IS NOT NULL OR (now() AT TIME ZONE t.home_timezone)::date > t.end_date+2));
 SELECT nullif(btrim(home_country),'') INTO home FROM public.player_profiles WHERE user_id=p_user;
 IF home IS NULL THEN DELETE FROM public.passport_stamps WHERE user_id=p_user; RETURN; END IF;
 FOR t IN SELECT tr.* FROM public.trips tr JOIN public.trip_members m ON m.trip_id=tr.id WHERE m.user_id=p_user AND m.status='approved' AND tr.kind='trip' AND NOT tr.is_sandbox AND (tr.ended_at IS NOT NULL OR (now() AT TIME ZONE tr.home_timezone)::date > tr.end_date+2) LOOP
   last_part := nullif(btrim(split_part(t.destination, ',', array_length(string_to_array(t.destination,','),1))), '');
   country := coalesce(nullif(btrim(t.passport_country),''),last_part);
   IF country IS NULL THEN CONTINUE; END IF;
   IF lower(country) IN ('usa','us','u.s.','united states of america','united states') THEN country:='United States'; END IF;
   IF t.passport_country IS NULL AND lower(country) = ANY(ARRAY['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming','dc','district of columbia','al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy']) THEN country:='United States'; END IF;
   IF lower(home) IN ('usa','us','u.s.','united states of america','united states') THEN home:='United States'; END IF;
   IF lower(country)=lower(home) THEN
     IF country <> 'United States' THEN DELETE FROM public.passport_stamps WHERE user_id=p_user AND trip_id=t.id; CONTINUE; END IF;
     k:='road_trip'; state_name:=coalesce(nullif(btrim(t.passport_state),''),CASE WHEN last_part <> 'United States' AND last_part <> 'USA' AND last_part <> 'US' THEN last_part END); city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
     IF state_name IS NULL THEN DELETE FROM public.passport_stamps WHERE user_id=p_user AND trip_id=t.id; CONTINUE; END IF;
   ELSE
     k:='international'; state_name:=NULL; city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
   END IF;
   INSERT INTO public.passport_stamps(user_id,trip_id,kind,country,state,city,stamped_on) VALUES(p_user,t.id,k,country,state_name,city_name,t.end_date)
   ON CONFLICT (user_id,trip_id) DO UPDATE SET kind=excluded.kind,country=excluded.country,state=excluded.state,city=excluded.city,stamped_on=excluded.stamped_on;
 END LOOP;
END $$;