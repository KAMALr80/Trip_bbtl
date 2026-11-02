-- M6-07 security review, kept as checks: RLS everywhere, SECURITY DEFINER functions pin their
-- search_path, and signed-out visitors (anon) reach only the launch switch, welcome copy and prices.
BEGIN;
\ir ../_helpers.psql
SELECT plan(7);

SELECT is((SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity), NULL, 'RLS is on for every public table');
SELECT is((SELECT string_agg(n.nspname || '.' || p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('public', 'trip_private') AND p.prosecdef
             AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')),
          NULL, 'every SECURITY DEFINER function sets its search_path');
SELECT is((SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
             AND (has_table_privilege('anon', c.oid, 'INSERT') OR has_table_privilege('anon', c.oid, 'UPDATE')
                  OR has_table_privilege('anon', c.oid, 'DELETE') OR has_table_privilege('anon', c.oid, 'TRUNCATE'))),
          NULL, 'anon can''t write any table');
SELECT is((SELECT string_agg(c.relname, ', ' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
             AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_any_column_privilege('anon', c.oid, 'SELECT'))),
          'app_settings, price_rules', 'anon reads only the launch switch / welcome copy and the price list');
SELECT is((SELECT string_agg(p.proname, ', ' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.prokind = 'f' AND has_function_privilege('anon', p.oid, 'EXECUTE')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
             AND p.proname NOT IN (SELECT proname FROM pg_proc q JOIN pg_namespace qn ON qn.oid = q.pronamespace
                                   WHERE qn.nspname = 'public' AND q.proname IN ('plan', 'finish', 'ok', 'is', 'isnt', 'throws_ok',
                                     'throws_like', 'lives_ok', 'pass', 'fail', 'diag', 'no_plan', '_tap_state'))),
          'price_list, public_launch, welcome_copy', 'anon runs only the three signed-out functions');
SELECT is((SELECT count(*)::int FROM storage.buckets
           WHERE public OR file_size_limit IS NULL OR file_size_limit > 5242880
              OR NOT (allowed_mime_types <@ ARRAY['image/jpeg', 'image/png', 'image/webp'])), 0,
          'every bucket is private, images only, 5 MB at most (M6-04)');
SELECT tests.authenticate_as_anon();
SELECT throws_ok($$SELECT * FROM public.trips$$, '42501', NULL, 'a signed-out request can''t even read trips');
SELECT * FROM finish();
ROLLBACK;
