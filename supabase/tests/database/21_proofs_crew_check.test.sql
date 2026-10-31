-- M3-06 proofs + Crew Check, M3-14 AI verdicts: pending points, one 👍 from someone else, 24h
-- expiry, solo self-honor, teen photo privacy.
BEGIN;
\ir ../_helpers.psql
SELECT plan(22);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
-- In Pre-Flight with a call night tomorrow, so everyone's sealed quest is open.
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 3, 4, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET preflight_days = 5 WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p2'));
INSERT INTO public.call_nights (trip_id, starts_at) VALUES ((SELECT id FROM ids WHERE k = 'trip'), now() + interval '1 day');

CREATE FUNCTION pg_temp.item(p_kind text, p_user text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND kind = p_kind
    AND user_id = tests.user_id(p_user)
$$;
INSERT INTO ids VALUES ('q1', pg_temp.item('sealed_quest', 'p1')), ('q2', pg_temp.item('sealed_quest', 'p2')),
                       ('show1', pg_temp.item('showcase', 'p1'));
-- Sealed quests are opened (revealed) before a proof; 23_reveal_and_drops covers opening.
UPDATE public.trip_schedule SET revealed_at = now() WHERE kind = 'sealed_quest';
-- A photo in storage for p1's quest.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('quest-proofs', (SELECT id FROM ids WHERE k = 'trip') || '/' || tests.user_id('p1') || '/' || (SELECT id FROM ids WHERE k = 'q1') || '/a.jpg',
        tests.user_id('p1'));
CREATE FUNCTION pg_temp.photo(p_item text, p_user text) RETURNS text LANGUAGE sql AS $$
  SELECT (SELECT id FROM ids WHERE k = 'trip') || '/' || tests.user_id(p_user) || '/' || (SELECT id FROM ids WHERE k = p_item) || '/a.jpg'
$$;

-- ---------------------------------------------------------------- send
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.submit_proof((SELECT id FROM ids WHERE k = 'q2'), NULL, 'done')$$, 'That isn''t one of your quests',
                   'only your own quests');
SELECT throws_like($$SELECT public.submit_proof((SELECT id FROM ids WHERE k = 'q1'), pg_temp.photo('q1', 'p2'), NULL)$$, 'Upload your photo first',
                   'the photo has to be in your own folder');
SELECT throws_like($$SELECT public.submit_proof((SELECT id FROM ids WHERE k = 'q1'), NULL, '  ')$$, 'Add a photo or a few words',
                   'an empty proof is refused');
INSERT INTO ids SELECT 'proof1', public.submit_proof((SELECT id FROM ids WHERE k = 'q1'), pg_temp.photo('q1', 'p1'), NULL);
SELECT is((SELECT status FROM public.points_ledger WHERE source = 'sealed_quest'), 'pending', 'the points wait for the crew');
SELECT is((SELECT points FROM public.trip_standings((SELECT id FROM ids WHERE k = 'trip'), 'preflight') WHERE user_id = auth.uid()), 0,
          'pending points don''t count yet');
INSERT INTO ids SELECT 'proof2', public.submit_proof((SELECT id FROM ids WHERE k = 'show1'), NULL, 'My three-minute pitch is ready');
SELECT throws_like($$SELECT public.approve_proof((SELECT id FROM ids WHERE k = 'proof1'))$$, 'You can''t approve your own proof',
                   'no approving yourself (R-402, R-411)');
SELECT is((SELECT count(*)::int FROM public.crew_check((SELECT id FROM ids WHERE k = 'trip'))), 0, 'your own proofs aren''t in your Crew Check');

-- ---------------------------------------------------------------- the crew checks
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is((SELECT count(*)::int FROM public.crew_check((SELECT id FROM ids WHERE k = 'trip'))), 2, 'Crew Check: "2 to check" (R-412)');
SELECT is((SELECT photo_path FROM public.crew_check((SELECT id FROM ids WHERE k = 'trip')) WHERE id = (SELECT id FROM ids WHERE k = 'proof1')),
          pg_temp.photo('q1', 'p1'), 'the crew sees the photo');
SELECT ok(trip_private.proof_read_ok(pg_temp.photo('q1', 'p1')), 'and storage lets them load it');
SELECT ok(public.approve_proof((SELECT id FROM ids WHERE k = 'proof1')), 'one 👍 approves it');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT ok(NOT public.approve_proof((SELECT id FROM ids WHERE k = 'proof1')), 'a second 👍 changes nothing');
SELECT tests.clear_authentication();
SELECT is((SELECT status || ':' || points FROM public.points_ledger WHERE source = 'sealed_quest'), 'approved:10', 'the points count now');
SELECT is((SELECT count(*)::int FROM public.proof_votes), 2, 'both votes are recorded');

-- ---------------------------------------------------------------- 24 hours without a 👍
UPDATE public.proofs SET expires_at = now() - interval '1 minute' WHERE id = (SELECT id FROM ids WHERE k = 'proof2');
SELECT is(trip_private.expire_proofs(), 1, 'the expiry job finds it');
SELECT is((SELECT status FROM public.points_ledger WHERE source = 'showcase'), 'rejected', 'no 👍 within 24h = not approved (R-411)');
SELECT ok(EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-proofs' AND schedule = '*/5 * * * *'), 'it runs every 5 minutes');

-- ---------------------------------------------------------------- AI verdicts (M3-14, Q3)
INSERT INTO ids VALUES ('q2proof', NULL);
SELECT tests.authenticate_as(tests.user_id('p2'));
UPDATE ids SET id = public.submit_proof((SELECT id FROM ids WHERE k = 'q2'), NULL, 'Sketched the tower') WHERE k = 'q2proof';
SELECT tests.clear_authentication();
SELECT trip_private.set_proof_ai((SELECT id FROM ids WHERE k = 'q2proof'), 'fail', 'not a sketch');
SELECT is((SELECT crew_status FROM public.proofs WHERE id = (SELECT id FROM ids WHERE k = 'q2proof')), 'waiting',
          'an AI fail only flags it; the crew still decides');
SELECT trip_private.set_proof_ai((SELECT id FROM ids WHERE k = 'q2proof'), 'pass', NULL);
SELECT is((SELECT status FROM public.points_ledger WHERE source = 'sealed_quest' AND user_id = tests.user_id('p2')), 'approved',
          'an AI pass approves on its own');

-- ---------------------------------------------------------------- teen privacy and solo
UPDATE public.trips SET has_minors = true, vibe = 'family' WHERE id = (SELECT id FROM ids WHERE k = 'trip');
UPDATE public.proofs SET crew_status = 'waiting', approved_by = NULL, expires_at = now() + interval '1 day' WHERE id = (SELECT id FROM ids WHERE k = 'proof1');
UPDATE public.points_ledger SET status = 'pending' WHERE source = 'sealed_quest' AND user_id = tests.user_id('p1');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is((SELECT photo_path FROM public.crew_check((SELECT id FROM ids WHERE k = 'trip')) WHERE id = (SELECT id FROM ids WHERE k = 'proof1')),
          NULL, 'with minors in the trip, other players don''t see the photo');
SELECT throws_like($$SELECT public.approve_proof((SELECT id FROM ids WHERE k = 'proof1'))$$, '%Captain or Co-Captain checks photos',
                   'and leaders check it instead');
SELECT tests.clear_authentication();

UPDATE public.trips SET play_mode = 'solo' WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.authenticate_as(tests.user_id('cap'));
INSERT INTO ids SELECT 'solo', public.submit_proof(pg_temp.item('showcase', 'cap'), NULL, 'Done!');
SELECT is((SELECT crew_status FROM public.proofs WHERE id = (SELECT id FROM ids WHERE k = 'solo')), 'not_needed', 'solo self-honors (R-414)');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
