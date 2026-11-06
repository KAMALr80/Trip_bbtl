-- B-22 push addresses, B-25 Storyteller for every guide contributor, B-26 indexes.
BEGIN;
\ir ../_helpers.psql
SELECT plan(19);

SELECT tests.create_user(h, 30) FROM unnest(ARRAY['cap', 'photo', 'writer', 'waiting', 'phone', 'next']) h;
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p $$;

-- ---------------------------------------------------------------- push addresses (B-22)
SELECT tests.authenticate_as(tests.user_id('phone'));
CREATE FUNCTION pg_temp.save(p_url text) RETURNS void LANGUAGE sql AS $$
  SELECT public.save_push_subscription(p_url, repeat('B', 87), repeat('a', 22), 'Test UA')
$$;
SELECT throws_like($$SELECT pg_temp.save('https://evil.example/x')$$, '%aren''t supported', 'any other host is refused');
SELECT throws_like($$SELECT pg_temp.save('https://fcm.googleapis.com.evil.example/x')$$, '%aren''t supported', 'a look-alike host is refused');
SELECT throws_like($$SELECT pg_temp.save('https://fcm.googleapis.com@evil.example/x')$$, '%aren''t supported', 'a host hidden behind user info is refused');
SELECT throws_like($$SELECT pg_temp.save('http://fcm.googleapis.com/x')$$, '%aren''t supported', 'plain http is refused');
SELECT throws_like($$SELECT pg_temp.save('https://169.254.169.254/latest')$$, '%aren''t supported', 'an internal address is refused');
SELECT lives_ok($$SELECT pg_temp.save('https://fcm.googleapis.com/fcm/send/abc')$$, 'Chrome and Android work');
SELECT lives_ok($$SELECT pg_temp.save('https://updates.push.services.mozilla.com/wpush/v2/abc')$$, 'Firefox works');
SELECT lives_ok($$SELECT pg_temp.save('https://web.push.apple.com/abc')$$, 'Safari works');
SELECT lives_ok($$SELECT pg_temp.save('https://wns2-par02p.notify.windows.com/w/?token=abc')$$, 'Edge works');
SELECT pg_temp.save('https://fcm.googleapis.com/fcm/send/n' || n) FROM generate_series(1, 12) n;
SELECT is((SELECT count(*)::int FROM public.push_subscriptions WHERE user_id = auth.uid()), 10, 'a player keeps ten browsers at most');
SELECT ok(EXISTS (SELECT 1 FROM public.push_subscriptions WHERE endpoint LIKE '%/send/n12'), 'and the newest stays');
-- The next person signing in on this browser takes its address over.
SELECT tests.authenticate_as(tests.user_id('next'));
SELECT pg_temp.save('https://fcm.googleapis.com/fcm/send/n12');
SELECT is((SELECT count(*)::int FROM public.push_subscriptions WHERE user_id = auth.uid()), 1, 'the next account on this browser gets its address');
SELECT tests.authenticate_as(tests.user_id('phone'));
SELECT is((SELECT count(*)::int FROM public.push_subscriptions WHERE endpoint LIKE '%/send/n12'), 0, 'and the last account loses it');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- Storyteller (B-25, Q13)
INSERT INTO ids SELECT 'ws', tests.create_trip(tests.user_id('cap'), 14, 4, 'a2c', 'UTC', 'UTC');
UPDATE public.trips SET room = 'window_seat', play_mode = 'crew', passport_country = 'Mexico' WHERE id = pg_temp.id('ws');
SELECT tests.add_member(pg_temp.id('ws'), tests.user_id(h)) FROM unnest(ARRAY['photo', 'writer', 'waiting']) h;
UPDATE public.trips SET start_date = start_date - 28, end_date = end_date - 28 WHERE id = pg_temp.id('ws');
INSERT INTO ids SELECT 'quest', id FROM public.trip_schedule WHERE trip_id = pg_temp.id('ws') AND kind = 'ws_quest' ORDER BY opens_at, slot LIMIT 1;
INSERT INTO ids SELECT 'prompt', id FROM public.trip_schedule WHERE trip_id = pg_temp.id('ws') AND kind = 'journal_prompt' ORDER BY opens_at, slot LIMIT 1;
INSERT INTO public.proofs (trip_id, user_id, schedule_id, source, photo_path, crew_status, expires_at)
VALUES (pg_temp.id('ws'), tests.user_id('photo'), pg_temp.id('quest'), 'sealed_quest', pg_temp.id('ws') || '/p/q/a.jpg', 'approved', now() + interval '1 day'),
       (pg_temp.id('ws'), tests.user_id('waiting'), pg_temp.id('quest'), 'sealed_quest', pg_temp.id('ws') || '/w/q/a.jpg', 'waiting', now() + interval '1 day');
INSERT INTO public.journal_entries (trip_id, user_id, schedule_id, day, prompt, body)
VALUES (pg_temp.id('ws'), tests.user_id('writer'), pg_temp.id('prompt'), current_date, 'p', 'We found a cenote.');
SELECT trip_private.lock_trip(pg_temp.id('ws'), true);
CREATE FUNCTION pg_temp.storyteller(p_user text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT tier || ':' || progress FROM public.user_badges WHERE user_id = tests.user_id(p_user) AND badge = 'storyteller'
$$;
SELECT is(pg_temp.storyteller('writer'), '1:1', 'a journal entry makes a contributor');
SELECT is(pg_temp.storyteller('photo'), '1:1', 'so does an approved photo in the guide (Q13, R-355)');
SELECT is(pg_temp.storyteller('waiting'), NULL, 'a photo nobody approved isn''t in the guide');
SELECT is(pg_temp.storyteller('cap'), NULL, 'and a player who added nothing isn''t a contributor');
-- After the Day 7 purge the file is gone, but the guide still counts.
UPDATE public.proofs SET photo_removed_at = now() WHERE trip_id = pg_temp.id('ws');
DELETE FROM public.user_badges WHERE user_id = tests.user_id('photo');
SELECT trip_private.refresh_passport(tests.user_id('photo'));
SELECT is(pg_temp.storyteller('photo'), '1:1', 'the purge doesn''t take a guide out of the count');

-- ---------------------------------------------------------------- indexes (B-26)
SELECT is((SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY (ARRAY[
             'game_cards_trip_idx', 'passport_stamps_trip_idx', 'photo_moderation_trip_idx', 'moderation_log_moderation_idx',
             'notification_queue_user_idx', 'trip_invites_trip_idx', 'cultural_inspirations_trip_idx',
             'culture_experiences_trip_idx', 'live_sessions_call_night_idx'])), 9,
          'the foreign keys that trip deletion and reminders look up have indexes');

SELECT * FROM finish();
ROLLBACK;
