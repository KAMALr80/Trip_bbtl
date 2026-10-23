ALTER TABLE public.trips ADD COLUMN passport_country text, ADD COLUMN passport_state text, ADD COLUMN passport_city text;
ALTER TABLE public.player_profiles ADD COLUMN home_country text;
CREATE TABLE public.passport_stamps (user_id uuid NOT NULL, trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('international','road_trip')), country text NOT NULL, state text, city text, stamped_on date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,trip_id));
GRANT SELECT ON public.passport_stamps TO authenticated;
GRANT ALL ON public.passport_stamps TO service_role;
ALTER TABLE public.passport_stamps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Travelers read own stamps" ON public.passport_stamps FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE TRIGGER passport_stamp_updated BEFORE UPDATE ON public.passport_stamps FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE OR REPLACE FUNCTION trip_private.sync_passport(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t record; home text; country text; state_name text; city_name text; k text;
BEGIN
 IF p_user IS NULL OR (p_user <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON b.trip_id=a.trip_id AND b.status='approved' WHERE a.user_id=auth.uid() AND a.status='approved' AND b.user_id=p_user)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT nullif(btrim(home_country),'') INTO home FROM public.player_profiles WHERE user_id=p_user;
 IF home IS NULL THEN RETURN; END IF;
 FOR t IN SELECT tr.* FROM public.trips tr JOIN public.trip_members m ON m.trip_id=tr.id WHERE m.user_id=p_user AND m.status='approved' AND tr.kind='trip' AND tr.season_scoring AND NOT tr.is_sandbox AND (tr.ended_at IS NOT NULL OR (now() AT TIME ZONE tr.home_timezone)::date > tr.end_date+2) LOOP
   country := coalesce(nullif(btrim(t.passport_country),''),nullif(btrim(split_part(t.destination, ',', array_length(string_to_array(t.destination,','),1))),''));
   IF country IS NULL THEN CONTINUE; END IF;
   IF lower(country) IN ('usa','us','u.s.','united states of america','united states') THEN country:='United States'; END IF;
   IF lower(home) IN ('usa','us','u.s.','united states of america','united states') THEN home:='United States'; END IF;
   IF lower(country)=lower(home) THEN
     IF country <> 'United States' THEN CONTINUE; END IF;
     k:='road_trip'; state_name:=nullif(btrim(t.passport_state),''); city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
     IF state_name IS NULL THEN state_name:=nullif(btrim(split_part(t.destination,',',2)), ''); END IF;
     IF state_name IS NULL OR lower(state_name) IN ('us','usa','united states') THEN CONTINUE; END IF;
   ELSE
     k:='international'; state_name:=NULL; city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
   END IF;
   INSERT INTO public.passport_stamps(user_id,trip_id,kind,country,state,city,stamped_on) VALUES(p_user,t.id,k,country,state_name,city_name,t.end_date)
   ON CONFLICT (user_id,trip_id) DO UPDATE SET kind=excluded.kind,country=excluded.country,state=excluded.state,city=excluded.city,stamped_on=excluded.stamped_on;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION trip_private.sync_passport(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.sync_passport(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.passport_collection() RETURNS TABLE(trip_id uuid, kind text, country text, state text, city text, stamped_on date, trip_name text, destination text, start_date date, squad_count integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM trip_private.sync_passport(auth.uid());
 RETURN QUERY SELECT s.trip_id,s.kind,s.country,s.state,s.city,s.stamped_on,t.name,t.destination,t.start_date,(SELECT count(*)::integer FROM public.trip_members m WHERE m.trip_id=s.trip_id AND m.status='approved') FROM public.passport_stamps s JOIN public.trips t ON t.id=s.trip_id WHERE s.user_id=auth.uid() ORDER BY s.stamped_on DESC;
END $$;
REVOKE ALL ON FUNCTION public.passport_collection() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.passport_collection() TO authenticated;
CREATE OR REPLACE FUNCTION public.traveler_level(p_user uuid) RETURNS TABLE(level text, real_trips integer, international_trips integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM trip_private.sync_passport(p_user);
 RETURN QUERY SELECT CASE WHEN count(*) FILTER(WHERE s.kind='international')>=5 THEN 'Passport Junkie 👑' WHEN count(*)>=3 THEN 'Explorer' WHEN count(*)>=1 THEN 'Traveler' ELSE NULL END::text, count(*)::integer, count(*) FILTER(WHERE s.kind='international')::integer FROM public.passport_stamps s WHERE s.user_id=p_user;
END $$;
REVOKE ALL ON FUNCTION public.traveler_level(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.traveler_level(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.set_passport_destination(p_trip uuid,p_country text,p_state text,p_city text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain' AND status='approved') THEN RAISE EXCEPTION 'Only the Captain can correct the destination'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trips WHERE id=p_trip AND kind='trip' AND NOT is_sandbox) THEN RAISE EXCEPTION 'Only real trips have passport destinations'; END IF;
 IF length(btrim(coalesce(p_country,''))) NOT BETWEEN 2 AND 80 OR length(coalesce(p_state,''))>80 OR length(coalesce(p_city,''))>80 THEN RAISE EXCEPTION 'Enter a country (and optional state and city)'; END IF;
 UPDATE public.trips SET passport_country=btrim(p_country),passport_state=nullif(btrim(p_state),''),passport_city=nullif(btrim(p_city),'') WHERE id=p_trip;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_passport_destination(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.set_passport_destination(uuid,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_passport_destination(p_trip uuid,p_country text,p_state text,p_city text) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.set_passport_destination(p_trip,p_country,p_state,p_city) $$;
REVOKE ALL ON FUNCTION public.set_passport_destination(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_passport_destination(uuid,text,text,text) TO authenticated;