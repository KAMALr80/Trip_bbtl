-- M0-11 characterisation: trip creation, joining with a code, approval, roles, leaving.
-- Pins TODAY's behaviour (Oct 2026). Where it differs from the deck, the test says so; change the
-- test on purpose when the rule changes (M2-10, M2-13), not by accident.
BEGIN;
\ir ../_helpers.psql
SELECT plan(32);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('young_cap', 20);
SELECT tests.create_user('p21', 25);
SELECT tests.create_user('p19', 19);
SELECT tests.create_user('nobirthday', NULL);
SELECT tests.create_user('stranger', 40);

-- ---------------------------------------------------------------- create (Captain-only setup)
SELECT tests.authenticate_as(tests.user_id('young_cap'));
SELECT throws_like(
  $$SELECT public.create_trip_play_mode_v3('Trip', 'Lisbon', current_date + 20, current_date + 24, 'UTC', 'online', 'PT', '{}')$$,
  'Captains are 21+%', 'a 20-year-old cannot create a trip (Captains are 21+, R-904)');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like(
  $$SELECT public.create_trip_play_mode_v3('Trip', 'Lisbon', current_date + 20, current_date + 20, 'UTC', 'online', 'PT', '{}')$$,
  'Trips can be 2 to 30 days long', 'a one-day trip is rejected (today: 2–30 days; deck R-112 says up to 14)');
SELECT throws_like(
  $$SELECT public.create_trip_play_mode_v3('Trip', 'Lisbon', current_date + 20, current_date + 24, 'UTC', 'everyone', 'PT', '{}')$$,
  'Choose who is playing', 'an unknown play mode is rejected');

CREATE TEMP TABLE t AS
  SELECT public.create_trip_play_mode_v3('Trip', 'Lisbon', current_date + 20, current_date + 24, 'UTC', 'online', 'PT', '{}') AS id;
GRANT SELECT ON t TO PUBLIC;
SELECT tests.clear_authentication();

SELECT is((SELECT role FROM public.trip_members WHERE trip_id = (SELECT id FROM t) AND user_id = tests.user_id('cap')),
          'captain', 'the creator becomes Captain (R-207)');
SELECT is((SELECT season_rule FROM public.trips WHERE id = (SELECT id FROM t)), 'a2c',
          'new trips are created on the a2c rule generation');
SELECT is((SELECT play_arrangement FROM public.trips WHERE id = (SELECT id FROM t)), 'online',
          'play mode is stored as play_arrangement');
SELECT ok((SELECT join_code ~ '^[A-Z0-9]{6,8}$' FROM public.trips WHERE id = (SELECT id FROM t)),
          'a join code is generated');

-- ---------------------------------------------------------------- join with the code
SELECT tests.authenticate_as(tests.user_id('nobirthday'));
SELECT throws_like($$SELECT public.join_trip(tests.join_code((SELECT id FROM t)))$$,
                   'Add your date of birth first', 'joining needs a saved birthday');

SELECT tests.authenticate_as(tests.user_id('p21'));
SELECT is(public.join_trip('NOPE99'), NULL::uuid, 'a wrong code returns NULL (no error, so codes can''t be probed)');
SELECT is(public.join_trip(lower(tests.join_code((SELECT id FROM t)))), (SELECT id FROM t),
          'a correct code joins (case-insensitive)');
SELECT is(public.join_trip(tests.join_code((SELECT id FROM t))), (SELECT id FROM t),
          'joining again is a no-op that returns the trip');

SELECT tests.authenticate_as(tests.user_id('p19'));
SELECT is(public.join_trip(tests.join_code((SELECT id FROM t))), (SELECT id FROM t), 'a 19-year-old can join');
SELECT tests.clear_authentication();

SELECT is((SELECT status FROM public.trip_members WHERE trip_id = (SELECT id FROM t) AND user_id = tests.user_id('p21')),
          'pending', 'joins wait for Captain approval (trips.require_approval defaults to true)');
SELECT is((SELECT count(*)::int FROM trip_private.code_attempts WHERE user_id = tests.user_id('p21')), 1,
          'a wrong code is logged for rate limiting');

-- rate limit: 10 bad attempts per hour
INSERT INTO trip_private.code_attempts (user_id) SELECT tests.user_id('stranger') FROM generate_series(1, 10);
SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT throws_like($$SELECT public.join_trip(tests.join_code((SELECT id FROM t)))$$, 'Too many tries%',
                   'after 10 bad codes in an hour even a correct code is refused');
SELECT tests.clear_authentication();
DELETE FROM trip_private.code_attempts WHERE user_id = tests.user_id('stranger');

-- ---------------------------------------------------------------- approve
SELECT tests.authenticate_as(tests.user_id('p19'));
SELECT throws_like($$SELECT public.approve_member((SELECT id FROM t), tests.user_id('p21'), true)$$,
                   'Only the Captain or Co-Captain can approve members', 'a member cannot approve');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT lives_ok($$SELECT public.approve_member((SELECT id FROM t), tests.user_id('p21'), true)$$, 'the Captain approves');
SELECT lives_ok($$SELECT public.approve_member((SELECT id FROM t), tests.user_id('p19'), true)$$, 'the Captain approves a 19-year-old');
SELECT throws_like($$SELECT public.approve_member((SELECT id FROM t), tests.user_id('p21'), true)$$,
                   'That request is no longer waiting', 'approving twice is refused');

-- ---------------------------------------------------------------- roles
SELECT throws_like($$SELECT public.manage_trip_member((SELECT id FROM t), tests.user_id('p19'), 'promote')$$,
                   'UNDER_21:%', 'promoting an under-21 to Co-Captain needs an explicit confirmation');
SELECT lives_ok($$SELECT public.manage_trip_member((SELECT id FROM t), tests.user_id('p21'), 'promote')$$,
                'the Captain names a Co-Captain');
SELECT tests.clear_authentication();
SELECT is((SELECT role FROM public.trip_members WHERE trip_id = (SELECT id FROM t) AND user_id = tests.user_id('p21')),
          'co_captain', 'the member is now Co-Captain');
SELECT ok(EXISTS (SELECT 1 FROM public.trip_role_changes WHERE trip_id = (SELECT id FROM t)),
          'role changes are logged in trip_role_changes');

SELECT tests.create_user('p30', 30);
SELECT tests.add_member((SELECT id FROM t), tests.user_id('p30'));
SELECT tests.authenticate_as(tests.user_id('p21'));
SELECT lives_ok($$SELECT public.manage_trip_member((SELECT id FROM t), tests.user_id('p30'), 'remove')$$,
                'the Co-Captain removes a player (R-210)');
SELECT throws_like($$SELECT public.manage_trip_member((SELECT id FROM t), tests.user_id('cap'), 'remove')$$,
                   'Only the Captain can do that', 'the Co-Captain cannot remove the Captain (R-208)');
SELECT throws_like($$SELECT public.manage_trip_member((SELECT id FROM t), tests.user_id('p19'), 'pass_crown')$$,
                   'Only the Captain can do that', 'only the Captain hands over the Captaincy (R-208)');
SELECT throws_like($$SELECT public.approve_member((SELECT id FROM t), tests.user_id('stranger'), true)$$,
                   'That request is no longer waiting',
                   'the Co-Captain gets past the approval check (R-208: every power but delete)');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.manage_trip_member((SELECT id FROM t), tests.user_id('p19'), 'pass_crown')$$,
                   'Captains are 21+%', 'the Captain role can only be handed to someone 21+');
SELECT throws_like($$SELECT public.leave_trip((SELECT id FROM t))$$, 'Pass the crown before leaving',
                   'the Captain cannot leave while others are in the trip');
SELECT lives_ok($$SELECT public.manage_trip_member((SELECT id FROM t), tests.user_id('p19'), 'remove')$$,
                'the Captain removes a player');
SELECT tests.clear_authentication();
SELECT ok(EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id = (SELECT id FROM t) AND user_id = tests.user_id('p19')),
          'a removal is remembered (rejoining needs approval again)');

SELECT tests.authenticate_as(tests.user_id('p21'));
SELECT lives_ok($$SELECT public.leave_trip((SELECT id FROM t))$$, 'a member can leave');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
