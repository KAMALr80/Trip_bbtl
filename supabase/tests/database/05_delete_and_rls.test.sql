-- M0-11 characterisation: deleting a trip (Captain only, logged, members notified) and the RLS
-- guarantees the game relies on: non-members read nothing, clients never write game tables directly.
BEGIN;
\ir ../_helpers.psql
SELECT plan(24);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('co', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('pending', 25);
SELECT tests.create_user('stranger', 25);

CREATE TEMP TABLE f AS SELECT
  tests.create_trip(tests.user_id('cap')) AS trip,
  tests.create_trip(tests.user_id('cap')) AS doomed,
  tests.create_trip(tests.user_id('cap')) AS doomed2;
GRANT SELECT ON f TO PUBLIC;
SELECT tests.add_member(trip, tests.user_id('co'), 'co_captain'),
       tests.add_member(trip, tests.user_id('p1')),
       tests.add_member(trip, tests.user_id('pending'), 'player', 'pending'),
       tests.add_member(doomed, tests.user_id('co'), 'co_captain'),
       tests.add_member(doomed, tests.user_id('p1'))
FROM f;
UPDATE public.trips SET name = 'Doomed Trip' WHERE id = (SELECT doomed FROM f);
UPDATE public.trips SET name = 'Second Doomed' WHERE id = (SELECT doomed2 FROM f);

-- ---------------------------------------------------------------- reading
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT count(*)::int FROM public.trips WHERE id = (SELECT trip FROM f)), 1, 'a member can read their trip');
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = (SELECT trip FROM f) AND status = 'approved'), 3,
          'a member can see the approved crew');
SELECT is((SELECT count(*)::int FROM public.player_private WHERE user_id <> tests.user_id('p1')), 0,
          'nobody can read another player''s birthday');
SELECT is((SELECT count(*)::int FROM public.player_private WHERE user_id = tests.user_id('p1')), 1,
          'a player can read their own birthday');

SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT is((SELECT count(*)::int FROM public.trips WHERE id = (SELECT trip FROM f)), 0, 'a non-member cannot read the trip');
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = (SELECT trip FROM f)), 0, 'a non-member cannot see the crew');
SELECT is((SELECT count(*)::int FROM public.mission_claims WHERE trip_id = (SELECT trip FROM f)), 0,
          'a non-member cannot see mission claims');

SELECT tests.authenticate_as(tests.user_id('pending'));
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = (SELECT trip FROM f) AND user_id <> tests.user_id('pending')), 0,
          'a pending member cannot see the rest of the crew yet');

SELECT tests.authenticate_as_anon();
SELECT throws_ok($$SELECT count(*) FROM public.trips$$, '42501', NULL, 'signed-out visitors cannot read any trip (no table grant since M6-07)');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- no direct writes
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_ok($$INSERT INTO public.trip_members (trip_id, user_id, role) VALUES ((SELECT trip FROM f), tests.user_id('stranger'), 'player')$$,
                 '42501', NULL, 'even the Captain cannot add members by writing trip_members directly');
-- UPDATE with no matching RLS policy silently changes 0 rows (no error), so check the data afterwards.
UPDATE public.trip_members SET role = 'captain' WHERE trip_id = (SELECT trip FROM f) AND user_id = tests.user_id('p1');
UPDATE public.trips SET name = 'Renamed' WHERE id = (SELECT trip FROM f);
SELECT throws_ok($$INSERT INTO public.mission_claims (trip_id, user_id, slot, category, mission_text, points, phase) VALUES ((SELECT trip FROM f), tests.user_id('cap'), 1, 'x', 'x', 99, 'takeoff')$$,
                 '42501', NULL, 'mission points cannot be written directly');
SELECT throws_ok($$INSERT INTO public.sealed_quests (trip_id, user_id, kind, drop_no, drop_at, value, title) VALUES ((SELECT trip FROM f), tests.user_id('cap'), 'sealed', 9, now(), 99, 'x')$$,
                 '42501', NULL, 'sealed quests cannot be written directly');
SELECT throws_ok($$INSERT INTO public.season_champions (trip_id, season, user_id) VALUES ((SELECT trip FROM f), 'trip', tests.user_id('cap'))$$,
                 '42501', NULL, 'crowns cannot be forged');
SELECT tests.clear_authentication();
SELECT is((SELECT role FROM public.trip_members WHERE trip_id = (SELECT trip FROM f) AND user_id = tests.user_id('p1')),
          'player', 'roles cannot be changed by writing trip_members directly');
SELECT is((SELECT name FROM public.trips WHERE id = (SELECT trip FROM f)), 'Test Trip',
          'trips cannot be edited by writing the table directly');

-- ---------------------------------------------------------------- delete trip
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.delete_trip((SELECT doomed FROM f), 'DELETE')$$, 'Captain only', 'players cannot delete a trip');
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT throws_like($$SELECT public.delete_trip((SELECT doomed FROM f), 'DELETE')$$, 'Captain only',
                   'the Co-Captain cannot delete a trip (R-208, R-210)');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.delete_trip((SELECT doomed FROM f), 'Wrong name')$$, 'Trip name does not match',
                   'deleting needs the trip name or the word DELETE');
SELECT lives_ok($$SELECT public.delete_trip((SELECT doomed FROM f), '  delete ')$$, 'the Captain deletes by typing DELETE (any case)');
SELECT lives_ok($$SELECT public.delete_trip((SELECT doomed2 FROM f), 'Second Doomed')$$, 'the Captain deletes by typing the trip name');
SELECT tests.clear_authentication();

SELECT is((SELECT count(*)::int FROM public.trips WHERE id = (SELECT doomed FROM f)), 0, 'the trip is gone');
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = (SELECT doomed FROM f)), 0, 'its memberships cascade away');
SELECT is((SELECT member_count FROM public.trip_deletion_log WHERE trip_id = (SELECT doomed FROM f)), 3,
          'the deletion is logged with the member count');
SELECT is((SELECT array_agg(user_id ORDER BY user_id) FROM public.trip_deletion_notes WHERE trip_name = 'Doomed Trip'),
          (SELECT array_agg(id ORDER BY id) FROM tests.users WHERE handle IN ('co', 'p1')),
          'every other member gets a deletion notice; the Captain does not');

SELECT * FROM finish();
ROLLBACK;
