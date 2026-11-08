-- N-1: a deleted account takes its birthday with it (the rest of what it leaves behind is in
-- 41_account_deletion_retention). N-2: the name given when joining reaches the Captain and
-- Co-Captain only, gives no access before approval, and goes when the membership goes.
BEGIN;
\ir ../_helpers.psql
SELECT plan(33);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('co', 30);
SELECT tests.create_user('crew', 30);
SELECT tests.create_user('pend', 30);
SELECT tests.create_user('decl', 30);
SELECT tests.create_user('out', 30);
SELECT tests.create_user('gone', 30);
SELECT tests.create_user('stays', 30);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 20, 4, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET require_approval = true WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('co'), 'co_captain');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('crew'));
CREATE FUNCTION pg_temp.trip() RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = 'trip' $$;
CREATE FUNCTION pg_temp.code() RETURNS text LANGUAGE sql AS $$ SELECT tests.join_code(pg_temp.trip()) $$;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA tests TO authenticated;

-- ---------------------------------------------------------------- N-2: giving a name
SELECT tests.authenticate_as(tests.user_id('pend'));
SELECT throws_like($$SELECT public.join_trip(pg_temp.code(), 'x')$$, 'Your name needs 2 to 30%', 'a one-letter name is refused');
SELECT throws_like($$SELECT public.join_trip(pg_temp.code(), repeat('x', 31))$$, 'Your name needs 2 to 30%', 'a 31-letter name is refused');
SELECT throws_like($$SELECT public.join_trip(pg_temp.code(), 'drunk guy')$$, 'Please choose a different name', 'an unsafe name is refused');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = pg_temp.trip() AND user_id = tests.user_id('pend')), 0,
  'a refused name adds no membership');

SELECT tests.authenticate_as(tests.user_id('pend'));
SELECT is(public.join_trip(pg_temp.code(), '  Penny   Lane '), pg_temp.trip(), 'joining with a name returns the trip');
SELECT tests.clear_authentication();
SELECT is((SELECT status FROM public.trip_members WHERE trip_id = pg_temp.trip() AND user_id = tests.user_id('pend')), 'pending', 'and waits for approval');
SELECT is((SELECT display_name FROM trip_private.join_names WHERE trip_id = pg_temp.trip() AND user_id = tests.user_id('pend')), 'Penny Lane', 'the name is stored, tidied');

SELECT tests.authenticate_as(tests.user_id('decl'));
SELECT is(public.join_trip(pg_temp.code(), 'Dee Clined'), pg_temp.trip(), 'a second player waits too');

-- ---------------------------------------------------------------- N-2: who sees it
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT name FROM public.pending_members(pg_temp.trip()) WHERE user_id = tests.user_id('pend')), 'Penny Lane', 'the Captain sees the name');
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT is((SELECT name FROM public.pending_members(pg_temp.trip()) WHERE user_id = tests.user_id('pend')), 'Penny Lane', 'the Co-Captain sees the name');
SELECT tests.authenticate_as(tests.user_id('crew'));
SELECT throws_like($$SELECT * FROM public.pending_members(pg_temp.trip())$$, 'Not allowed', 'crew can''t list who is waiting');
SELECT ok((SELECT count(*) FROM public.trip_roster(pg_temp.trip())) > 0, 'crew can read the roster');
SELECT is((SELECT count(*)::int FROM public.trip_roster(pg_temp.trip()) WHERE user_id = tests.user_id('pend')), 0, 'but a waiting player isn''t on it');
SELECT tests.authenticate_as(tests.user_id('pend'));
SELECT throws_like($$SELECT * FROM public.pending_members(pg_temp.trip())$$, 'Not allowed', 'a waiting player can''t list who is waiting');
SELECT throws_like($$SELECT * FROM public.trip_roster(pg_temp.trip())$$, 'Not a member', 'and gets no roster');
SELECT is((SELECT count(*)::int FROM public.trips WHERE id = pg_temp.trip()), 0, 'and can''t read the trip');
SELECT tests.authenticate_as(tests.user_id('out'));
SELECT throws_like($$SELECT * FROM public.pending_members(pg_temp.trip())$$, 'Not allowed', 'an outsider can''t list who is waiting');
SELECT throws_like($$SELECT * FROM trip_private.join_names$$, 'permission denied%', 'nobody reads the names table directly');
SELECT throws_like($$INSERT INTO trip_private.join_names (trip_id, user_id, display_name) VALUES (pg_temp.trip(), auth.uid(), 'Forged')$$, 'permission denied%', 'or writes to it');

-- ---------------------------------------------------------------- N-2: approve and decline
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT lives_ok($$SELECT public.approve_member(pg_temp.trip(), tests.user_id('pend'), true)$$, 'the Co-Captain approves an adult');
SELECT tests.authenticate_as(tests.user_id('crew'));
SELECT is((SELECT display_name FROM public.trip_roster(pg_temp.trip()) WHERE user_id = tests.user_id('pend')), 'Penny Lane', 'once approved, the crew sees the name');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT lives_ok($$SELECT public.approve_member(pg_temp.trip(), tests.user_id('decl'), false)$$, 'the Captain declines');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM trip_private.join_names WHERE user_id = tests.user_id('decl')), 0, 'a declined player''s name is gone');

INSERT INTO public.trip_player_cards (trip_id, user_id, real_name, game_name, avatar_style, avatar_seed) VALUES (pg_temp.trip(), tests.user_id('pend'), 'Penny', 'PennyCard', 'traveler', '1');
SELECT tests.authenticate_as(tests.user_id('crew'));
SELECT is((SELECT display_name FROM public.trip_roster(pg_temp.trip()) WHERE user_id = tests.user_id('pend')), 'PennyCard', 'a player card wins over the join name');
SELECT tests.authenticate_as(tests.user_id('pend'));
SELECT lives_ok($$SELECT public.leave_trip(pg_temp.trip())$$, 'leaving the trip');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM trip_private.join_names WHERE user_id = tests.user_id('pend')), 0, 'takes the name with it');

SELECT tests.authenticate_as(tests.user_id('out'));
SELECT is(public.join_trip(pg_temp.code()), pg_temp.trip(), 'an older app can still join without a name');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT name FROM public.pending_members(pg_temp.trip()) WHERE user_id = tests.user_id('out')), 'New traveler', 'and shows the fallback');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- N-1: deleting an account
INSERT INTO public.player_birthdays (user_id, birthday) VALUES (tests.user_id('gone'), '1990-01-01');
INSERT INTO public.passport_stamps (user_id, trip_id, kind, country, stamped_on) VALUES (tests.user_id('gone'), pg_temp.trip(), 'international', 'PT', current_date);
INSERT INTO ids VALUES ('gone', tests.user_id('gone')), ('stays', tests.user_id('stays'));
DELETE FROM auth.users WHERE id = (SELECT id FROM ids WHERE k = 'gone');
SELECT is((SELECT count(*)::int FROM public.player_private WHERE user_id = (SELECT id FROM ids WHERE k = 'gone')), 0, 'the deleted account''s birthday is gone');
SELECT is((SELECT count(*)::int FROM public.player_birthdays WHERE user_id = (SELECT id FROM ids WHERE k = 'gone')), 0, 'from both tables that hold one');
SELECT is((SELECT count(*)::int FROM public.player_private WHERE user_id = (SELECT id FROM ids WHERE k = 'stays')), 1, 'another player''s birthday stays');
SELECT is((SELECT count(*)::int FROM public.account_consents WHERE user_id = (SELECT id FROM ids WHERE k = 'gone')), 1, 'the consent record is untouched (legal decision pending)');
SELECT is((SELECT count(*)::int FROM public.passport_stamps WHERE user_id = (SELECT id FROM ids WHERE k = 'gone')), 0, 'the account''s passport stamp goes (founder decision, 2026-11-08)');

SELECT * FROM finish();
ROLLBACK;
