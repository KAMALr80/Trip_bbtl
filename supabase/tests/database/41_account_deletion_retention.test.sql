-- What a deleted account leaves behind (founder decision, 2026-11-08): the personal goes, shared
-- history stays, and legal-review records don't change. Rows of another player must never move.
BEGIN;
\ir ../_helpers.psql
SELECT plan(49);

SELECT tests.create_user('cap', 30);
SELECT tests.create_user('gone', 30);
SELECT tests.create_user('stays', 30);
SELECT tests.create_user('unconfirmed', 30);
SELECT tests.create_user('leader', 30);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('cap'), 20, 4, 'a2c', 'UTC', 'Europe/Lisbon');
INSERT INTO ids SELECT 'later', tests.create_trip(tests.user_id('cap'), 20, 4, 'a2c', 'UTC', 'Europe/Lisbon');
INSERT INTO ids SELECT 'led', tests.create_trip(tests.user_id('leader'), 20, 4, 'a2c', 'UTC', 'Europe/Lisbon');
INSERT INTO ids SELECT 'gone', tests.user_id('gone');
INSERT INTO ids SELECT 'stays', tests.user_id('stays');
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;
SELECT tests.add_member(pg_temp.id('trip'), pg_temp.id('gone'));
SELECT tests.add_member(pg_temp.id('trip'), pg_temp.id('stays'));
SELECT tests.add_member(pg_temp.id('later'), pg_temp.id('gone'));
SELECT tests.add_member(pg_temp.id('later'), pg_temp.id('stays'));
SELECT tests.clear_authentication();
UPDATE auth.users SET email_confirmed_at = now() WHERE id = pg_temp.id('gone');

-- Five schedule rows: mine with nothing on it, mine with a photo proof, mine with a text proof, mine
-- with a proof still waiting for the crew, and another player's.
INSERT INTO ids SELECT x.k, gen_random_uuid() FROM (VALUES ('s_empty'), ('s_photo'), ('s_text'), ('s_wait'), ('s_other'), ('s_shared')) x(k);
INSERT INTO public.trip_schedule (id, trip_id, kind, slot, user_id, opens_at, points, tailored_text) VALUES
  (pg_temp.id('s_empty'), pg_temp.id('trip'), 'sealed_quest', 'qa-empty', pg_temp.id('gone'), now() - interval '2 days', 5, 'for you'),
  (pg_temp.id('s_photo'), pg_temp.id('trip'), 'sealed_quest', 'qa-photo', pg_temp.id('gone'), now() - interval '2 days', 5, 'for you'),
  (pg_temp.id('s_text'), pg_temp.id('trip'), 'sealed_quest', 'qa-text', pg_temp.id('gone'), now() - interval '2 days', 5, NULL),
  (pg_temp.id('s_wait'), pg_temp.id('trip'), 'sealed_quest', 'qa-wait', pg_temp.id('gone'), now() - interval '2 days', 5, NULL),
  (pg_temp.id('s_other'), pg_temp.id('trip'), 'sealed_quest', 'qa-other', pg_temp.id('stays'), now() - interval '2 days', 5, 'for them'),
  (pg_temp.id('s_shared'), pg_temp.id('trip'), 'daily_card', 'qa-shared', NULL, now() - interval '2 days', 2, NULL);

INSERT INTO ids SELECT x.k, gen_random_uuid() FROM (VALUES ('p_photo'), ('p_text'), ('p_wait'), ('p_other')) x(k);
INSERT INTO public.proofs (id, trip_id, user_id, schedule_id, source, photo_path, body, ai_reason, crew_status, expires_at) VALUES
  (pg_temp.id('p_photo'), pg_temp.id('trip'), pg_temp.id('gone'), pg_temp.id('s_photo'), 'sealed_quest', 'gone/a.jpg', 'my caption', 'looks fine', 'approved', now() + interval '1 day'),
  (pg_temp.id('p_text'), pg_temp.id('trip'), pg_temp.id('gone'), pg_temp.id('s_text'), 'sealed_quest', NULL, 'my story', NULL, 'approved', now() + interval '1 day'),
  (pg_temp.id('p_wait'), pg_temp.id('trip'), pg_temp.id('gone'), pg_temp.id('s_wait'), 'sealed_quest', NULL, 'waiting', NULL, 'waiting', now() + interval '1 day'),
  (pg_temp.id('p_other'), pg_temp.id('trip'), pg_temp.id('stays'), pg_temp.id('s_other'), 'sealed_quest', 'stays/b.jpg', 'their caption', 'fine', 'approved', now() + interval '1 day');
INSERT INTO public.proof_votes (proof_id, voter_id) VALUES (pg_temp.id('p_photo'), pg_temp.id('stays'));
INSERT INTO public.daily_answers (schedule_id, trip_id, user_id, choice) VALUES
  (pg_temp.id('s_shared'), pg_temp.id('trip'), pg_temp.id('stays'), 1),
  (pg_temp.id('s_shared'), pg_temp.id('trip'), pg_temp.id('gone'), 2);

-- Shared history.
INSERT INTO public.points_ledger (trip_id, user_id, season, source, points, status, source_ref) VALUES
  (pg_temp.id('trip'), pg_temp.id('gone'), 'trip_season', 'daily_card', 2, 'approved', NULL),
  (pg_temp.id('trip'), pg_temp.id('gone'), 'trip_season', 'sealed_quest', 5, 'pending', pg_temp.id('s_wait')),
  (pg_temp.id('trip'), pg_temp.id('stays'), 'trip_season', 'daily_card', 2, 'approved', NULL);
INSERT INTO public.trip_crowns (trip_id, season, user_id, points) VALUES
  (pg_temp.id('trip'), 'trip_season', pg_temp.id('gone'), 40),
  (pg_temp.id('later'), 'trip_season', pg_temp.id('gone'), 40);
INSERT INTO public.season_champions (trip_id, season, user_id) VALUES (pg_temp.id('trip'), 'game', pg_temp.id('gone'));
INSERT INTO public.trip_postcards (trip_id, photos, answers, crowns, excited) VALUES (pg_temp.id('trip'),
  jsonb_build_array(
    jsonb_build_object('proof_id', pg_temp.id('p_photo'), 'path', 'gone/a.jpg', 'user_id', pg_temp.id('gone'), 'hearts', 3),
    jsonb_build_object('proof_id', pg_temp.id('p_other'), 'path', 'stays/b.jpg', 'user_id', pg_temp.id('stays'), 'hearts', 1)),
  '[{"key":"song","question":"Song?","answers":["nameless answer"]}]',
  jsonb_build_array(
    jsonb_build_object('season', 'trip_season', 'user_id', pg_temp.id('gone'), 'name', 'Real Name', 'points', 40, 'solo', false),
    jsonb_build_object('season', 'preflight', 'user_id', pg_temp.id('stays'), 'name', 'Stays', 'points', 30, 'solo', false)),
  '["so excited"]');

-- Personal rows: one for the player who goes and one for the player who stays.
INSERT INTO public.trip_player_cards (trip_id, user_id, real_name, game_name) VALUES
  (pg_temp.id('trip'), pg_temp.id('gone'), 'Gone Person', 'Gone'), (pg_temp.id('trip'), pg_temp.id('stays'), 'Stay Person', 'Stays');
INSERT INTO public.wrapup_answers (trip_id, user_id, question_key, answer) VALUES
  (pg_temp.id('trip'), pg_temp.id('gone'), 'song', 'mine'), (pg_temp.id('trip'), pg_temp.id('stays'), 'song', 'theirs');
INSERT INTO public.journal_entries (trip_id, user_id, schedule_id, day, prompt, body) VALUES
  (pg_temp.id('trip'), pg_temp.id('gone'), pg_temp.id('s_empty'), current_date, 'Prompt', 'dear diary'),
  (pg_temp.id('trip'), pg_temp.id('stays'), pg_temp.id('s_other'), current_date, 'Prompt', 'their diary');
INSERT INTO public.window_guide_items (trip_id, author_id, kind, body) VALUES
  (pg_temp.id('trip'), pg_temp.id('gone'), 'tip', 'my tip'), (pg_temp.id('trip'), pg_temp.id('stays'), 'tip', 'their tip');
INSERT INTO public.weekly_questions (trip_id, week_number, prompt, drops_at) VALUES (pg_temp.id('trip'), 1, 'Question?', now());
INSERT INTO public.weekly_answers (trip_id, week_number, user_id, answer) VALUES
  (pg_temp.id('trip'), 1, pg_temp.id('gone'), 'mine'), (pg_temp.id('trip'), 1, pg_temp.id('stays'), 'theirs');
INSERT INTO public.cost_notes (trip_id, user_id, message) VALUES (pg_temp.id('trip'), pg_temp.id('gone'), 'mine');
INSERT INTO public.checkin_responses (user_id, trip_id, context, context_key, answers) VALUES (pg_temp.id('gone'), pg_temp.id('trip'), 'trip_day', 'qa', '{"a":"mine"}');
INSERT INTO public.trip_drafts (user_id, data) VALUES (pg_temp.id('gone'), '{"name":"my draft"}');
INSERT INTO public.bug_reports (user_id, description) VALUES (pg_temp.id('gone'), 'my report');
INSERT INTO public.trip_feedback (trip_id, user_id, change_text, squad_message) VALUES (pg_temp.id('trip'), pg_temp.id('gone'), 'mine', 'mine');
INSERT INTO public.passport_stamps (user_id, trip_id, kind, country, stamped_on) VALUES
  (pg_temp.id('gone'), pg_temp.id('trip'), 'international', 'Portugal', current_date),
  (pg_temp.id('stays'), pg_temp.id('trip'), 'international', 'Portugal', current_date);
INSERT INTO public.photo_posts (trip_id, day_date, user_id, photo_path) VALUES (pg_temp.id('trip'), current_date, pg_temp.id('gone'), 'gone/wall.jpg');
INSERT INTO public.waitlist (email, user_id) VALUES
  ('linked@test.tripjunkies.local', pg_temp.id('gone')),
  ('gone@test.tripjunkies.local', NULL),
  ('unconfirmed@test.tripjunkies.local', NULL),
  ('someone.else@test.tripjunkies.local', NULL);

-- Legal-review records.
INSERT INTO public.photo_moderation (proof_id, trip_id, uploader_id) VALUES (pg_temp.id('p_photo'), pg_temp.id('trip'), pg_temp.id('gone'));
INSERT INTO public.moderation_log (action, subject_user) VALUES ('report', pg_temp.id('gone'));
INSERT INTO public.admin_actions (actor, action, target_user) VALUES (tests.user_id('cap'), 'disable_user', pg_temp.id('gone'));
INSERT INTO trip_private.teen_accounts (user_id, invite_id, trip_id) VALUES (pg_temp.id('gone'), gen_random_uuid(), pg_temp.id('trip'));
CREATE TEMP TABLE legal_before AS
  SELECT (SELECT md5(string_agg(c::text, ',' ORDER BY c::text)) FROM public.account_consents c) AS consents,
         (SELECT md5(string_agg(m::text, ',' ORDER BY m::text)) FROM public.moderation_log m) AS modlog,
         (SELECT md5(string_agg(a::text, ',' ORDER BY a::text)) FROM public.admin_actions a) AS adminlog,
         (SELECT md5(string_agg(p::text, ',' ORDER BY p::text)) FROM public.photo_moderation p) AS photomod,
         (SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM trip_private.teen_accounts t) AS teens;

-- ---------------------------------------------------------------- all or nothing
CREATE FUNCTION pg_temp.boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'cascade failed'; END $$;
CREATE TRIGGER boom BEFORE DELETE ON public.player_private FOR EACH ROW EXECUTE FUNCTION pg_temp.boom();
SELECT throws_like($$DELETE FROM auth.users WHERE id = pg_temp.id('gone')$$, 'cascade failed', 'a failure late in the delete raises');
DROP TRIGGER boom ON public.player_private;
SELECT is((SELECT count(*)::int FROM auth.users WHERE id = pg_temp.id('gone')), 1, 'after a failed delete the account is still there');
SELECT is((SELECT count(*)::int FROM public.wrapup_answers WHERE user_id = pg_temp.id('gone')), 1, 'and nothing was half removed');

-- ---------------------------------------------------------------- the delete
DELETE FROM auth.users WHERE id = pg_temp.id('gone');

SELECT is((SELECT count(*)::int FROM public.trip_members WHERE user_id = pg_temp.id('gone')), 0, 'memberships go');
SELECT is((SELECT count(*)::int FROM public.player_private WHERE user_id = pg_temp.id('gone')), 0, 'the birthday goes');
SELECT is((SELECT count(*)::int FROM public.trip_player_cards WHERE user_id = pg_temp.id('gone')), 0, 'player cards go');
SELECT is((SELECT count(*)::int FROM public.wrapup_answers WHERE user_id = pg_temp.id('gone')), 0, 'wrap-up answers go');
SELECT is((SELECT count(*)::int FROM public.journal_entries WHERE user_id = pg_temp.id('gone')), 0, 'journal entries go');
SELECT is((SELECT count(*)::int FROM public.window_guide_items WHERE author_id = pg_temp.id('gone')), 0, 'guide items go');
SELECT is((SELECT count(*)::int FROM public.weekly_answers WHERE user_id = pg_temp.id('gone')), 0, 'weekly answers go');
SELECT is((SELECT count(*)::int FROM public.cost_notes WHERE user_id = pg_temp.id('gone')), 0, 'cost notes go');
SELECT is((SELECT count(*)::int FROM public.checkin_responses WHERE user_id = pg_temp.id('gone')), 0, 'check-in answers go');
SELECT is((SELECT count(*)::int FROM public.trip_drafts WHERE user_id = pg_temp.id('gone')), 0, 'trip drafts go');
SELECT is((SELECT count(*)::int FROM public.bug_reports WHERE user_id = pg_temp.id('gone')), 0, 'bug reports go');
SELECT is((SELECT count(*)::int FROM public.passport_stamps WHERE user_id = pg_temp.id('gone')), 0, 'passport stamps go');
SELECT is((SELECT count(*)::int FROM public.trip_feedback WHERE user_id = pg_temp.id('gone') AND change_text IS NULL AND squad_message IS NULL), 1, 'feedback text is blanked, the row stays');

SELECT is((SELECT array_agg(email ORDER BY email) FROM public.waitlist),
          ARRAY['someone.else@test.tripjunkies.local', 'unconfirmed@test.tripjunkies.local'],
          'waitlist: the linked row and the matching confirmed email go, others stay');

-- Proofs stay without their text, so crew votes and moderation still have something to point at.
SELECT is((SELECT count(*)::int FROM public.proofs WHERE user_id = pg_temp.id('gone')), 3, 'proof rows stay');
SELECT is((SELECT body FROM public.proofs WHERE id = pg_temp.id('p_photo')), NULL, 'a photo proof loses its caption');
SELECT is((SELECT ai_reason FROM public.proofs WHERE id = pg_temp.id('p_photo')), NULL, 'and the AI note about it');
SELECT ok((SELECT photo_removed_at IS NOT NULL FROM public.proofs WHERE id = pg_temp.id('p_photo')), 'and is marked as having no photo any more');
SELECT is((SELECT body FROM public.proofs WHERE id = pg_temp.id('p_text')), '', 'a text proof keeps an empty body');
SELECT is((SELECT count(*)::int FROM public.proof_votes WHERE proof_id = pg_temp.id('p_photo')), 1, 'the crew vote on it stays');

-- A waiting proof can't reach the expiry sweep with nobody to notify.
SELECT is((SELECT crew_status FROM public.proofs WHERE id = pg_temp.id('p_wait')), 'expired', 'a waiting proof is expired');
SELECT is((SELECT status FROM public.points_ledger WHERE user_id = pg_temp.id('gone') AND source_ref = pg_temp.id('s_wait')), 'rejected', 'and its pending points are rejected, as at expiry');
UPDATE public.proofs SET crew_status = 'waiting', expires_at = now() - interval '1 minute' WHERE id = pg_temp.id('p_other');
SELECT lives_ok($$SELECT trip_private.expire_proofs()$$, 'the expiry sweep still runs');
UPDATE public.proofs SET crew_status = 'approved', expires_at = now() + interval '1 day' WHERE id = pg_temp.id('p_other');

SELECT is((SELECT array_agg(slot ORDER BY slot) FROM public.trip_schedule WHERE trip_id = pg_temp.id('trip') AND user_id = pg_temp.id('gone')),
          ARRAY['qa-photo', 'qa-text', 'qa-wait'], 'schedule: the row with nothing on it goes, rows with a proof stay');
SELECT is((SELECT count(*)::int FROM public.trip_schedule WHERE user_id = pg_temp.id('gone') AND tailored_text IS NOT NULL), 0, 'kept schedule rows lose their tailored text');

-- ---------------------------------------------------------------- shared history stays
SELECT is((SELECT count(*)::int FROM public.points_ledger WHERE user_id = pg_temp.id('gone') AND status = 'approved'), 1, 'earned points stay');
SELECT is((SELECT count(*)::int FROM public.trip_crowns WHERE user_id = pg_temp.id('gone')), 2, 'crowns stay');
SELECT is((SELECT count(*)::int FROM public.season_champions WHERE user_id = pg_temp.id('gone')), 1, 'season champions stay');

SELECT is((SELECT p.photos->0->>'path' FROM public.trip_postcards p WHERE trip_id = pg_temp.id('trip')), 'stays/b.jpg', 'the postcard keeps another player''s photo first');
SELECT is((SELECT jsonb_array_length(p.photos) FROM public.trip_postcards p WHERE trip_id = pg_temp.id('trip')), 1, 'and drops the deleted file');
SELECT is((SELECT p.crowns->0->>'name' FROM public.trip_postcards p WHERE trip_id = pg_temp.id('trip')), 'Former player', 'the postcard crown reads Former player');
SELECT is((SELECT p.crowns->0->>'user_id' FROM public.trip_postcards p WHERE trip_id = pg_temp.id('trip')), NULL, 'with no identifier');
SELECT is((SELECT p.crowns->1->>'name' FROM public.trip_postcards p WHERE trip_id = pg_temp.id('trip')), 'Stays', 'another crown keeps its name');
SELECT is((SELECT p.answers->0->'answers'->>0 FROM public.trip_postcards p WHERE trip_id = pg_temp.id('trip')), 'nameless answer', 'nameless answers stay on the postcard');
SELECT is((SELECT count(*)::int FROM public.trip_postcards p WHERE p::text LIKE '%' || pg_temp.id('gone') || '%'), 0, 'no trace of the id is left on any postcard');

SELECT is(trip_private.lock_trip(pg_temp.id('later'), true), true, 'a trip locking after the delete still locks');
SELECT is((SELECT p.crowns->0->>'name' FROM public.trip_postcards p WHERE trip_id = pg_temp.id('later')), 'Former player', 'and its crown reads Former player');

SELECT is((SELECT count(*)::int FROM public.photo_removed WHERE photo_path = 'gone/wall.jpg'), 1, 'the photo wall hides the deleted file');

-- ---------------------------------------------------------------- nobody else moves
SELECT is((SELECT count(*)::int FROM public.trip_player_cards WHERE user_id = pg_temp.id('stays'))
        + (SELECT count(*)::int FROM public.wrapup_answers WHERE user_id = pg_temp.id('stays'))
        + (SELECT count(*)::int FROM public.journal_entries WHERE user_id = pg_temp.id('stays'))
        + (SELECT count(*)::int FROM public.window_guide_items WHERE author_id = pg_temp.id('stays'))
        + (SELECT count(*)::int FROM public.weekly_answers WHERE user_id = pg_temp.id('stays'))
        + (SELECT count(*)::int FROM public.passport_stamps WHERE user_id = pg_temp.id('stays') AND trip_id = pg_temp.id('trip'))
        + (SELECT count(*)::int FROM public.daily_answers WHERE user_id = pg_temp.id('stays'))
        + (SELECT count(*)::int FROM public.player_private WHERE user_id = pg_temp.id('stays')), 8, 'another player''s personal rows all stay');
SELECT is((SELECT body FROM public.proofs WHERE id = pg_temp.id('p_other')), 'their caption', 'another player''s proof keeps its text');

-- ---------------------------------------------------------------- legal-review records
SELECT is((SELECT consents FROM legal_before), (SELECT md5(string_agg(c::text, ',' ORDER BY c::text)) FROM public.account_consents c), 'account_consents unchanged');
SELECT is((SELECT modlog FROM legal_before), (SELECT md5(string_agg(m::text, ',' ORDER BY m::text)) FROM public.moderation_log m), 'moderation_log unchanged');
SELECT is((SELECT adminlog FROM legal_before), (SELECT md5(string_agg(a::text, ',' ORDER BY a::text)) FROM public.admin_actions a), 'admin_actions unchanged');
SELECT is((SELECT photomod FROM legal_before), (SELECT md5(string_agg(p::text, ',' ORDER BY p::text)) FROM public.photo_moderation p), 'photo_moderation unchanged');
SELECT is((SELECT teens FROM legal_before), (SELECT md5(string_agg(t::text, ',' ORDER BY t::text)) FROM trip_private.teen_accounts t), 'teen_accounts unchanged');

-- ---------------------------------------------------------------- a Captain deleted outside the app
INSERT INTO ids SELECT 'leader', tests.user_id('leader');
DELETE FROM auth.users WHERE id = pg_temp.id('leader');
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = pg_temp.id('led') AND role = 'captain'), 1, 'a Captain''s membership row is not removed, so the trip is not silently leaderless');

SELECT * FROM finish();
ROLLBACK;
