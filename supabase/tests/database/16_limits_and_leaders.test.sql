-- M2-13 server-side limits (checked against room_rules on every write) and M2-10 Co-Captain powers.
BEGIN;
\ir ../_helpers.psql
SELECT plan(15);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('co', 30);
SELECT tests.create_user('p1', 25);
CREATE TEMP TABLE f AS SELECT tests.create_trip(tests.user_id('cap'), 20, 5) AS trip;
GRANT SELECT ON f TO PUBLIC;
SELECT tests.add_member(trip, tests.user_id('co'), 'co_captain') FROM f;
SELECT tests.add_member(trip, tests.user_id('p1')) FROM f;

-- ---------------------------------------------------------------- trip length and settings
SELECT throws_like($$UPDATE public.trips SET end_date = start_date + 14 WHERE id = (SELECT trip FROM f)$$,
                   'Trips can be up to 14 days%', 'trips are 14 days at most (R-112)');
SELECT lives_ok($$UPDATE public.trips SET end_date = start_date + 13 WHERE id = (SELECT trip FROM f)$$, '14 days is fine');
SELECT throws_like($$UPDATE public.trips SET room = 'explore_culture' WHERE id = (SELECT trip FROM f)$$,
                   'This room runs 1 to 7 days', 'at-home rooms are 1 to 7 days (R-112)');
SELECT throws_like($$UPDATE public.trips SET end_date = start_date + 1, room = 'game_night', play_mode = 'crew' WHERE id = (SELECT trip FROM f)$$,
                   'This room runs 1 to 1 days', 'Game Night is one night');
SELECT throws_like($$UPDATE public.trips SET room = 'window_seat', play_mode = 'offline', end_date = start_date + 2 WHERE id = (SELECT trip FROM f)$$,
                   'That way of playing isn''t available%', 'Window Seat has no off-app mode');
SELECT throws_like($$UPDATE public.trips SET preflight_days = 11 WHERE id = (SELECT trip FROM f)$$,
                   'Pre-Flight can be up to 10 days', 'Pre-Flight is 0 to 10 days (R-101)');
SELECT throws_like($$UPDATE public.trips SET focuses = '{food}' WHERE id = (SELECT trip FROM f)$$,
                   'Pick up to 0 focuses', 'focuses are for Explore a Culture only');

-- ---------------------------------------------------------------- crew size
SELECT tests.create_user('extra' || n, 30) FROM generate_series(1, 10) n;
SELECT tests.add_member((SELECT trip FROM f), tests.user_id('extra' || n), 'player', 'pending') FROM generate_series(1, 9) n;
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = (SELECT trip FROM f)), 12, 'a crew holds 12, pending included');
SELECT throws_like($$SELECT tests.add_member((SELECT trip FROM f), tests.user_id('extra10'))$$,
                   'This crew is full (12 players max)', 'a 13th player is refused (R-005)');
UPDATE public.trips SET play_mode = 'solo' WHERE id = (SELECT trip FROM f);
DELETE FROM public.trip_members WHERE trip_id = (SELECT trip FROM f) AND user_id IN (SELECT id FROM tests.users WHERE handle LIKE 'extra%');
SELECT throws_like($$SELECT tests.add_member((SELECT trip FROM f), tests.user_id('extra10'))$$,
                   'This room is played by its Captain only', 'nobody joins a solo trip');
UPDATE public.trips SET play_mode = 'crew' WHERE id = (SELECT trip FROM f);

-- ---------------------------------------------------------------- call nights
INSERT INTO public.call_nights (trip_id, starts_at) SELECT (SELECT trip FROM f), now() + make_interval(days => n) FROM generate_series(1, 4) n;
SELECT throws_like($$INSERT INTO public.call_nights (trip_id, starts_at) SELECT trip, now() + interval '9 days' FROM f$$,
                   'Up to 4 call nights per trip', 'a 5th call night is refused (R-204)');

-- ---------------------------------------------------------------- Co-Captain powers (R-208)
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT lives_ok($$SELECT public.set_trip_vibe((SELECT trip FROM f), 'party')$$, 'the Co-Captain changes the vibe');
SELECT lives_ok($$SELECT public.set_trip_timezone((SELECT trip FROM f), 'Asia/Makassar')$$, 'the Co-Captain changes the trip time zone (M2-04)');
SELECT throws_like($$SELECT public.delete_trip((SELECT trip FROM f), 'DELETE')$$, '%Captain%',
                   'the Co-Captain cannot delete the trip');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.set_trip_vibe((SELECT trip FROM f), 'chill')$$, 'Captain or Co-Captain only',
                   'players cannot change trip settings');
SELECT tests.clear_authentication();
SELECT * FROM finish();
ROLLBACK;
