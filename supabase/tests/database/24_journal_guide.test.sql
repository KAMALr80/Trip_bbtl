-- M3-12 journal + shared guide, M3-13 solo at-home showcase page.
BEGIN;
\ir ../_helpers.psql
SELECT plan(19);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('out', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
-- A Window Seat crew of two, in Trip Season: started two days ago.
INSERT INTO ids SELECT 'ws', tests.create_trip(tests.user_id('cap'), -2, 5, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET room = 'window_seat', arrived_at = now() - interval '2 days' WHERE id = (SELECT id FROM ids WHERE k = 'ws');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'ws'), tests.user_id('p1'));
INSERT INTO public.player_profiles (user_id, real_name, game_name) VALUES (tests.user_id('p1'), 'P One', 'p1');
CREATE FUNCTION pg_temp.item(p_kind text, p_user text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'ws') AND kind = p_kind
    AND user_id = tests.user_id(p_user) AND opens_at <= now() AND closes_at > now() ORDER BY opens_at DESC LIMIT 1
$$;
-- Tonight's prompt is out.
UPDATE public.trip_schedule SET opens_at = now() - interval '1 hour'
WHERE trip_id = (SELECT id FROM ids WHERE k = 'ws') AND kind = 'journal_prompt' AND day = (now() AT TIME ZONE 'Europe/Lisbon')::date;
INSERT INTO ids VALUES ('j1', pg_temp.item('journal_prompt', 'p1')), ('q1', pg_temp.item('ws_quest', 'p1'));

-- ---------------------------------------------------------------- journal (R-351, R-352)
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT count(*)::int FROM public.journal_options((SELECT id FROM ids WHERE k = 'j1'))), 3,
          'one prompt plus two to swap to');
SELECT throws_like($$SELECT public.write_journal((SELECT id FROM ids WHERE k = 'j1'), '   ')$$, 'Write a line or two first',
                   'an empty entry is refused');
SELECT throws_like($$SELECT public.write_journal((SELECT id FROM ids WHERE k = 'j1'), 'Lovely day', 7)$$, 'Pick one of the prompts',
                   'only the offered prompts');
SELECT ok(public.write_journal((SELECT id FROM ids WHERE k = 'j1'), 'Got lost by the river and found a bakery.', 1) IS NOT NULL,
          'p1 writes tonight''s entry on a swapped prompt');
SELECT ok(public.write_journal((SELECT id FROM ids WHERE k = 'j1'), 'Got lost by the river and found the best bakery.', 1) IS NOT NULL,
          'and can edit it until it closes');
SELECT is((SELECT count(*)::int FROM public.journal_entries), 1, 'one entry per day');
SELECT is((SELECT sum(points)::int FROM public.points_ledger WHERE source = 'ws_journal'), 2, 'journal = 2 points, once (R-351)');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.write_journal((SELECT id FROM ids WHERE k = 'j1'), 'Not mine')$$, 'That isn''t your journal',
                   'nobody writes in someone else''s journal');
SELECT is((SELECT count(*)::int FROM public.journal_entries), 0, 'and others can''t read it directly');

-- ---------------------------------------------------------------- the guide (R-354, R-355)
SELECT tests.clear_authentication();
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('quest-proofs', (SELECT id FROM ids WHERE k = 'ws') || '/' || tests.user_id('p1') || '/' || (SELECT id FROM ids WHERE k = 'q1') || '/a.jpg',
        tests.user_id('p1'));
INSERT INTO public.proofs (trip_id, user_id, schedule_id, source, photo_path, crew_status, approved_at, expires_at)
VALUES ((SELECT id FROM ids WHERE k = 'ws'), tests.user_id('p1'), (SELECT id FROM ids WHERE k = 'q1'), 'ws_quest',
        (SELECT id FROM ids WHERE k = 'ws') || '/' || tests.user_id('p1') || '/' || (SELECT id FROM ids WHERE k = 'q1') || '/a.jpg',
        'approved', now(), now());
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT string_agg(kind || ':' || coalesce(author, '-'), ',' ORDER BY kind) FROM public.trip_guide((SELECT id FROM ids WHERE k = 'ws'))),
          'journal:p1,photo:p1', 'the crew sees one shared guide with names'
          );
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.publish_guide((SELECT id FROM ids WHERE k = 'ws'), true)$$, '%shares the guide', 'players don''t publish');
SELECT tests.authenticate_as(tests.user_id('cap'));
CREATE TEMP TABLE tok AS SELECT public.publish_guide((SELECT id FROM ids WHERE k = 'ws'), true) AS t;
SELECT tests.clear_authentication();
SELECT is((SELECT string_agg(kind || ':' || coalesce(author, 'hidden'), ',') FROM public.public_guide((SELECT t FROM tok))),
          'journal:hidden', 'the public page hides names and photos until the player opts in (R-355)');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT public.set_guide_prefs((SELECT id FROM ids WHERE k = 'ws'), true, true);
SELECT tests.clear_authentication();
SELECT is((SELECT string_agg(kind || ':' || coalesce(author, 'hidden'), ',' ORDER BY kind) FROM public.public_guide((SELECT t FROM tok))),
          'journal:p1,photo:p1', 'after opting in, name and photo show');
UPDATE public.trips SET has_minors = true, vibe = 'family' WHERE id = (SELECT id FROM ids WHERE k = 'ws');
SELECT is((SELECT count(*)::int FROM public.public_guide((SELECT t FROM tok)) WHERE kind = 'photo'), 0,
          'a trip with minors never shows photos publicly');
SELECT tests.authenticate_as_anon();
SELECT throws_ok($$SELECT * FROM public.public_guide((SELECT t FROM tok))$$, '42501', NULL,
                 'visitors go through the server route, not the database');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is(public.publish_guide((SELECT id FROM ids WHERE k = 'ws'), false), NULL, 'unpublishing');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.public_guide((SELECT t FROM tok))), 0, 'the link stops working');

-- ---------------------------------------------------------------- solo at home (R-365)
SELECT tests.create_user('solo', 30);
INSERT INTO ids SELECT 'home', tests.create_trip(tests.user_id('solo'), 3, 3, 'a2c', 'UTC', NULL);
UPDATE public.trips SET room = 'explore_culture', play_mode = 'solo', cultures = '{japan}', destination = 'Japan'
WHERE id = (SELECT id FROM ids WHERE k = 'home');
SELECT is((SELECT count(*)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'home') AND kind = 'journal_prompt'),
          3, 'a solo at-home room gets a showcase note each experience day');
SELECT ok((SELECT bool_and(tailored_text LIKE '%japan%' OR tailored_text NOT LIKE '%{culture}%') FROM public.trip_schedule
           WHERE trip_id = (SELECT id FROM ids WHERE k = 'home') AND kind = 'journal_prompt'),
          'filled in with their culture');

SELECT * FROM finish();
ROLLBACK;
