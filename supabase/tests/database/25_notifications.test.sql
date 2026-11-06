-- M4-07 – M4-09: reminders. Quiet hours, planning from the schedule (and re-planning), muting,
-- Crew Check and expiry events, Game Night live, the sender's claim/finish, and who may touch what.
BEGIN;
\ir ../_helpers.psql
SELECT plan(33);

-- ---------------------------------------------------------------- quiet hours (R-812)
SELECT is(trip_private.quiet_shift('2026-11-01 15:00+00', 'UTC', '22:00', '08:00', NULL),
          '2026-11-01 15:00+00'::timestamptz, 'outside quiet hours: unchanged');
SELECT is(trip_private.quiet_shift('2026-11-01 23:30+00', 'UTC', '22:00', '08:00', NULL),
          '2026-11-02 08:00+00'::timestamptz, 'late evening moves to the morning');
SELECT is(trip_private.quiet_shift('2026-11-02 03:00+00', 'UTC', '22:00', '08:00', NULL),
          '2026-11-02 08:00+00'::timestamptz, 'small hours move to the same morning');
SELECT is(trip_private.quiet_shift('2026-11-01 23:30+00', 'UTC', '22:00', '08:00', '2026-11-02 01:00+00'),
          '2026-11-01 21:55+00'::timestamptz, 'a deadline before morning: just before quiet hours start');
SELECT is(trip_private.quiet_shift('2026-11-01 15:30+00', 'Asia/Makassar', '22:00', '08:00', NULL),
          '2026-11-02 00:00+00'::timestamptz, 'measured in the player''s zone (23:30 in Bali → 08:00 Bali)');
SELECT is(trip_private.quiet_shift('2026-11-01 13:00+00', 'UTC', '12:00', '14:00', NULL),
          '2026-11-01 14:00+00'::timestamptz, 'a daytime quiet window works too');
SELECT is(trip_private.quiet_shift('2026-11-01 23:59+00', 'UTC', '22:00', '08:00', '2026-11-02 00:00+00',
                                   '2026-11-01 23:59+00'), NULL,
          'content that opens and closes inside quiet hours is never sent before it opens');

-- ---------------------------------------------------------------- planning from the schedule
SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
-- Takeoff in 3 days, 5 days of Pre-Flight, a call night in two days.
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 3, 4, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET preflight_days = 5 WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p2'));
INSERT INTO public.call_nights (trip_id, starts_at) VALUES ((SELECT id FROM ids WHERE k = 'trip'), now() + interval '2 days');
INSERT INTO ids SELECT 'night', id FROM public.call_nights WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip');
CREATE FUNCTION pg_temp.queued(p_user text, p_type text) RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*)::int FROM public.notification_queue
  WHERE user_id = tests.user_id(p_user) AND type = p_type AND status = 'queued'
$$;

SELECT ok(pg_temp.queued('p1', 'daily') > 0, 'each player gets Daily Discovery reminders');
SELECT is(pg_temp.queued('p1', 'night_soon'), 1, 'one "call night in an hour" per player');
SELECT is((SELECT send_after FROM public.notification_queue WHERE type = 'night_soon' AND user_id = tests.user_id('p1')),
          (SELECT starts_at - interval '1 hour' FROM public.call_nights WHERE id = (SELECT id FROM ids WHERE k = 'night')),
          'an hour before the call night');
SELECT ok(pg_temp.queued('p1', 'missions_open') = 1 AND pg_temp.queued('p1', 'preflight_closing') = 1,
          'travel-day reminders are planned');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.notification_queue q
                      WHERE q.type = 'daily' AND q.status = 'queued' AND q.trip_id = (SELECT id FROM ids WHERE k = 'trip')
                        AND (q.send_after AT TIME ZONE 'UTC')::time < time '08:00'),
          'Daily Discovery goes out at 8 AM or later, never in quiet hours');
SELECT ok((SELECT bool_and(body <> '') FROM public.notification_queue WHERE type = 'daily'
           AND trip_id = (SELECT id FROM ids WHERE k = 'trip')),
          'the daily push carries the tip itself (R-313)');

-- Re-planning: the Captain moves the call night; its reminder moves, no duplicate.
UPDATE public.call_nights SET starts_at = now() + interval '2 days 3 hours' WHERE id = (SELECT id FROM ids WHERE k = 'night');
SELECT trip_private.plan_trip((SELECT id FROM ids WHERE k = 'trip'));
SELECT is(pg_temp.queued('p1', 'night_soon'), 1, 'moving a call night keeps one reminder');
SELECT is((SELECT send_after FROM public.notification_queue WHERE type = 'night_soon' AND user_id = tests.user_id('p1')),
          (SELECT starts_at - interval '1 hour' FROM public.call_nights WHERE id = (SELECT id FROM ids WHERE k = 'night')),
          'and it moves with the night');

-- ---------------------------------------------------------------- settings
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT count(*)::int FROM public.my_notification_settings()), 13, 'every reminder type is listed (wrap-up added in M5-02)');
SELECT public.set_notification_pref('daily', false, false);
SELECT is(pg_temp.queued('p1', 'daily'), 0, 'muting a type drops what was queued');
SELECT ok(pg_temp.queued('p2', 'daily') > 0, 'only for that player');
SELECT tests.clear_authentication();
SELECT trip_private.plan_notifications((SELECT id FROM ids WHERE k = 'trip'));
SELECT is(pg_temp.queued('p1', 'daily'), 0, 'and re-planning doesn''t bring it back');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT public.set_notification_pref('daily', true, false);
SELECT ok(pg_temp.queued('p1', 'daily') > 0, 'turning it back on plans it again');
SELECT throws_like($$SELECT public.set_notification_pref('nonsense', true, true)$$, 'Unknown reminder type',
                   'only known types');
SELECT throws_like($$SELECT count(*) FROM public.notification_queue$$, '%permission denied%',
                   'players can''t read the queue');
SELECT throws_like($$SELECT * FROM public.claim_notifications()$$, '%permission denied%',
                   'or run the sender');
SELECT throws_like($$SELECT public.queue_test_notification()$$, 'Turn on notifications on this phone first',
                   'a test needs a subscription');
SELECT public.save_push_subscription('https://fcm.googleapis.com/fcm/send/abc', repeat('B', 87), repeat('a', 22), 'Test UA');
SELECT ok(public.queue_test_notification() IS NOT NULL, 'then a test is queued for right now');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is((SELECT count(*)::int FROM public.push_subscriptions), 0, 'nobody sees another player''s subscriptions');

-- ---------------------------------------------------------------- events
SELECT tests.clear_authentication();
INSERT INTO public.proofs (trip_id, user_id, schedule_id, source, body, crew_status, expires_at)
SELECT (SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'), s.id, 'sealed_quest', 'Done!', 'waiting', now() + interval '1 day'
FROM public.trip_schedule s WHERE s.trip_id = (SELECT id FROM ids WHERE k = 'trip') AND s.kind = 'sealed_quest'
  AND s.user_id = tests.user_id('p1') LIMIT 1;
SELECT ok(pg_temp.queued('cap', 'crew_check') = 1 AND pg_temp.queued('p2', 'crew_check') = 1
          AND pg_temp.queued('p1', 'crew_check') = 0, 'a proof waiting tells the rest of the crew, not its owner');
INSERT INTO public.proofs (trip_id, user_id, schedule_id, source, body, crew_status, expires_at)
SELECT (SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'), s.id, 'showcase', 'Also done', 'waiting', now() + interval '1 day'
FROM public.trip_schedule s WHERE s.trip_id = (SELECT id FROM ids WHERE k = 'trip') AND s.kind = 'showcase'
  AND s.user_id = tests.user_id('p1') LIMIT 1;
SELECT is(pg_temp.queued('cap', 'crew_check'), 1, 'a second one the same half-day shares the reminder (max 2 a day)');
UPDATE public.proofs SET expires_at = now() - interval '1 minute' WHERE source = 'sealed_quest';
SELECT trip_private.expire_proofs();
SELECT is(pg_temp.queued('p1', 'proof_expired'), 1, 'an expired proof tells its owner');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT public.open_live((SELECT id FROM ids WHERE k = 'trip'), NULL);
SELECT ok(pg_temp.queued('p1', 'night_live') = 1 AND pg_temp.queued('cap', 'night_live') = 0,
          'opening Game Night tells everyone but the one who opened it');

-- ---------------------------------------------------------------- the sender
SELECT tests.clear_authentication();
UPDATE public.notification_queue SET send_after = now() - interval '1 minute'
WHERE type = 'proof_expired' AND user_id = tests.user_id('p1');
CREATE TEMP TABLE claimed AS SELECT * FROM public.claim_notifications(100, tests.user_id('p1'));
SELECT ok((SELECT count(*) FROM claimed WHERE type = 'proof_expired') = 1
          AND (SELECT jsonb_array_length(subscriptions) FROM claimed WHERE type = 'proof_expired') = 1,
          'claim hands over due rows with the player''s subscriptions');
SELECT public.finish_notifications(jsonb_build_array(jsonb_build_object(
  'id', (SELECT id FROM claimed WHERE type = 'proof_expired'), 'outcome', 'retry', 'error', 'push service busy')));
SELECT ok((SELECT status = 'queued' AND send_after > now() AND attempts = 1 FROM public.notification_queue
           WHERE id = (SELECT id FROM claimed WHERE type = 'proof_expired')), 'a retry waits and counts the attempt');
UPDATE public.notification_queue SET send_after = now() - interval '1 minute'
WHERE id = (SELECT id FROM claimed WHERE type = 'proof_expired');
SELECT public.finish_notifications(
  (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'outcome', 'sent', 'channel', 'push',
                                       'gone', jsonb_build_array('https://fcm.googleapis.com/fcm/send/abc')))
   FROM public.claim_notifications(100, tests.user_id('p1')) c));
SELECT ok((SELECT status = 'sent' AND channel = 'push' FROM public.notification_queue
           WHERE id = (SELECT id FROM claimed WHERE type = 'proof_expired'))
          AND NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE endpoint = 'https://fcm.googleapis.com/fcm/send/abc'),
          'sent is recorded, and a subscription the push service says is gone is deleted');

SELECT * FROM finish();
ROLLBACK;
