-- M6-02 image moderation (flags only, R-905) and the AI verdict + safety rules (M6-01, Q3).
BEGIN;
\ir ../_helpers.psql
SELECT plan(19);

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
CREATE FUNCTION pg_temp.proof(p_key text, p_part int, p_ai text DEFAULT 'pending') RETURNS void LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.proofs (trip_id, user_id, schedule_id, part, source, photo_path, crew_status, ai_status, expires_at)
  VALUES (pg_temp.id('trip'), tests.user_id('p1'), pg_temp.id('item'), p_part, 'airport_mission',
          pg_temp.id('trip') || '/' || tests.user_id('p1') || '/' || pg_temp.id('item') || '/' || p_key || '.jpg',
          'waiting', p_ai, now() + interval '1 day')
  RETURNING id INTO v;
  INSERT INTO ids VALUES (p_key, v);
END $$;
SELECT pg_temp.proof('clean', 0), pg_temp.proof('unsafe', 1), pg_temp.proof('reported', 2, 'not_needed');

-- ---------------------------------------------------------------- AI verdicts (Q3)
SELECT trip_private.set_proof_ai(pg_temp.id('clean'), 'pass', 'square found', NULL);
SELECT is((SELECT crew_status FROM public.proofs WHERE id = pg_temp.id('clean')), 'approved', 'an AI pass approves the proof');
SELECT trip_private.set_proof_ai(pg_temp.id('unsafe'), 'pass', 'square found', '{"safety":["nudity"]}');
SELECT is((SELECT ai_status || '/' || crew_status FROM public.proofs WHERE id = pg_temp.id('unsafe')), 'unsure/waiting',
          'a pass with a safety flag doesn''t approve; it goes to the crew');
SELECT is((SELECT status FROM public.photo_moderation WHERE proof_id = pg_temp.id('unsafe')), 'flagged', 'and the photo is flagged');
SELECT is((SELECT count(*)::int FROM public.moderation_log WHERE action = 'ai_flag'), 1, 'logged');

-- ---------------------------------------------------------------- hidden from the crew until reviewed
SELECT ok(NOT trip_private.proof_photo_ok(pg_temp.id('unsafe'), tests.user_id('cap')), 'the crew (even the Captain) can''t see a flagged photo');
SELECT ok(trip_private.proof_photo_ok(pg_temp.id('unsafe'), tests.user_id('p1')), 'its uploader still can');
SELECT ok(trip_private.proof_photo_ok(pg_temp.id('clean'), tests.user_id('cap')), 'a clean photo stays visible');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT photo_path FROM public.crew_check(pg_temp.id('trip')) WHERE id = pg_temp.id('unsafe')), NULL,
          'Crew Check shows the proof without its photo');
SELECT throws_like($$SELECT * FROM public.moderation_queue()$$, 'Admins only', 'players can''t open the queue');

-- ---------------------------------------------------------------- reports
SELECT lives_ok($$SELECT public.report_proof_photo(pg_temp.id('reported'), 'Not our trip')$$, 'the Captain reports a photo');
SELECT lives_ok($$SELECT public.report_proof_photo(pg_temp.id('reported'), 'again')$$, 'reporting twice is a no-op');
SELECT tests.clear_authentication();
SELECT is((SELECT reports FROM public.photo_moderation WHERE proof_id = pg_temp.id('reported')), 1, 'one report per player');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT ok(trip_private.proof_photo_ok(pg_temp.id('reported'), tests.user_id('cap')), 'a report alone doesn''t hide the photo');
SELECT throws_like($$SELECT public.report_proof_photo(pg_temp.id('unsafe'), NULL)$$, 'You can report a crew photo you can see',
                   'nobody reports a photo they can''t see');

-- ---------------------------------------------------------------- review
SELECT tests.authenticate_as(tests.user_id('admin'));
SELECT is((SELECT string_agg(status, ',' ORDER BY status) FROM public.moderation_queue()), 'flagged,reported', 'the queue, flagged first');
SELECT ok((SELECT photo_path IS NOT NULL FROM public.moderation_queue() WHERE proof_id = pg_temp.id('unsafe'))
          AND trip_private.proof_photo_ok(pg_temp.id('unsafe'), tests.user_id('admin')), 'reviewers see the photo with its context');
SELECT public.moderate_photo((SELECT id FROM public.moderation_queue() WHERE proof_id = pg_temp.id('unsafe')), 'approve', 'False alarm');
SELECT ok(trip_private.proof_photo_ok(pg_temp.id('unsafe'), tests.user_id('cap')), 'approved: the crew sees it again');
SELECT public.moderate_photo((SELECT id FROM public.moderation_queue() WHERE proof_id = pg_temp.id('reported')), 'remove', 'Not appropriate');
SELECT ok(NOT trip_private.proof_photo_ok(pg_temp.id('reported'), tests.user_id('cap')), 'removed: hidden for good (never deleted)');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.moderation_log WHERE actor = tests.user_id('admin')), 2, 'every decision is logged');

SELECT * FROM finish();
ROLLBACK;
