-- M2-02 / M2-03: the new trip columns, call nights access, and trip_phase for real trips.
BEGIN;
\ir ../_helpers.psql
SELECT plan(10);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('stranger', 25);
CREATE TEMP TABLE f AS SELECT tests.create_trip(tests.user_id('cap'), 3, 5) AS trip;
GRANT SELECT ON f TO PUBLIC;
SELECT tests.add_member(trip, tests.user_id('p1')) FROM f;
UPDATE public.trips SET preflight_days = 5 WHERE id = (SELECT trip FROM f);
INSERT INTO public.call_nights (trip_id, starts_at)
SELECT trip, now() + interval '1 day' FROM f;

SELECT is((SELECT room || '/' || play_mode FROM public.trips WHERE id = (SELECT trip FROM f)),
          'trip/crew', 'new trips default to the trip room, crew mode');
SELECT ok((SELECT setup_completed_at IS NOT NULL FROM public.trips WHERE id = (SELECT trip FROM f)),
          'trips made by the older create paths count as set up');
SELECT is((SELECT phase FROM trip_private.trip_phase((SELECT trip FROM f))), 'preflight',
          'a trip 3 days out with 5 Pre-Flight days is in Pre-Flight');
SELECT is((SELECT phase FROM trip_private.trip_phase((SELECT trip FROM f), now() + interval '60 days')),
          'archived', 'trip_phase takes any instant (time travel)');

SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT phase FROM public.trip_phase((SELECT trip FROM f))), 'preflight', 'members can read the phase');
SELECT is((SELECT count(*)::int FROM public.call_nights), 1, 'members see their call nights');
SELECT throws_like($$INSERT INTO public.call_nights (trip_id, starts_at) SELECT trip, now() FROM f$$,
                   '%permission denied%', 'clients cannot write call nights directly');

SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT throws_like($$SELECT * FROM public.trip_phase((SELECT trip FROM f))$$, 'Join this trip first',
                   'non-members cannot read the phase');
SELECT is((SELECT count(*)::int FROM public.call_nights), 0, 'non-members see no call nights');

SELECT tests.authenticate_as_anon();
SELECT throws_like($$SELECT * FROM public.trip_phase((SELECT trip FROM f))$$, '%permission denied%',
                   'signed-out visitors cannot call trip_phase');
SELECT * FROM finish();
ROLLBACK;
