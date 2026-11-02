-- M6-07 security review: least privilege for signed-out visitors (the `anon` role).
-- RLS was already on for every public table and every SECURITY DEFINER function pins its
-- search_path (30_security checks both from now on). But Supabase's default grants left `anon`
-- with table privileges on every table and EXECUTE on public functions, so RLS was the only wall.
-- Now `anon` keeps only what the signed-out screens use: the launch switch and welcome copy
-- (app_settings columns and their functions) and the public price list. Everything else is for
-- signed-in players (`authenticated`) or the server (`service_role`), as before.
-- rollback: GRANT ALL ON ALL TABLES IN SCHEMA public TO anon; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA
--   public TO anon, PUBLIC; ALTER DEFAULT PRIVILEGES ... GRANT (the Supabase defaults).

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p', 'f') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
  -- Functions: no EXECUTE through PUBLIC; signed-in players and the server keep what they had.
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f'
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
    IF has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- What signed-out screens read.
GRANT SELECT (id, public_launch, founder_intro, welcome_faq, boarding_tile) ON public.app_settings TO anon;
GRANT SELECT ON public.price_rules TO anon;
GRANT EXECUTE ON FUNCTION public.public_launch(), public.welcome_copy(), public.price_list() TO anon;

-- New objects don't get anon access by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;
