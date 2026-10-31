-- M3-02 content library + M3-03 schedule planner: counts per trip length, stable plans, content
-- that fits the room, text hidden until it opens, late joiners and replanning.
BEGIN;
\ir ../_helpers.psql
SELECT plan(25);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('late', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;

-- Trips start in 14 days, home UTC, trip zone Lisbon; 5 Pre-Flight days.
CREATE FUNCTION pg_temp.trip(p_k text, p_days int, p_room text DEFAULT 'trip', p_mode text DEFAULT 'crew') RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v uuid := tests.create_trip(tests.user_id('cap'), 14, p_days, 'a2c', 'UTC', 'Europe/Lisbon');
BEGIN
  UPDATE public.trips SET room = p_room, play_mode = p_mode, preflight_days = 5, destination = 'Lisbon, Portugal',
    trip_timezone = CASE WHEN p_room IN ('explore_culture', 'show_culture') THEN 'UTC' ELSE 'Europe/Lisbon' END
  WHERE id = v;
  INSERT INTO ids VALUES (p_k, v);
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.n(p_k text, p_kind text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = p_k) AND kind = p_kind
$$;
CREATE FUNCTION pg_temp.fingerprint(p_k text) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(kind || slot || coalesce(variant, '') || opens_at::text || coalesce(content_item_id::text, ''), ',' ORDER BY kind, slot, user_id)
  FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = p_k)
$$;

-- ---------------------------------------------------------------- the library
SELECT ok((SELECT count(*) FROM public.content_items WHERE kind = 'daily_card') >= 30, 'the library has Daily Cards');
SELECT ok((SELECT bool_and(cardinality(items) > 0) FROM public.content_items WHERE kind IN ('drop_bingo', 'drop_scavenger')),
          'Bingo and Scavenger drops come with their squares / finds');
SELECT throws_ok($$INSERT INTO public.content_items (kind, rooms, modes, body) VALUES ('daily_card', '{trip}', '{trip}', 'Get drunk at the bar')$$,
                 '23514', NULL, 'unsafe wording is refused by the content check');

-- ---------------------------------------------------------------- a 4-day and a 10-day crew trip
SELECT pg_temp.trip('four', 4);
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'four'), tests.user_id('p1'));
SELECT pg_temp.trip('ten', 10);

SELECT is(pg_temp.n('four', 'surprise_drop'), 2, 'a 4-day trip gets 2 Surprise Drops (R-342)');
SELECT ok(pg_temp.n('ten', 'surprise_drop') BETWEEN 4 AND 5, 'a 10-day trip gets 4-5');
SELECT is((SELECT count(DISTINCT variant)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'ten') AND kind = 'surprise_drop'),
          4, 'the four games all appear on a long trip');
SELECT ok((SELECT bool_and(extract(hour FROM opens_at AT TIME ZONE 'Europe/Lisbon') BETWEEN 9 AND 11 AND closes_at - opens_at = interval '24 hours')
           FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'ten') AND kind = 'surprise_drop'),
          'drops open 9-11 AM trip time for 24h (Q27)');
SELECT is(pg_temp.n('four', 'daily_card'), 5, 'a Daily Card every Pre-Flight day');
SELECT is((SELECT count(*)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND kind = 'daily_discovery'
           AND variant = 'question' AND opens_at < (SELECT opens_at FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND kind = 'phase' AND slot = 'takeoff')),
          3, 'Pre-Flight question days are every other day from day 1 (Q22)');
SELECT is(pg_temp.n('four', 'airport_mission'), 6, '3 Airport Missions per player');
SELECT is(pg_temp.n('four', 'trip_quest'), 2, 'a trip quest per player (R-344)');
SELECT is(pg_temp.n('four', 'showcase'), 2, 'a Showcase per player');
SELECT ok((SELECT bool_and(content_item_id IS NOT NULL AND tailored_text NOT LIKE '%{destination}%')
           FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND kind NOT IN ('phase', 'call_night', 'crowning')),
          'every item gets content, with the destination filled in');
SELECT is((SELECT count(DISTINCT content_item_id)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND kind = 'daily_card'),
          5, 'no repeats while the pool lasts');

-- Stable: planning again changes nothing (M3-03 deterministic).
CREATE TEMP TABLE fp AS SELECT pg_temp.fingerprint('ten') AS v;
SELECT trip_private.plan_trip((SELECT id FROM ids WHERE k = 'ten'));
SELECT is(pg_temp.fingerprint('ten'), (SELECT v FROM fp), 'planning again gives the same schedule');

-- ---------------------------------------------------------------- rooms and modes
SELECT pg_temp.trip('japan', 3, 'explore_culture');
UPDATE public.trips SET cultures = '{japan}', destination = 'Japan' WHERE id = (SELECT id FROM ids WHERE k = 'japan');
SELECT is((SELECT count(*)::int FROM public.trip_schedule s JOIN public.content_items c ON c.id = s.content_item_id
           WHERE s.trip_id = (SELECT id FROM ids WHERE k = 'japan') AND NOT ('at_home' = ANY (c.modes))),
          0, 'an at-home Japan trip never gets an at-a-place item (R-007)');
SELECT is(pg_temp.n('japan', 'home_mission'), 3, 'at home: Home Missions instead of Airport Missions');
SELECT is(pg_temp.n('japan', 'surprise_drop'), 0, 'no Surprise Drops at home');

SELECT pg_temp.trip('ws', 3, 'window_seat', 'solo');
SELECT ok(pg_temp.n('ws', 'ws_quest') >= 2 AND pg_temp.n('ws', 'ws_quest') = pg_temp.n('ws', 'journal_prompt'),
          'Window Seat: a quest and a journal prompt each Trip Season day (R-351)');

SELECT pg_temp.trip('off', 4, 'trip', 'offline');
SELECT is(pg_temp.n('off', 'airport_mission') + pg_temp.n('off', 'surprise_drop') + pg_temp.n('off', 'showcase'), 0,
          'off-app play gets cards but no scored items (R-006)');

-- ---------------------------------------------------------------- roster changes
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'four'), tests.user_id('late'), 'player', 'pending');
SELECT is((SELECT count(*)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND user_id = tests.user_id('late')),
          0, 'pending players get nothing yet');
UPDATE public.trip_members SET status = 'approved', approved_at = now()
WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND user_id = tests.user_id('late');
SELECT is((SELECT count(*)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND user_id = tests.user_id('late')
           AND kind IN ('trip_quest', 'showcase')), 2, 'an approved late joiner gets their own items');

-- ---------------------------------------------------------------- what players can read
-- Open today's first Daily Card early so one item is open and the rest are not.
UPDATE public.trip_schedule SET opens_at = now() - interval '1 hour'
WHERE id = (SELECT id FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'four') AND kind = 'daily_card' ORDER BY slot LIMIT 1);
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_ok($$SELECT tailored_text FROM public.trip_schedule LIMIT 1$$, '42501', NULL, 'players can''t read content columns directly');
SELECT is((SELECT count(*)::int FROM public.my_schedule((SELECT id FROM ids WHERE k = 'four')) WHERE body IS NOT NULL),
          1, 'only items that have opened show their text');
SELECT is((SELECT count(*)::int FROM public.my_schedule((SELECT id FROM ids WHERE k = 'four'))
           WHERE user_id IS NOT NULL AND user_id <> auth.uid()), 0, 'other players'' own items stay private');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
