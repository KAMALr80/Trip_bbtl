-- M6-05 admin area: find users and trips, disable an account (logged), admins only.
BEGIN;
\ir ../_helpers.psql
SELECT plan(8);
SELECT tests.create_user('admin', 40);
SELECT tests.create_user('alice', 30);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('admin'));
INSERT INTO public.player_profiles (user_id, real_name, game_name) VALUES (tests.user_id('alice'), 'Alice A', 'AliceWonder');
CREATE TEMP TABLE tr AS SELECT tests.create_trip(tests.user_id('alice'), 14, 3) AS id;
GRANT SELECT ON tr TO PUBLIC;

SELECT tests.authenticate_as(tests.user_id('alice'));
SELECT throws_like($$SELECT * FROM public.admin_find_users('a')$$, 'Admins only', 'players can''t search users');
SELECT throws_like($$SELECT * FROM public.admin_find_trips('a')$$, 'Admins only', 'or trips');
SELECT throws_ok($$SELECT public.record_user_block(tests.user_id('alice'), tests.user_id('alice'), true, 'x')$$, '42501', NULL,
                 'nobody records a block from the browser');

SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT is((SELECT game_name FROM public.admin_find_users('wonder')), 'AliceWonder', 'find a user by game name');
SELECT is((SELECT id FROM public.admin_find_trips(tests.join_code((SELECT id FROM tr)))), (SELECT id FROM tr), 'find a trip by join code');
SELECT tests.clear_authentication();
SELECT public.record_user_block(tests.user_id('admin'), tests.user_id('alice'), true, 'Spam');
SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT is((SELECT disabled FROM public.admin_find_users('wonder')), true, 'the list shows the account is disabled');
SELECT tests.clear_authentication();
SELECT is((SELECT action || ':' || note FROM public.admin_actions), 'disable_user:Spam', 'and the action is logged');
SELECT throws_like($$SELECT public.record_user_block(tests.user_id('admin'), tests.user_id('admin'), true, 'x')$$,
                   'Admins can''t be disabled here', 'admins can''t be disabled from the app');
SELECT * FROM finish();
ROLLBACK;
