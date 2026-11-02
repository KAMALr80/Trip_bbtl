-- M6-06 Test Lab for the new engine: sandboxes for any room × mode, jump to phase, bots that play.
BEGIN;
\ir ../_helpers.psql
SELECT plan(14);

SELECT tests.create_user('founder', 40);
SELECT tests.create_user('player', 30);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('founder'));
SELECT tests.create_user('bot' || n, 30) FROM generate_series(1, 3) n;
INSERT INTO public.sandbox_bots (user_id, name) SELECT tests.user_id('bot' || n), 'Bot' || n FROM generate_series(1, 3) n;
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.phase(p uuid) RETURNS text LANGUAGE sql AS $$ SELECT phase FROM trip_private.trip_phase(p, now()) $$;

SELECT tests.authenticate_as(tests.user_id('player'));
SELECT throws_like($$SELECT public.lab_engine_create('trip', 'crew', 3, 4)$$, 'Test Lab is founder-only', 'founder only');

SELECT tests.authenticate_as(tests.user_id('founder'));
INSERT INTO ids SELECT 'crew', public.lab_engine_create('trip', 'crew', 3, 4);
INSERT INTO ids SELECT 'home', public.lab_engine_create('explore_culture', 'solo', 1, 3);
SELECT throws_like($$SELECT public.lab_engine_create('window_seat', 'offline', 1, 3)$$, 'This room has no "offline" mode', 'room × mode checked');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = pg_temp.id('crew') AND status = 'approved'), 3,
          'a crew sandbox: the founder and two bots');
SELECT ok((SELECT is_sandbox AND rules_version = 2 FROM public.trips WHERE id = pg_temp.id('crew')), 'a new-engine sandbox');
SELECT is(pg_temp.phase(pg_temp.id('crew')), 'preflight', 'it starts in Pre-Flight');
SELECT ok((SELECT count(*) > 0 FROM public.trip_schedule WHERE trip_id = pg_temp.id('crew') AND kind = 'daily_discovery'),
          'planned like a real trip');

SELECT tests.authenticate_as(tests.user_id('founder'));
SELECT is(public.lab_jump(pg_temp.id('crew'), 'takeoff'), 'takeoff', 'jump to Takeoff');
SELECT is(public.lab_jump(pg_temp.id('crew'), 'trip_season'), 'trip_season', 'jump to Trip Season');
SELECT ok(public.lab_engine_play(pg_temp.id('crew')) ~ '^[1-9][0-9]* actions', 'bots play what is open');
SELECT tests.clear_authentication();
SELECT ok((SELECT count(*) > 0 FROM public.daily_answers d JOIN public.sandbox_bots b ON b.user_id = d.user_id
           WHERE d.trip_id = pg_temp.id('crew')), 'as themselves, through the real functions');
SELECT tests.authenticate_as(tests.user_id('founder'));
SELECT is(public.lab_jump(pg_temp.id('crew'), 'baggage_claim'), 'baggage_claim', 'jump to Baggage Claim');
SELECT is(public.lab_jump(pg_temp.id('crew'), 'locked'), 'locked', 'and past Day 7');
SELECT tests.clear_authentication();
SELECT ok((SELECT locked_at IS NOT NULL FROM public.trips WHERE id = pg_temp.id('crew'))
          AND EXISTS (SELECT 1 FROM public.trip_postcards WHERE trip_id = pg_temp.id('crew')), 'locked with a postcard');
SELECT tests.authenticate_as(tests.user_id('founder'));
SELECT is(public.lab_jump(pg_temp.id('home'), 'takeoff'), 'takeoff', 'at-home rooms jump to Home Missions too');

SELECT * FROM finish();
ROLLBACK;
