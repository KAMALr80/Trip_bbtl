-- N-6: a declined player is told, and only they can see it.
BEGIN;
\ir ../_helpers.psql
SELECT plan(14);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('crew', 30);
SELECT tests.create_user('asker', 30);
SELECT tests.create_user('ok', 30);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 20, 4, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET require_approval = true, name = 'Lisbon Crew' WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('crew'));
CREATE FUNCTION pg_temp.trip() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = 'trip' $$;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA tests TO authenticated;

SELECT tests.authenticate_as(tests.user_id('asker'));
SELECT public.join_trip(tests.join_code(pg_temp.trip()), 'Asker');
SELECT tests.authenticate_as(tests.user_id('ok'));
SELECT public.join_trip(tests.join_code(pg_temp.trip()), 'Okay');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT lives_ok($$SELECT public.approve_member(pg_temp.trip(), tests.user_id('asker'), false)$$, 'the Captain declines a request');
SELECT lives_ok($$SELECT public.approve_member(pg_temp.trip(), tests.user_id('ok'), true)$$, 'and approves another');

SELECT tests.authenticate_as(tests.user_id('asker'));
SELECT is((SELECT name FROM public.my_join_declines()), 'Lisbon Crew', 'the declined player is told which trip');
SELECT throws_like($$SELECT * FROM public.trip_roster(pg_temp.trip())$$, '%', 'a declined player still has no access to the trip');

SELECT tests.authenticate_as(tests.user_id('ok'));
SELECT is((SELECT count(*)::int FROM public.my_join_declines()), 0, 'an approved player has no decline');
SELECT tests.authenticate_as(tests.user_id('crew'));
SELECT is((SELECT count(*)::int FROM public.my_join_declines()), 0, 'nobody else sees the decline');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT count(*)::int FROM public.my_join_declines()), 0, 'not even the Captain who declined it');

SELECT tests.authenticate_as_anon();
SELECT throws_like($$SELECT * FROM public.my_join_declines()$$, '%permission denied%', 'signed-out visitors can''t call it');
SELECT tests.authenticate_as(tests.user_id('crew'));
SELECT throws_like($$SELECT * FROM trip_private.join_declines$$, '%permission denied%', 'the table isn''t readable directly');

-- Asking again hides it; a second decline shows it again.
SELECT tests.authenticate_as(tests.user_id('asker'));
SELECT public.join_trip(tests.join_code(pg_temp.trip()), 'Asker');
SELECT is((SELECT count(*)::int FROM public.my_join_declines()), 0, 'asking again hides the old decline');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT public.approve_member(pg_temp.trip(), tests.user_id('asker'), false);
SELECT tests.authenticate_as(tests.user_id('asker'));
SELECT is((SELECT count(*)::int FROM public.my_join_declines()), 1, 'a second decline shows again');

SELECT lives_ok($$SELECT public.dismiss_join_decline(pg_temp.trip())$$, 'the player dismisses it');
SELECT is((SELECT count(*)::int FROM public.my_join_declines()), 0, 'and it''s gone');

SELECT tests.clear_authentication();
INSERT INTO trip_private.join_declines (trip_id, user_id) VALUES (pg_temp.trip(), tests.user_id('asker'));
DELETE FROM auth.users WHERE id = tests.user_id('asker');
SELECT is((SELECT count(*)::int FROM trip_private.join_declines), 0, 'deleting the account removes it');

SELECT * FROM finish();
ROLLBACK;
