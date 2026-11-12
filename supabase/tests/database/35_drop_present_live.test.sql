-- R-343: a Surprise Drop proven by presenting it live at the next Game Night Live. A claim instead of
-- photos, kept out of Crew Check, approved by a 👍 at Game Night Live for a flat 10, never holding the
-- drop's scoring back, expired once the Trip Season crown is decided; solo players send photos.
BEGIN;
\ir ../_helpers.psql
SELECT plan(19);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
SELECT tests.create_user('p3', 25);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 3, 6, 'a2c', 'UTC', 'Europe/Lisbon');
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p1'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p2'));
SELECT tests.add_member((SELECT id FROM ids WHERE k = 'trip'), tests.user_id('p3'));
-- An open Speed drop (Speed takes a few words, so no photo upload is needed here).
INSERT INTO ids SELECT 'drop', id FROM public.trip_schedule
WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip') AND kind = 'surprise_drop' ORDER BY opens_at LIMIT 1;
UPDATE public.trip_schedule SET variant = 'speed', opens_at = now() - interval '1 hour', closes_at = now() + interval '1 hour'
WHERE id = (SELECT id FROM ids WHERE k = 'drop');
CREATE FUNCTION pg_temp.drop_pts(p_user text) RETURNS int LANGUAGE sql AS $$
  SELECT points FROM public.points_ledger WHERE source = 'surprise_drop' AND source_ref = (SELECT id FROM ids WHERE k = 'drop')
    AND user_id = tests.user_id(p_user) AND status = 'approved'
$$;

-- ---------------------------------------------------------------- claim
SELECT tests.authenticate_as(tests.user_id('p1'));
INSERT INTO ids SELECT 'claim', public.claim_drop_live((SELECT id FROM ids WHERE k = 'drop'));
SELECT is(public.claim_drop_live((SELECT id FROM ids WHERE k = 'drop')), (SELECT id FROM ids WHERE k = 'claim'),
          'claiming twice keeps one claim');
SELECT is((SELECT live::text || ':' || crew_status FROM public.proofs WHERE id = (SELECT id FROM ids WHERE k = 'claim')), 'true:waiting',
          'the player sees their claim waiting');
SELECT throws_like($$SELECT public.submit_drop_proof((SELECT id FROM ids WHERE k = 'drop'), 0, NULL, 'done!')$$,
                   'You''re presenting this one live', 'no photos once presenting live');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT public.submit_drop_proof((SELECT id FROM ids WHERE k = 'drop'), 0, NULL, 'Finished in 3 minutes');
SELECT throws_like($$SELECT public.claim_drop_live((SELECT id FROM ids WHERE k = 'drop'))$$,
                   'You''ve already sent photos for this drop', 'and no live claim once photos are in');

-- ---------------------------------------------------------------- not in Crew Check
SELECT tests.authenticate_as(tests.user_id('p3'));
SELECT is((SELECT count(*)::int FROM public.crew_check((SELECT id FROM ids WHERE k = 'trip')) WHERE id = (SELECT id FROM ids WHERE k = 'claim')), 0,
          'a live claim isn''t in Crew Check');
SELECT throws_like($$SELECT public.approve_proof((SELECT id FROM ids WHERE k = 'claim'))$$, 'This one is presented live at Game Night',
                   'and the crew can''t 👍 it from there');
SELECT public.approve_proof(c.id) FROM public.crew_check((SELECT id FROM ids WHERE k = 'trip')) c
WHERE c.schedule_id = (SELECT id FROM ids WHERE k = 'drop');

-- ---------------------------------------------------------------- the drop closes before Game Night
SELECT tests.clear_authentication();
UPDATE public.trip_schedule SET closes_at = now() - interval '1 minute' WHERE id = (SELECT id FROM ids WHERE k = 'drop');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.claim_drop_live((SELECT id FROM ids WHERE k = 'drop'))$$, 'This drop has closed',
                   'claims only while the drop is open');
SELECT tests.clear_authentication();
SELECT trip_private.settle_drops();
SELECT ok((SELECT settled_at IS NOT NULL FROM public.trip_schedule WHERE id = (SELECT id FROM ids WHERE k = 'drop')),
          'a waiting live claim doesn''t hold the drop''s scoring back');
SELECT is(pg_temp.drop_pts('p2'), 25, 'p2 is scored as before: 10 + 15 for finishing first');
SELECT is(pg_temp.drop_pts('p1'), NULL, 'p1 has nothing yet');
SELECT trip_private.expire_proofs();
SELECT is((SELECT crew_status FROM public.proofs WHERE id = (SELECT id FROM ids WHERE k = 'claim')), 'waiting',
          'and the claim doesn''t expire while the crown is open');

-- ---------------------------------------------------------------- Game Night Live
INSERT INTO public.live_sessions (trip_id, season, opened_by, auto_close_at)
VALUES ((SELECT id FROM ids WHERE k = 'trip'), 'trip_season', tests.user_id('cap'), now() + interval '6 hours');
INSERT INTO ids SELECT 'live', id FROM public.live_sessions WHERE trip_id = (SELECT id FROM ids WHERE k = 'trip');
SELECT tests.authenticate_as(tests.user_id('p3'));
SELECT ok(public.live_present((SELECT id FROM ids WHERE k = 'live'), tests.user_id('p1')), 'p1 presents and p3 taps 👍');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT ok(NOT public.live_present((SELECT id FROM ids WHERE k = 'live'), tests.user_id('p1')), 'a second 👍 adds nothing');
SELECT tests.clear_authentication();
SELECT is(pg_temp.drop_pts('p1'), 10, 'the live drop scores a flat 10 (R-343), once');
SELECT is((SELECT crew_status || ':' || (approved_by = tests.user_id('p3'))::text FROM public.proofs WHERE id = (SELECT id FROM ids WHERE k = 'claim')),
          'approved:true', 'the claim is approved by the first 👍');
SELECT is(trip_private.drop_points((SELECT id FROM ids WHERE k = 'drop'), tests.user_id('p2')), 25,
          'and it takes no place in the Speed finish order');

-- ---------------------------------------------------------------- nobody 👍'd it: expired with the crown
UPDATE public.trip_schedule SET closes_at = now() + interval '1 hour' WHERE id = (SELECT id FROM ids WHERE k = 'drop');
SELECT tests.authenticate_as(tests.user_id('p3'));
INSERT INTO ids SELECT 'claim3', public.claim_drop_live((SELECT id FROM ids WHERE k = 'drop'));
SELECT tests.clear_authentication();
INSERT INTO public.trip_crownings (trip_id, season, how) VALUES ((SELECT id FROM ids WHERE k = 'trip'), 'trip_season', 'fallback');
SELECT trip_private.expire_proofs();
SELECT is((SELECT crew_status FROM public.proofs WHERE id = (SELECT id FROM ids WHERE k = 'claim3')), 'expired',
          'a claim nobody 👍''d expires once the Trip Season crown is decided');
SELECT is(trip_private.drop_points((SELECT id FROM ids WHERE k = 'drop'), tests.user_id('p3')), 0, 'for 0 pts');

-- ---------------------------------------------------------------- solo (a crew of one)
INSERT INTO ids SELECT 'solo', tests.create_trip(tests.user_id('p2'), 3, 6, 'a2c', 'UTC', 'Europe/Lisbon');
INSERT INTO ids SELECT 'solo_drop', id FROM public.trip_schedule
WHERE trip_id = (SELECT id FROM ids WHERE k = 'solo') AND kind = 'surprise_drop' ORDER BY opens_at LIMIT 1;
UPDATE public.trip_schedule SET opens_at = now() - interval '1 hour', closes_at = now() + interval '1 hour'
WHERE id = (SELECT id FROM ids WHERE k = 'solo_drop');
SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT throws_like($$SELECT public.claim_drop_live((SELECT id FROM ids WHERE k = 'solo_drop'))$$, 'Playing solo, send a photo instead',
                   'solo players send photos (R-365)');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
