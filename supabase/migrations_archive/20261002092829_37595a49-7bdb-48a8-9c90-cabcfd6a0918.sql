CREATE OR REPLACE FUNCTION trip_private.sync_passport(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; home text; country text; state_name text; city_name text; k text; last_part text;
BEGIN
 IF p_user IS NULL OR (p_user <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON b.trip_id=a.trip_id AND b.status='approved' WHERE a.user_id=auth.uid() AND a.status='approved' AND b.user_id=p_user)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT nullif(btrim(home_country),'') INTO home FROM public.player_profiles WHERE user_id=p_user;
 IF home IS NULL THEN RETURN; END IF;
 FOR t IN SELECT tr.* FROM public.trips tr JOIN public.trip_members m ON m.trip_id=tr.id WHERE m.user_id=p_user AND m.status='approved' AND tr.kind='trip' AND tr.season_scoring AND NOT tr.is_sandbox AND (tr.ended_at IS NOT NULL OR (now() AT TIME ZONE tr.home_timezone)::date > tr.end_date+2) LOOP
   last_part := nullif(btrim(split_part(t.destination, ',', array_length(string_to_array(t.destination,','),1))), '');
   country := coalesce(nullif(btrim(t.passport_country),''),last_part);
   IF country IS NULL THEN CONTINUE; END IF;
   IF lower(country) IN ('usa','us','u.s.','united states of america','united states') THEN country:='United States'; END IF;
   IF t.passport_country IS NULL AND lower(country) = ANY(ARRAY['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming','dc','district of columbia','al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy']) THEN country:='United States'; END IF;
   IF lower(home) IN ('usa','us','u.s.','united states of america','united states') THEN home:='United States'; END IF;
   IF lower(country)=lower(home) THEN
     IF country <> 'United States' THEN CONTINUE; END IF;
     k:='road_trip'; state_name:=coalesce(nullif(btrim(t.passport_state),''),CASE WHEN last_part <> 'United States' AND last_part <> 'USA' AND last_part <> 'US' THEN last_part END); city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
     IF state_name IS NULL THEN CONTINUE; END IF;
   ELSE
     k:='international'; state_name:=NULL; city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
   END IF;
   INSERT INTO public.passport_stamps(user_id,trip_id,kind,country,state,city,stamped_on) VALUES(p_user,t.id,k,country,state_name,city_name,t.end_date)
   ON CONFLICT (user_id,trip_id) DO UPDATE SET kind=excluded.kind,country=excluded.country,state=excluded.state,city=excluded.city,stamped_on=excluded.stamped_on;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION trip_private.end_trip(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ DECLARE tr public.trips; today date; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain' AND status='approved') THEN RAISE EXCEPTION 'Only the Captain can end the trip'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip FOR UPDATE; today := (now() AT TIME ZONE tr.home_timezone)::date;
IF tr.ended_at IS NOT NULL THEN RETURN; END IF;
IF today < tr.end_date OR today > tr.end_date + 1 THEN RAISE EXCEPTION 'You can end the trip from its last day until a day after'; END IF;
UPDATE public.trips SET ended_at = now() WHERE id=p_trip;
IF tr.is_sandbox THEN RETURN; END IF;
IF tr.kind = 'at_home' THEN
  INSERT INTO public.postcard_stickers(user_id,trip_id,pack) SELECT user_id, p_trip, tr.at_home_pack FROM public.trip_members WHERE trip_id=p_trip AND status='approved' ON CONFLICT DO NOTHING;
ELSIF NOT EXISTS (SELECT 1 FROM public.reward_codes WHERE user_id=auth.uid() AND used_at IS NULL AND expires_at > now()) THEN
  INSERT INTO public.reward_codes(user_id,code,cents,source_trip,expires_at) VALUES (auth.uid(), 'CAPT-' || upper(substr(md5(gen_random_uuid()::text),1,6)), 200, p_trip, now() + interval '90 days');
END IF;
END $$;