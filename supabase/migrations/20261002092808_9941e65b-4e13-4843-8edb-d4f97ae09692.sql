CREATE OR REPLACE FUNCTION trip_private.passport_collection() RETURNS TABLE(trip_id uuid, kind text, country text, state text, city text, stamped_on date, trip_name text, destination text, start_date date, squad_count integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM trip_private.sync_passport(auth.uid());
 RETURN QUERY SELECT s.trip_id,s.kind,s.country,s.state,s.city,s.stamped_on,t.name,t.destination,t.start_date,(SELECT count(*)::integer FROM public.trip_members m WHERE m.trip_id=s.trip_id AND m.status='approved') FROM public.passport_stamps s JOIN public.trips t ON t.id=s.trip_id WHERE s.user_id=auth.uid() ORDER BY s.stamped_on DESC;
END $$;
REVOKE ALL ON FUNCTION trip_private.passport_collection() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.passport_collection() TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.traveler_level(p_user uuid) RETURNS TABLE(level text, real_trips integer, international_trips integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM trip_private.sync_passport(p_user);
 RETURN QUERY SELECT CASE WHEN count(*) FILTER(WHERE s.kind='international')>=5 THEN 'Passport Junkie 👑' WHEN count(*)>=3 THEN 'Explorer' WHEN count(*)>=1 THEN 'Traveler' ELSE NULL END::text, count(*)::integer, count(*) FILTER(WHERE s.kind='international')::integer FROM public.passport_stamps s WHERE s.user_id=p_user;
END $$;
REVOKE ALL ON FUNCTION trip_private.traveler_level(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.traveler_level(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.passport_collection() RETURNS TABLE(trip_id uuid, kind text, country text, state text, city text, stamped_on date, trip_name text, destination text, start_date date, squad_count integer) LANGUAGE sql SET search_path=public AS $$ SELECT * FROM trip_private.passport_collection() $$;
CREATE OR REPLACE FUNCTION public.traveler_level(p_user uuid) RETURNS TABLE(level text, real_trips integer, international_trips integer) LANGUAGE sql SET search_path=public AS $$ SELECT * FROM trip_private.traveler_level(p_user) $$;