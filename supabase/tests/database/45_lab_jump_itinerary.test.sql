-- Founder review: a Test Lab jump moves the sandbox's dates, so its itinerary and day tags move too
-- (new engine: lab_jump; older time travel: lab_shift keeps the trip's own itinerary).
BEGIN;
\ir ../_helpers.psql
SELECT plan(9);

SELECT tests.create_user('founder', 40);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('founder'));
SELECT tests.create_user('bot' || n, 30) FROM generate_series(1, 5) n;
INSERT INTO public.sandbox_bots (user_id, name) SELECT tests.user_id('bot' || n), 'Bot' || n FROM generate_series(1, 5) n;
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;

SELECT tests.authenticate_as(tests.user_id('founder'));
INSERT INTO ids SELECT 'trip', public.lab_engine_create('trip', 'crew', 3, 4);
SELECT tests.clear_authentication();

-- An itinerary on the trip's first two days (one with a flight) and a tag on day 2.
INSERT INTO public.trip_itineraries (trip_id, days)
SELECT t.id, jsonb_build_array(
         jsonb_build_object('date', t.start_date::text, 'city', 'Lisbon', 'stays', '[]'::jsonb, 'spots', '[]'::jsonb,
                            'flights', jsonb_build_array(jsonb_build_object('date', t.start_date::text, 'from', 'BOM', 'to', 'LIS'))),
         jsonb_build_object('date', (t.start_date + 1)::text, 'city', 'Porto', 'stays', '[]'::jsonb, 'spots', '[]'::jsonb,
                            'flights', '[]'::jsonb))
FROM public.trips t WHERE t.id = pg_temp.id('trip')
ON CONFLICT (trip_id) DO UPDATE SET days = excluded.days;
-- The sandbox starts with the sample day tags; keep only one to follow.
DELETE FROM public.trip_day_tags WHERE trip_id = pg_temp.id('trip');
INSERT INTO public.trip_day_tags (trip_id, day_date, tag)
SELECT id, start_date + 1, 'Explore' FROM public.trips WHERE id = pg_temp.id('trip');

SELECT tests.authenticate_as(tests.user_id('founder'));
SELECT is(public.lab_jump(pg_temp.id('trip'), 'trip_season'), 'trip_season', 'jump to Trip Season');
SELECT tests.clear_authentication();

SELECT is((SELECT days->0->>'date' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')),
          (SELECT start_date::text FROM public.trips WHERE id = pg_temp.id('trip')),
          'day 1 of the itinerary moved to the new first day');
SELECT is((SELECT days->1->>'date' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')),
          (SELECT (start_date + 1)::text FROM public.trips WHERE id = pg_temp.id('trip')),
          'day 2 moved with it');
SELECT is((SELECT days->0->'flights'->0->>'date' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')),
          (SELECT start_date::text FROM public.trips WHERE id = pg_temp.id('trip')),
          'and its flight');
SELECT is((SELECT days->0->>'city' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')), 'Lisbon',
          'nothing else in the day changed');
SELECT is((SELECT day_date FROM public.trip_day_tags WHERE trip_id = pg_temp.id('trip')),
          (SELECT start_date + 1 FROM public.trips WHERE id = pg_temp.id('trip')),
          'the day tag moved too');

-- ---------------------------------------------------------------- older time travel (lab_shift)
SELECT tests.authenticate_as(tests.user_id('founder'));
INSERT INTO ids SELECT 'old', public.lab_create(4, 7, 10);
SELECT tests.clear_authentication();
UPDATE public.trip_itineraries SET days = jsonb_set(days, '{0,city}', '"Founder city"') WHERE trip_id = pg_temp.id('old');
SELECT tests.authenticate_as(tests.user_id('founder'));
SELECT lives_ok($$SELECT public.lab_shift(pg_temp.id('old'), 'day', 2)$$, 'time travel to trip day 2');
SELECT tests.clear_authentication();
SELECT is((SELECT days->0->>'city' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('old')), 'Founder city',
          'the trip''s own itinerary is kept, not replaced by the sample');
SELECT is((SELECT days->0->>'date' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('old')),
          (SELECT start_date::text FROM public.trips WHERE id = pg_temp.id('old')),
          'and it moved with the dates');

SELECT * FROM finish();
ROLLBACK;
