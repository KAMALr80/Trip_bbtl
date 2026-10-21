CREATE TABLE IF NOT EXISTS trip_private.cron_keys (name text PRIMARY KEY, key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO trip_private.cron_keys(name, key) VALUES ('purge_photos', encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT (name) DO NOTHING;
CREATE OR REPLACE FUNCTION public.check_cron_key(p_name text, p_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM trip_private.cron_keys WHERE name=p_name AND length(coalesce(p_key,'')) >= 32 AND key=p_key) $$;
REVOKE EXECUTE ON FUNCTION public.check_cron_key(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_cron_key(text,text) TO service_role;