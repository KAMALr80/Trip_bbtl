# QA master test plan: TripJunkies staging review

**Source of requirements:** *TripJunkies Staging Review* (19 pages), checked against `dev-docs/02-game-rules-spec.md` (the deck spec; root `AGENTS.md` says the deck wins on conflicts).
**Build under test:** branch `fix/review-batch-5` @ `d8c9a2e`.
**Rule:** testing only. No feature, schema or data changes.

## 1. System under test

| Layer | Technology |
|---|---|
| Front end | React 19, TanStack Start 1.168 / Router 1.170, Vite 8 (rolldown), Tailwind 4, Radix / shadcn, i18next |
| Server | TanStack Start server functions on Vercel (Node), AI via `@ai-sdk/openai` (key server-side) |
| Database | Supabase Postgres: 161 `public` tables (all RLS), privileged logic in `trip_private`, pg_cron |
| Auth | Supabase Auth (email 6-digit code, Google), age tiers enforced in DB triggers and functions |
| Offline | Service worker + outbox (`src/data/offline/outbox`) |
| Monitoring | Sentry (browser, DSN optional) |

**Modules (`src/features`):** admin, ai-credits, app-shell, at-home, auth, captain-tools, culture, daily, guide, home, live, me, moderation, offline, onboarding, passport, play, players, points, postcard, profile, quests, setup, trip, window-seat.

**Existing test assets:** 46 Vitest files (343 tests), 48 pgTAP files, 24 mocked Playwright specs (`e2e/`), 4 PWA specs (`e2e/pwa`), 1 real-stack spec (`e2e/live`), plus `scripts/security/check-bundle.ts`.

**Environments:** `.env.local` points at a local Supabase stack (`127.0.0.1:54321`), which wasn't running. No staging URL or test-account credentials are in the repo, as expected.

## 2. Test levels and where each requirement is covered

| Level | Tool | Run in this audit | Covers |
|---|---|---|---|
| Static review | Source + schema snapshot | Yes | Every PDF finding (fixed / not fixed), RLS coverage, XSS sinks, definer-function guards |
| Types | `tsc --noEmit` | Yes: clean | |
| Unit | Vitest | Yes: 343 / 343 | Phase mirror, rooms, places, world map, PlayHero, final standings… |
| Database | pgTAP via `scripts/db/test.sh` in Postgres 16 | Yes: 47 / 48 files | RLS, roles, age gates, points, crowns, votes, moderation, deletion |
| Bundle secrets | `check-bundle.ts` | Yes | No server secret in client output |
| Mocked E2E (build) | Playwright, `playwright.build.config.ts` | Yes (see API report) | UI flows with a mocked Supabase |
| Real-stack E2E | `playwright.live.config.ts` | **Blocked**: no local Supabase CLI stack | Signed-in flows |
| Live staging, two accounts | Manual, [QA_TEST_CASES.md](QA_TEST_CASES.md) | **Blocked**: no credentials | Everything multiplayer |
| Devices | Real iPhone / Android | **Blocked**: no device | Offline, install, push |

## 3. Entry / exit criteria

- **Entry:** the branch builds, types are clean, and the DB migrations replay.
- **Exit (release):** all P1 cases in QA_TEST_CASES pass live on staging with two or three accounts; no open CRITICAL or HIGH bugs; DB suite 48/48; mocked E2E on the build green twice; the PWA suite green.

## 4. Execution order (as requested)

Phases 1–4 (analysis, requirements, cases, back end / DB / security) ran in full where the environment allowed. Phases 5–13 (auth, screens, roles, rooms, games, multiplayer, Passport, offline, regression) ran as code review and automated suites. Their live parts are written up as manual cases with BLOCKED status. Phases 14–15 are these reports.

## 5. What's needed to finish

1. Staging URL and three disposable test accounts (Captain 21+, Player 18–20, a brand-new account), plus one teen invite.
2. A test-only Supabase project, or the local CLI stack (`supabase start`) for `e2e/live`.
3. One iPhone and one Android phone for offline, install and push.
4. `AI_API_KEY` on staging for photo checks.
5. Founder answers to the decisions in [QA_BUG_REPORT.md](QA_BUG_REPORT.md).
