-- M1-10: no FULL/PREVIEW trip levels and no per-trip feature switches. Every trip gets the same
-- features; unfinished ones are hidden by app-level flags (src/lib/flags.ts).
BEGIN;
\ir ../_helpers.psql
SELECT plan(10);

SELECT is((SELECT count(*)::int FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'level'), 0,
          'trips has no level column');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('public', 'trip_private')
             AND p.proname IN ('trip_features', 'trip_slice_pct', 'founder_preview', 'founder_set_preview',
                               'founder_set_trip_level', 'preview_room_ok', 'trip_level_trg')), 0,
          'the feature map, preview settings and trip level functions are gone');
-- Nothing may read the trip to decide a feature. The kept shims take no decision.
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('public', 'trip_private')
             AND (p.prosrc ~ 'preview_settings' OR p.prosrc ~* 'level\s*=\s*''(full|preview)''')), 0,
          'no function reads preview settings or branches on a trip level');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public'
           AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'feature_on|in_slice'), 0,
          'no row policy depends on a feature switch');

SELECT tests.create_user('admin', 40);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('admin'));
SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
CREATE TEMP TABLE f AS SELECT tests.create_trip(tests.user_id('cap'), 10, 5) AS a, tests.create_trip(tests.user_id('cap'), 20, 5) AS b;
GRANT SELECT ON f TO PUBLIC;
UPDATE public.trips SET require_approval = false WHERE id IN (SELECT a FROM f UNION SELECT b FROM f);

SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT lives_ok($$SELECT public.join_trip(tests.join_code((SELECT a FROM f)))$$, 'a player joins one trip');
SELECT lives_ok($$SELECT public.join_trip(tests.join_code((SELECT b FROM f)))$$,
                'and a second one (the preview one-room limit is gone)');
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE user_id = tests.user_id('p1')), 2, 'both joins stuck');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT * FROM public.founder_trips()$$, 'Founder only', 'only the founder lists every trip');
SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT ok((SELECT count(*) FROM public.founder_trips() WHERE id IN (SELECT a FROM f UNION SELECT b FROM f)) = 2,
          'the founder lists every trip');
SELECT is((SELECT rules_version FROM public.founder_trips() WHERE id = (SELECT a FROM f)), 2::smallint,
          'with its archive state, for the cutover');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
