CREATE OR REPLACE FUNCTION public.trip_slice_pct(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN t.level='full' THEN 100 ELSE (SELECT slice_pct FROM trip_private.preview_settings) END FROM public.trips t WHERE t.id=p_trip $$;
REVOKE ALL ON FUNCTION public.trip_slice_pct(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_slice_pct(uuid) TO service_role;