CREATE OR REPLACE FUNCTION trip_private.season_games_ok(p_trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.trips t WHERE t.id=p_trip AND t.kind='trip' AND coalesce(t.season_scoring,true) AND coalesce(t.play_arrangement,'group')<>'offline') $$;