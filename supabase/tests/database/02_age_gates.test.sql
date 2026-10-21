-- M0-11 characterisation: age gates at sign-up, birthday entry, joining and approval.
-- Deck R-904: sign-up 18+, 13–17 only by Captain invite, 18–20 can't be Captain, alcohol 21+.
-- Where today's code differs, the test name says "today" and points at the task that changes it.
BEGIN;
\ir ../_helpers.psql
SELECT plan(18);

-- ---------------------------------------------------------------- sign-up trigger on auth.users
-- Supabase Auth always sets created_at; the trigger skips rows without it.
SELECT throws_like($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'a@x.test', '{"provider":"email"}', '{"legal_version":"2026-10-03"}', now())$$,
  'A birthday is required to sign up', 'email sign-up without a birthday is refused');

SELECT throws_like(format($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'b@x.test', '{"provider":"email"}', '{"legal_version":"2026-10-03","birthday":"%s"}', now())$$,
  (current_date - interval '12 years')::date),
  'Family Mode is coming soon%', 'email sign-up under 13 is refused');

SELECT lives_ok(format($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'c@x.test', '{"provider":"email"}', '{"legal_version":"2026-10-03","birthday":"%s"}', now())$$,
  (current_date - interval '15 years')::date),
  'email sign-up at 15 is allowed (today; deck R-904 says self sign-up is 18+ — M6-03 / Q12)');

SELECT throws_like($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'd@x.test', '{"provider":"email"}', '{}', now())$$,
  'Please provide your birthday and accept the current Terms',
  'email sign-up without the current legal version is refused');

SELECT lives_ok($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'e@x.test', '{"provider":"google"}', '{}', now())$$,
  'Google sign-up needs no birthday at sign-up (it is asked before joining)');

-- ---------------------------------------------------------------- set_my_dob
SELECT tests.create_user('newbie', NULL);
SELECT tests.authenticate_as(tests.user_id('newbie'));
SELECT throws_like($$SELECT public.set_my_dob(current_date - 30 * 365, false)$$,
                   'Please confirm your birthday and agree', 'the birthday needs the agreement box');
SELECT throws_like($$SELECT public.set_my_dob((current_date - interval '12 years')::date, true)$$,
                   'Family Mode is coming soon%', 'a birthday under 13 is refused');
SELECT lives_ok($$SELECT public.set_my_dob((current_date - interval '30 years')::date, true)$$, 'an adult saves a birthday');
SELECT throws_like($$SELECT public.set_my_dob((current_date - interval '40 years')::date, true)$$,
                   'Your birthday is already saved%', 'the birthday can''t be changed afterwards');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- teens joining
SELECT tests.create_user('cap', 30);
SELECT tests.create_user('teen', 15);
SELECT tests.create_user('teen2', 16);
CREATE TEMP TABLE trips_ AS SELECT
  tests.create_trip(tests.user_id('cap'), 14, 5, 'legacy') AS legacy_trip,
  tests.create_trip(tests.user_id('cap'), 14, 5, 'a2c') AS a2c_trip,
  tests.create_trip(tests.user_id('cap'), 14, 5, 'a2c') AS a2c_trip2,
  tests.create_trip(tests.user_id('cap'), 14, 5, 'a2c') AS party_trip;
GRANT SELECT ON trips_ TO PUBLIC;
UPDATE public.trips SET vibe = 'party' WHERE id = (SELECT party_trip FROM trips_);

SELECT tests.authenticate_as(tests.user_id('teen'));
SELECT throws_like($$SELECT public.join_trip(tests.join_code((SELECT legacy_trip FROM trips_)))$$,
                   'Under 18? Ask your trip''s Captain for a teen invite link.',
                   'a teen cannot join a legacy trip with the plain code');
SELECT throws_like($$SELECT public.join_trip(tests.join_code((SELECT party_trip FROM trips_)))$$,
                   'This trip isn''t open to players under 18', 'a teen cannot join a party-vibe trip');
SELECT is(public.join_trip(tests.join_code((SELECT a2c_trip FROM trips_))), (SELECT a2c_trip FROM trips_),
          'a teen CAN join an a2c trip with the plain code (today; deck R-904 says Captain invite only — M6-03)');
SELECT throws_like($$SELECT public.join_trip(tests.join_code((SELECT a2c_trip2 FROM trips_)))$$,
                   'Players under 18 can be in one trip at a time', 'a teen can be in one trip at a time');
SELECT tests.clear_authentication();

SELECT is((SELECT status FROM public.trip_members WHERE trip_id = (SELECT a2c_trip FROM trips_) AND user_id = tests.user_id('teen')),
          'pending', 'an under-21 join always waits for approval');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT lives_ok($$SELECT public.approve_member((SELECT a2c_trip FROM trips_), tests.user_id('teen'), true)$$,
                'the Captain approves the teen');
SELECT tests.clear_authentication();
SELECT is((SELECT (vibe, has_minors)::text FROM public.trips WHERE id = (SELECT a2c_trip FROM trips_)),
          '(family,t)', 'approving a teen switches the a2c trip to Family vibe with has_minors');

SELECT throws_like($$UPDATE public.trips SET vibe = 'party' WHERE id = (SELECT a2c_trip FROM trips_)$$,
                   'MINORS_FAMILY:%', 'a trip with minors cannot leave the Family vibe (trips_minor_guard)');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.manage_trip_member((SELECT a2c_trip FROM trips_), tests.user_id('teen'), 'promote_under21')$$,
                   'Players under 18 can''t be Co-Captain', 'a teen can never be Co-Captain');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
