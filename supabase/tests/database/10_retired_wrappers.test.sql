-- M1-08: the app can't call the wrappers of retired features (dev-docs/05 §2). Kept features still
-- work, and the service role keeps access for exports and support.
BEGIN;
\ir ../_helpers.psql
SELECT plan(8);

SELECT ok((SELECT count(*) FROM trip_private.retired_wrappers) >= 70, 'the retired wrappers are recorded with their feature');
SELECT is((SELECT array_agg(p.oid::regprocedure::text ORDER BY 1) FROM pg_proc p
           JOIN trip_private.retired_wrappers r ON r.name = p.proname
           WHERE p.pronamespace = 'public'::regnamespace
             AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
                  OR has_function_privilege('anon', p.oid, 'EXECUTE'))),
          NULL, 'no retired wrapper is executable by anon or authenticated');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN trip_private.retired_wrappers r ON r.name = p.proname
           WHERE p.pronamespace = 'public'::regnamespace AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')),
          0, 'the service role keeps access');

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
CREATE TEMP TABLE f AS SELECT tests.create_trip(tests.user_id('cap'), 0, 5) AS trip;
GRANT SELECT ON f TO PUBLIC;
SELECT tests.add_member(trip, tests.user_id('p1')) FROM f;

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_ok($$SELECT public.qotw_action((SELECT trip FROM f), 1, 'reveal')$$, '42501', NULL,
                 'a Captain can''t run Question of the Week');
SELECT throws_ok($$SELECT public.spin_next_game((SELECT trip FROM f))$$, '42501', NULL,
                 'or spin the old game wheel');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_ok($$SELECT * FROM public.game_rooms()$$, '42501', NULL, 'a player can''t list public Game Rooms');
SELECT lives_ok($$SELECT * FROM public.trip_standings((SELECT trip FROM f), 'preflight')$$, 'the new engine still works');
SELECT ok(public.is_trip_member((SELECT trip FROM f), tests.user_id('p1')), 'shared helpers still work');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
