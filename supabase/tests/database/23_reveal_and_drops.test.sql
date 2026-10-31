-- M3-05 opening sealed quests (+5 within 3h), M3-08 missions in order, M3-09 Surprise Drop proofs
-- and drop_points, M3-10 sharing a trip quest.
BEGIN;
\ir ../_helpers.psql
SELECT plan(20);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 3, 6, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET preflight_days = 5 WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p2'));
INSERT INTO public.call_nights (trip_id, starts_at) VALUES ((SELECT id FROM ids WHERE k = 'trip'), now() + interval '2 days');
CREATE FUNCTION pg_temp.item(p_kind text, p_user text, p_slot text DEFAULT NULL) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND kind = p_kind
    AND user_id IS NOT DISTINCT FROM tests.user_id(p_user) AND (p_slot IS NULL OR slot = p_slot) ORDER BY opens_at LIMIT 1
$$;
INSERT INTO ids VALUES ('q1', pg_temp.item('sealed_quest', 'p1')), ('q2', pg_temp.item('sealed_quest', 'p2'));
-- p1's quest dropped an hour ago; p2's four hours ago.
UPDATE public.trip_schedule SET opens_at = now() - interval '1 hour' WHERE id = (SELECT id FROM ids WHERE k = 'q1');
UPDATE public.trip_schedule SET opens_at = now() - interval '4 hours' WHERE id = (SELECT id FROM ids WHERE k = 'q2');

-- ---------------------------------------------------------------- sealed quests (R-322)
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT body FROM public.my_schedule((SELECT id FROM ids WHERE k = 'trip')) WHERE id = (SELECT id FROM ids WHERE k = 'q1')), NULL,
          'a dropped quest stays sealed until opened');
SELECT throws_like($$SELECT public.submit_proof((SELECT id FROM ids WHERE k = 'q1'), NULL, 'done')$$, 'Open it first', 'no proof before opening');
SELECT ok(public.open_item((SELECT id FROM ids WHERE k = 'q1')), 'p1 opens it');
SELECT ok((SELECT body IS NOT NULL FROM public.my_schedule((SELECT id FROM ids WHERE k = 'trip')) WHERE id = (SELECT id FROM ids WHERE k = 'q1')),
          'and now sees the text');
SELECT ok(NOT public.open_item((SELECT id FROM ids WHERE k = 'q1')), 'opening twice changes nothing');
SELECT throws_like($$SELECT public.open_item((SELECT id FROM ids WHERE k = 'q2'))$$, 'That isn''t one of your sealed cards', 'only your own');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT public.open_item((SELECT id FROM ids WHERE k = 'q2'));
SELECT tests.clear_authentication();
SELECT is((SELECT string_agg(u.handle, ',') FROM public.points_ledger l JOIN tests.users u ON u.id = l.user_id WHERE source = 'sealed_speed'),
          'p1', '+5 only when opened within 3h of the drop (R-322)');

-- ---------------------------------------------------------------- missions in order (R-331)
UPDATE public.trip_schedule SET opens_at = now() - interval '1 hour', closes_at = now() + interval '1 day'
WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND kind = 'airport_mission';
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.open_item(pg_temp.item('airport_mission', 'p1', '2'))$$, 'Open Mission 1 first', 'Mission 2 waits for Mission 1');
SELECT ok(public.open_item(pg_temp.item('airport_mission', 'p1', '1')), 'Mission 1 opens');
SELECT ok(public.open_item(pg_temp.item('airport_mission', 'p1', '2')), 'then Mission 2');

-- ---------------------------------------------------------------- trip quest sharing (R-344)
SELECT tests.clear_authentication();
UPDATE public.trip_schedule SET opens_at = now() - interval '1 hour', closes_at = now() + interval '1 day'
WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND kind = 'trip_quest';
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT public.open_item(pg_temp.item('trip_quest', 'p1'));
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is((SELECT count(*)::int FROM public.my_schedule((SELECT id FROM ids WHERE k = 'trip')) WHERE kind = 'trip_quest' AND user_id = tests.user_id('p1')),
          0, 'a trip quest is a surprise by default');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT public.share_trip_quest(pg_temp.item('trip_quest', 'p1'), true);
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT ok((SELECT body IS NOT NULL FROM public.my_schedule((SELECT id FROM ids WHERE k = 'trip')) WHERE kind = 'trip_quest' AND user_id = tests.user_id('p1')),
          'shared, the crew sees it');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- Surprise Drops (R-342, Q4)
SELECT is(trip_private.bingo_lines(ARRAY[0, 1, 2], 3), 1, 'a row is a Bingo line');
SELECT is(trip_private.bingo_lines(ARRAY[0, 1, 2, 3, 4, 5, 6, 7, 8], 3), 8, 'a blackout has all 8 lines');
INSERT INTO ids SELECT 'bingo', pg_temp.item('surprise_drop', NULL);
UPDATE public.trip_schedule SET variant = 'bingo', opens_at = now() - interval '1 hour', closes_at = now() + interval '1 hour',
  content_item_id = (SELECT id FROM public.content_items WHERE source = 'starter' AND source_ref = 'drop-bingo-01')
WHERE id = (SELECT id FROM ids WHERE k = 'bingo');
INSERT INTO storage.objects (bucket_id, name, owner)
SELECT 'quest-proofs', (SELECT id FROM ids WHERE k = 'trip') || '/' || tests.user_id('p1') || '/' || (SELECT id FROM ids WHERE k = 'bingo') || '/' || n || '.jpg',
       tests.user_id('p1') FROM generate_series(0, 3) n;
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.submit_drop_proof((SELECT id FROM ids WHERE k = 'bingo'), 9, NULL, NULL)$$, 'Pick a square', 'squares are 0-8');
SELECT public.submit_drop_proof((SELECT id FROM ids WHERE k = 'bingo'), n,
  (SELECT id FROM ids WHERE k = 'trip') || '/' || tests.user_id('p1') || '/' || (SELECT id FROM ids WHERE k = 'bingo') || '/' || n || '.jpg', NULL)
FROM generate_series(0, 3) n;
SELECT is((SELECT count(*)::int FROM public.proofs WHERE schedule_id = (SELECT id FROM ids WHERE k = 'bingo') AND ai_status = 'pending'), 4,
          'Bingo photos wait for the AI check too (R-413)');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT public.approve_proof(c.id) FROM public.crew_check((SELECT id FROM ids WHERE k = 'trip')) c WHERE c.schedule_id = (SELECT id FROM ids WHERE k = 'bingo');
SELECT tests.clear_authentication();
SELECT is(trip_private.drop_points((SELECT id FROM ids WHERE k = 'bingo'), tests.user_id('p1')), 10, 'one line = 10 (Q4)');
SELECT is(trip_private.settle_drops(), 0, 'nothing is scored while the drop is open');
UPDATE public.trip_schedule SET closes_at = now() - interval '1 minute' WHERE id = (SELECT id FROM ids WHERE k = 'bingo');
SELECT is(trip_private.settle_drops(), 1, 'after it closes the drop is scored');
SELECT is((SELECT points FROM public.points_ledger WHERE source = 'surprise_drop' AND user_id = tests.user_id('p1')), 10,
          'into Trip Season, once');

SELECT * FROM finish();
ROLLBACK;
