-- Founder review: a new-engine Test Lab sandbox starts with a sample itinerary for travel rooms, so
-- the Trip tab isn't empty; at-home rooms have none.
BEGIN;
\ir ../_helpers.psql
SELECT plan(6);

SELECT tests.create_user('founder', 40);
INSERT INTO public.app_admins (user_id) VALUES (tests.user_id('founder'));
SELECT tests.create_user('bot' || n, 30) FROM generate_series(1, 5) n;
INSERT INTO public.sandbox_bots (user_id, name) SELECT tests.user_id('bot' || n), 'Bot' || n FROM generate_series(1, 5) n;
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;

SELECT tests.authenticate_as(tests.user_id('founder'));
INSERT INTO ids SELECT 'trip', public.lab_engine_create('trip', 'crew', 3, 4);
INSERT INTO ids SELECT 'home', public.lab_engine_create('explore_culture', 'solo', 1, 3);
SELECT tests.clear_authentication();

SELECT is((SELECT jsonb_array_length(days) FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')),
          (SELECT end_date - start_date + 1 FROM public.trips WHERE id = pg_temp.id('trip')),
          'a travel sandbox gets one itinerary day per trip day');
SELECT is((SELECT days->0->>'date' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')),
          (SELECT start_date::text FROM public.trips WHERE id = pg_temp.id('trip')),
          'starting on the first trip day');
SELECT is((SELECT days->0->>'city' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')), 'Lisbon',
          'set in Lisbon, like the sandbox');
SELECT is((SELECT days->0->'flights'->0->>'to' FROM public.trip_itineraries WHERE trip_id = pg_temp.id('trip')), 'LIS',
          'with the arrival flight into Lisbon');
SELECT is((SELECT count(*)::int FROM public.trip_day_tags WHERE trip_id = pg_temp.id('trip')),
          (SELECT end_date - start_date + 1 FROM public.trips WHERE id = pg_temp.id('trip')),
          'and a tag for each day');
SELECT is((SELECT count(*)::int FROM public.trip_itineraries WHERE trip_id = pg_temp.id('home')), 0,
          'an at-home sandbox has no itinerary');

SELECT * FROM finish();
ROLLBACK;
