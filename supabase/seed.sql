-- Local development seed (M0-04). `supabase db reset` runs it after the migrations.
-- LOCAL ONLY: fixed ids and a shared password. Never run it against staging or production.
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING.
--
-- Sign in with any of these, password: tripjunkies-local
--   founder@tripjunkies.local  admin (founder tools, Test Lab)
--   cap@tripjunkies.local      25, Captain of both trips, home zone America/New_York
--   cocap@tripjunkies.local    30, Co-Captain of "Lisbon Crew", home zone Europe/London
--   p1@tripjunkies.local       22, member of both trips
--   p2@tripjunkies.local       19, member (can't be Captain, R-904)
--   p3@tripjunkies.local       40, member
--   solo@tripjunkies.local     28, in no trip (Window Seat / solo testing)
--   new@tripjunkies.local      30, in no trip, no profile yet (onboarding)
-- Trips: "Lisbon Crew" (join code LISBONXX, departs in 7 days) and "Departure Day" (TAKEOFFX,
-- departs today, so Airport Missions are open).

-- ---------------------------------------------------------------- storage buckets
-- The buckets were created outside the migrations on the live project. All private; access goes
-- through the storage.objects policies and signed URLs.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('trip-photos', 'trip-photos', false),
  ('quest-proofs', 'quest-proofs', false),
  ('player-avatars', 'player-avatars', false),
  ('culture-photos', 'culture-photos', false),
  ('inspiration-photos', 'inspiration-photos', false),
  ('window-guide', 'window-guide', false),
  ('bug-screenshots', 'bug-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------- accounts
CREATE TEMP TABLE seed_users (handle text, id uuid, age int, tz text, real_name text, game_name text);
INSERT INTO seed_users VALUES
  ('founder', '00000000-0000-4000-8000-000000000001', 40, 'America/New_York', 'Founder Local', 'Founder'),
  ('cap',     '00000000-0000-4000-8000-000000000002', 25, 'America/New_York', 'Casey Captain', 'Casey'),
  ('cocap',   '00000000-0000-4000-8000-000000000003', 30, 'Europe/London',    'Jordan Cocap', 'Jordan'),
  ('p1',      '00000000-0000-4000-8000-000000000004', 22, 'America/Chicago',  'Riley One', 'Riley'),
  ('p2',      '00000000-0000-4000-8000-000000000005', 19, 'America/Los_Angeles', 'Sam Two', 'Sam'),
  ('p3',      '00000000-0000-4000-8000-000000000006', 40, 'Asia/Singapore',   'Alex Three', 'Alex'),
  ('solo',    '00000000-0000-4000-8000-000000000007', 28, 'Europe/Berlin',    'Morgan Solo', 'Morgan'),
  ('new',     '00000000-0000-4000-8000-000000000008', 30, 'America/New_York', NULL, NULL);

-- Shaped like Supabase Auth email sign-ups, so the auth.users triggers (age gate) run as in real life.
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
       u.handle || '@tripjunkies.local', extensions.crypt('tripjunkies-local', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}',
       jsonb_build_object('legal_version', '2026-10-03',
                          'birthday', (current_date - make_interval(years => u.age) - interval '30 days')::date::text),
       now(), now(), '', '', '', ''
FROM seed_users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT u.id, u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.handle || '@tripjunkies.local', 'email_verified', true),
       'email', now(), now(), now()
FROM seed_users u
ON CONFLICT DO NOTHING;

INSERT INTO public.account_consents (user_id, legal_version, accepted_at)
SELECT id, '2026-10-03', now() FROM seed_users
WHERE NOT EXISTS (SELECT 1 FROM public.account_consents c WHERE c.user_id = seed_users.id);

INSERT INTO public.player_private (user_id, dob)
SELECT id, (current_date - make_interval(years => age) - interval '30 days')::date FROM seed_users
ON CONFLICT DO NOTHING;

INSERT INTO public.beta_access (user_id, source) SELECT id, 'invite' FROM seed_users ON CONFLICT DO NOTHING;
INSERT INTO public.app_admins (user_id) SELECT id FROM seed_users WHERE handle = 'founder' ON CONFLICT DO NOTHING;

INSERT INTO public.profiles (id, time_zone)
SELECT id, tz FROM seed_users WHERE handle <> 'new' ON CONFLICT DO NOTHING;
INSERT INTO public.player_profiles (user_id, real_name, game_name)
SELECT id, real_name, game_name FROM seed_users WHERE handle <> 'new' ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- trips
INSERT INTO public.trips (id, name, destination, start_date, end_date, home_timezone, trip_timezone,
                          join_code, season_rule, play_arrangement, game_plan, game_start, created_at)
VALUES
  ('00000000-0000-4000-9000-000000000001', 'Lisbon Crew', 'Lisbon, Portugal',
   current_date + 7, current_date + 11, 'America/New_York', 'Europe/Lisbon',
   'LISBONXX', 'a2c', 'online', 'date_driven', current_date - 3, now() - interval '3 days'),
  ('00000000-0000-4000-9000-000000000002', 'Departure Day', 'Mexico City, Mexico',
   current_date, current_date + 3, 'America/New_York', 'America/Mexico_City',
   'TAKEOFFX', 'a2c', 'online', 'date_driven', current_date - 7, now() - interval '7 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.trip_members (trip_id, user_id, role, status, approved_at)
SELECT t.trip_id::uuid, u.id, t.role, 'approved', now()
FROM (VALUES
  ('00000000-0000-4000-9000-000000000001', 'cap', 'captain'),
  ('00000000-0000-4000-9000-000000000001', 'cocap', 'co_captain'),
  ('00000000-0000-4000-9000-000000000001', 'p1', 'player'),
  ('00000000-0000-4000-9000-000000000001', 'p2', 'player'),
  ('00000000-0000-4000-9000-000000000001', 'p3', 'player'),
  ('00000000-0000-4000-9000-000000000002', 'cap', 'captain'),
  ('00000000-0000-4000-9000-000000000002', 'p1', 'player')
) AS t(trip_id, handle, role)
JOIN seed_users u ON u.handle = t.handle
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- content
-- Placeholder cards for the a2c sealed quest / Showcase draw. The real card pool was loaded outside
-- the migrations on the live project; replace these with an export of it once we have DB access.
INSERT INTO public.security_missions (id, kind, category, title, text, backstory, keywords, presentation_tag, insight, budget_note)
SELECT ('00000000-0000-4000-a000-' || lpad((c.n * 100 + i)::text, 12, '0'))::uuid, c.kind, 'culture',
       '[local seed] ' || c.title || ' ' || i, c.body, 'Placeholder card for local development.',
       ARRAY['{destination}'], c.tag, 'A placeholder insight long enough to qualify.', 'Free'
FROM (VALUES
  (1, 'checkin', 'video_call',     'Sealed quest for {destination}', 'Find one surprising fact about {destination} and share it on the call.'),
  (2, 'home',    'trip_meetup',    'Showcase for {destination}',     'Bring one thing that shows the crew what {destination} means to you.'),
  (3, 'home',    'at_home_finale', 'Finale showcase',               'Present something you made or learned for the finale night.')
) AS c(n, kind, tag, title, body)
CROSS JOIN generate_series(1, 6) i
ON CONFLICT (id) DO NOTHING;

DROP TABLE seed_users;
