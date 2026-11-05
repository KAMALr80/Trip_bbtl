-- M5-07 passport stamps v2, M5-08 levels, M5-09 badges.
BEGIN;
\ir ../_helpers.psql
SELECT plan(43);

-- ---------------------------------------------------------------- levels (R-703), every boundary
SELECT is((SELECT level || ':' || stars FROM trip_private.level_for(n)), want, n || ' countries → ' || want)
FROM (VALUES (0, 'none:0'), (1, 'tourist:0'), (2, 'tourist:0'), (3, 'explorer:0'), (4, 'explorer:0'), (5, 'voyager:0'),
             (7, 'globetrotter:0'), (9, 'globetrotter:0'), (10, 'passport_junkie:0'), (14, 'passport_junkie:0'),
             (15, 'passport_junkie:1'), (20, 'passport_junkie:2'), (29, 'passport_junkie:2'), (30, 'passport_junkie:3'),
             (45, 'passport_junkie:3')) v(n, want);
SELECT is((SELECT next_at FROM trip_private.level_for(7)), 10, 'next level at 10 countries');

-- ---------------------------------------------------------------- badges (R-711 – R-713)
SELECT is(trip_private.badge_tier(b, n), want, b || ' ' || n || ' → tier ' || want)
FROM (VALUES ('us_explorer', 0, 0), ('us_explorer', 1, 1), ('us_explorer', 5, 2), ('us_explorer', 14, 2), ('us_explorer', 15, 3),
             ('culture_collector', 4, 1), ('culture_collector', 10, 3), ('storyteller', 3, 2), ('storyteller', 10, 3)) v(b, n, want);
SELECT is(trip_private.season_label(date '2026-12-20'), 'Winter 2027', 'December is the next year''s winter');
SELECT is(trip_private.season_label(date '2026-10-02'), 'Fall 2026', 'season + year');

-- ---------------------------------------------------------------- stamps from the lock
SELECT tests.create_user('me', 30);
SELECT tests.create_user('pal', 30);
INSERT INTO public.player_profiles (user_id, real_name, game_name, home_country)
VALUES (tests.user_id('me'), 'Me', 'me', 'United States');
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;
-- A finished trip (ended 10 days ago) per kind of room.
CREATE FUNCTION pg_temp.trip(p_key text, p_room text, p_mode text, p_country text, p_state text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v uuid := tests.create_trip(tests.user_id('me'), 14, CASE WHEN p_room = 'game_night' THEN 1 ELSE 4 END, 'a2c', 'UTC', 'UTC');
BEGIN
  UPDATE public.trips SET room = p_room, play_mode = p_mode, passport_country = p_country, passport_state = p_state,
    cultures = CASE WHEN p_room IN ('explore_culture', 'show_culture') THEN ARRAY[p_country] ELSE '{}' END
  WHERE id = v;
  INSERT INTO ids VALUES (p_key, v);
END $$;
SELECT pg_temp.trip('tx', 'trip', 'solo', 'USA', 'Texas');
SELECT pg_temp.trip('ca', 'trip', 'crew', 'United States', 'California');
SELECT pg_temp.trip('jp', 'trip', 'crew', 'Japan', NULL);
SELECT pg_temp.trip('ws', 'window_seat', 'crew', 'Mexico', NULL);
SELECT pg_temp.trip('cu', 'explore_culture', 'crew', 'Korea', NULL);
SELECT pg_temp.trip('gn', 'game_night', 'crew', 'Japan', NULL);
SELECT tests.add_member(pg_temp.id('ca'), tests.user_id('pal'));
-- All of them ended 10 days ago.
UPDATE public.trips SET start_date = start_date - 28, end_date = end_date - 28 WHERE id IN (SELECT id FROM ids);
-- A journal entry for the Window Seat guide, written after the move: moving the dates re-plans the
-- schedule and deletes items that no longer fit, with their journal entries (P8), so an entry made
-- before it could vanish depending on which item it hung on.
INSERT INTO public.journal_entries (trip_id, user_id, schedule_id, day, prompt, body)
SELECT pg_temp.id('ws'), tests.user_id('me'), s.id, s.day, 'Prompt', 'We found a cenote.'
FROM public.trip_schedule s
WHERE s.trip_id = pg_temp.id('ws') AND s.kind = 'journal_prompt'
ORDER BY s.opens_at, s.slot LIMIT 1;

SELECT is((SELECT count(*) FILTER (WHERE x.l)::int FROM (SELECT trip_private.lock_trip(pg_temp.id(k), true) AS l FROM unnest(ARRAY['tx', 'ca', 'jp', 'ws', 'cu', 'gn']) k) x), 5,
          'every trip locks except Game Night');
SELECT is((SELECT string_agg(s.kind || coalesce('/' || s.state, '') || CASE WHEN s.solo THEN '/solo' ELSE '' END, ',' ORDER BY s.kind, s.state)
           FROM public.passport_stamps s WHERE s.user_id = tests.user_id('me')),
          'international,international,postcard,road_trip/California,road_trip/Texas/solo',
          'state stamps at home (with the solo marker), passport stamps abroad, a postcard for the culture room');
SELECT is((SELECT count(*)::int FROM public.passport_stamps WHERE trip_id = pg_temp.id('gn')), 0, 'Game Night gives no stamp (R-008)');
SELECT is((SELECT culture FROM public.passport_stamps WHERE trip_id = pg_temp.id('cu') AND user_id = tests.user_id('me')), 'Korea',
          'the postcard names its culture');
SELECT is((SELECT kind FROM public.passport_stamps WHERE trip_id = pg_temp.id('ca') AND user_id = tests.user_id('pal')), 'international',
          'without a "From" the trip counts as abroad');
SELECT is((SELECT countries || ':' || level FROM public.passport_progress WHERE user_id = tests.user_id('me')), '3:explorer',
          'United States, Japan, Mexico: Explorer (R-703); the culture postcard isn''t a country');
SELECT is((SELECT string_agg(badge || ':' || tier || ':' || progress, ',' ORDER BY badge) FROM public.user_badges WHERE user_id = tests.user_id('me')),
          'culture_collector:1:1,storyteller:1:1,us_explorer:1:2',
          'badges: 2 states, 1 culture, 1 Window Seat guide');

-- Tiers never go down (R-711).
UPDATE public.user_badges SET tier = 2, progress = 5 WHERE user_id = tests.user_id('me') AND badge = 'us_explorer';
SELECT trip_private.refresh_passport(tests.user_id('me'));
SELECT is((SELECT tier FROM public.user_badges WHERE user_id = tests.user_id('me') AND badge = 'us_explorer'), 2, 'a tier never drops');

-- ---------------------------------------------------------------- reads
SELECT tests.authenticate_as(tests.user_id('me'));
SELECT is((SELECT count(*)::int FROM public.my_stamps()), 5, 'my stamps');
SELECT is((public.my_passport_progress()->>'level'), 'explorer', 'my level');
SELECT is(jsonb_array_length(public.my_passport_progress()->'badges'), 3, 'my badges');
SELECT ok((SELECT bool_and((b->>'new')::boolean) FROM jsonb_array_elements(public.my_passport_progress()->'badges') b), 'new badges celebrate');
SELECT public.mark_badges_seen();
SELECT ok(NOT (SELECT bool_or((b->>'new')::boolean) FROM jsonb_array_elements(public.my_passport_progress()->'badges') b), 'once');
-- The older on-read sync leaves new-engine stamps alone.
SELECT lives_ok($$SELECT * FROM public.passport_collection()$$, 'the older passport screen still loads');
SELECT is((SELECT count(*)::int FROM public.passport_stamps), 5, 'and keeps the new stamps');
SELECT tests.authenticate_as(tests.user_id('pal'));
SELECT is((SELECT count(*)::int FROM public.passport_stamps WHERE user_id = tests.user_id('me')), 0, 'nobody reads another player''s stamps');

SELECT * FROM finish();
ROLLBACK;
