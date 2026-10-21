# 05 — Legacy Retire List

The deck *"replaces earlier briefs and PDFs"*. The features below were built for those earlier briefs and **are not in the deck**. Removing them is what makes it possible to build one clean engine.

> ⚠ **Needs founder approval (Q20)** before anything is dropped. Some items may be wanted back later. The procedure below makes removal reversible until the final drop step.

---

## 1. How to retire safely (procedure)

1. **Decide the fate of existing trips (Q1).** Recommended:
   - Mark all trips created before the cutover with `rules_version = 1`.
   - Render them through **one read-only "archive" trip view**: overview, members, photos, stamps, crowns already won.
   - Allow no new play on them. Passport stamps already earned stay.
   - **Siam Vibes (`VRFQQM`)** is a real group; tell the Captain before the cutover.
2. **Hide the UI first** (feature flag off, route removed). Ship it. Watch errors for a week.
3. **Stop the writes:** `REVOKE EXECUTE` on the public wrapper functions. Leave the tables in place.
4. **Archive:** `ALTER TABLE … SET SCHEMA legacy_archive;` and export to CSV / Storage for the founder.
5. **Drop**, but only after a full release cycle with no issues, in its own migration with a clear name (e.g. `2026xxxx_drop_question_of_the_week.sql`).
6. **Mine content before dropping.** Card decks, question pools and mission text can seed `content_items` for Daily Card, Daily Discovery and Games on the Flight.

## 2. Features to retire

| # | Feature | Why it goes | Frontend (main files) | Database (tables / functions, partial) |
|---|---|---|---|---|
| L1 | **Old game night**: spin wheel, game catalog, host rotation, turns, cards, finale vote, host timer | Replaced by **Game Night Live** (no host, avatar votes, R-401) | `GameNights`, `GameWheel`, `NightGamePicker`, `GamePlanPicker`, `GameNightExtras`, `GameExtrasC2`, `GameNightCabin`, `ConfirmHost`, `next-game-night.ts`, `season-plan.ts`, `game-night-ai.functions.ts` | `game_night_*`, `game_cards`, `game_catalog`, `game_format_prompts`, `game_pick_log`, `game_scores`, `trip_play_state`; `plan_game_nights`, `apply_game_plan`, `reschedule_preview`, `apply_reschedule`, `game_stamps`, spin/draw functions |
| L2 | **Host swaps, no-show penalties** | No host in the new model | `HostSwaps` | `host_swaps`, `host_penalties` |
| L3 | **Skip passes** | Not in the deck | in `Seasons.tsx` / `Season.tsx` | `skip_passes` |
| L4 | **Question of the Week** (+ voting, tie-break wheel, bonus questions) | Replaced by Daily Discovery / Daily Card | `WeeklyQuestion` | `weekly_questions`, `weekly_answers`, `weekly_answer_votes`, `weekly_question_pool`; `qotw_action`, `vote_weekly_answer`, `qotw_answers` |
| L5 | **Quick Vote** ("Cleared for Takeoff / Grounded") | Not in the deck | vote sheet in `index.tsx` / `Seasons.tsx` | `live_votes`, `live_vote_ballots`; `close_live_vote` |
| L6 | **Trip pot / cost splitting** | Not in the deck | `TripCosts` | `cost_items`, `cost_shares`, `cost_log`, `cost_notes`; `trip_pot` |
| L7 | **Junkie Rank** + rank rewards | The deck: no lifetime points; you keep stamps, postcards, badges | `ExperiencePreviews` (rewards list), Junkie Rank UI in `PassportBook` / `MeExtras` | `junkie_ranks`; `junkie_rank` |
| L8 | **AI credit wallet & tiers** (20/35/50/70, purchases) | The deck: "AI included; quiet daily limit on remixes" | `AiCredits` (keep the founder **AiGuard** admin) | `user_credits`, `ai_credit_purchases`; `spend_credits`, `use_ai_quota` (simplify to the daily cap) |
| L9 | **Teams for ≤ 12 players** | Teams return only for Event Group (later) | team UI in `Seasons.tsx` | `trip_teams`, `trip_team_members`; `pick_team` |
| L10 | **Party cards / sip-or-skip / 21+ approvals** | Keep only "alcohol content 21+" as a content filter | `AdultCards`, `ActivityAlternative` | `trip_adult_*`, `trip_item_alternatives` |
| L11 | **Early Check-In** tasks | Not in the deck | `EarlyCheckIn`, `CheckinShowTell` | `mission_claims` rows with `phase='checkin'` |
| L12 | **Secret Missions** | Not in the deck | `SecretMissions` | `secret_missions` |
| L13 | **Trip-day games** (daily bingo/quests/trivia/MVP, released by Captain, game-day rhythm) | Replaced by **Surprise Drops** + Daily Discovery + trip quest | `TripDayGames`, `SeasonGames`, `PracticeDay`, `pending-bingo.ts` | `trip_day_games`, `trip_day_trivia_keys`, `trivia_answers`, `day_votes`, `trip_season_*`; `release_trip_day`, `game_day_status`, `trip_season` (stamps) |
| L14 | **Game Rooms** (public room listing + join requests) | Not in the deck | `GameRooms`, `RoomExperienceCard` | `room_requests`, `room_blocks`; `set_room_listing`, `game_rooms` |
| L15 | **Travel From Home inspiration cards / public previews** | Not in the deck (Window Seat and culture rooms replace them) | `Inspiration`, `SampleExperience`, `CultureQuest` (review) | `cultural_inspirations`, `inspiration_votes`, `experience_previews`, `culture_quest_*` (review) |
| L16 | **Trip Wrapped story slides** | Replaced by the Postcard / collage (R-605) | Wrapped in `Seasons.tsx` / `PlayHub` | — |
| L17 | **"Original" look** + per-page look switches | One design direction (Airline Look) | `look.tsx`, every `cinematic ? … : …` branch, large parts of `styles.css` | `app_settings.look` |
| L18 | **Home layout mockups** | Review-only tool | `HomeLayoutMockups`, `routes/home-mockups.tsx` | profile home-layout setting |
| L19 | **FULL / PREVIEW trip levels + feature switches** | Beta tooling that doubles code paths. Replace with simple env flags | `features.tsx` (`FeatureGate`), `FounderFeatures` | `trip_private.preview_*`, `trips.level`, `trip_features`, `feature_on`, `require_feature` |
| L20 | **Late-joiner start stamps** | Old scoring | — | `trip_private.trip_join_grants`, `apply_join_baseline`, `trip_members.start_stamps` |
| L21 | **Normalised /100 scores, "stamps"-as-points** | The deck uses raw points per season | score strips in `Season.tsx` / `Seasons.tsx` / `SeasonQuests` | `trip_season_score`, `game_board`, `scoreOf` |
| L22 | **Player card facts** (occupation, fun fact, persona, next-year goal) | The deck keeps only role + "most excited for" | parts of `PlayerCards` | `trip_player_cards` facts columns |
| L23 | Stray file `null` at repo root | Junk (holds a shell error) | — | — |

## 3. Keep (people often assume these are legacy)

- **Test Lab** (sandbox trips, bots, time travel): the deck asks for a way to run test trips.
- **Founder dashboard, beta codes, waitlist, bug inbox, AI guard.**
- **Sealed quests + Showcase**: they are in the deck. Evolve them; don't drop them.
- **Airport Missions** (`mission_claims` with `phase='takeoff'`): in the deck, cap 12.
- **One-phone offline night** (`OnePhoneNight`): this is "Friends off the app".
- **Games on the Flight** (`GameArcade`): in the deck, free and no points.
- **Passport stamps** (`passport_stamps`): evolve them.
- **Photo reporting / removal**: moderation.
- **Age gates**, **legal pages + consent**, **account deletion**, **trip deletion with audit**.
- **Itinerary upload + AI reading**: not in the deck, but cheap and useful. Founder to confirm (Q6).
