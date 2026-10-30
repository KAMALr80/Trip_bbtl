-- M3-04 Daily Discovery + Daily Card: one answer per player per day, scored into the ledger.
BEGIN;
\ir ../_helpers.psql
SELECT plan(12);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
-- In Pre-Flight today: the trip starts in 3 days with 5 Pre-Flight days (home zone UTC).
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 3, 4, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET preflight_days = 5 WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'));

CREATE FUNCTION pg_temp.item(p_kind text, p_day date DEFAULT current_date) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND kind = p_kind AND day = p_day
$$;
-- Make today's card a question with a known answer, and today's Discovery a fact day.
UPDATE public.trip_schedule SET content_item_id = (SELECT id FROM public.content_items WHERE source = 'starter' AND source_ref = 'discovery-q-05'), points = 2
WHERE id = pg_temp.item('daily_card');
UPDATE public.trip_schedule SET variant = 'fact', points = NULL,
  content_item_id = (SELECT id FROM public.content_items WHERE source = 'starter' AND source_ref = 'discovery-f-01')
WHERE id = pg_temp.item('daily_discovery');
INSERT INTO ids VALUES ('card', pg_temp.item('daily_card')), ('disc', pg_temp.item('daily_discovery')),
                       ('tomorrow', pg_temp.item('daily_card', current_date + 1));

SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT phase FROM public.trip_phase((SELECT id FROM ids WHERE k = 'trip'))), 'preflight', 'the trip is in Pre-Flight');
SELECT throws_like($$SELECT * FROM public.answer_daily((SELECT id FROM ids WHERE k = 'card'))$$, 'Pick one of the answers',
                   'a question needs an answer');
SELECT is((SELECT row(points, correct, answer)::text FROM public.answer_daily((SELECT id FROM ids WHERE k = 'card'), 3)),
          '(2,t,3)', 'a right answer: 1 for answering +1 for right (Q4), and the answer is shown');
SELECT throws_like($$SELECT * FROM public.answer_daily((SELECT id FROM ids WHERE k = 'card'), 3)$$, 'You''ve already played this one',
                   'one answer per card');
SELECT is((SELECT sum(points)::int FROM public.points_ledger WHERE source = 'daily_card'), 2, 'the ledger has it once');
SELECT is((SELECT points FROM public.answer_daily((SELECT id FROM ids WHERE k = 'disc'))), 0, 'fact days score nothing');
SELECT throws_like($$SELECT * FROM public.answer_daily((SELECT id FROM ids WHERE k = 'tomorrow'))$$, 'That card hasn''t opened yet',
                   'tomorrow''s card waits for midnight (home time in Pre-Flight)');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT row(points, correct)::text FROM public.answer_daily((SELECT id FROM ids WHERE k = 'card'), 0)), '(1,f)',
          'a wrong answer still earns 1');
SELECT is((SELECT count(*)::int FROM public.daily_answers), 1, 'players see only their own answers');
SELECT is((SELECT points FROM public.trip_standings((SELECT id FROM ids WHERE k = 'trip'), 'preflight') WHERE user_id = tests.user_id('p1')),
          2, 'standings include Daily Card points');

SELECT tests.clear_authentication();
SELECT tests.create_user('out', 25);
SELECT tests.authenticate_as(tests.user_id('out'));
SELECT throws_like($$SELECT * FROM public.answer_daily((SELECT id FROM ids WHERE k = 'card'), 1)$$, 'That card isn''t in your trip',
                   'outsiders can''t answer');
SELECT throws_ok($$INSERT INTO public.daily_answers (schedule_id, trip_id, user_id) VALUES
                   ((SELECT id FROM ids WHERE k = 'card'), (SELECT id FROM ids WHERE k = 'trip'), auth.uid())$$,
                 '42501', NULL, 'clients can''t write answers');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
