-- M1-01: archive mode. Archived trips (rules_version = 1) stay readable but players can't change
-- them; deleting, leaving and moderation still work; system jobs and app admins are not blocked.
BEGIN;
\ir ../_helpers.psql
SELECT plan(23);

SELECT tests.create_user('admin', 40);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('admin'));
SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
SELECT tests.create_user('newbie', 25);

CREATE TEMP TABLE f AS SELECT
  tests.create_trip(tests.user_id('cap'), 0, 5) AS old_trip,     -- departs today: missions open
  tests.create_trip(tests.user_id('cap'), 0, 5) AS kept_trip,    -- mid-trip group, kept playing
  tests.create_trip(tests.user_id('cap'), 0, 5) AS doomed_trip;
GRANT SELECT ON f TO PUBLIC;
SELECT tests.add_member(old_trip, tests.user_id('p1')), tests.add_member(old_trip, tests.user_id('p2')),
       tests.add_member(kept_trip, tests.user_id('p1')), tests.add_member(doomed_trip, tests.user_id('p1'))
FROM f;
UPDATE public.trips SET require_approval = false WHERE id = (SELECT old_trip FROM f);
-- Keep other trips (e.g. the local seed) out of this test's cutover.
UPDATE public.trips SET created_at = now() + interval '1 day'
WHERE id NOT IN (SELECT unnest(ARRAY[old_trip, kept_trip, doomed_trip]) FROM f);

-- Every table with a trip_id carries the guard, except the deliberate allowlist in the migration.
-- A new trip table needs its own trigger: CREATE TRIGGER <table>_archive_guard ... guard_archived_trip().
SELECT is(
  (SELECT array_agg(c.table_name::text ORDER BY c.table_name) FROM information_schema.columns c
   JOIN information_schema.tables tb USING (table_schema, table_name)
   WHERE c.table_schema = 'public' AND c.column_name = 'trip_id' AND tb.table_type = 'BASE TABLE'
     AND c.table_name NOT IN ('ai_usage', 'bug_reports', 'checkin_responses', 'content_seen', 'content_topups',
                              'content_variants', 'orders', 'photo_removed', 'photo_reports', 'trip_deletion_log',
                              'trip_feedback', 'trip_role_changes', 'sandbox_bots', 'sandbox_trips')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = ('public.' || quote_ident(c.table_name))::regclass
                       AND t.tgname = c.table_name || '_archive_guard')),
  NULL, 'every trip table has the archive guard trigger');

SELECT is((SELECT count(*)::int FROM public.trips WHERE id IN (SELECT old_trip FROM f) AND rules_version = 2), 1,
          'trips are current (rules_version 2) until someone archives them');

-- ---------------------------------------------------------------- archiving is admin-only and logged
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.archive_legacy_trips(now() + interval '1 minute', '{}', 'x')$$, 'App admins only',
                   'a Captain cannot archive trips');
SELECT throws_like($$SELECT public.set_trip_archived((SELECT old_trip FROM f), true, 'x')$$, 'App admins only',
                   'a Captain cannot archive their own trip');

SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT is(public.archive_legacy_trips(now() + interval '1 minute', ARRAY[(SELECT kept_trip FROM f)], 'M1 cutover test'), 2,
          'the admin archives every trip created before the cutover except the kept one');
SELECT tests.clear_authentication();
SELECT is((SELECT rules_version FROM public.trips WHERE id = (SELECT kept_trip FROM f)), 2::smallint, 'the kept trip stays current');
SELECT is((SELECT count(*)::int FROM trip_private.trip_archive_log WHERE note = 'M1 cutover test' AND archived), 2,
          'each archived trip is logged');

-- ---------------------------------------------------------------- players can read but not play
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT rules_version FROM public.trips WHERE id = (SELECT old_trip FROM f)), 1::smallint,
          'members can still read an archived trip and see that it is archived');
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = (SELECT old_trip FROM f)), 3,
          'members can still see the crew');
SELECT throws_like($$SELECT public.mission_action((SELECT old_trip FROM f), 'reveal', 1)$$, 'TRIP_ARCHIVED:%',
                   'no Airport Mission can be revealed on an archived trip');
SELECT lives_ok($$SELECT public.mission_action((SELECT kept_trip FROM f), 'reveal', 1)$$,
                'the kept trip still plays');

SELECT tests.authenticate_as(tests.user_id('newbie'));
SELECT throws_like($$SELECT public.join_trip(tests.join_code((SELECT old_trip FROM f)))$$, 'TRIP_ARCHIVED:%',
                   'nobody can join an archived trip');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.manage_trip_member((SELECT old_trip FROM f), tests.user_id('p1'), 'promote')$$, 'TRIP_ARCHIVED:%',
                   'roles can''t change on an archived trip');
SELECT throws_like($$SELECT public.confirm_departure((SELECT old_trip FROM f))$$, 'TRIP_ARCHIVED:%',
                   'the trip row itself can''t change');
SELECT lives_ok($$SELECT public.manage_trip_member((SELECT old_trip FROM f), tests.user_id('p2'), 'remove')$$,
                'the Captain can still remove a player');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = (SELECT old_trip FROM f) AND user_id = tests.user_id('p2')), 0,
          'the removed player is gone');

SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT lives_ok($$SELECT public.leave_trip((SELECT old_trip FROM f))$$, 'a player can still leave an archived trip');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT lives_ok($$SELECT public.delete_trip((SELECT doomed_trip FROM f), 'DELETE')$$, 'the Captain can still delete an archived trip');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.trips WHERE id = (SELECT doomed_trip FROM f)), 0, 'the archived trip is deleted');

-- ---------------------------------------------------------------- system jobs and admins pass
SELECT lives_ok($$INSERT INTO public.mission_claims (trip_id, user_id, slot, category, mission_text, points, phase)
                  VALUES ((SELECT old_trip FROM f), tests.user_id('cap'), 1, 'x', 'x', 2, 'takeoff')$$,
                'system context (cron, migrations, service role: no auth.uid) is not blocked');

SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT lives_ok($$SELECT public.set_trip_archived((SELECT old_trip FROM f), false, 'restore test')$$, 'the admin restores a trip');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT rules_version FROM public.trips WHERE id = (SELECT old_trip FROM f)), 2::smallint, 'the restored trip is current again');
SELECT lives_ok($$SELECT public.confirm_departure((SELECT old_trip FROM f))$$, 'and plays again');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
