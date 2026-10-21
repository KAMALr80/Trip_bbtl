-- M0-04: the local seed (supabase/seed.sql) gives a playable setup: sign-in works, quests are
-- dealt, missions are open. The seed is applied before the tests, by `supabase db reset` or by
-- scripts/db/test.sh (which applies it twice to prove it can be re-run).
BEGIN;
\ir ../_helpers.psql
SELECT plan(10);


SELECT is((SELECT count(*)::int FROM auth.users WHERE email LIKE '%@tripjunkies.local'), 8, 'eight seeded accounts (re-running the seed adds none)');
SELECT ok((SELECT encrypted_password = extensions.crypt('tripjunkies-local', encrypted_password) FROM auth.users WHERE email = 'cap@tripjunkies.local'),
          'the shared local password matches');
SELECT is((SELECT count(*)::int FROM auth.identities i JOIN auth.users u ON u.id = i.user_id WHERE u.email LIKE '%@tripjunkies.local'), 8,
          'each account has an email identity (needed for password sign-in)');
SELECT ok(EXISTS (SELECT 1 FROM public.app_admins a JOIN auth.users u ON u.id = a.user_id WHERE u.email = 'founder@tripjunkies.local'),
          'the founder account is an admin');
SELECT is((SELECT count(*)::int FROM storage.buckets WHERE id IN ('trip-photos','quest-proofs','player-avatars','culture-photos',
                                                                  'inspiration-photos','window-guide','bug-screenshots') AND NOT public), 7,
          'all seven private storage buckets exist');
SELECT is((SELECT count(*)::int FROM public.trip_members WHERE trip_id = '00000000-0000-4000-9000-000000000001' AND status = 'approved'), 5,
          'Lisbon Crew has five approved members');
SELECT is((SELECT role FROM public.trip_members WHERE trip_id = '00000000-0000-4000-9000-000000000001'
             AND user_id = '00000000-0000-4000-8000-000000000003'), 'co_captain', 'cocap is Co-Captain');

SELECT tests.authenticate_as('00000000-0000-4000-8000-000000000004');
SELECT ok((SELECT count(*) FROM public.sealed_quest_state('00000000-0000-4000-9000-000000000001')) >= 2,
          'a member is dealt sealed quests and a Showcase on Lisbon Crew');
SELECT isnt(public.mission_action('00000000-0000-4000-9000-000000000002', 'reveal', 1), NULL::uuid,
            'Airport Missions are open on Departure Day');
SELECT is(public.join_trip('LISBONXX'), '00000000-0000-4000-9000-000000000001'::uuid, 'the documented join code works');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
