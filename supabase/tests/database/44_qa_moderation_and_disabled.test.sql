-- Staging QA, Nov 12 2026: STG-09 (removing an approved photo) and STG-10 (a disabled account's
-- existing token).
BEGIN;
\ir ../_helpers.psql
SELECT plan(14);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('admin', 40);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('admin'));
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), -2, 5, 'a2c', 'UTC', 'UTC');
UPDATE public.trips SET arrived_at = now() - interval '2 days' WHERE id = pg_temp.id('trip');
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('p1'));
INSERT INTO ids SELECT 'item', id FROM public.trip_schedule
WHERE trip_id = pg_temp.id('trip') AND kind = 'airport_mission' AND user_id = tests.user_id('cap') ORDER BY slot LIMIT 1;
INSERT INTO ids SELECT 'item2', id FROM public.trip_schedule
WHERE trip_id = pg_temp.id('trip') AND kind = 'airport_mission' AND user_id = tests.user_id('cap') ORDER BY slot OFFSET 1 LIMIT 1;

-- A proof the crew approved (points approved) and one still waiting (points pending).
CREATE FUNCTION pg_temp.proof(p_key text, p_item text, p_crew text, p_points text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.proofs (trip_id, user_id, schedule_id, part, source, photo_path, crew_status, ai_status, expires_at)
  VALUES (pg_temp.id('trip'), tests.user_id('p1'), pg_temp.id(p_item), 0, 'airport_mission',
          pg_temp.id('trip') || '/' || tests.user_id('p1') || '/' || pg_temp.id(p_item) || '/' || p_key || '.jpg',
          p_crew, 'not_needed', now() + interval '1 day')
  RETURNING id INTO v;
  INSERT INTO ids VALUES (p_key, v);
  PERFORM trip_private.award_points(pg_temp.id('trip'), tests.user_id('p1'), 'trip_season', 'airport_mission',
                                    pg_temp.id(p_item), 4, p_points);
END $$;
SELECT pg_temp.proof('approved', 'item', 'approved', 'approved');
SELECT pg_temp.proof('waiting', 'item2', 'waiting', 'pending');
CREATE FUNCTION pg_temp.points(p_item text) RETURNS text LANGUAGE sql AS $$
  SELECT status FROM public.points_ledger WHERE trip_id = pg_temp.id('trip') AND user_id = tests.user_id('p1')
    AND source = 'airport_mission' AND source_ref = pg_temp.id(p_item) $$;
SELECT is(pg_temp.points('item'), 'approved', 'setup: the approved photo''s points count');

-- ---------------------------------------------------------------- STG-09
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT public.report_proof_photo(pg_temp.id('approved'), 'QA');
SELECT public.report_proof_photo(pg_temp.id('waiting'), 'QA');
SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT lives_ok($$SELECT public.moderate_photo((SELECT id FROM public.moderation_queue() WHERE proof_id = pg_temp.id('approved')), 'remove', 'QA')$$,
                'an approved photo can be removed');
SELECT is((SELECT status FROM public.photo_moderation WHERE proof_id = pg_temp.id('approved')), 'removed', 'it leaves the queue as removed');
SELECT ok(NOT trip_private.proof_photo_ok(pg_temp.id('approved'), tests.user_id('cap')), 'the crew no longer sees it');
SELECT is(pg_temp.points('item'), 'void', 'its approved points are voided');
SELECT lives_ok($$SELECT public.moderate_photo((SELECT id FROM public.moderation_queue() WHERE proof_id = pg_temp.id('waiting')), 'remove', 'QA')$$,
                'a waiting photo can be removed');
SELECT is(pg_temp.points('item2'), 'rejected', 'its pending points are rejected');
SELECT tests.clear_authentication();
SELECT is((SELECT coalesce(sum(points), 0)::int FROM public.points_ledger
           WHERE trip_id = pg_temp.id('trip') AND user_id = tests.user_id('p1') AND status = 'approved'), 0,
          'no points left for removed content');

-- ---------------------------------------------------------------- STG-10
SELECT ok(trip_private.is_trip_member(pg_temp.id('trip'), tests.user_id('p1')), 'setup: p1 is a member');
INSERT INTO public.user_blocks (user_id, disabled, note, changed_by)
VALUES (tests.user_id('p1'), true, 'QA', tests.user_id('admin'));
SELECT ok(NOT trip_private.is_trip_member(pg_temp.id('trip'), tests.user_id('p1')), 'a disabled account is no member');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT * FROM public.trip_roster(pg_temp.id('trip'))$$, 'Not a member',
                   'its old token can''t read the roster');
SELECT is((SELECT count(*)::int FROM public.trips WHERE id = pg_temp.id('trip')), 0, 'or the trip');
SELECT tests.clear_authentication();
UPDATE public.user_blocks SET disabled = false WHERE user_id = tests.user_id('p1');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT count(*)::int FROM public.trip_roster(pg_temp.id('trip'))), 2, 're-enabled: the roster is back');
SELECT tests.clear_authentication();
INSERT INTO public.user_blocks (user_id, disabled, note, changed_by)
VALUES (tests.user_id('cap'), true, 'QA', tests.user_id('admin'));
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT ok(NOT trip_private.is_leader(pg_temp.id('trip')) AND NOT trip_private.is_captain(pg_temp.id('trip')),
          'a disabled Captain has no leader powers');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
