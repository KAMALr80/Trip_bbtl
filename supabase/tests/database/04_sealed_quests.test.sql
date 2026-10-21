-- M0-11 characterisation: sealed quests and Showcase on an a2c trip (R-321 – R-324).
-- Today's speed bonus is "+5 if proof is SUBMITTED within 3h of OPENING". The deck (R-322) says
-- "+5 if OPENED within 3h of the DROP". The test pins today's rule; change it in M3-05.
BEGIN;
\ir ../_helpers.psql
SELECT plan(27);

-- The a2c card pool is content loaded outside the migrations, so add a few fixture cards.
INSERT INTO public.security_missions (kind, category, title, text, backstory, keywords, presentation_tag, insight, budget_note)
SELECT 'checkin', 'culture', 'Sealed card ' || i || ' for {destination}', 'Find something about {destination}', 'Story',
       ARRAY['{destination}'], 'video_call', 'An insight long enough to count', 'Free'
FROM generate_series(1, 4) i;
INSERT INTO public.security_missions (kind, category, title, text, backstory, keywords, presentation_tag, insight, budget_note)
VALUES ('home', 'culture', 'Showcase for {destination}', 'Show the crew', 'Story', '{}', 'trip_meetup',
        'An insight long enough to count', 'Free');

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('p1', 25);
SELECT tests.create_user('p2', 25);
SELECT tests.create_user('stranger', 25);

-- Trip set up 5 days ago, departing in 5 days, game plan chosen.
CREATE TEMP TABLE f AS SELECT tests.create_trip(tests.user_id('cap'), 5, 5) AS trip;
GRANT SELECT ON f TO PUBLIC;
UPDATE public.trips SET created_at = now() - interval '5 days', game_start = current_date - 5, game_plan = 'date_driven'
WHERE id = (SELECT trip FROM f);
SELECT tests.add_member(trip, tests.user_id('p1')) FROM f;
SELECT tests.add_member(trip, tests.user_id('p2')) FROM f;

-- ---------------------------------------------------------------- the drop schedule
SELECT is((SELECT count(*)::int FROM trip_private.sealed_drops((SELECT trip FROM f))), 3,
          'a 10-day Pre-Flight gets 3 sealed drops (2 when it is shorter than 7 days)');
SELECT ok((SELECT bool_and(value IN (5, 10)) FROM trip_private.sealed_drops((SELECT trip FROM f))),
          'each drop is worth 5 or 10 (deck R-322 says 5–15 by difficulty)');
SELECT is(trip_private.quest_cutoff((SELECT trip FROM f)),
          ((SELECT start_date FROM public.trips WHERE id = (SELECT trip FROM f)) - 1)::timestamp AT TIME ZONE 'UTC',
          'quests close at 00:00 home time the day BEFORE takeoff (deck R-101: Pre-Flight closes 23:59 that day)');

-- ---------------------------------------------------------------- what a player sees
SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT throws_like($$SELECT * FROM public.sealed_quest_state((SELECT trip FROM f))$$,
                   'Only approved members can see quests', 'non-members cannot see quests');

SELECT tests.authenticate_as(tests.user_id('p1'));
CREATE TEMP TABLE q AS SELECT * FROM public.sealed_quest_state((SELECT trip FROM f));
GRANT SELECT ON q TO PUBLIC;
SELECT is((SELECT count(*)::int FROM q WHERE kind = 'sealed'), 2, 'only drops whose time has passed are dealt (2 of 3)');
SELECT is((SELECT count(*)::int FROM q WHERE kind = 'showcase'), 1, 'each player gets one Showcase');
SELECT is((SELECT value FROM q WHERE kind = 'showcase'), 20, 'the Showcase is worth 20 (R-324)');
SELECT is((SELECT count(*)::int FROM q WHERE kind = 'sealed' AND title IS NULL AND mission_text IS NULL), 2,
          'a sealed quest''s text stays hidden until it is opened (drop 1 already shows as expired)');

SELECT tests.authenticate_as(tests.user_id('p2'));
SELECT throws_like($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 1), 'open')$$,
                   'Quest not found', 'a player cannot open someone else''s quest');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- open → submit → review
-- p1 opens drop 2 and presents it within 3h; drop 1 has been sealed for over 3 days.
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 1), 'open')$$,
                   'This quest expired', 'a quest not opened within 3 days of its drop expires');
SELECT lives_ok($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 2), 'open')$$,
                'the owner opens a dropped quest');
SELECT is((SELECT state FROM public.sealed_quest_state((SELECT trip FROM f)) WHERE drop_no = 2), 'open', 'the quest is open');
SELECT isnt((SELECT title FROM public.sealed_quest_state((SELECT trip FROM f)) WHERE drop_no = 2), NULL, 'its text is now visible');
SELECT throws_like($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 2), 'submit', 'upload', 'nope.jpg')$$,
                   'Upload your photo first', 'photo proof must already be in the quest-proofs bucket at the owner''s path');
SELECT lives_ok($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 2), 'submit', 'show')$$,
                'the owner chooses to show it at game night');
SELECT is((SELECT (state, points)::text FROM public.sealed_quest_state((SELECT trip FROM f)) WHERE drop_no = 2), '(show_pending,0)',
          'a game-night presentation scores nothing until a leader approves it');

SELECT throws_like($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 2), 'approve')$$,
                   'Only the Captain or Co-Captain can review quests', 'players cannot approve quests');
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT lives_ok($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 2), 'approve')$$,
                'the Captain approves the presentation');
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT is((SELECT (state, points)::text FROM public.sealed_quest_state((SELECT trip FROM f)) WHERE drop_no = 2),
          format('(counted,%s)', (SELECT value + 5 FROM q WHERE drop_no = 2)),
          'an approved quest submitted within 3h of opening scores its value +5');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- the scoring function itself
-- sealed_award() on variations of p1's approved quest (jsonb_populate_record overrides fields).
CREATE TEMP TABLE base AS SELECT x.* FROM public.sealed_quests x
  WHERE x.trip_id = (SELECT trip FROM f) AND x.user_id = tests.user_id('p1') AND x.drop_no = 2;
SELECT is(trip_private.sealed_award(jsonb_populate_record(NULL::public.sealed_quests, to_jsonb(b) || jsonb_build_object('submitted_at', b.opened_at + interval '4 hours'))),
          b.value, 'submitted more than 3h after opening: no speed bonus') FROM base b;
SELECT is(trip_private.sealed_award(jsonb_populate_record(NULL::public.sealed_quests, to_jsonb(b) || jsonb_build_object('declined_at', now()))),
          0, 'a declined quest scores 0') FROM base b;
SELECT is(trip_private.sealed_award(jsonb_populate_record(NULL::public.sealed_quests, to_jsonb(b) || jsonb_build_object('proof_mode', 'upload', 'proof_path', 'x', 'approved_at', NULL))),
          b.value + 5, 'photo proof counts without approval (and gets the bonus inside 3h)') FROM base b;

CREATE TEMP TABLE sc AS SELECT x.* FROM public.sealed_quests x
  WHERE x.trip_id = (SELECT trip FROM f) AND x.user_id = tests.user_id('p1') AND x.kind = 'showcase';
GRANT SELECT ON sc TO PUBLIC;
SELECT is(trip_private.sealed_award(jsonb_populate_record(NULL::public.sealed_quests, to_jsonb(s))), 0, 'a Showcase scores nothing until approved') FROM sc s;
SELECT is(trip_private.sealed_award(jsonb_populate_record(NULL::public.sealed_quests, to_jsonb(s) || jsonb_build_object('approved_at', now()))),
          20, 'an approved Showcase scores 20') FROM sc s;

-- ---------------------------------------------------------------- review rules
SELECT tests.authenticate_as(tests.user_id('cap'));
SELECT throws_like($$SELECT public.sealed_quest_action((SELECT id FROM sc), 'approve')$$,
                   'Showcases are approved at the crowning meet-up', 'Showcases are only approved at the crowning meet-up');
CREATE TEMP TABLE capq AS SELECT * FROM public.sealed_quest_state((SELECT trip FROM f));  -- deals the Captain's own quests
SELECT throws_like($$SELECT public.sealed_quest_action((SELECT id FROM capq WHERE kind = 'showcase'), 'approve')$$,
                   'You can''t review your own quest', 'leaders cannot review their own quests');
SELECT tests.clear_authentication();

UPDATE public.sealed_quests SET opened_at = now() - interval '25 hours'
WHERE trip_id = (SELECT trip FROM f) AND user_id = tests.user_id('p1') AND drop_no = 1;
SELECT tests.authenticate_as(tests.user_id('p1'));
SELECT throws_like($$SELECT public.sealed_quest_action((SELECT id FROM q WHERE kind = 'sealed' AND drop_no = 1), 'submit', 'show')$$,
                   'Boarding closed%', 'proof is refused 24h after opening ("self-destruct")');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
