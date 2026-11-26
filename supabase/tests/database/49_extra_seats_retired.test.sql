-- QA-B02: the "+6 seats" add-on is retired. A crew trip's cap is its room's maxCrew (12) and asking
-- for extra seats is refused, so no add-on price or order can be recorded for nothing.
BEGIN;
\ir ../_helpers.psql
SELECT plan(5);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('pal', 30);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;
INSERT INTO ids VALUES ('trip', tests.create_trip(tests.user_id('cap'), 14, 4, 'a2c', 'UTC', 'UTC'));
UPDATE public.trips SET room = 'trip', play_mode = 'crew', play_arrangement = 'online' WHERE id = pg_temp.id('trip');
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('pal'));

SELECT is(trip_private.seat_cap(pg_temp.id('trip')), 12, 'a crew trip already has 12 seats (R-005)');

SELECT tests.authenticate_as(tests.user_id('pal'));
SELECT throws_like($$SELECT public.unlock_extra_seats(pg_temp.id('trip'))$$, 'Only the Captain can add seats',
                   'a player still can''t ask');
SELECT tests.clear_authentication();

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.unlock_extra_seats(pg_temp.id('trip'))$$, '%every seat its room allows%',
                   'the Captain is told the crew already has every seat');
SELECT tests.clear_authentication();

SELECT is((SELECT extra_seats FROM public.trips WHERE id = pg_temp.id('trip')), false, 'the flag is not set');
SELECT is((SELECT count(*)::int FROM public.orders WHERE trip_id = pg_temp.id('trip') AND kind = 'seat_addon'), 0,
          'and no add-on order is recorded');

SELECT * FROM finish();
ROLLBACK;
