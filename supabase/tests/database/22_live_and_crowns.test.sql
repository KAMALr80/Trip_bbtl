-- M3-07 Game Night Live and M3-11 crowns: Show & Tell 👍, secret awards with ties, Close / Reopen,
-- midnight auto-close, Early Bird / Jet Setter with the tie-break, the solo goal and the Q10 fallback.
BEGIN;
\ir ../_helpers.psql
SELECT plan(27);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
-- In Pre-Flight, with a call night that started an hour ago.
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 3, 4, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET preflight_days = 5 WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p2'));
INSERT INTO public.call_nights (trip_id, starts_at) VALUES ((SELECT id FROM ids WHERE k = 'trip'), now() + interval '2 hours');
INSERT INTO ids SELECT 'night', id FROM public.call_nights WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip');
CREATE FUNCTION pg_temp.pts(p_user text, p_season text DEFAULT 'preflight') RETURNS int LANGUAGE sql AS $$
  SELECT points FROM trip_private.standings((SELECT id FROM ids WHERE k = 'trip'), p_season) WHERE user_id = tests.user_id(p_user)
$$;

-- ---------------------------------------------------------------- open
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.open_live((SELECT id FROM ids WHERE k = 'trip'), NULL, true)$$, '%opens the crowning night',
                   'players open call nights, not the crowning night');
INSERT INTO ids SELECT 'live', public.open_live((SELECT id FROM ids WHERE k = 'trip'), (SELECT id FROM ids WHERE k = 'night'));
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT is(public.open_live((SELECT id FROM ids WHERE k = 'trip'), (SELECT id FROM ids WHERE k = 'night')), (SELECT id FROM ids WHERE k = 'live'),
          'everyone lands on the same screen (R-405)');
SELECT is((SELECT season FROM public.live_sessions WHERE id = (SELECT id FROM ids WHERE k = 'live')), 'preflight', 'a call night counts toward Pre-Flight');
SELECT is((SELECT auto_close_at FROM public.live_sessions WHERE id = (SELECT id FROM ids WHERE k = 'live')),
          ((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC', 'it closes itself at local midnight (R-404)');

-- ---------------------------------------------------------------- Show & Tell (R-402)
SELECT throws_like($$SELECT public.live_present((SELECT id FROM ids WHERE k = 'live'), auth.uid())$$, 'You can''t tap your own avatar',
                   'no tapping yourself');
SELECT ok(public.live_present((SELECT id FROM ids WHERE k = 'live'), tests.user_id('p1')), 'the first 👍 for p1');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT ok(NOT public.live_present((SELECT id FROM ids WHERE k = 'live'), tests.user_id('p1')), 'a second 👍 adds nothing');
SELECT tests.clear_authentication();
SELECT is(pg_temp.pts('p1'), 20 + (SELECT points FROM public.trip_schedule WHERE kind = 'sealed_quest' AND user_id = tests.user_id('p1')),
          'show up + present = 20, and their sealed quest for the night counts');

-- ---------------------------------------------------------------- Awards (R-403, Q7)
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.live_vote_award((SELECT id FROM ids WHERE k = 'live'), 'best_overall', auth.uid())$$, 'Vote for someone else',
                   'no self-votes (Q7)');
SELECT public.live_vote_award((SELECT id FROM ids WHERE k = 'live'), 'best_overall', tests.user_id('p2'));
SELECT public.live_vote_award((SELECT id FROM ids WHERE k = 'live'), 'best_story', tests.user_id('cap'));
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT public.live_vote_award((SELECT id FROM ids WHERE k = 'live'), 'best_overall', tests.user_id('p1'));
SELECT throws_ok($$SELECT * FROM public.live_award_votes$$, '42501', NULL, 'ballots can''t be read directly');
SELECT is((SELECT count(*)::int FROM public.live_state((SELECT id FROM ids WHERE k = 'live')) WHERE cardinality(won_awards) > 0), 0,
          'no winners show before Close');
SELECT is((SELECT thumbs FROM public.live_state((SELECT id FROM ids WHERE k = 'live')) WHERE user_id = tests.user_id('p1')), 2,
          '👍 counts are live');
SELECT throws_like($$SELECT public.close_live((SELECT id FROM ids WHERE k = 'live'))$$, '%closes Game Night', 'players can''t close');

SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT public.close_live((SELECT id FROM ids WHERE k = 'live'));
SELECT tests.clear_authentication();
SELECT is((SELECT string_agg(source || ':' || u.handle, ',' ORDER BY source, u.handle) FROM public.points_ledger l JOIN tests.users u ON u.id = l.user_id
           WHERE source LIKE 'award%' AND status = 'approved'),
          'award_best_overall:p1,award_best_overall:p2,award_best_story:cap', 'a tie gives every tied player the award (Q7)');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT is((SELECT won_awards FROM public.live_state((SELECT id FROM ids WHERE k = 'live')) WHERE user_id = tests.user_id('cap')),
          ARRAY['best_story'], 'winners show after Close');
SELECT throws_like($$SELECT public.live_present((SELECT id FROM ids WHERE k = 'live'), tests.user_id('p2'))$$, 'This Game Night has closed',
                   'no 👍 after Close');
SELECT public.reopen_live((SELECT id FROM ids WHERE k = 'live'));
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.points_ledger WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip')
             AND source LIKE 'award%' AND status = 'approved'), 0,
          'Reopen takes the award points back until the next Close');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT public.live_vote_award((SELECT id FROM ids WHERE k = 'live'), 'best_overall', tests.user_id('cap'));
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT public.close_live((SELECT id FROM ids WHERE k = 'live'));
SELECT tests.clear_authentication();
SELECT is((SELECT string_agg(source || ':' || u.handle, ',' ORDER BY source, u.handle) FROM public.points_ledger l JOIN tests.users u ON u.id = l.user_id
           WHERE source LIKE 'award%' AND status = 'approved'),
          'award_best_overall:cap,award_best_overall:p1,award_best_story:cap', 'closing again re-counts the votes');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- auto-close (R-404)
UPDATE public.live_sessions SET status = 'open', closed_at = NULL, auto_close_at = now() - interval '1 minute' WHERE id = (SELECT id FROM ids WHERE k = 'live');
SELECT ok(trip_private.live_and_crowns_due() >= 1, 'the job runs with nobody online');
SELECT is((SELECT status || ':' || (closed_by IS NULL)::text FROM public.live_sessions WHERE id = (SELECT id FROM ids WHERE k = 'live')),
          'closed:true', 'and closes it at midnight');

-- ---------------------------------------------------------------- crowns (R-503 – R-507)
-- Early Bird: p1 leads Pre-Flight.
SELECT trip_private.crown_season((SELECT id FROM ids WHERE k = 'trip'), 'preflight', 'preflight_close');
SELECT is((SELECT string_agg(u.handle, ',') FROM public.trip_crowns c JOIN tests.users u ON u.id = c.user_id WHERE c.season = 'preflight'),
          'p1', 'Early Bird goes to the top Pre-Flight scorer');
SELECT trip_private.crown_season((SELECT id FROM ids WHERE k = 'trip'), 'preflight', 'preflight_close');
SELECT is((SELECT count(*)::int FROM public.trip_crowns WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND season = 'preflight'), 1,
          'crowning is idempotent');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.open_live((SELECT id FROM ids WHERE k = 'trip'))$$, '%crown has already been decided',
                   'no more Pre-Flight Game Nights after Early Bird');
SELECT tests.clear_authentication();

-- Jet Setter, fallback (Q10): no crowning night and the last trip day's 9 PM has passed.
UPDATE public.trips SET start_date = current_date - 6, end_date = current_date - 2, crowning_at = NULL, preflight_days = 0
WHERE id = (SELECT id FROM ids WHERE k = 'trip');
SELECT trip_private.award_points((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p2'), 'trip_season', 'trip_quest', NULL, 10);
SELECT trip_private.live_and_crowns_due();
SELECT is((SELECT how FROM public.trip_crownings WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND season = 'trip_season'), 'fallback',
          'Jet Setter is crowned without a crowning night (Q10)');
SELECT is((SELECT string_agg(u.handle, ',') FROM public.trip_crowns c JOIN tests.users u ON u.id = c.user_id WHERE c.season = 'trip_season'),
          'p2', 'the Trip Season leader wears it');

-- Solo goal (R-507, Q5).
SELECT tests.create_user('solo', 30);
INSERT INTO ids SELECT 'solo', tests.create_trip(tests.user_id('solo'), 3, 4, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET preflight_days = 4, play_mode = 'solo' WHERE id = (SELECT id FROM ids WHERE k = 'solo');
SELECT ok(trip_private.solo_goal((SELECT id FROM ids WHERE k = 'solo'), 'preflight') > 0, 'a solo trip has a Pre-Flight goal');
SELECT trip_private.award_points((SELECT id FROM ids WHERE k = 'solo'), tests.user_id('solo'), 'preflight', 'showcase', NULL, 20);
SELECT trip_private.crown_season((SELECT id FROM ids WHERE k = 'solo'), 'preflight', 'preflight_close');
SELECT is((SELECT (count(*) = 1) = (20 >= trip_private.solo_goal((SELECT id FROM ids WHERE k = 'solo'), 'preflight'))
           FROM public.trip_crowns WHERE trip_id = (SELECT id FROM ids WHERE k = 'solo')),
          true, 'solo is crowned only when the points reach the goal');

SELECT * FROM finish();
ROLLBACK;
