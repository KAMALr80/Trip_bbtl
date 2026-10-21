REVOKE EXECUTE ON FUNCTION trip_private.age_of(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.public_launch() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT coalesce((SELECT public_launch FROM public.app_settings LIMIT 1), false) $$;
GRANT EXECUTE ON FUNCTION public.public_launch() TO anon, authenticated;