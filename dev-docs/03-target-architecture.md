# 03 — Target Architecture

**Goal:** one game engine that every room plugs into, with rules on the server, and a client that can run as a website and as a store app.

> Guiding principle from the deck: *"Rooms change the content and the theme, never the flow."* Today each room has its own implementation. The target is **one engine plus room configuration**.

---

## 1. What we keep

- **TanStack Start + React 19 + Tailwind v4 + shadcn/ui.** Modern and typed, and it already builds.
- **Supabase Postgres, with game rules as `SECURITY DEFINER` functions in `trip_private`, and RLS denying direct writes.** The right model for a competitive game: clients can't forge scores.
- **The Test Lab** (sandbox trips, bots, time travel).
- **The AI safety plumbing:** `content-rules.ts`, `safeContent`, the DB phrase guard, the `ai_gate` kill switch and caps.
- **Age gating in the database**, Storage with signed URLs, pg_cron.

## 2. What changes (summary)

| Area | Today | Target |
|---|---|---|
| Routing | One route (`index.tsx`) holding 5 tabs in React state | Real routes with deep links (§3) |
| Code layout | 150 flat components | Feature folders (§4) |
| Rooms | Separate code paths per `kind` / `a2e_kind` / `season_rule` | `RoomConfig` + one engine (§5) |
| Phases | `datePhase()` on the client + several SQL helpers | **One phase function** in SQL, mirrored in TypeScript, with shared test fixtures (§6) |
| Points | `season_points` UNIONs about 12 sources; Trip Season also normalised to /100 | **`points_ledger`**, an append-only table written only by `award_points()` (§7) |
| Proof / approvals | Several mechanisms (two-member verify, Captain review, mission approvals) | One **`proofs`** table + **Crew Check** + AI check status (§8) |
| Content | Many pools (`security_missions`, `game_cards`, `weekly_question_pool`, `trip_day_games`, `solo_quests`, culture packs…) | One **`content_items`** library tagged by room/mode/kind + a per-trip **`trip_schedule`** (§9) |
| Time | Trip zone picked by hand | Destination → IANA zone looked up automatically (§10) |
| Notifications | `.ics` files | Queue + Web Push + email + preferences (§11) |
| Packaging | Manifest PWA, no service worker | **Installable web app** (service worker) + offline outbox (§12). No native apps. |
| AI | Lovable gateway, text only | Own provider key, text + vision, same gate (§13) |
| Visual looks | Original + Cinematic | **One** "Airline Look" design system (§14) |

---

## 3. Routing

TanStack Router file-based routes. Proposed URL map:

```
/                                  → redirect: signed-out → /welcome, signed-in → /home
/welcome, /signin, /reset-password
/tour                              → Explore tour (R-907)
/home                              → Home (Daily Discovery, countdown, departures board)
/trips/new                         → Captain setup wizard, steps 1–5 as search param ?step=n (R-201)
/join/$code                        → invite (keep)
/t/$tripId                         → trip layout (loads trip once, provides context)
/t/$tripId/play                    → Play hub (R-301)
/t/$tripId/play/$phase             → preflight | takeoff | trip-season | baggage-claim
/t/$tripId/play/card/$cardId       → card detail (quest, mission, drop, crew-check…)
/t/$tripId/live                    → Game Night Live (R-401)
/t/$tripId/trip                    → itinerary / dates / call nights (if Trip tab stays, Q6)
/t/$tripId/postcard                → Postcard / collage
/me                                → Me tab (R-801)
/me/captain/$tripId                → Captain tools, one tile per phase (R-210)
/p/$userId                         → Passport Junkie profile (R-701)
/map                               → world map (later)
/legal/$document, /about
/admin/*                           → founder tools (guarded by is_app_admin)
/api/*                             → server routes (cron, webhooks, push sender)
```

- Bottom tab bar = links, so tabs get URLs, the back button works, and push notifications can deep-link (`/t/abc/play/card/xyz`).
- The trip layout route loads the trip, the member's role, the server phase and the room config once, and provides them through context.

## 4. Source layout

```
src/
  routes/                 thin route files only (loaders + layout), no business logic
  features/
    auth/                 sign-in, sign-up, age gate UI, Apple/Google
    setup/                Captain wizard (5 screens), shared step components
    trip/                 trip context, room config, phase hook, banners
    play/                 hub, phase pages, face cards
    daily/                Daily Discovery (Home) + Daily Card (Play)
    quests/               sealed quests, showcase, trip quest
    missions/             Airport / Home Missions
    surprise-drops/       bingo, scavenger, speed, photo challenge
    game-night/           Game Night Live, Show & Tell, Awards
    crew-check/           approval queue + card
    points/               standings, score strip, crown celebration
    window-seat/          journal, guide
    culture/              Explore / Show Your Culture specifics (focuses, finale)
    postcards/            picks, wrap-up questions, collage render
    passport/             profile, levels, badges, stamps
    captain-tools/        per-phase tiles, roles, remove player, delete trip
    notifications/        preferences, quiet hours, permission prompt
    offline/              outbox, cache, sync status
    admin/                founder dashboard, test lab, beta codes, bug inbox
  data/                   typed RPC wrappers + TanStack Query hooks (the ONLY place that imports supabase client)
  design/                 tokens, airline-look components (BoardingPass, TicketStub, LuggageTag, StampBadge)
  lib/                    pure helpers (dates, time zones, formatting), no React, no DB
  integrations/           supabase, ai, push, analytics
  i18n/                   message catalogs (en; es later)
supabase/
  migrations/             0000_baseline.sql + new migrations
  functions/ (optional)   if you choose Edge Functions for push/AI instead of Worker routes
  tests/                  pgTAP tests per domain
  seed/                   content seed + test fixtures
```

**Rule:** components never call `supabase` directly. They use hooks from `src/data/*`. That gives typed calls, one place for caching and invalidation, and one place to add the offline outbox (§12).

## 5. Rooms as configuration

```ts
// src/features/trip/rooms.ts (mirrored by SQL function trip_private.room_rules(room text) returning jsonb)
export type RoomId = "trip" | "window_seat" | "explore_culture" | "show_culture" | "game_night";
export type PlayMode = "solo" | "crew" | "offline";

export interface RoomConfig {
  id: RoomId;
  atHome: boolean;                       // R-108/R-110: home time only, Home Missions, experience days
  modes: PlayMode[];                     // which "Who's playing?" answers are allowed
  maxCrew: number;                       // 12 (trip/culture), 4 (window seat)
  mainDays: { min: number; max: number };// trips 1–14, at-home 1–7 (R-112)
  preFlightDays: { min: 0; max: 10; skippable: true };
  maxCallNights: 4;
  takeoff: "airport_missions" | "home_missions" | "none";
  tripSeasonStart: "arrival_button" | "first_experience_day";
  crowningLabel: "Crowning night" | "Finale night";
  photosKept: { group: number; solo: number }; // 6 / 10 (R-606)
  postcardPicksPerPlayer: number;        // 2, or 5 for Window Seat crew (R-354)
  dailyQuest: boolean;                   // Window Seat
  journal: boolean;                      // Window Seat
  focuses?: { max: 2 };                  // Explore a Culture
  contentTags: ("trip" | "at_home" | "solo")[];
  theme: ThemeId;                        // art, banner images, copy variants
  pointsEnabled: boolean;                // false for game_night (R-008)
}
```

- The server keeps the same table (SQL function or `room_rules` table) and **validates every write against it** (R-509).
- The client copy is only for display.
- Add a test that fails if the two disagree. Generate one from the other, or compare them in CI.

## 6. Phase engine (single source of truth)

```sql
-- returns the phase and its window for any trip at any instant
trip_private.trip_phase(p_trip uuid, p_at timestamptz DEFAULT now())
  RETURNS TABLE(phase text,             -- 'setup' | 'preflight' | 'takeoff' | 'trip_season' | 'baggage_claim' | 'archived'
                phase_starts_at timestamptz,
                phase_ends_at   timestamptz,
                tz text,                -- the zone this phase is measured in (home vs trip, R-108)
                day_index int)          -- 1-based day inside the phase
```

- The inputs are trip dates, `preflight_days`, `home_timezone`, `trip_timezone`, `arrived_at` (the "We've arrived" tap) and the room config.
- **Pure and deterministic**: no `now()` inside except as a default parameter. That makes the Test Lab's time travel trivial: pass `p_at`.
- TypeScript mirror: `src/features/trip/phase.ts` with **the same test fixtures** (JSON cases in `supabase/tests/fixtures/phases.json`, used by both pgTAP and Vitest).
- **Every gated action** (open a quest, upload proof, vote, close a night) calls `trip_phase` on the server. **The client only displays.**

## 7. Points ledger

```sql
CREATE TABLE public.points_ledger (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id      uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  season       text NOT NULL CHECK (season IN ('preflight','trip_season')),
  source       text NOT NULL,          -- 'daily_card','daily_discovery','sealed_quest','sealed_speed','showcase',
                                       -- 'airport_mission','game_night_present','award_best_overall',
                                       -- 'award_most_creative','award_best_story','surprise_drop',
                                       -- 'ws_quest','ws_journal','captain_adjust'
  source_ref   uuid,                   -- id of the quest / proof / night / drop
  points       int  NOT NULL,
  status       text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected','void')),
  earned_at    timestamptz NOT NULL DEFAULT now(),   -- for "earliest finish" tie-break (R-506)
  created_by   uuid,                   -- who triggered it (self, voter, system)
  UNIQUE (trip_id, user_id, source, source_ref)      -- idempotency: replays from the offline outbox can't double-count
);
-- No client grants. Written only by trip_private.award_points(...) / set_points_status(...).
```

- **Standings** = `SUM(points) WHERE status='approved' GROUP BY user_id, season`.
- **Crowning** = take the standings at the season's close time, apply the tie-break (R-506), write `season_champions`. For solo, compare against the goal (R-507).
- **Caps** (Airport Missions ≤ 12) are enforced inside `award_points`, not in the read query.
- **Crew Check** works on `status`: `pending` → `approved` (1 👍) or `rejected` (24h timeout).
- **Why:** one place to audit ("why do I have 47 points?" = list my ledger rows), offline-safe, easy to unit test, and the Play hub's score strip is one query.

## 8. Proofs, Crew Check and AI checks

```
proofs(id, trip_id, user_id, source, source_ref, photo_path, text, created_at,
       ai_status   ('not_needed','pending','pass','unsure','fail','error'),
       ai_reason, crew_status ('not_needed','waiting','approved','expired'),
       approved_by uuid, approved_at, expires_at)
proof_votes(proof_id, voter_id, created_at)        -- 👍; voter ≠ owner; approved members only
```

Flow (recommended default for Q3):
1. Upload → `proofs` row → a points row with `status='pending'`.
2. If the source is Bingo, Scavenger or Photo Challenge, queue an **AI check**.
3. AI `pass` → auto-approve. AI `unsure` or `fail` → it goes to **Crew Check**. AI `fail` is **flagged, never auto-rejected** (R-905: "flags only").
4. Other proofs (quests, missions) go straight to Crew Check.
5. The first 👍 from another approved member → approve. `expires_at = created_at + 24h` → a cron job marks it `expired` and the points row `rejected`.
6. Solo trips skip Crew Check (self-honor, R-414). AI still runs for moderation.

## 9. Content library + per-trip schedule

```
content_items(id, kind, rooms text[], modes text[] /* trip|at_home|solo */, focus text, vibe text,
              min_age int, alcohol bool, title, body, insight, points_min, points_max,
              placeholders text[] /* {city},{country},{culture} */, locale, active bool)
trip_schedule(id, trip_id, kind, day date, opens_at, closes_at, content_item_id, generated_text,
              audience ('all'|'user'), user_id, revealed_at)
```

- Kinds: `daily_discovery`, `daily_card`, `sealed_quest`, `showcase`, `airport_mission`, `home_mission`, `surprise_drop_bingo|scavenger|speed|photo`, `trip_quest`, `journal_prompt`, `wrapup_question`.
- When setup finishes, **materialise the schedule** with `trip_private.plan_trip(trip_id)`: which drops open when, which days are Surprise Drop days (random but stored, so it's stable and can be reproduced), and which days are question days.
- Editing dates re-plans the future and keeps the past, like today's `apply_reschedule`.
- AI tailoring (city/culture) runs **when the schedule is planned** (or the night before), not on tap. That way content exists before an offline flight and AI spend is predictable.
- Keep the existing **no-repeat** logic (`content_seen`) and the AI **top-up** pattern.
- Text stays **hidden until `revealed_at`**, enforced by a security-definer read function, exactly like today's sealed quests.

## 10. Time zones

- **Home zone:** read from the Captain's device (`Intl.DateTimeFormat().resolvedOptions().timeZone`) at trip creation. Store it on the trip.
- **Trip zone:** look it up from the destination. Recommended approach:
  1. Replace the free-text city with a **places autocomplete** that returns lat/lng. Options: Google Places, Mapbox Search, or a hosted GeoNames dataset. Today `places.ts` only has countries and US states.
  2. Lat/lng → IANA zone with an offline library (e.g. `geo-tz` on the server, or `tz-lookup` style polygons). For country-only destinations, use the country's main zone and let the Captain confirm when the country has several.
  3. Show "Trip time: Asia/Makassar (UTC+8)" on setup screen 2 with a "Change" link. The manual picker stays as the fallback.
- **Viewer display:** every deadline is one instant, shown in the viewer's phone zone (R-109). Keep `viewer-time.ts`.
- **Server:** never uses the viewer's zone (already a rule in `src/AGENTS.md`).

## 11. Notifications

```
push_subscriptions(user_id, endpoint UNIQUE, p256dh, auth, user_agent, updated_at)   -- one per browser
notification_prefs(user_id, type, push bool, email bool)     -- one row per type (R-812 "mute any type")
profiles.quiet_start time, profiles.quiet_end time, profiles.time_zone
notification_queue(id, user_id, trip_id, type, title, body, deep_link, send_after timestamptz,
                   status ('queued','sent','skipped','failed'), attempts, sent_at, dedupe_key UNIQUE)
```

- **Enqueue** when the schedule is planned (§9) and on events (proof waiting, night live, crowned). `send_after` respects quiet hours: shift it to the end of quiet hours in the user's zone.
- **Send:** pg_cron (every minute) → a server route `/api/cron/notify` → **Web Push** (VAPID; the standard Push API in Chrome, Edge, Firefox and Safari) with **email as backup** (Resend, Postmark or SES) when there's no subscription or the push fails. Delete subscriptions the push service reports gone (404/410).
- **Deep links** into routes (§3): the service worker's `notificationclick` opens or focuses the app at the link.
- **iPhone:** web push only works once the app is **added to the Home Screen** (iOS 16.4+). The install guide (M4-01) and the email backup cover players who don't install.

## 12. Installable web app + offline

**Decision (Oct 31, 2026, founder): no native apps.** The same React app, served from Cloudflare, is
installed from the browser (Add to Home Screen). A service worker makes it open with no network (★02).
The earlier Capacitor plan is dropped, along with store listings, native sign-in and FCM/APNs.

- **Service worker** (staging and production builds only): precaches the app shell and the art and content the flight games need. It never caches API, Supabase or server-function responses. New versions wait until the player accepts the existing `UpdatePrompt`, so previews and games never switch version mid-session (G12).
- **Install:** our own install card on Chrome/Android (`beforeinstallprompt`); a short Add to Home Screen guide on iPhone Safari, which has no prompt. On iPhone, installing is what unlocks web push and keeps stored data from being cleared after 7 days without a visit.
- **Offline model:**
  - **Snapshot:** at Takeoff (and whenever online), cache the trip bundle in IndexedDB: the member list, today's and tomorrow's schedule items that are already revealed or that reveal offline (flight games), and flight game content.
  - **Outbox:** user actions (answers, journal entries, votes, photo uploads) are written to a local IndexedDB queue with a client-generated **idempotency key**. When the page is back online (and on app start), flush the queue in order. Background Sync helps where it exists but isn't relied on (Safari has none). The server keys on `(source, source_ref, user)` (§7), so retries are safe.
  - **Rules still live on the server:** offline actions are *claims*; the server accepts or rejects them on sync (e.g. a deadline passed). The UI shows "Will sync when you're online".
  - Flight games give **no points** (R-334), so most offline play needs no server check.
- **Photos:** the browser file input with `capture`; compress and strip EXIF location before upload.
- **Revisit native** only if the founder changes the decision (e.g. a store presence becomes a business need); a Capacitor wrapper of this app would then be the cheapest route.

## 13. AI

- Replace the Lovable gateway with **your own provider key**. Keep the Vercel AI SDK, so changing provider is a one-line change.
- Put one module in `src/integrations/ai/` with typed tasks: `tailorContent`, `suggestTripNames`, `readItinerary`, `checkProofPhoto` (vision), `moderateImage`.
- Every call goes through `trip_private.ai_gate` and gets logged to `ai_usage`. That's already the case today; keep it.
- **Vision check** (R-413): the input is the photo plus the challenge text; the output is `{ verdict: pass|unsure|fail, reason, safety_flags[] }`. Never send names or faces as identity data. Store only the verdict.
- AI never rewrites players' words (R-604).

## 14. Design system

- **One look:** the deck's "Airline Look" (slide 21). Remove the `look.tsx` switch and the "Original" branches (M1).
- Tokens in `src/design/tokens.css`: navy, indigo, cyan, pink, orange, sun yellow (deck), plus the art palette in `docs/BRAND.md`.
- Shared airline components: `BoardingPass` (Play hub), `DeparturesBoard` (Home), `TicketStub` (missions/quests), `LuggageTag` (crowns), `PassportPage` + `Stamp`, `PhaseBanner`, `AvatarRing` (sunset glow).
- Accessibility: fix the contrast issues from the beta notes (dark dropdowns, faint chips). Target WCAG AA, 44px tap targets, reduced motion (the app already respects it).

## 15. Environments & delivery

| Env | Supabase | Web |
|---|---|---|
| local | `supabase start` (CLI, Docker) + seed | `bun dev` (no service worker) |
| staging | separate Supabase project | Cloudflare Worker `staging` (service worker on) |
| production | new production project (start fresh, see [07](07-dev-setup-and-lovable-exit.md)) | Cloudflare Worker `prod` on `tripjunkies.app` (service worker on) |

**CI (GitHub Actions):** install → typecheck → lint → unit tests (Vitest) → DB tests (pgTAP against `supabase start`) → build → Playwright smoke tests against a preview deploy.

**Observability:**
- Sentry for errors (replaces `lovable-error-reporting.ts`), in the browser and the Worker.
- Supabase logs.
- A simple product analytics tool (e.g. PostHog) with **no PII in events**.
