-- M5-10 Passport Junkie profile: public / private (R-714), crew, hidden trips (Q28), top stamps.
BEGIN;
\ir ../_helpers.psql
SELECT plan(22);

SELECT tests.create_user('me', 30);
SELECT tests.create_user('pal', 30);
SELECT tests.create_user('stranger', 30);
SELECT tests.create_user('teen', 15);
INSERT INTO public.player_profiles (user_id, real_name, game_name, home_country, avatar_style, avatar_path) VALUES
  (tests.user_id('me'), 'Me', 'meme', 'United States', 'photo', 'account/' || tests.user_id('me') || '/me.jpg'),
  (tests.user_id('pal'), 'Pal', 'palpal', NULL, 'traveler', NULL),
  (tests.user_id('teen'), 'Teen', 'teeny', NULL, 'traveler', NULL);
CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ids WHERE k = p $$;
-- me and pal share a trip; me has two stamps (one trip with pal, one without).
INSERT INTO ids SELECT 'shared', tests.create_trip(tests.user_id('me'), 14, 3);
INSERT INTO ids SELECT 'solo', tests.create_trip(tests.user_id('me'), 14, 3);
SELECT tests.add_member(pg_temp.id('shared'), tests.user_id('pal'));
INSERT INTO public.trip_player_cards (trip_id, user_id, game_name, most_excited)
VALUES (pg_temp.id('shared'), tests.user_id('me'), 'meme', 'The night market');
INSERT INTO public.passport_stamps (user_id, trip_id, kind, country, stamped_on, room)
VALUES (tests.user_id('me'), pg_temp.id('shared'), 'international', 'Japan', current_date - 30, 'trip'),
       (tests.user_id('me'), pg_temp.id('solo'), 'international', 'Peru', current_date - 10, 'trip');
SELECT trip_private.refresh_passport(tests.user_id('me'));

-- ---------------------------------------------------------------- private by default
SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT is((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(public.player_profile(tests.user_id('me'))) k
           WHERE k NOT IN ('user_id', 'avatar_style', 'avatar_seed', 'avatar_path', 'is_public', 'self', 'crew', 'private')),
          ARRAY['countries', 'game_name', 'level', 'stars'], 'a private profile shows only avatar, game name and level to outsiders');
SELECT is(public.player_profile(tests.user_id('me'))->>'level', 'tourist', 'with the level');
SELECT is(public.player_profile(tests.user_id('me'))->'avatar_path', 'null'::jsonb, 'and no photo avatar path');
SELECT ok(public.player_profile(tests.user_id('me'))->'stamps' IS NULL, 'no stamps');

-- ---------------------------------------------------------------- the crew sees everything
SELECT tests.authenticate_as(tests.user_id('pal'));
SELECT is(jsonb_array_length(public.player_profile(tests.user_id('me'))->'stamps'), 2, 'the crew sees every stamp');
SELECT is(public.player_profile(tests.user_id('me'), pg_temp.id('shared'))->'this_trip'->>'most_excited', 'The night market',
          'and, for a shared trip, its role and "most excited for" (page 1)');
SELECT is(public.player_profile(tests.user_id('me'), pg_temp.id('solo'))->'this_trip', 'null'::jsonb,
          'not for a trip the viewer isn''t in');
SELECT is(public.player_profile(tests.user_id('me'))->>'avatar_path', 'account/' || tests.user_id('me') || '/me.jpg', 'crew get the photo avatar');

-- ---------------------------------------------------------------- my own settings
SELECT tests.authenticate_as(tests.user_id('me'));
SELECT lives_ok($$SELECT public.set_profile(true, '  Night-market hunter  ', 'Canada')$$, 'go public with About me and From');
SELECT is((SELECT home_country FROM public.player_profiles WHERE user_id = tests.user_id('me')), 'Canada', 'From is saved');
SELECT throws_like($$SELECT public.set_profile(true, repeat('a', 161), NULL)$$, 'Keep About me%', 'About me stays short');
SELECT throws_like($$SELECT public.set_top_stamps(ARRAY[pg_temp.id('shared'), gen_random_uuid()])$$, 'Pick from your own stamps',
                   'top stamps are my own');
SELECT lives_ok($$SELECT public.set_top_stamps(ARRAY[pg_temp.id('shared')])$$, 'pick a top stamp');
SELECT lives_ok($$SELECT public.set_trip_hidden(pg_temp.id('solo'), true)$$, 'hide a trip');
SELECT throws_like($$SELECT public.set_trip_hidden(gen_random_uuid(), true)$$, 'That isn''t one of your trips', 'only my own trips');
SELECT is(public.player_profile(tests.user_id('me'))->'stamps'->0->>'top', 'true', 'top stamps come first');

-- ---------------------------------------------------------------- public: hidden trips stay hidden from outsiders only
SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT is(public.player_profile(tests.user_id('me'))->>'about_me', 'Night-market hunter', 'a public profile shows everything');
SELECT is(jsonb_array_length(public.player_profile(tests.user_id('me'))->'stamps'), 1, 'except the hidden trip (Q28)');
SELECT is(public.player_profile(tests.user_id('me'))->'stamps'->0->>'has_postcard', 'false', 'outsiders can''t open postcards');
SELECT tests.authenticate_as(tests.user_id('pal'));
SELECT is(jsonb_array_length(public.player_profile(tests.user_id('me'))->'stamps'), 2, 'the crew still sees the hidden trip');

-- ---------------------------------------------------------------- under 18 is always private
SELECT tests.authenticate_as(tests.user_id('teen'));
SELECT throws_like($$SELECT public.set_profile(true, NULL, NULL)$$, '%under 18 stay private', 'teens can''t go public');
SELECT tests.authenticate_as(tests.user_id('stranger'));
SELECT is(public.player_profile(tests.user_id('teen'))->>'private', 'true', 'a teen profile is private to outsiders');

SELECT * FROM finish();
ROLLBACK;
