-- M0-11 characterisation: age gates at sign-up, birthday entry, joining and approval.
-- Deck R-904: sign-up 18+, 13–17 only by Captain invite, 18–20 can't be Captain, alcohol 21+.
-- M6-03 (Q12 default): self sign-up is 18+; 13–17 only through a Captain's teen invite.
BEGIN;
\ir ../_helpers.psql
SELECT plan(24);

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

SELECT throws_like(format($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'c@x.test', '{"provider":"email"}', '{"legal_version":"2026-10-03","birthday":"%s"}', now())$$,
  (current_date - interval '15 years')::date),
  'TripJunkies accounts are for ages 18 and up%', 'email sign-up at 15 without a teen invite is refused (R-904, Q12)');

SELECT lives_ok(format($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'c2@x.test', '{"provider":"email"}', '{"legal_version":"2026-10-03","birthday":"%s"}', now())$$,
  (current_date - interval '18 years 1 day')::date),
  'email sign-up at 18 is allowed');

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
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.create_teen_invite((SELECT party_trip FROM trips_), true)$$,
                   'Teens can''t join Party trips%', 'there are no teen invites to a party-vibe trip');
SELECT tests.authenticate_as(tests.user_id('teen'));
SELECT throws_like($$SELECT public.join_trip(tests.join_code((SELECT a2c_trip FROM trips_)))$$,
                   'Under 18? Ask your trip''s Captain for a teen invite link.',
                   'a teen cannot join any trip with the plain code (R-904, Q12)');
SELECT tests.authenticate_as(tests.user_id('cap'));
CREATE TEMP TABLE inv AS SELECT public.create_teen_invite((SELECT a2c_trip FROM trips_), true) AS one,
                                public.create_teen_invite((SELECT a2c_trip2 FROM trips_), true) AS two;
GRANT SELECT ON inv TO PUBLIC;
SELECT tests.authenticate_as(tests.user_id('teen'));
SELECT is(public.join_trip((SELECT one FROM inv)), (SELECT a2c_trip FROM trips_), 'the teen joins with the Captain''s teen invite');
SELECT throws_like($$SELECT public.join_trip((SELECT two FROM inv))$$,
                   'Players under 18 can be in one trip at a time', 'a teen can be in one trip at a time');
SELECT tests.clear_authentication();
-- The invite carries the sign-up: a 15-year-old with a valid teen invite can create an account.
SELECT lives_ok(format($$
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data, created_at)
  VALUES (gen_random_uuid(), 'f@x.test', '{"provider":"email"}', '{"legal_version":"2026-10-03","birthday":"%s","teen_invite":"%s"}', now())$$,
  (current_date - interval '15 years')::date, (SELECT two FROM inv)),
  'email sign-up at 15 WITH a teen invite is allowed');
SELECT tests.create_user('gteen', NULL);
SELECT tests.authenticate_as(tests.user_id('gteen'));
SELECT throws_like($$SELECT public.set_my_dob((current_date - interval '16 years')::date, true)$$,
                   'TripJunkies accounts are for ages 18 and up%', 'a Google sign-up under 18 can''t save a birthday without an invite');
SELECT throws_like($$SELECT public.set_teen_dob((current_date - interval '16 years')::date, true, 'NOPENOPENO')$$,
                   'TripJunkies accounts are for ages 18 and up%', 'or with an invite that doesn''t exist');
SELECT is(public.set_teen_dob((current_date - interval '16 years')::date, true, (SELECT two FROM inv)), 'Teen 13–17',
          'with the Captain''s teen invite it can');
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
