-- QA-09 (R-105): a Pre-Flight that was skipped or has no days gives no Early Bird crown, whoever has
-- points. A Pre-Flight that ran crowns the leader, and the phase before takeoff is "upcoming".
BEGIN;
\ir ../_helpers.psql
SELECT plan(9);

SELECT tests.create_user('cap', 30);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
INSERT INTO ids SELECT v.k, tests.create_trip(tests.user_id('cap'), 3, 6, 'a2c', 'UTC', 'Europe/Lisbon')
FROM (VALUES ('zero'), ('skip'), ('real')) v(k);
UPDATE public.trips SET preflight_days = 0 WHERE id = (SELECT id FROM ids WHERE k = 'zero');
UPDATE public.trips SET preflight_days = 5, preflight_skipped = true WHERE id = (SELECT id FROM ids WHERE k = 'skip');
UPDATE public.trips SET preflight_days = 5 WHERE id = (SELECT id FROM ids WHERE k = 'real');
SELECT trip_private.award_points(i.id, tests.user_id('cap'), 'preflight', 'daily_card', i.id, 2, 'approved', now(), NULL)
FROM ids i;

SELECT is((SELECT phase FROM trip_private.trip_phase((SELECT id FROM ids WHERE k = 'zero'))), 'upcoming',
  'zero days of Pre-Flight: the phase before takeoff is upcoming');
SELECT is((SELECT phase FROM trip_private.trip_phase((SELECT id FROM ids WHERE k = 'skip'))), 'upcoming',
  'skipped Pre-Flight: the phase before takeoff is upcoming');
SELECT is((SELECT phase FROM trip_private.trip_phase((SELECT id FROM ids WHERE k = 'real'))), 'preflight',
  'five days of Pre-Flight, three days out: the phase is preflight');

SELECT trip_private.crown_season((SELECT id FROM ids WHERE k = 'zero'), 'preflight', 'preflight_close');
SELECT trip_private.crown_season((SELECT id FROM ids WHERE k = 'skip'), 'preflight', 'preflight_close');
SELECT trip_private.crown_season((SELECT id FROM ids WHERE k = 'real'), 'preflight', 'preflight_close');

SELECT is((SELECT count(*)::int FROM public.trip_crowns WHERE trip_id = (SELECT id FROM ids WHERE k = 'zero')), 0,
  'zero days: no Early Bird crown, even with points');
SELECT is((SELECT count(*)::int FROM public.trip_crowns WHERE trip_id = (SELECT id FROM ids WHERE k = 'skip')), 0,
  'skipped: no Early Bird crown, even with points');
SELECT is((SELECT count(*)::int FROM public.trip_crowns WHERE trip_id = (SELECT id FROM ids WHERE k = 'real')), 1,
  'a Pre-Flight that ran crowns the leader');
SELECT is((SELECT points FROM public.trip_crowns WHERE trip_id = (SELECT id FROM ids WHERE k = 'real')), 2,
  'with their points');
SELECT is((SELECT count(*)::int FROM public.trip_crownings WHERE trip_id = (SELECT id FROM ids WHERE k = 'zero')), 1,
  'zero days: the season is still marked closed, so it is not retried');

SELECT trip_private.crown_season((SELECT id FROM ids WHERE k = 'real'), 'preflight', 'preflight_close');
SELECT is((SELECT count(*)::int FROM public.trip_crowns WHERE trip_id = (SELECT id FROM ids WHERE k = 'real')), 1,
  'crowning twice changes nothing');

SELECT * FROM finish();
ROLLBACK;
