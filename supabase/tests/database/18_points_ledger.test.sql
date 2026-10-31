-- M3-01 points ledger: award_points, caps, idempotency, status moves, standings and tie-breaks.
BEGIN;
\ir ../_helpers.psql
SELECT plan(32);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
SELECT tests.create_user('pend', 25);
SELECT tests.create_user('out', 25);

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 14, 5);
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p2'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('pend'), 'player', 'pending');
INSERT INTO ids VALUES ('q1', gen_random_uuid()), ('q2', gen_random_uuid()), ('q3', gen_random_uuid()), ('night', gen_random_uuid());

CREATE FUNCTION pg_temp.award(p_user text, p_season text, p_source text, p_ref text, p_points int,
                              p_status text DEFAULT 'approved', p_at timestamptz DEFAULT now()) RETURNS bigint
LANGUAGE sql AS $$
  SELECT trip_private.award_points((SELECT id FROM ids WHERE k = 'trip'), tests.user_id(p_user), p_season, p_source,
                                   (SELECT id FROM ids WHERE k = p_ref), p_points, p_status, p_at)
$$;
CREATE FUNCTION pg_temp.total(p_user text, p_season text) RETURNS int LANGUAGE sql AS $$
  SELECT points FROM trip_private.standings((SELECT id FROM ids WHERE k = 'trip'), p_season) WHERE user_id = tests.user_id(p_user)
$$;

-- ---------------------------------------------------------------- the rules table
SELECT is((SELECT points_min || '-' || points_max FROM public.points_rules WHERE source = 'surprise_drop'), '10-33',
          'Surprise Drops are worth 10-33 (R-502, Q4)');
SELECT is((SELECT cap_per_trip FROM public.points_rules WHERE source = 'airport_mission'), 12, 'missions cap at 12 (R-332)');

-- ---------------------------------------------------------------- award_points checks
SELECT ok(pg_temp.award('p1', 'preflight', 'sealed_quest', 'q1', 10) IS NOT NULL, 'a sealed quest is awarded');
SELECT is(pg_temp.award('p1', 'preflight', 'sealed_quest', 'q1', 10),
          (SELECT id FROM public.points_ledger WHERE source = 'sealed_quest' AND user_id = tests.user_id('p1')),
          'a replay returns the same row');
SELECT is(pg_temp.total('p1', 'preflight'), 10, 'a replay doesn''t double-count');
SELECT throws_like($$SELECT pg_temp.award('p1', 'preflight', 'sealed_quest', 'q2', 16)$$, '%worth 5 to 15 points%',
                   'points outside the range are refused');
SELECT throws_like($$SELECT pg_temp.award('p1', 'trip_season', 'sealed_quest', 'q2', 10)$$, '%count toward preflight%',
                   'a source can''t land in the wrong season');
SELECT throws_like($$SELECT pg_temp.award('p1', 'preflight', 'made_up', 'q2', 1)$$, 'Unknown points source%', 'unknown sources are refused');
SELECT throws_like($$SELECT pg_temp.award('pend', 'preflight', 'showcase', 'q1', 20)$$, 'Only players in this trip%',
                   'pending players don''t earn points');
SELECT throws_like($$SELECT pg_temp.award('out', 'preflight', 'showcase', 'q1', 20)$$, 'Only players in this trip%',
                   'outsiders don''t earn points');

-- ---------------------------------------------------------------- caps (R-332) and one a day
SELECT ok(pg_temp.award('p2', 'trip_season', 'airport_mission', 'q1', 4) IS NOT NULL, 'mission 1');
SELECT ok(pg_temp.award('p2', 'trip_season', 'airport_mission', 'q2', 4) IS NOT NULL, 'mission 2');
SELECT ok(pg_temp.award('p2', 'trip_season', 'home_mission', 'q3', 3) IS NOT NULL, 'home missions share the cap');
SELECT ok(pg_temp.award('p2', 'trip_season', 'airport_mission', 'night', 4) IS NOT NULL, 'the fourth fits partly');
SELECT is((SELECT points FROM public.points_ledger WHERE user_id = tests.user_id('p2') AND source_ref = (SELECT id FROM ids WHERE k = 'night')),
          1, 'it is trimmed to what''s left of the cap');
SELECT is(pg_temp.total('p2', 'trip_season'), 12, 'missions total 12 at most');
SELECT is(pg_temp.award('p2', 'trip_season', 'airport_mission', NULL, 2), NULL, 'nothing more once the cap is reached');

SELECT ok(pg_temp.award('p2', 'preflight', 'daily_card', 'q1', 2) IS NOT NULL, 'today''s Daily Card');
SELECT is(pg_temp.award('p2', 'preflight', 'daily_card', 'q2', 2), NULL, 'a second Daily Card the same day earns nothing');
SELECT ok(pg_temp.award('p2', 'preflight', 'daily_card', 'q3', 1, 'approved', now() + interval '1 day') IS NOT NULL,
          'tomorrow''s counts again');

-- ---------------------------------------------------------------- status moves (Crew Check, reopen)
SELECT ok(pg_temp.award('cap', 'preflight', 'showcase', 'q1', 20, 'pending') IS NOT NULL, 'a pending Showcase');
SELECT is(pg_temp.total('cap', 'preflight'), 0, 'pending points don''t count yet');
SELECT ok(trip_private.set_points_status((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('cap'), 'showcase',
                                         (SELECT id FROM ids WHERE k = 'q1'), 'approved'), 'approved by the crew');
SELECT is(pg_temp.total('cap', 'preflight'), 20, 'approved points count');
SELECT throws_like($$SELECT trip_private.set_points_status((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('cap'), 'showcase',
                                                           (SELECT id FROM ids WHERE k = 'q1'), 'pending')$$,
                   'Points can''t go from approved to pending', 'status only moves forward');

-- ---------------------------------------------------------------- standings and the tie-break (R-506)
-- cap 20 (all Showcase) vs p1 10 + 10 later: tied on 20; cap has more Showcase points.
SELECT ok(pg_temp.award('p1', 'preflight', 'sealed_quest', 'q3', 10, 'approved', now() + interval '1 hour') IS NOT NULL, 'p1 catches up');
SELECT is((SELECT array_agg(rank ORDER BY rank) FROM trip_private.standings((SELECT id FROM ids WHERE k = 'trip'), 'preflight')),
          ARRAY[1, 2, 3], 'standings: Showcase breaks the tie, then everyone else');
SELECT is((SELECT user_id FROM trip_private.standings((SELECT id FROM ids WHERE k = 'trip'), 'preflight') WHERE rank = 1),
          tests.user_id('cap'), 'more Showcase points wins the tie');

-- ---------------------------------------------------------------- access
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT count(*)::int FROM public.points_ledger), 2, 'players read only their own rows');
SELECT throws_ok($$INSERT INTO public.points_ledger (trip_id, user_id, season, source, points)
                   VALUES ((SELECT id FROM ids WHERE k = 'trip'), auth.uid(), 'preflight', 'showcase', 20)$$,
                 '42501', NULL, 'clients can''t write points');
SELECT is((SELECT count(*)::int FROM public.trip_standings((SELECT id FROM ids WHERE k = 'trip'), 'preflight')), 3,
          'members read the standings');
SELECT tests.authenticate_as(tests.user_id('out'));
SELECT throws_like($$SELECT * FROM public.trip_standings((SELECT id FROM ids WHERE k = 'trip'), 'preflight')$$, 'Join this trip first',
                   'outsiders can''t');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
