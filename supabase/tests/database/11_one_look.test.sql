-- M1-03: one visual look; nothing stores or switches it.
BEGIN;
\ir ../_helpers.psql
SELECT plan(2);
SELECT is((SELECT count(*)::int FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'app_settings' AND column_name = 'look'), 0,
          'app_settings has no look column');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('public', 'trip_private') AND p.proname IN ('current_look', 'founder_set_look')), 0,
          'the look functions are gone');
SELECT * FROM finish();
ROLLBACK;
