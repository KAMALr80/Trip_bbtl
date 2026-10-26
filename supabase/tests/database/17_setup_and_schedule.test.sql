-- M2-05 create_trip_v2 + drafts, M2-06 call nights, M2-12 plan_trip.
BEGIN;
\ir ../_helpers.psql
SELECT plan(37);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('young', 20);
SELECT tests.create_user('co', 30);
SELECT tests.create_user('p1', 25);

-- A setup with dates relative to today (home zone UTC).
CREATE FUNCTION pg_temp.setup(p_room text, p_mode text DEFAULT 'crew', p_start int DEFAULT 20, p_days int DEFAULT 5,
                              p_pre int DEFAULT 5, p_extra jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'room', p_room, 'playMode', p_mode, 'name', 'Bali Crew', 'destination', 'Ubud, Bali, Indonesia',
    'country', 'ID', 'city', 'Ubud', 'lat', -8.5, 'lng', 115.26,
    'startDate', current_date + p_start, 'endDate', current_date + p_start + p_days - 1,
    'preflightDays', p_pre, 'vibe', 'chill', 'homeTz', 'UTC', 'tripTz', 'Asia/Makassar',
    'crowningAt', ((current_date + p_start + p_days - 1) + time '12:00') AT TIME ZONE 'Asia/Makassar',
    'crowningPlace', 'The villa') || p_extra
$$;
GRANT EXECUTE ON FUNCTION pg_temp.setup(text, text, int, int, int, jsonb) TO PUBLIC;
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;

-- ---------------------------------------------------------------- who can create, and what
SELECT tests.authenticate_as(tests.user_id('young'));
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('trip'))$$, 'Captains are 21+%', 'Captains are 21+ (R-904)');

SELECT tests.authenticate_as(tests.user_id('cap'));
INSERT INTO ids SELECT 'trip', public.create_trip_v2(pg_temp.setup('trip'));
SELECT is((SELECT role FROM public.trip_members WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND user_id = tests.user_id('cap')),
          'captain', 'whoever creates the trip is its Captain (R-207)');
SELECT is((SELECT room || '/' || play_mode || '/' || preflight_days FROM public.trips WHERE id = (SELECT id FROM ids WHERE k = 'trip')),
          'trip/crew/5', 'the setup answers are saved (R-211)');
SELECT ok((SELECT join_code ~ '^[A-Z]{8}$' AND join_code_enabled FROM public.trips WHERE id = (SELECT id FROM ids WHERE k = 'trip')),
          'a trip code is made automatically (R-206)');
SELECT lives_ok($$INSERT INTO ids SELECT 'window', public.create_trip_v2(pg_temp.setup('window_seat', 'solo'))$$, 'Window Seat solo');
SELECT lives_ok($$INSERT INTO ids SELECT 'explore', public.create_trip_v2(pg_temp.setup('explore_culture', 'solo', 10, 3, 2, '{"focuses": ["food", "music"]}'))$$,
                'Explore a Culture solo with two focuses (R-004, R-361)');
SELECT lives_ok($$INSERT INTO ids SELECT 'show', public.create_trip_v2(pg_temp.setup('show_culture', 'offline', 10, 3, 0))$$, 'Show Your Culture off the app');
SELECT lives_ok($$INSERT INTO ids SELECT 'night', public.create_trip_v2(pg_temp.setup('game_night', 'offline', 0, 1, 0, '{"crowningAt": null}'))$$,
                'a Game Night tonight, without a crowning night');
SELECT is((SELECT trip_timezone FROM public.trips WHERE id = (SELECT id FROM ids WHERE k = 'explore')), 'UTC',
          'at-home rooms use home time only (R-108)');
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('explore_culture', 'crew', 0, 3, 0))$$,
                   'At-home experiences start tomorrow at the earliest%', 'at-home rooms are made at least the day before (R-110)');
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('game_night', 'solo', 0, 1, 0, '{"crowningAt": null}'))$$,
                   'Choose who''s playing', 'Game Night has no "Just me" (R-004)');
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('trip', 'crew', 20, 15))$$, 'Trips can be up to 14 days%', 'trips are 14 days at most');
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('trip') - 'crowningAt')$$, 'Pick the crowning night%',
                   'the crowning night is required (R-205)');
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('trip', 'crew', 20, 5, 5, jsonb_build_object('crowningAt', now())))$$,
                   'The crowning night has to be on one of the trip days', 'the crowning night is during the trip');
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('trip', 'crew', 20, 5, 5, '{"tripTz": "Mars/Olympus"}'))$$,
                   'Check the trip time zone', 'time zones are checked');
SELECT throws_like($$SELECT public.create_trip_v2(pg_temp.setup('trip', 'crew', 20, 5, 5, '{"hasMinors": true, "vibe": "party"}'))$$,
                   '%party vibe', 'trips with minors can''t be party trips');

-- ---------------------------------------------------------------- call nights (R-204)
SELECT is(public.set_call_nights((SELECT id FROM ids WHERE k = 'trip'),
            jsonb_build_array(jsonb_build_object('startsAt', (current_date + 17) + time '19:00', 'callLink', 'https://meet.example/a',
                                                 'secondLink', 'https://zoom.example/b'))), 1, 'a call night inside Pre-Flight is saved');
SELECT throws_like($$SELECT public.set_call_nights((SELECT id FROM ids WHERE k = 'trip'),
                     jsonb_build_array(jsonb_build_object('startsAt', (current_date + 21) + time '19:00')))$$,
                   'Call nights happen during Pre-Flight%', 'call nights outside Pre-Flight are refused');
SELECT throws_like($$SELECT public.set_call_nights((SELECT id FROM ids WHERE k = 'trip'),
                     (SELECT jsonb_agg(jsonb_build_object('startsAt', (current_date + 15 + n) + time '19:00')) FROM generate_series(0, 4) n))$$,
                   'Up to 4 call nights per trip', 'a 5th call night is refused');
SELECT throws_like($$SELECT public.set_call_nights((SELECT id FROM ids WHERE k = 'trip'), '[{"startsAt": "2026-13-45"}]')$$,
                   'Pick a date and time%', 'bad dates are refused');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.set_call_nights((SELECT id FROM ids WHERE k = 'trip'), '[]')$$,
                   'Only the Captain or Co-Captain%', 'players cannot set call nights');

-- ---------------------------------------------------------------- schedule (M2-12)
SELECT tests.clear_authentication();
SELECT is((SELECT string_agg(kind || ':' || slot, ',' ORDER BY opens_at) FILTER (WHERE kind <> 'call_night')
           || ',' || count(*) FILTER (WHERE kind = 'call_night')
           FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip')),
          'phase:preflight,phase:takeoff,phase:trip_season,crowning:,phase:baggage_claim,1',
          'the schedule has the four phases, the call night and the crowning night');
CREATE TEMP TABLE before AS SELECT id, opens_at FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip');
SELECT trip_private.plan_trip((SELECT id FROM ids WHERE k = 'trip'));
SELECT is((SELECT count(*)::int FROM public.trip_schedule s JOIN before b USING (id, opens_at)), (SELECT count(*)::int FROM before),
          're-running the planner changes nothing (idempotent)');
UPDATE public.trips SET start_date = start_date + 1, end_date = end_date + 1 WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT is((SELECT opens_at FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND slot = 'takeoff'),
          ((current_date + 21)::timestamp AT TIME ZONE 'UTC'), 'moving the dates re-plans future items');
UPDATE public.trips SET preflight_skipped = true WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT is((SELECT count(*)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND slot = 'preflight'), 0,
          'skipping Pre-Flight removes its marker');
SELECT is((SELECT season_scoring FROM public.trips WHERE id = (SELECT id FROM ids WHERE k = 'night')), false,
          'a Game Night never counts for boards or crowns (R-008)');
SELECT is((SELECT count(*)::int FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'night') AND kind = 'phase'), 2,
          'a Game Night has the night and Baggage Claim only');

-- ---------------------------------------------------------------- Captain tiles (M2-11)
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('co'), 'co_captain');
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT lives_ok($$SELECT public.set_crowning_night((SELECT id FROM ids WHERE k = 'trip'),
                   ((current_date + 22) + time '20:00') AT TIME ZONE 'Asia/Makassar', 'Beach club', NULL)$$,
                'the Co-Captain moves the crowning night');
SELECT is((SELECT opens_at FROM public.trip_schedule WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND kind = 'crowning'),
          ((current_date + 22) + time '20:00') AT TIME ZONE 'Asia/Makassar', 'and the schedule follows');
SELECT throws_like($$SELECT public.set_crowning_night((SELECT id FROM ids WHERE k = 'trip'), now(), 'x', NULL)$$,
                   'The crowning night has to be on one of the trip days', 'only on a trip day');
SELECT throws_like($$SELECT public.set_preflight((SELECT id FROM ids WHERE k = 'trip'), 3, false)$$,
                   'Some call nights would fall outside Pre-Flight%', 'Pre-Flight can''t shrink past a call night');
SELECT lives_ok($$SELECT public.set_preflight((SELECT id FROM ids WHERE k = 'trip'), 5, false)$$, 'the Co-Captain sets Pre-Flight days');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.set_preflight((SELECT id FROM ids WHERE k = 'trip'), 0, true)$$,
                   'Only the Captain or Co-Captain%', 'players cannot change Pre-Flight');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- drafts
SELECT tests.authenticate_as(tests.user_id('co'));
SELECT lives_ok($$SELECT public.save_trip_draft('{"step": 2, "room": "trip", "name": "Lisbon"}')$$, 'a draft is saved');
SELECT is((SELECT data->>'name' FROM public.trip_drafts), 'Lisbon', 'and read back by its owner');
SELECT throws_like($$SELECT public.save_trip_draft('{"offlineNames": ["Ana"]}')$$, '%trip_drafts_data_check%',
                   'off-app names never reach the server (R-006)');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT count(*)::int FROM public.trip_drafts), 0, 'nobody else sees a draft');
SELECT tests.clear_authentication();
SELECT * FROM finish();
ROLLBACK;
