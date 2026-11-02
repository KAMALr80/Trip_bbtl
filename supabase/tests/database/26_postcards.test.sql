-- M5-01 Postcard Picks, M5-02 wrap-up week, M5-03 Day 7 lock, M5-05 photo purge, M5-06 tie-break / swap.
BEGIN;
\ir ../_helpers.psql
SELECT plan(58);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
SELECT tests.create_user('p3', 25);
SELECT tests.create_user('out', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;

-- A crew of four in Trip Season (started two days ago), going to Portugal.
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), -2, 5, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET arrived_at = now() - interval '2 days', passport_country = 'Portugal', passport_city = 'Lisbon'
WHERE id = pg_temp.id('trip');
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('p1'));
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('p2'));
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('p3'));
INSERT INTO public.player_profiles (user_id, real_name, game_name, home_country) VALUES
  (tests.user_id('p1'), 'P One', 'p1', 'Portugal'), (tests.user_id('p2'), 'P Two', 'p2', 'USA');
INSERT INTO public.trip_player_cards (trip_id, user_id, game_name, most_excited)
VALUES (pg_temp.id('trip'), tests.user_id('p2'), 'Twosie', 'Pastéis de nata');
-- An item that survives re-planning when the test moves the dates (keyed by kind, slot and player):
-- re-planning deletes items that no longer fit, and their proofs with them.
INSERT INTO ids SELECT 'item', id FROM public.trip_schedule
WHERE trip_id = pg_temp.id('trip') AND kind = 'airport_mission' AND user_id = tests.user_id('cap') ORDER BY slot LIMIT 1;

-- Two photos each (proofs), uploaded in order: cap c1 c2, p1 a1 a2, p2 b1 b2, p3 d1 d2; and one more of
-- p1's (a3), and one of p1's that expired (ax).
CREATE FUNCTION pg_temp.photo(p_key text, p_user text, p_n int, p_status text DEFAULT 'approved') RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_path text := pg_temp.id('trip') || '/' || tests.user_id(p_user) || '/' || pg_temp.id('item') || '/' || p_key || '.jpg';
  v_id uuid;
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('quest-proofs', v_path, tests.user_id(p_user));
  INSERT INTO public.proofs (trip_id, user_id, schedule_id, part, source, photo_path, crew_status, approved_at, expires_at, created_at)
  VALUES (pg_temp.id('trip'), tests.user_id(p_user), pg_temp.id('item'), p_n, 'airport_mission', v_path, p_status, now(),
          now() + interval '1 day', now() - interval '1 day' + p_n * interval '1 minute')
  RETURNING id INTO v_id;
  INSERT INTO ids VALUES (p_key, v_id);
END $$;
SELECT pg_temp.photo('c1', 'cap', 1), pg_temp.photo('c2', 'cap', 2), pg_temp.photo('a1', 'p1', 3), pg_temp.photo('a2', 'p1', 4),
       pg_temp.photo('b1', 'p2', 5), pg_temp.photo('b2', 'p2', 6), pg_temp.photo('d1', 'p3', 7), pg_temp.photo('d2', 'p3', 8),
       pg_temp.photo('a3', 'p1', 9), pg_temp.photo('ax', 'p1', 10, 'expired');
-- An upload that never became a proof.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('quest-proofs', pg_temp.id('trip') || '/' || tests.user_id('p1') || '/' || pg_temp.id('item') || '/orphan.jpg', tests.user_id('p1'));

-- ---------------------------------------------------------------- reminders (Q11)
SELECT is((SELECT count(*)::int FROM trip_private.desired_notifications(pg_temp.id('trip')) WHERE type = 'wrapup'), 12,
          'wrap-up reminders on Baggage Claim days 1, 5 and 7 for each player');

-- ---------------------------------------------------------------- Postcard Picks (R-601)
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((public.postcard_info(pg_temp.id('trip'))->>'picks')::int, 2, 'a crew picks 2 photos each');
SELECT is(public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a1')), 1, 'p1 picks a photo');
SELECT is(public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a2')), 2, 'and a second');
SELECT is(public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a1')), 2, 'picking the same one again changes nothing');
SELECT throws_like($$SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a3'))$$, 'You can pick 2 photos%',
                   'a third pick is refused by the server');
SELECT throws_like($$SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('b1'))$$, 'Pick one of your own trip photos',
                   'only your own photos');
SELECT throws_like($$SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('ax'))$$, 'Pick one of your own trip photos',
                   'not a photo whose proof expired');
SELECT is(public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a2'), false), 1, 'swap: unpick one');
SELECT is(public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a2')), 2, 'and pick again');
SELECT throws_like($$SELECT public.heart_photo(pg_temp.id('trip'), pg_temp.id('a1'))$$, 'Wrap-up week starts%',
                   'no hearts during the trip');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is((SELECT count(*)::int FROM public.postcard_picks), 0, 'players can''t read each other''s picks directly');
SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('b1')), public.pick_postcard(pg_temp.id('trip'), pg_temp.id('b2'));
SELECT tests.authenticate_as(tests.user_id('p3'));
SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('d1')), public.pick_postcard(pg_temp.id('trip'), pg_temp.id('d2'));
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('c1')), public.pick_postcard(pg_temp.id('trip'), pg_temp.id('c2'));
SELECT tests.authenticate_as(tests.user_id('out'));
SELECT throws_like($$SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a3'))$$, 'Join this trip first', 'outsiders can''t');

-- ---------------------------------------------------------------- wrap-up week (R-602 – R-604)
-- The trip ended three days ago: Baggage Claim day 3.
SELECT tests.clear_authentication();
UPDATE public.trips SET start_date = current_date - 7, end_date = current_date - 3, arrived_at = now() - interval '7 days'
WHERE id = pg_temp.id('trip');
SELECT is((SELECT phase FROM trip_private.trip_phase(pg_temp.id('trip'), now())), 'baggage_claim', 'the trip is in Baggage Claim');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.pick_postcard(pg_temp.id('trip'), pg_temp.id('a2'), false)$$, 'Postcard Picks closed%',
                   'picks froze at the end of the last trip day');
SELECT is((SELECT count(*)::int FROM trip_private.wrapup_questions(pg_temp.id('trip'))), 3, 'three questions');
SELECT is((SELECT key FROM trip_private.wrapup_questions(pg_temp.id('trip')) WHERE idx = 0), 'never_forget',
          '"Moment you''ll never forget" first');
SELECT throws_like($$SELECT public.answer_wrapup(pg_temp.id('trip'), 'never_forget', repeat('a', 61))$$, 'Keep it short%',
                   'answers stay short');
SELECT throws_like($$SELECT public.answer_wrapup(pg_temp.id('trip'), 'nope', 'hi')$$, 'That isn''t one of this trip''s questions',
                   'only the trip''s questions');
SELECT lives_ok($$SELECT public.answer_wrapup(pg_temp.id('trip'), 'never_forget', '  Fado in Alfama at midnight ')$$,
                'p1 answers, as typed');
SELECT is((SELECT answer FROM public.wrapup_answers), 'Fado in Alfama at midnight', 'stored trimmed, word for word');
SELECT throws_like($$SELECT public.heart_photo(pg_temp.id('trip'), pg_temp.id('a1'))$$, 'Heart the crew''s photos, not your own',
                   'no hearts for your own photo');
SELECT throws_like($$SELECT public.heart_photo(pg_temp.id('trip'), pg_temp.id('a3'))$$, 'That photo isn''t a Postcard Pick',
                   'only picks can be hearted');
SELECT public.heart_photo(pg_temp.id('trip'), pg_temp.id('b1'));
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is((SELECT count(*)::int FROM public.wrapup_answers), 0, 'answers are private until the postcard');
SELECT ok(public.heart_photo(pg_temp.id('trip'), pg_temp.id('a1')), 'p2 hearts a1');
SELECT ok(public.heart_photo(pg_temp.id('trip'), pg_temp.id('a1')), 'a second heart from the same player is a no-op');
SELECT is((SELECT count(*)::int FROM public.wrapup_board(pg_temp.id('trip'))), 8, 'the board shows the crew''s 8 picks');
SELECT is((SELECT count(*)::int FROM public.wrapup_board(pg_temp.id('trip')) WHERE hearted), 1, 'with my hearts');
SELECT tests.authenticate_as(tests.user_id('p3'));
SELECT public.heart_photo(pg_temp.id('trip'), pg_temp.id('a1'));

-- ---------------------------------------------------------------- Captain tie-break and swap (R-606)
-- Ranking now: a1 (2 hearts), b1 (1), then 0 hearts by upload: c1 c2 a2 b2 | d1 d2.
SELECT throws_like($$SELECT * FROM public.postcard_ranking(pg_temp.id('trip'))$$, '%sees the ranking', 'players don''t see counts');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT string_agg(r.proof_id::text, ',' ORDER BY r.pos) FROM public.postcard_ranking(pg_temp.id('trip')) r WHERE r.kept),
          (SELECT string_agg(pg_temp.id(k)::text, ',' ORDER BY o) FROM unnest(ARRAY['a1', 'b1', 'c1', 'c2', 'a2', 'b2']) WITH ORDINALITY u(k, o)),
          'the top 6: hearts first, then earliest upload');
SELECT is((SELECT count(*)::int FROM public.postcard_ranking(pg_temp.id('trip')) WHERE tied), 6, 'the six 0-heart photos are tied at the cut');
SELECT throws_like($$SELECT public.break_postcard_tie(pg_temp.id('trip'), pg_temp.id('a1'))$$, 'That photo isn''t tied at the cut',
                   'only ties can be broken');
SELECT lives_ok($$SELECT public.break_postcard_tie(pg_temp.id('trip'), pg_temp.id('d2'))$$, 'the Captain breaks the tie for d2');
SELECT ok((SELECT kept FROM public.postcard_ranking(pg_temp.id('trip')) WHERE proof_id = pg_temp.id('d2'))
          AND NOT (SELECT kept FROM public.postcard_ranking(pg_temp.id('trip')) WHERE proof_id = pg_temp.id('b2')),
          'd2 is in and b2 is out');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.swap_postcard_photo(pg_temp.id('trip'), pg_temp.id('a1'), pg_temp.id('d1'))$$,
                   'Only the Captain or Co-Captain swaps a photo', 'players can''t swap');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT lives_ok($$SELECT public.swap_postcard_photo(pg_temp.id('trip'), pg_temp.id('c1'), pg_temp.id('d1'))$$,
                'the Captain swaps c1 for d1');
SELECT throws_like($$SELECT public.swap_postcard_photo(pg_temp.id('trip'), pg_temp.id('c2'), pg_temp.id('b2'))$$,
                   'The one swap is already used', 'once per trip');

-- ---------------------------------------------------------------- Day 7 lock (R-605, M5-03)
SELECT tests.clear_authentication();
INSERT INTO public.trip_crowns (trip_id, season, user_id, points) VALUES (pg_temp.id('trip'), 'trip_season', tests.user_id('p2'), 40);
SELECT is(trip_private.lock_trip(pg_temp.id('trip')), false, 'nothing locks before Day 7 ends');
UPDATE public.trips SET start_date = current_date - 13, end_date = current_date - 9 WHERE id = pg_temp.id('trip');
SELECT ok(trip_private.postcards_due() >= 1, 'the cron job locks it after Day 7');
SELECT ok((SELECT locked_at IS NOT NULL FROM public.trips WHERE id = pg_temp.id('trip')), 'trips.locked_at is set');
SELECT is((SELECT string_agg(ph->>'proof_id', ',' ORDER BY o) FROM public.trip_postcards, jsonb_array_elements(photos) WITH ORDINALITY x(ph, o)
           WHERE trip_id = pg_temp.id('trip')),
          (SELECT string_agg(pg_temp.id(k)::text, ',' ORDER BY o) FROM unnest(ARRAY['a1', 'b1', 'd2', 'd1', 'c2', 'a2']) WITH ORDINALITY u(k, o)),
          'six photos: ranked, tie broken, d1 swapped into c1''s place');
SELECT is((SELECT answers->0 FROM public.trip_postcards WHERE trip_id = pg_temp.id('trip')),
          '{"key": "never_forget", "question": "Moment you''ll never forget", "answers": ["Fado in Alfama at midnight"]}'::jsonb,
          'answers grouped by question, with no names');
SELECT is((SELECT excited FROM public.trip_postcards WHERE trip_id = pg_temp.id('trip')), '["Pastéis de nata"]'::jsonb,
          'everyone''s "most excited for"');
SELECT is((SELECT crowns->0->>'name' FROM public.trip_postcards WHERE trip_id = pg_temp.id('trip')), 'p2', 'and the crowns, with names');
SELECT is(trip_private.lock_trip(pg_temp.id('trip'), true), false, 're-running the lock changes nothing');
SELECT is((SELECT count(*)::int FROM public.notification_queue WHERE trip_id = pg_temp.id('trip') AND dedupe_key LIKE 'postcard_ready:%'), 4,
          'everyone hears the postcard is ready');

-- Stamps (M5-07): one per member; home country decides passport vs state stamp (R-702).
SELECT is((SELECT count(*)::int FROM public.passport_stamps WHERE trip_id = pg_temp.id('trip')), 4, 'a stamp in every member''s passport');
SELECT is((SELECT kind FROM public.passport_stamps WHERE trip_id = pg_temp.id('trip') AND user_id = tests.user_id('p1')), 'road_trip',
          'p1 is from Portugal: a home-country (state) stamp');
SELECT is((SELECT kind || ':' || array_to_string(crowns, ',') FROM public.passport_stamps
           WHERE trip_id = pg_temp.id('trip') AND user_id = tests.user_id('p2')),
          'international:trip_season', 'p2 is from the USA: a passport stamp with their crown');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is((SELECT has_postcard FROM public.my_stamps() WHERE trip_id = pg_temp.id('trip')), true, 'the stamp opens the postcard');
SELECT is((SELECT count(*)::int FROM public.trip_postcards), 1, 'members read the postcard');
SELECT tests.authenticate_as(tests.user_id('out'));
SELECT is((SELECT count(*)::int FROM public.trip_postcards), 0, 'outsiders don''t');

-- ---------------------------------------------------------------- photo purge (M5-05, Q11)
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM trip_private.photos_to_purge(50) WHERE trip_id = pg_temp.id('trip')), 5,
          'everything but the six postcard photos is listed: 4 photos and the orphan upload');
SELECT is(trip_private.finish_photo_purge(pg_temp.id('trip'), 0), 5, 'nothing deleted yet: 5 left, the trip stays queued');
DELETE FROM storage.objects o USING trip_private.photos_to_purge(50) p WHERE o.bucket_id = p.bucket AND o.name = p.path;
SELECT is(trip_private.finish_photo_purge(pg_temp.id('trip'), 5), 0, 'after the route deletes them nothing is left');
SELECT ok((SELECT photos_purged_at IS NOT NULL FROM public.trips WHERE id = pg_temp.id('trip')), 'and the trip is marked purged');
SELECT is((SELECT count(*)::int FROM public.proofs WHERE trip_id = pg_temp.id('trip') AND photo_removed_at IS NOT NULL), 4,
          'the non-kept proofs lose their photo');
SELECT is((SELECT count(*)::int FROM public.photo_purge_log WHERE trip_id = pg_temp.id('trip')), 2, 'every run is logged');

SELECT * FROM finish();
ROLLBACK;
