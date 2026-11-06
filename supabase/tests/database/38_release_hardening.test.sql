-- B-27 orphaned files, B-29 AI reservations, B-30 notification re-claims, and age at the day boundary.
BEGIN;
\ir ../_helpers.psql
SELECT plan(30);

SELECT tests.create_user(h, 30) FROM unnest(ARRAY['cap', 'crew', 'solo', 'other', 'ai1', 'ai2']) h;
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p $$;
CREATE FUNCTION pg_temp.put(p_bucket text, p_path text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES (p_bucket, p_path, NULL)
$$;
CREATE FUNCTION pg_temp.orphans(p_path_like text) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(bucket, ',' ORDER BY bucket) FROM trip_private.orphan_files(5000) WHERE path LIKE p_path_like
$$;

-- ---------------------------------------------------------------- the last Captain leaves (B-27)
INSERT INTO ids SELECT 'alone', tests.create_trip(tests.user_id('solo'), 10, 3, 'a2c', 'UTC', 'UTC');
INSERT INTO ids SELECT 'crewed', tests.create_trip(tests.user_id('cap'), 10, 3, 'a2c', 'UTC', 'UTC');
SELECT tests.add_member(pg_temp.id('crewed'), tests.user_id('crew'));
SELECT pg_temp.put(b, pg_temp.id('alone') || '/' || tests.user_id('solo') || '/x/a.jpg')
FROM unnest(ARRAY['quest-proofs', 'trip-photos', 'window-guide', 'player-avatars']) b;
SELECT pg_temp.put('quest-proofs', pg_temp.id('crewed') || '/' || tests.user_id('crew') || '/x/a.jpg');
SELECT pg_temp.put('quest-proofs', 'not-a-trip-folder/a.jpg');
SELECT pg_temp.put('player-avatars', 'account/' || tests.user_id('crew') || '/me.jpg');

SELECT is(pg_temp.orphans(pg_temp.id('alone') || '/%'), NULL, 'nothing is an orphan while the trip exists');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.leave_trip(pg_temp.id('crewed'))$$, 'Pass the crown before leaving', 'a Captain with a crew can''t just leave');
SELECT tests.authenticate_as(tests.user_id('solo'));
SELECT public.leave_trip(pg_temp.id('alone'));
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.trips WHERE id = pg_temp.id('alone')), 0, 'a Captain alone leaving deletes the trip');
SELECT is(pg_temp.orphans(pg_temp.id('alone') || '/%'), 'player-avatars,quest-proofs,trip-photos,window-guide',
          'and every one of its files is listed for deletion');
SELECT is(pg_temp.orphans(pg_temp.id('crewed') || '/%'), NULL, 'another trip''s files are not');
SELECT is(pg_temp.orphans('not-a-trip-folder/%'), NULL, 'files outside a trip folder are not');
SELECT is(pg_temp.orphans('account/%'), NULL, 'account photos are not');

-- A file still in use by another row stays, even in a deleted trip's folder.
INSERT INTO ids SELECT 'gone', tests.create_trip(tests.user_id('other'), 10, 3, 'a2c', 'UTC', 'UTC');
SELECT pg_temp.put('player-avatars', pg_temp.id('gone') || '/' || tests.user_id('other') || '/me.jpg');
SELECT pg_temp.put('player-avatars', pg_temp.id('gone') || '/' || tests.user_id('other') || '/old.jpg');
INSERT INTO public.player_profiles (user_id, real_name, game_name, avatar_style, avatar_path)
VALUES (tests.user_id('other'), 'Other', 'other', 'photo', pg_temp.id('gone') || '/' || tests.user_id('other') || '/me.jpg');
DELETE FROM public.trips WHERE id = pg_temp.id('gone');
SELECT is(pg_temp.orphans('%' || tests.user_id('other') || '/me.jpg'), NULL, 'a profile photo in a deleted trip''s folder stays');
SELECT is(pg_temp.orphans('%' || tests.user_id('other') || '/old.jpg'), 'player-avatars', 'the unused photo next to it goes');

-- Cards and experiences.
SELECT pg_temp.put('inspiration-photos', gen_random_uuid() || '/' || tests.user_id('crew') || '/card.jpg');
SELECT pg_temp.put('culture-photos', gen_random_uuid() || '/' || tests.user_id('crew') || '/exp.jpg');
SELECT is(pg_temp.orphans('%/card.jpg'), 'inspiration-photos', 'a deleted card''s photo is listed');
SELECT is(pg_temp.orphans('%/exp.jpg'), 'culture-photos', 'a deleted experience''s photo is listed');

-- Retry: the listing holds no state, so what wasn't removed comes up again; what was, doesn't.
SELECT is((SELECT count(*)::int FROM trip_private.orphan_files(1)), 1, 'it respects the batch size');
SELECT ok((SELECT count(*) > 0 FROM trip_private.orphan_files(5000) WHERE path LIKE pg_temp.id('alone') || '/%'), 'a failed run leaves them for the next');
SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects WHERE name LIKE pg_temp.id('alone') || '/%';
SELECT is(pg_temp.orphans(pg_temp.id('alone') || '/%'), NULL, 'and once removed they are gone from the list');

-- Unauthorized callers.
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_ok($$SELECT * FROM public.orphan_files()$$, '42501', NULL, 'a player can''t list orphaned files');
SELECT tests.authenticate_as_anon();
SELECT throws_ok($$SELECT * FROM public.orphan_files()$$, '42501', NULL, 'nor can a signed-out visitor');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- AI reservations (B-29)
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid = 'trip_private.ai_gate(text, uuid, uuid)'::regprocedure), 'v',
          'the gate re-reads the count after waiting for its lock');
UPDATE public.app_settings SET ai_enabled = true, ai_daily_user_cap = 2, ai_daily_global_cap = 1000;
SELECT ok(public.ai_reserve_server('proof_check', NULL, tests.user_id('ai1')) IS NOT NULL, 'the first call is reserved');
SELECT is((SELECT count(*)::int FROM public.ai_usage WHERE user_id = tests.user_id('ai1')), 1, 'and counts before the model is called');
SELECT ok(public.ai_reserve_server('proof_check', NULL, tests.user_id('ai1')) IS NOT NULL, 'the second too');
SELECT is(public.ai_reserve_server('proof_check', NULL, tests.user_id('ai1')), NULL, 'the third is over this player''s cap');
SELECT ok(public.ai_reserve_server('proof_check', NULL, tests.user_id('ai2')) IS NOT NULL, 'another player still has room');
UPDATE public.app_settings SET ai_enabled = false;
SELECT is(public.ai_reserve_server('proof_check', NULL, tests.user_id('ai2')), NULL, 'the kill switch stops everyone');
UPDATE public.app_settings SET ai_enabled = true;
SELECT tests.authenticate_as(tests.user_id('ai1'));
SELECT throws_ok($$SELECT public.ai_reserve_server('proof_check', NULL, auth.uid())$$, '42501', NULL, 'a player can''t reserve app-paid AI');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- re-claimed sends (B-30)
INSERT INTO public.notification_queue (id, user_id, trip_id, type, title, body, send_after, dedupe_key, status, claimed_at, attempts)
VALUES ('00000000-0000-4000-8000-00000000f001', tests.user_id('crew'), pg_temp.id('crewed'), 'crew_check', 't', 'b', now(), 'r1', 'sending', now() - interval '11 minutes', 5),
       ('00000000-0000-4000-8000-00000000f002', tests.user_id('other'), pg_temp.id('crewed'), 'crew_check', 't', 'b', now(), 'r2', 'sending', now() - interval '11 minutes', 1),
       ('00000000-0000-4000-8000-00000000f003', tests.user_id('crew'), pg_temp.id('crewed'), 'crew_check', 't', 'b', now(), 'r3', 'sending', now() - interval '11 minutes', 1),
       ('00000000-0000-4000-8000-00000000f004', tests.user_id('crew'), pg_temp.id('crewed'), 'crew_check', 't', 'b', now(), 'r4', 'sending', now() - interval '1 minute', 1);
SELECT count(*) FROM trip_private.claim_notifications(1000, NULL);
CREATE FUNCTION pg_temp.queue(p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT status || ':' || attempts FROM public.notification_queue WHERE dedupe_key = p_key
$$;
SELECT is(pg_temp.queue('r1'), 'failed:5', 'a send that keeps dying stops at the attempt limit');
SELECT is(pg_temp.queue('r2'), 'skipped:1', 'one for a player who left the trip is dropped');
SELECT is(pg_temp.queue('r3'), 'sending:2', 'one for a current player is tried again (at-least-once)');
SELECT is(pg_temp.queue('r4'), 'sending:1', 'one still being sent is left alone');

-- ---------------------------------------------------------------- age on the day (R-904)
UPDATE public.player_private SET dob = (current_date - interval '18 years')::date WHERE user_id = tests.user_id('ai1');
SELECT is(trip_private.age_of(tests.user_id('ai1')), 18, 'a player is 18 on their birthday');
UPDATE public.player_private SET dob = (current_date - interval '18 years' + interval '1 day')::date WHERE user_id = tests.user_id('ai1');
SELECT is(trip_private.age_of(tests.user_id('ai1')), 17, 'and 17 the day before');

SELECT * FROM finish();
ROLLBACK;
