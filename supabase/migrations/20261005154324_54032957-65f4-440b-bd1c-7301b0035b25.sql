CREATE OR REPLACE FUNCTION public.price_list()
RETURNS TABLE(key text, label text, cents integer, beta_free boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS
$$ SELECT r.key, r.label, r.cents, coalesce((SELECT s.beta_free FROM public.app_settings s ORDER BY s.id LIMIT 1), true) FROM public.price_rules r ORDER BY r.sort $$;
REVOKE ALL ON FUNCTION public.price_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_list() TO anon, authenticated;