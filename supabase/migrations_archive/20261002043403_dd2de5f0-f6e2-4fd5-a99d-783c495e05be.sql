GRANT SELECT ON public.app_settings TO anon;
CREATE POLICY "Anyone reads launch switch" ON public.app_settings FOR SELECT TO anon USING (true);
CREATE OR REPLACE FUNCTION public.public_launch() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT coalesce((SELECT public_launch FROM public.app_settings LIMIT 1), false) $$;