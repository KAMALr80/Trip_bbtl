ALTER TABLE public.app_settings ADD COLUMN look jsonb NOT NULL DEFAULT '{"global":"cinematic","pages":{}}'::jsonb;
UPDATE public.app_settings SET look = '{"global":"cinematic","pages":{}}'::jsonb, updated_at = now() WHERE id = true;
CREATE OR REPLACE FUNCTION trip_private.current_look() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT coalesce((SELECT look FROM public.app_settings WHERE id = true), '{"global":"original","pages":{}}'::jsonb) $$;
CREATE OR REPLACE FUNCTION public.current_look() RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$ SELECT trip_private.current_look() $$;
REVOKE ALL ON FUNCTION trip_private.current_look(), public.current_look() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.current_look() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_look() TO anon, authenticated;
CREATE OR REPLACE FUNCTION trip_private.founder_set_look(p_look jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; v text;
BEGIN
 IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 IF jsonb_typeof(p_look) IS DISTINCT FROM 'object' OR p_look->>'global' NOT IN ('original','cinematic') OR jsonb_typeof(p_look->'pages') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_look)) <> 2 THEN RAISE EXCEPTION 'Invalid look choice'; END IF;
 FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(p_look->'pages') LOOP
   IF k NOT IN ('splash','home-top','home-bottom','passport','boarding','boarding-pass','game-night','spin','journey','calendar','squad','at-home','culture','me','explore','founder','error','buttons') OR v NOT IN ('original','cinematic') THEN RAISE EXCEPTION 'Invalid page look choice'; END IF;
 END LOOP;
 UPDATE public.app_settings SET look=p_look, updated_at=now() WHERE id=true;
END $$;
CREATE OR REPLACE FUNCTION public.founder_set_look(p_look jsonb) RETURNS void LANGUAGE sql SET search_path = public AS $$ SELECT trip_private.founder_set_look(p_look) $$;
REVOKE ALL ON FUNCTION trip_private.founder_set_look(jsonb), public.founder_set_look(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.founder_set_look(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.founder_set_look(jsonb) TO authenticated;