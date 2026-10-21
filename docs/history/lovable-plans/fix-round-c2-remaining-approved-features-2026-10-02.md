# Fix Round C2 — remaining approved features

Item 0 (the games bug) is already fixed. The rest is below. Nothing gets restyled, and Siam Vibes stays exactly as it is.

## 1. Founder "Play anything now" (Test Lab trips only)
- One server check, "founder on a Test Lab trip". It returns true only for the founder account on Test Lab trips.
- The live-night window, "opens at" locks, trip-day release checks, At Home morning unlocks and the crowning/Wrapped timing all accept that check as an override. Real trips keep every rule.
- A "Jump to…" list in Test Lab: Warm-up, Card rounds, Finale vote, Question of the Week reveal, Trip day 1, At Home day 1, Passport Night, Crowning, Wrapped. Each one sets up the Test Lab trip with the existing lab functions and then opens that screen.

## 1b. View the app as…
- Extend the existing Game Day role switch into a choice that applies to every screen: Captain, Co-Captain, player, waiting member, teen, new invitee.
- It uses the existing Test Lab role switch (the server acts as a bot with that role), so Home, Discover, Trip, Game Day, calendar, trip pot, At Home and Passport all show real role-filtered data.
- A banner at the top says "Viewing as …" with one-tap Exit. It only works while a Test Lab trip is active.

## 2. Shuffle teams
- A Captain-only "Shuffle teams" button in the existing teams editor, with a confirm step.
- A new server function spreads approved players evenly across the teams without going over any team's limit. It refuses once the first game night has started.

## 3. Challenge categories
- Each trip-day challenge gets one of 7 categories: Taste the City, Culture Hunt, Landmark Challenge, Language or Local Expression, Team Challenge, Mystery Mission, Speed Round.
- Existing challenges get a category assigned once, by keyword. AI-made challenges must pick one. Players see a small label on each challenge.

## 4. At Home packs
- Thailand, Mexico and Japan each get at least 8 questions and 2–3 more ideas per category. All of it is clean and friendly.
- The existing app-paid top-up can add more pack items. Teens never get 21+ items.

## 5. Passport
- USA becomes one country page that holds the state stamps. The separate road-trip section is removed; the stored data stays the same.
- A "Places" list view: country or state, city, dates, trip name, newest first.
- Stamps become small drawn images (SVG), and each page only loads when it's opened, so the passport stays fast with 30+ stamps.

## 6. Sing-off / Fave Tune
- A new game in the existing games list. Each player enters a "disc" (song title and artist, typed or picked from a short list).
- The group votes with the existing in-app vote, which stays hidden until the reveal. No lyrics or audio are ever shown or stored.
- It works on Game Day and as an At Home activity.

## 7. Optional host timer
- The host, Co-Captain or Captain can start a countdown: 30s, 1 min, 2 min, 5 min or a custom time.
- Every phone in the trip sees it. Nothing shows unless a timer is started, and only leaders can start or stop one.

## Technical details
- `trip_private.lab_bypass(p_trip)`: `is_app_admin()` AND `trips.is_sandbox`. It is ORed into `night_open`, `play_day`/release checks, `at_home_plan` release and `finalize_season`/end gates.
- New columns, all with grants and RLS following existing patterns: `trip_play_state.timer_ends_at` and `timer_label` (written via leader-checked `set_activity_timer`); a `category` column on trip-day challenges/quests; `at_home_pack_items` seed rows added by migration.
- Viewing as a role reuses `lab_as`/`lab_role`. A client context drives the banner and Exit.
- `shuffle_teams(p_trip)` is Captain-checked, locks team rows and refuses after the first night has started.
- Sing-off adds a `game_catalog` row plus a "disc" entry form, and uses `post_live_vote`/`cast_live_vote`.
- Verification: build, a DB test as founder vs non-founder on a Test Lab trip and a real trip, and a Playwright pass through each new screen.
