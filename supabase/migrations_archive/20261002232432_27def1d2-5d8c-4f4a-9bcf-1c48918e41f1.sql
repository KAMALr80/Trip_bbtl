CREATE OR REPLACE FUNCTION trip_private.my_mix_used() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT count(*)::int FROM public.ai_usage WHERE user_id=auth.uid() AND kind='arcade_mix' AND created_at >= date_trunc('day', now()) $$;
REVOKE ALL ON FUNCTION trip_private.my_mix_used() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.my_mix_used() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.my_mix_used() RETURNS integer LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.my_mix_used() $$;
REVOKE ALL ON FUNCTION public.my_mix_used() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_mix_used() TO authenticated;