ALTER FUNCTION public.culture_days(uuid) SET SCHEMA trip_private;
ALTER FUNCTION public.my_preview_shared(uuid,uuid) SET SCHEMA trip_private;
ALTER FUNCTION public.preview_culture_link(uuid) SET SCHEMA trip_private;
CREATE FUNCTION public.culture_days(p_exp uuid) RETURNS SETOF public.culture_exp_days LANGUAGE sql STABLE SET search_path=public AS $$ SELECT * FROM trip_private.culture_days(p_exp) $$;
CREATE FUNCTION public.my_preview_shared(p_trip uuid DEFAULT NULL, p_exp uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SET search_path=public AS $$ SELECT trip_private.my_preview_shared(p_trip,p_exp) $$;
CREATE FUNCTION public.preview_culture_link(p_preview uuid) RETURNS uuid LANGUAGE sql STABLE SET search_path=public AS $$ SELECT trip_private.preview_culture_link(p_preview) $$;
REVOKE ALL ON FUNCTION public.culture_days(uuid), public.my_preview_shared(uuid,uuid), public.preview_culture_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.culture_days(uuid), public.my_preview_shared(uuid,uuid), public.preview_culture_link(uuid) TO authenticated, service_role;