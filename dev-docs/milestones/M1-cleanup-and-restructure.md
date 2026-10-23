# M1 — Cleanup & Restructure

**Goal:**
- Remove what the deck dropped.
- Get down to **one visual look**, **real routes** and a **data layer**.
- Freeze old trips as archives.

After M1 the codebase has one path per feature and is ready for the new engine.
**Depends on:** M0 (tests + founder decisions Q1, Q6, Q15, Q20).
**Exit criteria:**
- [05](../05-legacy-retire-list.md) items are hidden and their writes revoked.
- `index.tsx` is gone; tabs have URLs.
- No `look` switch remains.
- Components don't import the Supabase client.
- The M0 characterisation tests are still green (updated only where a feature was removed on purpose).

| ID | Task | Size |
|---|---|---|
| M1-01 | Archive mode for existing trips (`rules_version`) | M |
| M1-02 | Remove retired features from the UI | L |
| M1-03 | One look: remove "Original", set Airline Look tokens | L |
| M1-04 | ✅ | `src/routes/index.tsx` is gone; its components live in `src/features/*`. Pathless `_shell` layout: tabs are URLs (`/`, `/home`, `/me`) and sub-screens are validated search params (`src/features/app-shell/nav.ts`); refresh and back/forward work. Q6 tab bar Home · Play · Trip · Me, crew list inside Trip. **Trip layout** `/t/$tripId` (redirects to Play) with `/t/$tripId/play` and `/t/$tripId/trip`: the URL opens that trip, its loader prefetches roster and cards; plain `/play` and `/trip` move to the open trip; an id that isn't mine falls back to the current trip. Signed-in e2e tests run against a mocked Supabase backend (`e2e/support/mock-backend.ts`). **Later:** phase and room config join the trip loader with the M2 phase engine; optional path URLs for `/me/captain`, `/p/$userId`, `/admin`. |
| M1-05 | ✅ | `types.ts` generated from the migrations (`scripts/db/gen-types.sh`, CI checks it is current). Typed `rpc()` / `rpcOn()` in `src/data`; 60 → 5 `as unknown as`. Query hooks `useTrips` / `useMembers` / `useCards` (`src/data/queries.ts`) drive the app shell, which no longer imports the client (`src/data/account.ts` holds its other calls). **Lint rule:** importing `@/integrations/supabase/client` outside `src/data`, `src/features/auth` and `src/integrations` fails; the 50 older importers are listed in `eslint-suppressions.json` and come off as each screen moves to hooks (M2/M3 rebuilds). |
| M1-06 | ✅ | Prettier pass done (own commit, in `.git-blame-ignore-revs`). 81 files moved from `src/components` into 19 feature folders (`src/features/README.md`); `src/components` holds `ui/` and 8 shared pieces. The component rules file is now `src/features/AGENTS.md`. 155 lines are still over 160 chars: shadcn `ui/` class strings and long copy/class literals Prettier can't break; they go as screens are rebuilt. |
| M1-07 | 🟡 | i18next + react-i18next in `src/i18n` with typed keys from `src/i18n/en.json`; device language detected, English only (Q15). Sign-in, email code, tab bar, Explore prompt and the M1-12 copy read from the catalog. **Lint rule:** new JSX text and string `aria-label` / `placeholder` / `title` / `alt` fail. **Left:** 1,950 existing strings in 91 files (listed in `eslint-suppressions.json`); they move to the catalog as M2/M3 rebuild each screen, rather than extracting copy from screens about to be replaced. |
| M1-08 | Revoke + archive retired DB objects | M |
| M1-09 | Migration baseline for new environments | M |
| M1-10 | Remove FULL/PREVIEW levels and per-trip feature switches | M |
| M1-11 | Mine retired content into a seed file | S |
| M1-12 | 🟡 | Place suggestions are opaque (form no longer shows through); small pink text, destructive red, podium names and the Play phase track (upcoming steps were at half opacity) meet AA; NOW badge and accessible names fixed. Copy: "I'll write it" → "Start from ready-made cards"; "Optional preparation before travel" → "Pre-Flight warm-up days before you go (optional)". `e2e/a11y.spec.ts`: axe WCAG 2.1 A/AA plus a painted-contrast check (`e2e/support/contrast.ts`) on sign-in, Home, Play, Trip, Captain Tools, Me, Help and trip setup, all passing. **Left:** light appearance and screens the mock backend can't reach (live rooms, culture setup) need the local stack or staging; founder phone check. |

## Status (Oct 23, 2026, end of day)

| ID | State | What's done · what's left |
|---|---|---|
| M1-01 | ✅ | `trips.rules_version` (2 = current, 1 = archived), one `<table>_archive_guard` trigger on every trip table, admin-only `archive_legacy_trips` / `set_trip_archived` (logged), read-only `ArchivedTrip` view, 23 pgTAP assertions. Nothing is archived yet. **Left (founder):** tell Siam Vibes (`VRFQQM`), then run the cutover with `founder_trips()` to pick the trips to keep. |
| M1-02 | 🟡 | L1–L5, L7, L9, L11–L14, L16, L18, L21 (readouts), L22 removed from the UI; Play hub placeholders for Daily Card, Game Night Live, Crew Check, Surprise Drops, Postcard Picks. `tsconfig` now has `noUnusedLocals`. **Deferred** (see below): L6 and old At Home pieces, L8, L15, L21 scoring engine, `GamePlanPicker`. |
| M1-03 | 🟡 | One look: `look.tsx`, `useLook`, the Original branches (codemod), the founder Look screen and `app_settings.look` are gone (11_one_look.test.sql). `src/design/tokens.css` holds the deck palette (`--tj-*`) and all app variables; `docs/BRAND.md` updated. 432 dead selectors removed: `styles.css` 260 → 194 KB (built 360 → 299 KB); signed-out screens pixel-identical. **Left:** CSS < 80 KB comes with the M2/M3 screen rebuilds (what remains is the live look of Home, Play, Journey and Passport); `PhaseBanner`, `AvatarRing`, `FaceCard`, `ScoreStrip` get built with their first screen in M2 instead of shipping unused; the founder's signed-in screenshot check needs the local stack or staging. |
| M1-04 | 🟡 | `src/routes/index.tsx` is gone; its components live in `src/features/*`. Pathless `_shell` layout: tabs are URLs (`/`, `/home`, `/play`, `/trip`, `/me`) and sub-screens are validated search params (`src/features/app-shell/nav.ts`); refresh and back/forward work. Q6 tab bar Home · Play · Trip · Me, crew list inside Trip. Signed-in e2e smoke tests run against a mocked Supabase backend (`e2e/support/mock-backend.ts`). **Left:** `/t/$tripId` trip layout with loaders (needs the M1-05 hooks); optional path URLs for `/me/captain`, `/p/$userId`, `/admin`. |
| M1-05 | 🟡 | `types.ts` generated from the migrations (`scripts/db/gen-types.sh`, CI checks it is current). Typed `rpc()` / `rpcOn()` in `src/data` (null-tolerant args); the untyped client casts are gone (60 → 5 `as unknown as`). **Left:** lint rule banning the client outside `src/data` / `src/features/auth` (existing imports as suppressions); Query hooks for trips, members and cards, used by the app shell. |
| M1-06 | 🟡 | Prettier pass done (own commit, in `.git-blame-ignore-revs`). Started `src/features/` (app-shell, auth, admin, trip, points). **Left:** move the rest of `src/components`. |
| M1-07 | ⬜ | Not started. |
| M1-08 | 🟡 | 75 public wrappers of retired features revoked from `anon`/`authenticated`, listed in `trip_private.retired_wrappers` (10_retired_wrappers.test.sql). No cron job served only a retired feature. `scripts/db/export-legacy.sh` exports the 52 retired tables to CSV. **Left:** run the export on production (needs M0-02 access) and deliver it; move the tables to `legacy_archive` one release later, after `delete_trip`, `trip_photos` and account deletion stop naming them. |
| M1-09 | ⬜ | **Needs** a production dump (M0-02) to rehearse on staging. |
| M1-10 | ✅ | `trips.level`, the trip feature map, preview settings RPCs and the preview row policies are gone; `feature_on` / `require_feature` / `in_slice` are constants for older callers only. `FeatureGate` deleted; `src/lib/flags.ts` holds environment flags (`VITE_FEATURE_MAP`). Test Lab had no preview-level mode (its role views stay). |
| M1-11 | ✅ | `supabase/seed/content_candidates.csv` (2,938 rows). **Left (founder):** review and tag. |
| M1-12 | ⬜ | Not started. |

**Environment note:** the cloud sessions can't run `supabase start` (the network policy blocks the Docker registries), so signed-in flows are checked with the mocked backend; CI's `supabase` job runs the real stack.

**Kept for now, on purpose** (each removed by the milestone that replaces it):
- **L15 Inspiration / culture cards:** still the only way to create Explore a Culture and Show Your Culture rooms. Until the M2-05 setup wizard.
- **Old At Home room** and what it uses (`TripCosts` player view, `GameExtrasC2` timer and Sing-Off, `CinematicMonthCalendar`, `HostSwaps` night actions, `NightGamePicker`). Until M3-13.
- **L8 AI credits:** `spend_credits` / `use_ai_quota` gate 8 paid AI actions on the server. Until M3-02 (daily cap).
- **L21 scoring:** `season_points`, `trip_season_score`, `game_board` and the season leaderboard. Until M3-16 (raw points).
- **`GamePlanPicker`:** a2c sealed quests still need it. Until M2.
- **Test Lab** still offers bot actions for some retired features; they run as SECURITY DEFINER and keep working. Clean up in M6-06.


---

### M1-01 · Archive mode for existing trips
- Add `trips.rules_version smallint NOT NULL DEFAULT 2`. Set it to `1` for every trip created before the cutover (legacy, a2c, a2e).
- Build **one read-only `ArchivedTrip` view** showing name, dates, place, crew avatars, crowns already won, photos (until purge), passport stamps.
- All play actions are refused on the server for `rules_version = 1` (one guard in a shared helper used by every write function).
- Tell the active groups (Siam Vibes `VRFQQM`) before release (Q1).
- **Acceptance:** an old trip opens read-only; no write RPC succeeds on it (pgTAP); stamps and profiles are untouched.

### M1-02 · Remove retired features from the UI
- Work through [05 §2](../05-legacy-retire-list.md) **L1–L23**, one PR per item group:
  - game night (L1–L3)
  - Question of the Week + Quick Vote (L4–L5)
  - Trip pot (L6)
  - rank, credits, teams, party (L7–L10)
  - check-in, secret missions, trip-day games (L11–L13)
  - rooms, inspiration, Wrapped (L14–L16)
  - mockups, preview levels, scoring readouts, card facts (L18–L22)
- Big mixed files (`Seasons.tsx` 68k, `Season.tsx`, `GameNights.tsx`, `PlayHub.tsx`) get **split first**, then pruned.
- Leave **placeholders** in the Play hub for the cards M2/M3 will fill: Daily Card, Crew Check, Game Night Live, Postcard Picks.
- **Acceptance:** no route or button reaches a retired feature; bundle size drops; the remaining E2E smoke tests pass.

### M1-03 · One look: Airline Look tokens
- Remove `src/lib/look.tsx`, `useLook`, `LOOK_KEYS`, every `cinematic ? … : …` branch (keep the Cinematic branch; it's closer to the deck), the `app_settings.look` reads, and the look switcher.
- Create `src/design/tokens.css` from deck slide 21 (navy, indigo, cyan, pink, orange, sun yellow) + `docs/BRAND.md`. Strip unused CSS from the 227 KB `styles.css`.
- Base components: `PhaseBanner`, `AvatarRing` (sunset glow), `FaceCard`, `ScoreStrip`. The airline set (boarding pass, ticket stub, luggage tag) comes in M2/M3 with their screens.
- **Acceptance:** no `look` references; CSS < 80 KB; screens look the same as today's Cinematic look at 390px (screenshot diff for the founder).

### M1-04 · Split `index.tsx` into real routes
- Implement the URL map in [03 §3](../03-target-architecture.md): `/welcome`, `/signin`, `/home`, `/t/$tripId/play`, `/t/$tripId/play/$phase`, `/t/$tripId/trip`, `/me`, `/p/$userId`, `/admin/*`, …
- Add a `/t/$tripId` layout route that loads trip + role + server phase + room config once (TanStack Router loader + Query).
- Tab bar per **Q6** (default Home · Play · Trip · Me) as `<Link>`s. "Current trip" is remembered per user (today it's local state).
- Keep `/join/$code` and `/beta/$code` behaviour (invite code preserved through auth for 24h, `pending-code.ts`).
- **Acceptance:** every tab and sub-page has a URL; refresh and back/forward work; `/join/ABC123` signed-out → sign in → lands in the trip; `index.tsx` is under 150 lines.

### M1-05 · Data layer + regenerated types
- Regenerate `types.ts` (with RPCs). Create `src/data/<domain>.ts` with typed RPC wrappers + Query hooks (`useTrip`, `useMembers`, `usePhase`, `useStandings`, …).
- Move the 57 components' direct `supabase.rpc/.from` calls into hooks. Remove `as unknown as { rpc … }` casts.
- Add a lint rule banning `@/integrations/supabase/client` imports outside `src/data` and `src/features/auth`.
- **Acceptance:** the lint rule passes; cast count reduced to under 10 (documented exceptions).

### M1-06 · Feature folders + Prettier pass
- Move files into `src/features/*` ([03 §4](../03-target-architecture.md)). This is a mechanical move.
- Run Prettier (`printWidth: 100`) once over `src/`, in its own PR.
- **Acceptance:** no file has lines over 160 chars (except generated); `src/components` holds only `ui/` and truly shared pieces.

### M1-07 · i18n scaffolding
- Add a small i18n library (e.g. `i18next` / `react-i18next`, or `@lingui`). Extract user-facing strings from kept screens into `src/i18n/en.json`. Detect locale from the device; English only for now (Q15).
- **Acceptance:** new code has no hard-coded copy (lint rule or review); the catalog covers the kept screens.

### M1-08 · Revoke + archive retired DB objects
- For each retired feature: `REVOKE EXECUTE` on its public wrappers, then move its tables to a `legacy_archive` schema. Drop cron jobs that only served retired features. Export the data to CSV for the founder.
- **Acceptance:** pgTAP confirms the wrappers are gone or denied; the app works; archive exports are delivered.
- The final `DROP` happens in a later release (procedure in [05 §1](../05-legacy-retire-list.md)).

### M1-09 · Migration baseline for new environments
- Generate `supabase/migrations/00000000000000_baseline.sql` from the cleaned schema. Move the 299 old files to `supabase/migrations_archive/`. On existing databases, mark the baseline as applied with `supabase migration repair`.
- **Rehearse on a staging copy of production first.**
- **Acceptance:** `supabase db reset` locally gives the same schema as production (`supabase db diff` is empty).

### M1-10 · Remove FULL/PREVIEW levels and feature switches
- Remove `trips.level`, `trip_features`, `feature_on` / `require_feature`, `FeatureGate`, `FounderFeatures` and the Test Lab "preview" mode. Replace with a few **environment-level flags** for unfinished features (`FEATURE_MAP=false`).
- **Acceptance:** no per-trip feature branching left.

### M1-11 · Mine retired content into a seed
- Export the useful text from `game_cards`, `game_catalog`, `weekly_question_pool`, `security_missions`, `trip_day_games` templates, `at_home_pack_items` and `practice-prompts.ts` into `supabase/seed/content_candidates.csv`, with suggested `kind` / `rooms` / `modes` tags for M3's `content_items`.
- **Acceptance:** CSV delivered to the founder for review and tagging.

### M1-12 · Contrast & readability fixes (beta notes, slide 20)
- Dark dropdown suggestions; chips, tabs and +/− buttons faint until tapped → fix to AA contrast in the new tokens.
- Rename confusing copy: "I'll write it", "optional preparation before travel".
- **Acceptance:** an axe / Lighthouse a11y pass on the kept screens; the founder confirms on a phone.
