-- M0-11 characterisation: Airport Missions (R-331/R-332) and "We've arrived" (R-103).
-- Airport Missions use now(): fixtures place the trip's first day relative to today (home zone UTC).
BEGIN;
\ir ../_helpers.psql
SELECT plan(27);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('co', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('stranger', 25);

CREATE TEMP TABLE f AS SELECT
  tests.create_trip(tests.user_id('cap'), 0, 5) AS today_trip,       -- departure day is today
  tests.create_trip(tests.user_id('cap'), 3, 5) AS future_trip,      -- departs in 3 days
  tests.create_trip(tests.user_id('cap'), -1, 5) AS started_trip,    -- departed yesterday
  tests.create_trip(tests.user_id('cap'), 0, 5, 'a2c', 'America/New_York', 'Asia/Makassar') AS bali_trip;
GRANT SELECT ON f TO PUBLIC;
SELECT tests.add_member(today_trip, tests.user_id('co'), 'co_captain') FROM f;
SELECT tests.add_member(today_trip, tests.user_id('p1')) FROM f;
SELECT tests.add_member(future_trip, tests.user_id('p1')) FROM f;
SELECT tests.add_member(started_trip, tests.user_id('p1')) FROM f;

CREATE TEMP TABLE claims (slot int PRIMARY KEY, id uuid);
GRANT ALL ON claims TO PUBLIC;

-- ---------------------------------------------------------------- the departure-day window
SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'reveal', 1)$$,
                   'Join this trip first', 'non-members cannot reveal missions');

SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.mission_action((SELECT future_trip FROM f), 'reveal', 1)$$,
                   'Airport Missions open on departure day', 'missions are sealed before departure day');
SELECT throws_like($$SELECT public.mission_action((SELECT started_trip FROM f), 'reveal', 1)$$,
                   'Airport Missions have closed%', 'missions not revealed on departure day are missed');
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'reveal', 2)$$,
                   'Finish the one before this first', 'missions are revealed in order');

-- ---------------------------------------------------------------- reveal, complete, cap
INSERT INTO claims SELECT 1, public.mission_action((SELECT today_trip FROM f), 'reveal', 1);
SELECT isnt((SELECT id FROM claims WHERE slot = 1), NULL::uuid, 'mission 1 reveals on departure day');
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'reveal', 1)$$,
                   'Already revealed', 'a mission can only be revealed once');
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'reveal', 2)$$,
                   'Finish the one before this first', 'the next mission waits until this one is answered');
SELECT is(public.mission_action((SELECT today_trip FROM f), 'complete', NULL, (SELECT id FROM claims WHERE slot = 1)),
          (SELECT id FROM claims WHERE slot = 1), 'submitting proof completes the mission');
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'complete', NULL, (SELECT id FROM claims WHERE slot = 1))$$,
                   'Already answered', 'a mission can only be answered once');

INSERT INTO claims SELECT 2, public.mission_action((SELECT today_trip FROM f), 'reveal', 2);
SELECT public.mission_action((SELECT today_trip FROM f), 'complete', NULL, (SELECT id FROM claims WHERE slot = 2));
INSERT INTO claims SELECT 3, public.mission_action((SELECT today_trip FROM f), 'reveal', 3);
SELECT public.mission_action((SELECT today_trip FROM f), 'skip', NULL, (SELECT id FROM claims WHERE slot = 3));
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'reveal', 4)$$,
                   'Missions 4 and 5 are for layovers', 'missions 4–5 need the layover flag');
INSERT INTO claims SELECT 4, public.mission_action((SELECT today_trip FROM f), 'reveal', 4, NULL, true);
SELECT public.mission_action((SELECT today_trip FROM f), 'complete', NULL, (SELECT id FROM claims WHERE slot = 4));
INSERT INTO claims SELECT 5, public.mission_action((SELECT today_trip FROM f), 'reveal', 5, NULL, true);
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'reveal', 6, NULL, true)$$,
                   'Pick a mission slot', 'there are at most 5 mission slots');
SELECT tests.clear_authentication();

SELECT is((SELECT array_agg(points ORDER BY slot)::text FROM public.mission_claims
           WHERE trip_id = (SELECT today_trip FROM f) AND user_id = tests.user_id('p1')),
          '{2,2,2,3,3}', 'missions 1–3 are worth 2 points and layover missions 4–5 are worth 3');
SELECT is((SELECT sum(points)::int FROM public.mission_claims
           WHERE trip_id = (SELECT today_trip FROM f) AND user_id = tests.user_id('p1')),
          12, 'the most a player can reach is 12 (R-332 cap), by construction of the slot values');
SELECT is((SELECT status FROM public.mission_claims WHERE id = (SELECT id FROM claims WHERE slot = 3)),
          'skipped', 'a skipped mission is recorded as skipped');
SELECT ok((SELECT bool_and(position('{destination}' in mission_text) = 0) FROM public.mission_claims
           WHERE trip_id = (SELECT today_trip FROM f)), 'the destination is filled into the mission text');

-- ---------------------------------------------------------------- verification by leaders
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'verify', NULL, (SELECT id FROM claims WHERE slot = 1))$$,
                   'Only the Captain or Co-Captain can verify', 'players cannot verify missions');
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT lives_ok($$SELECT public.mission_action((SELECT today_trip FROM f), 'verify', NULL, (SELECT id FROM claims WHERE slot = 1))$$,
                'the Co-Captain verifies a mission');
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'decline', NULL, (SELECT id FROM claims WHERE slot = 1))$$,
                   'Already decided', 'a decided mission stays decided');
SELECT tests.clear_authentication();
SELECT is((SELECT status FROM public.mission_claims WHERE id = (SELECT id FROM claims WHERE slot = 1)),
          'released', 'a verified mission is released (its points count)');

-- ---------------------------------------------------------------- proof deadline
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT proof_due_at FROM public.mission_window((SELECT today_trip FROM f))),
          trip_private.trip_season_start_at((SELECT today_trip FROM f)),
          'proof for a revealed mission is due when Trip Season starts (R-332)');
SELECT tests.clear_authentication();
UPDATE public.mission_claims SET revealed_at = now() - interval '3 days' WHERE id = (SELECT id FROM claims WHERE slot = 5);
UPDATE public.trips SET departure_confirmed_at = now() - interval '1 hour' WHERE id = (SELECT today_trip FROM f);
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.mission_action((SELECT today_trip FROM f), 'complete', NULL, (SELECT id FROM claims WHERE slot = 5))$$,
                   'This mission proof deadline has passed', 'no proof after Trip Season has started and 24h have passed');
SELECT tests.clear_authentication();
UPDATE public.trips SET departure_confirmed_at = NULL WHERE id = (SELECT today_trip FROM f);

-- ---------------------------------------------------------------- "We've arrived"
SELECT is(trip_private.trip_season_start_at((SELECT bali_trip FROM f)),
          ((SELECT start_date FROM public.trips WHERE id = (SELECT bali_trip FROM f)) + 1 + time '23:59') AT TIME ZONE 'Asia/Makassar',
          'without a tap, Trip Season starts automatically at 23:59 trip time the day after takeoff (R-103)');

SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.confirm_departure((SELECT today_trip FROM f))$$,
                   'Only the Captain or Co-Captain can confirm arrival', 'players cannot tap "We''ve arrived"');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.confirm_departure((SELECT future_trip FROM f))$$,
                   'Arrival can only be confirmed once, on or after your first trip day', 'arrival cannot be confirmed before the first trip day');
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT lives_ok($$SELECT public.confirm_departure((SELECT today_trip FROM f))$$,
                'the Co-Captain can tap "We''ve arrived" (already matches R-103)');
SELECT throws_like($$SELECT public.confirm_departure((SELECT today_trip FROM f))$$,
                   'Arrival can only be confirmed once%', 'arrival is confirmed only once');
SELECT tests.clear_authentication();
SELECT is(trip_private.trip_season_start_at((SELECT today_trip FROM f)),
          (SELECT departure_confirmed_at FROM public.trips WHERE id = (SELECT today_trip FROM f)),
          'after the tap, Trip Season starts at the tap time');

SELECT * FROM finish();
ROLLBACK;
