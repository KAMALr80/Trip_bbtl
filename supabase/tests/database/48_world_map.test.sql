-- World map (deck slide 15, R-721): pins for public adult players' trips and the viewer's own; a
-- private player, a hidden trip and a sandbox stay off it; only members get to open the postcard.
BEGIN;
\ir ../_helpers.psql
SELECT plan(9);

SELECT tests.create_user('me', 30);
SELECT tests.create_user('pub', 30);
SELECT tests.create_user('priv', 30);
SELECT tests.create_user('stranger', 30);
INSERT INTO public.player_profiles (user_id, real_name, game_name)
VALUES (tests.user_id('me'), 'Me', 'me'), (tests.user_id('pub'), 'Pub', 'pub'),
       (tests.user_id('priv'), 'Priv', 'priv'), (tests.user_id('stranger'), 'Stranger', 'stranger');
INSERT INTO public.profile_prefs (user_id, is_public, hidden_trips) VALUES
  (tests.user_id('pub'), true, '{}'), (tests.user_id('priv'), false, '{}')
ON CONFLICT (user_id) DO UPDATE SET is_public = excluded.is_public, hidden_trips = excluded.hidden_trips;

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;
INSERT INTO ids VALUES
  ('mine', tests.create_trip(tests.user_id('me'), 14, 4, 'a2c', 'UTC', 'UTC')),
  ('public', tests.create_trip(tests.user_id('pub'), 14, 4, 'a2c', 'UTC', 'UTC')),
  ('hidden', tests.create_trip(tests.user_id('pub'), 14, 4, 'a2c', 'UTC', 'UTC')),
  ('private', tests.create_trip(tests.user_id('priv'), 14, 4, 'a2c', 'UTC', 'UTC')),
  ('sandbox', tests.create_trip(tests.user_id('pub'), 14, 4, 'a2c', 'UTC', 'UTC'));
UPDATE public.trips SET is_sandbox = true WHERE id = pg_temp.id('sandbox');
UPDATE public.profile_prefs SET hidden_trips = ARRAY[pg_temp.id('hidden')] WHERE user_id = tests.user_id('pub');

INSERT INTO public.passport_stamps (user_id, trip_id, kind, country, city, stamped_on, room, crowns)
VALUES (tests.user_id('me'), pg_temp.id('mine'), 'international', 'Japan', 'Tokyo', date '2026-10-01', 'trip', '{}'),
       (tests.user_id('pub'), pg_temp.id('public'), 'international', 'Portugal', 'Lisbon', date '2026-09-01', 'trip',
        '{trip_season}'),
       (tests.user_id('pub'), pg_temp.id('hidden'), 'international', 'Peru', 'Cusco', date '2026-08-01', 'trip', '{}'),
       (tests.user_id('priv'), pg_temp.id('private'), 'international', 'Kenya', 'Nairobi', date '2026-07-01', 'trip', '{}'),
       (tests.user_id('pub'), pg_temp.id('sandbox'), 'international', 'Chile', 'Santiago', date '2026-06-01', 'trip', '{}');

SELECT tests.authenticate_as(tests.user_id('me'));
SELECT ok(EXISTS (SELECT 1 FROM public.world_map() WHERE trip_id = pg_temp.id('mine')), 'my own trip is on my map');
SELECT ok(EXISTS (SELECT 1 FROM public.world_map() WHERE trip_id = pg_temp.id('public')), 'a public player''s trip is on it');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.world_map() WHERE trip_id = pg_temp.id('private')), 'a private player''s trip is not');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.world_map() WHERE trip_id = pg_temp.id('hidden')), 'a hidden trip is not (Q28)');
SELECT ok(NOT EXISTS (SELECT 1 FROM public.world_map() WHERE trip_id = pg_temp.id('sandbox')), 'a sandbox is not');
SELECT is((SELECT country FROM public.world_map() WHERE trip_id = pg_temp.id('public')), 'Portugal', 'the pin''s country');
SELECT is((SELECT crowns FROM public.world_map() WHERE trip_id = pg_temp.id('public')), ARRAY['trip_season'], 'and its crowns');
SELECT is((SELECT member FROM public.world_map() WHERE trip_id = pg_temp.id('public')), false,
          'not a member, so no postcard to open');
SELECT tests.clear_authentication();

SELECT tests.authenticate_as_anon();
SELECT throws_ok($$SELECT * FROM public.world_map()$$, '42501', NULL, 'signed-out visitors can''t read the map');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
