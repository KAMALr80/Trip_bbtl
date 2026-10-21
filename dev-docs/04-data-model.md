# 04 — Data Model: Existing Tables and Proposed Changes

> **Decisions here are proposals.** Final keep/retire calls depend on [06-open-questions.md](06-open-questions.md) Q1 (what happens to existing trips) and Q20 (approving the retire list).
> **Legend:**
> - **Keep**: keep as is
> - **Change**: keep, but alter
> - **Merge**: fold into a new table
> - **Retire**: stop writing; archive, then drop (see [05](05-legacy-retire-list.md))
> - **Review**: purpose unclear from the code; confirm before deciding

Before any of this, **M0-06 dumps the current live schema** (`supabase db dump --schema public,trip_private`). The 299 migrations rewrite many functions repeatedly, so the dump is the only reliable view of what's actually defined.

---

## 1. Existing tables by area

### Identity, profile, consent

| Table | Decision | Notes |
|---|---|---|
| `profiles` | **Change** | Per-user presentation (`time_zone`, `seen_tips`, look). Add `quiet_start`, `quiet_end`, `locale`. Drop look/appearance columns with the Original look |
| `player_profiles` | **Change** | Game name, avatar style/seed, `public_leaderboard`. Add `is_public` (R-714), `about_me`, `from_country` (R-702), `top_stamp_ids uuid[]` (R-801) |
| `player_private`, `player_birthdays` | Keep | Private details, birthdays (owner/Captain only) |
| `account_consents` | Keep | Legal consent history |
| `app_admins` | Keep | Founder/admin gate (`is_app_admin`) |
| `trip_private.teen_accounts` | Keep | Teen tracking for age rules (re-check vs R-904) |
| `age_guesses` | Review | Possibly an old game; confirm |

### Trips & membership

| Table | Decision | Notes |
|---|---|---|
| `trips` | **Change** | Slim down heavily (see §3) |
| `trip_members` | **Change** | Keep roles (`captain` / `co_captain` / member) and status (`pending` / `approved`). Add `trip_role_label` and `most_excited` (R-212); these live in `trip_player_cards` today |
| `trip_player_cards` | Merge → `trip_members` + `player_profiles` | Facts (hometown, occupation, fun fact) aren't in the deck; keep only role + most_excited |
| `trip_invites` | Keep | Invite links/codes |
| `trip_role_changes` | Keep | Audit log of role changes |
| `trip_private.trip_removals`, `code_attempts` | Keep | Removal history; join-code rate limiting |
| `trip_private.trip_join_grants` | Retire | Late-joiner "start stamps" baseline (old scoring) |
| `trip_deletion_log`, `trip_deletion_notes` | Keep | Delete-trip audit + member notice |
| `trip_itineraries`, `trip_day_tags` | Keep (if Trip tab stays, Q6) | Itinerary days; AI itinerary reading |
| `trip_item_alternatives` | Retire | Alternatives for old bingo/quest/trivia items |
| `trip_adult_settings`, `trip_adult_activities`, `trip_adult_approvals` | Retire | "Party / sip-or-skip". Keep **21+ alcohol** as a content tag (`content_items.alcohol`, R-904) |
| `trip_play_state` | Retire | Old host-driven shared play cursor |

### Old game nights, wheel, cards, Question of the Week (all replaced by Game Night Live)

| Table | Decision |
|---|---|
| `game_nights` | **Change → `call_nights`** (date, time, call link, 2nd link; max 4, R-204). Or keep the table name and drop host/game columns |
| `game_night_flow`, `game_night_turns`, `game_night_votes`, `game_night_polls`, `game_night_reactions`, `game_night_moments`, `game_night_card_skips` | Retire |
| `game_cards`, `game_catalog`, `game_format_prompts`, `game_pick_log` | Retire, but **mine the content** for Daily Card / Games on the Flight before dropping |
| `game_scores` | Retire (replaced by `points_ledger`) |
| `host_swaps`, `host_penalties`, `skip_passes` | Retire |
| `live_votes`, `live_vote_ballots` | Retire (Quick Vote) |
| `weekly_questions`, `weekly_answers`, `weekly_answer_votes`, `weekly_question_pool` | Retire (Question of the Week). The pool may seed Daily Discovery / Daily Card |

### Seasons, scores, teams, ranks

| Table | Decision | Notes |
|---|---|---|
| `season_champions` | **Change** | Keep. Season values become `preflight` (Early Bird) / `trip_season` (Jet Setter); drop `home` (at-home uses `trip_season`, R-110) |
| `season_settings` | Review | Prize notes / crowning settings; likely fold into `trips` crowning columns |
| `season_quests` | Merge → `points_ledger` / `proofs` | Pre-flight quest claims, old model |
| `stamp_settings` | Retire | Old stamp values |
| `junkie_ranks` | Retire | Junkie Rank |
| `trip_teams`, `trip_team_members` | Retire now | Re-introduce for Event Group (later) |

### Quests, missions, proofs

| Table | Decision | Notes |
|---|---|---|
| `sealed_quests` | **Change** (M3) | Keep the reveal/secrecy model; migrate scheduling to `trip_schedule`, points to `points_ledger`, proof to `proofs` |
| `security_missions` | Merge → `content_items` | Airport / Check-In mission text pool (no client grants: keep that property) |
| `mission_claims` | **Change / Merge** | Airport Missions ✅. Move proof to `proofs` and points to the ledger; drop the `checkin` phase (Early Check-In 🗑) |
| `airport_claims` | Review | Possibly earlier Airport Mission version |
| `mission_votes`, `quest_posts`, `quest_thumbs`, `quest_challenges` | Merge → `proofs` / `proof_votes` | Several earlier approval mechanisms |
| `secret_missions` | Retire | Not in the deck |
| `trip_private.trip_speed_finishes` | Merge → ledger (`earned_at` + speed source) | |

### Trip-day games (replaced by Surprise Drops + Daily Discovery)

| Table | Decision |
|---|---|
| `trip_day_games`, `trip_day_trivia_keys`, `trivia_answers`, `day_votes` | Retire (mine content) |
| `bingo_marks` | **Change**: reusable for Surprise Drop Bingo |
| `trip_season_games`, `trip_season_finds`, `trip_season_reveals` | Retire / Merge → `trip_schedule` |

### At Home & culture rooms

| Table | Decision | Notes |
|---|---|---|
| `at_home_packs`, `at_home_pack_items` | Merge → `content_items` | Seeded packs |
| `at_home_activities`, `at_home_answers`, `at_home_votes`, `at_home_song_winners`, `home_day_sessions`, `home_day_results` | Retire / Merge | Old At Home day flow; becomes engine + schedule |
| `culture_experiences`, `culture_exp_days` | **Change** | Map to `trips` with room `explore_culture` / `show_culture`; experience days → `trip_schedule` |
| `culture_quest_sessions`, `culture_quest_items`, `culture_quest_players`, `culture_quest_answers` | Review → likely Merge | Culture Quest mini-game |
| `culture_showcase_ballots`, `culture_showcase_rewards`, `culture_showcase_viewers` | Merge → Game Night Live tables | Finale voting |
| `culture_stamps`, `culture_layer_stamps`, `postcard_stickers` | Merge → passport / postcards | Culture Collector badge (R-712) counts distinct cultures |
| `cultural_inspirations`, `inspiration_votes`, `culture_exp_likes`, `culture_exp_hidden`, `experience_previews` | Retire or Review | "Travel From Home" inspiration cards and public previews; not in the deck |
| `solo_quests` | **Change** | Window Seat / solo daily quests → `trip_schedule` + `proofs` |
| `window_guide_items` | **Change** | Window Seat shared guide (R-354/355) |
| `song_discs` | Review | Sing-off |

### Photos & passport

| Table | Decision | Notes |
|---|---|---|
| `photo_posts` | **Change** | Trip photos; becomes the pool for Postcard Picks; purge non-kept after Day 7 (R-607) |
| `photo_reactions` | Merge → `postcard_hearts` | |
| `photo_removed`, `photo_reports` | Keep | Moderation |
| `passport_stamps` | **Change** | Add `postcard_id`, crowns, solo marker, `is_hidden`; country vs state from `from_country` (R-702) |

### Money, credits, AI

| Table | Decision | Notes |
|---|---|---|
| `orders`, `price_rules`, `reward_codes` | Keep (dormant until Phase 2 payments) | Prices must match R-903 tiers |
| `ai_credit_purchases`, `user_credits` | Retire | AI credit wallet; the deck says AI is included with a quiet daily limit |
| `ai_usage` | Keep | AI spend log + caps |
| `trip_private.ai_guard_log` | Keep | |
| `cost_items`, `cost_shares`, `cost_log`, `cost_notes` | Retire | Trip pot |

### Content & feedback

| Table | Decision |
|---|---|
| `content_seen` | Keep (no-repeat) |
| `content_variants`, `content_topups` | Merge → `content_items` (AI variants with `source='ai'`) |
| `content_feedback` | Keep (anonymous ratings) |
| `trip_feedback`, `checkin_responses` | Keep (founder feedback/check-ins), Review |

### Founder / beta / sandbox

| Table | Decision |
|---|---|
| `beta_codes`, `beta_access`, `waitlist` | Keep through beta |
| `bug_reports`, `bug_issues` | Keep |
| `sandbox_trips`, `sandbox_bots`, `trip_private.lab_views` | Keep (Test Lab) |
| `app_settings` | Keep (drop look settings) |
| `trip_private.preview_settings`, `preview_log`, `preview_hidden` | Retire with FULL/PREVIEW levels (if approved) |
| `room_requests`, `room_blocks` | Retire (public Game Rooms listing) |
| `trip_private.cron_keys` | Keep |
| `trip_private.inspiration_moderation` | Keep if inspirations stay |

---

## 2. New tables (SQL sketches)

> All new tables: RLS **on**, **no direct client writes**. Writes go through identity-checked `trip_private` functions with `public` wrappers. That is the existing pattern; keep it.

```sql
-- 2.1 Points (see 03 §7)
CREATE TABLE public.points_ledger ( ... );               -- full definition in 03-target-architecture.md §7

-- 2.2 Proofs + Crew Check (03 §8)
CREATE TABLE public.proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source text NOT NULL, source_ref uuid NOT NULL,
  photo_path text, body text CHECK (length(body) <= 500),
  ai_status text NOT NULL DEFAULT 'not_needed', ai_reason text,
  crew_status text NOT NULL DEFAULT 'waiting',
  approved_by uuid, approved_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id, source, source_ref)
);
CREATE TABLE public.proof_votes (
  proof_id uuid REFERENCES proofs(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proof_id, voter_id)
);

-- 2.3 Content + schedule (03 §9)
CREATE TABLE public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                -- daily_discovery | daily_card | sealed_quest | showcase | airport_mission |
                                     -- home_mission | drop_bingo | drop_scavenger | drop_speed | drop_photo |
                                     -- trip_quest | journal_prompt | wrapup_question | flight_game
  rooms text[] NOT NULL, modes text[] NOT NULL,   -- modes: trip | at_home | solo  (R-007)
  focus text, vibe text, min_age int NOT NULL DEFAULT 13, alcohol boolean NOT NULL DEFAULT false,
  title text, body text NOT NULL, insight text,
  points_min int, points_max int, has_question boolean DEFAULT false,
  locale text NOT NULL DEFAULT 'en', source text NOT NULL DEFAULT 'curated', active boolean DEFAULT true
);
CREATE TABLE public.trip_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind text NOT NULL, day date, opens_at timestamptz NOT NULL, closes_at timestamptz,
  audience text NOT NULL DEFAULT 'all', user_id uuid,          -- per-player items (trip quest, sealed quest)
  content_item_id uuid REFERENCES content_items(id), tailored_text text,
  revealed_at timestamptz, points int,
  UNIQUE (trip_id, kind, day, user_id)
);

-- 2.4 Game Night Live (R-401–R-405)
CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  call_night_id uuid, is_crowning boolean NOT NULL DEFAULT false,
  season text NOT NULL, status text NOT NULL DEFAULT 'open',   -- open | closed
  opened_at timestamptz DEFAULT now(), closed_at timestamptz, closed_by uuid,
  auto_close_at timestamptz NOT NULL                           -- midnight (R-404)
);
CREATE TABLE public.live_presents (session_id uuid, presenter_id uuid, voter_id uuid, created_at timestamptz,
  PRIMARY KEY (session_id, presenter_id, voter_id), CHECK (presenter_id <> voter_id));
CREATE TABLE public.live_award_votes (session_id uuid, award text CHECK (award IN ('best_overall','most_creative','best_story')),
  voter_id uuid, nominee_id uuid, created_at timestamptz,
  PRIMARY KEY (session_id, award, voter_id), CHECK (nominee_id <> voter_id));  -- confirm: can you vote for yourself? (Q7)

-- 2.5 Postcards & wrap-up (R-6xx)
CREATE TABLE public.postcard_picks (trip_id uuid, user_id uuid, photo_id uuid, picked_at timestamptz,
  PRIMARY KEY (trip_id, user_id, photo_id));            -- max 2 (5 for Window Seat crew) enforced in function
CREATE TABLE public.postcard_hearts (trip_id uuid, photo_id uuid, voter_id uuid, PRIMARY KEY (trip_id, photo_id, voter_id));
CREATE TABLE public.wrapup_answers (trip_id uuid, user_id uuid, question_key text, answer text CHECK (length(answer) <= 60),
  PRIMARY KEY (trip_id, user_id, question_key));
CREATE TABLE public.trip_postcards (trip_id uuid PRIMARY KEY, locked_at timestamptz, photo_paths text[],
  answers jsonb /* grouped by question, no names */, crowns jsonb, image_path text /* rendered collage */);

-- 2.6 Window Seat journal (R-351)
CREATE TABLE public.journal_entries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid, user_id uuid,
  day date, prompt_id uuid, body text CHECK (length(body) <= 2000), created_at timestamptz DEFAULT now(),
  UNIQUE (trip_id, user_id, day));

-- 2.7 Notifications (03 §11)
CREATE TABLE public.device_tokens (...);  CREATE TABLE public.notification_prefs (...);  CREATE TABLE public.notification_queue (...);

-- 2.8 Places (03 §10) — or store only on trips
-- trips.dest_lat, trips.dest_lng, trips.dest_place_id, trips.trip_timezone (exists)
```

**Badges and levels** (R-703, R-711–713): compute them **when a stamp or postcard is added**. Either compute on read (cheap: count distinct countries/states/cultures/guides), or store `user_badges(user_id, badge, tier, earned_at)` written by the same function that adds stamps. Don't run a background job (R-704).

---

## 3. `trips` table: proposed column set

Today `trips` has about 60 columns accumulated across rule generations. Proposed target:

| Keep / add | Purpose |
|---|---|
| `id, name, join_code, join_code_enabled, join_locked, created_at, updated_at, is_sandbox` | core |
| **`room`** (enum: `trip`, `window_seat`, `explore_culture`, `show_culture`, `game_night`) | replaces `kind` + `a2e_kind` + `a2e_room` |
| **`play_mode`** (`solo` / `crew` / `offline`) | replaces `play_arrangement` (rename `online` → `crew`) |
| `destination, passport_country, passport_state, passport_city` **+ `dest_lat, dest_lng, dest_place_id`** | place + stamp classification |
| **`cultures text[]`, `focuses text[]`** | R-202 culture to explore (+ optional 2nd), R-361 focuses |
| `start_date, end_date` | trip / experience days |
| **`preflight_days smallint`** (0–10) + **`preflight_skipped bool`** | replaces `game_start`, `schedule_every`, `game_plan`, `season_rule` |
| `home_timezone, trip_timezone` | keep |
| **`arrived_at`** (rename `departure_confirmed_at`), **`arrived_by`** | R-103 |
| **`crowning_at`, `crowning_place`, `crowning_call_link`** | replaces `finale_at`, `finale_place`, `finale_format` |
| `call_link, backup_call_link` → move to `call_nights` | R-204 |
| `vibe, has_minors, max_squad` | keep |
| `motto` | Review: not in the deck; keep as optional |
| `ended_at, photos_purged_at` + **`locked_at`** (Day 7) | R-605 |
| **`rules_version int`** | 1 = legacy/a2c/a2e archive, 2 = new engine. Lets old trips stay readable without branching the new code (Q1) |

**Drop with the retire list:** `big_group, bingo_needs_photo, extra_seats, game_days_every, game_plan, game_start, guide_published_at (→ window_seat), level, leaderboard_public, pay_note, rest_days, room_city, room_country, room_listed, room_nickname, room_region, schedule_every, season_rule, season_scoring, surprise_mode, team_mode, at_home_length, at_home_pack, unlocked_at/unlocked_by (until payments)`. Confirm each against the M0 schema dump.
