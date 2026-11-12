# Testing report

**Date:** Nov 5, 2026 · **Code:** `main` at `3d2bfcd`. The baseline ran before any change; the final run includes the fixes in [FIXES_AND_REGRESSION_REPORT.md](FIXES_AND_REGRESSION_REPORT.md). Those fixes were merged by PR #3 (`50b4e21`). A last verification ran after that merge: see [Final verification](#final-verification-nov-5-after-pr-3).

**Environment:** Windows 11 with about 0.7–1.1 GB of free RAM, so suites ran one at a time. Docker Desktop and the local Supabase stack ran with the long-lived local volume; its seed was applied Oct 31. Playwright 1.56.1 with Chromium 141, iPhone 13 viewport.

Every number below comes from a run during this audit. Anything not run is listed as **not executed**.

## Summary

| Suite | Command | Baseline | Final |
|---|---|---|---|
| Unit (Vitest) | `bun run test` | 205 passed, 0 failed, 0 skipped | 205 passed, 0 failed, 0 skipped |
| Typecheck | `bun run typecheck` | passed | passed |
| ESLint (CI mode) | `npx eslint . --quiet` | 0 errors | 0 errors |
| ESLint (all) | `npx eslint .` | 0 errors, 104 warnings | 0 errors, 104 warnings |
| Prettier | `npx prettier --list-different .` | 48 files (json/md only, none `.ts`/`.tsx`) | unchanged; the changed files pass |
| Production build | `bun run build` | passed | passed |
| Bundle secret check | `bun scripts/security/check-bundle.ts` | no secrets | no secrets |
| Unused files | `npx knip@5 --include files` | 5 files | 5 files (left, see B-07) |
| pgTAP, disposable PG16 (CI "database" job) | `scripts/db/test.sh` in `postgres:16` | 35/35 files, 827 assertions | 35/35 files, 827 assertions |
| Generated artifacts up to date | replay + `inventory.py` on PG16 | 5/5 identical | not re-run (no schema change) |
| pgTAP, local stack (real pgTAP) | `supabase test db` | 33/35 files (`07_seed`, `22_live_and_crowns` failed) | 34/35 (`07_seed` fails, see B-05) |
| Mocked E2E | `npx playwright test` | 57 passed, 1 failed | **59 passed**, 0 failed, 0 skipped |
| PWA / offline E2E | `-c playwright.pwa.config.ts` | 13/13 | 13/13 |
| Live-stack E2E | `-c playwright.live.config.ts` | 2 passed, 1 not executed | 2 passed, 1 not executed |
| Authentication and role checks (browser, real local stack) | scripted probe | 10/10 | 10/10 |
| `bun audit` | `bun audit` | 35 advisories (14 high, 16 moderate, 5 low) | unchanged (needs upgrades, see B-01) |

The mocked suite goes from 58 to 59 tests because this audit adds one regression test (B-09).

## Authentication (browser against the real local Supabase, seed accounts)

| # | Check | Result |
|---|---|---|
| 1 | Valid email/password login (Captain) lands on Home | passed |
| 2 | Wrong password: "Invalid login credentials", no session | passed |
| 3 | Unknown user: the same generic message, no session, no account enumeration | passed |
| 4 | Logout clears the token and protects routes again | passed |
| 5 | Session survives a refresh | passed |
| 6 | Signed in: `/play` → `/t/<id>/play`, `/me`, `/trips/new` open | passed |
| 7 | Signed out: `/home`, `/play`, `/trip`, `/me` show sign-in; `/trips/new` → `/` | passed |
| 8 | Captain sees Captain Tools for their trip | passed |
| 9 | Crew (`p1`): no Captain Tools even with `?tools=true`, no Founder tools | passed |
| 10 | Founder sees Founder tools; the Captain doesn't | passed |
| 11 | Google OAuth disabled (real `/auth/v1/settings`): friendly message, no redirect | passed |
| 12 | Google OAuth enabled | passed in mocked E2E only; no Google credentials exist locally |
| 13 | Google OAuth state unknown (`{}`): redirect as before, no error | passed in mocked E2E |
| 14 | Session expiry: a broken stored session signs the player out on the next load; a server refusal clears the offline snapshot (PWA `snapshot.spec`) | passed |

## Trip management and core modules

These were verified with the existing pgTAP and mocked E2E suites. To keep local data as it is, no new trips or memberships were written to the local database.

| Workflow | Coverage that passed |
|---|---|
| Create trip, 21+ Captain, room limits | pgTAP `01_membership`, `13_room_rules`, `16_limits_and_leaders`, `17_setup_and_schedule`; E2E `setup-wizard` |
| Join by code, pending approval, approve, Co-Captain, remove, pass the crown, leave | pgTAP `01_membership`, `16_limits_and_leaders`; E2E `join-flow`, `invite-pin` |
| Teen invite and age gates | pgTAP `02_age_gates` |
| Delete trip, RLS isolation, no direct client writes | pgTAP `05_delete_and_rls`, `30_security` |
| Phase engine and transitions | pgTAP `14_phase_engine`, `15_trip_engine`; unit `phase.test.ts` |
| Captain tools | E2E `captain-tiles`; the authentication checks above |
| Daily play, proofs, Crew Check, Surprise Drops, R-343 | pgTAP 20–23 and 35; E2E `daily-play`, `crew-check`, `surprise-drop` |
| Game Night Live and crowns | pgTAP 22; E2E `game-night`, `game-night-live` |
| Content admin (M3-02), admin area, moderation, Test Lab | pgTAP 31–34; E2E `admin`, `moderation` |
| Postcards, Passport, profile | pgTAP 26–29; E2E `postcard`, `profile` |
| Notifications | pgTAP 25; E2E `notifications`; PWA push test |
| Mobile navigation and a11y | E2E `shell-navigation`, `a11y` (axe WCAG 2.1 A/AA) |
| PWA install, offline, outbox, snapshot | E2E `install`; PWA suite 13/13 |

## Not executed, and why

| Item | Reason |
|---|---|
| Live E2E "an invite link survives sign-in, and Join room adds the player" | It writes a trip membership for a seed account in the local database |
| Password reset and invitation emails | No SMTP, and sending email wasn't approved |
| Google OAuth with a real provider | No Google OAuth credentials exist locally (Q17) |
| Desktop viewports | No desktop Playwright project exists; all projects are iPhone 13 |
| Real phones (M4-10), staging, load and performance (M6-08) | No staging environment and no devices |
| Hosted cron, `pg_net`, storage purge | Local stack only |
| External or penetration testing | Out of scope; owner decision (M6-07) |

## Failures seen in the baseline

1. **`22_live_and_crowns.test.sql` on the local stack.** The query returned more than one row: the test read `trip_crownings` without a trip filter, and the local cron had crowned other trips. Fixed (B-08).
2. **`07_seed.test.sql` on the local stack.** "Airport Missions have closed". The seed's dates are relative to the day it was applied (Oct 31). It passes on a fresh database, in CI and on the disposable PG16 database. Not fixed: the fix is `supabase db reset`, which isn't allowed here (B-05).
3. **Mocked E2E `game-night-live.spec.ts`.** It timed out after the page reloaded during the test; the failure snapshot shows the splash screen. Re-run alone it passed twice (42.0 s cold, 8.3 s warm), so it was a cold server or a Vite reload, not an app defect. Fixed by the E2E warm-up (B-10): in the final run it passed in 5.0 s.
4. **Signed-out spec run alone on a cold server.** The first test timed out while the page was still on the splash screen. Fixed by the warm-up (B-10): on a genuinely cold server, the first test passed in 5.9 s.

## Final verification (Nov 5, after PR #3)

**Code:** `main` at `50b4e21`, plus the B-12 and B-14 fixes (then on `final-verification`; merged by PR #4 as `ec98cef`, CI passed on the PR and after the merge). That tree has the same application code as `4c442c9`, which the full browser suites above tested, and CI passed on PR #3 (run 42023808424) and after the merge (run 42026792076), all three jobs. So the browser suites weren't repeated in full here.

| Suite | Result |
|---|---|
| Typecheck | passed |
| Unit (Vitest) | 205 passed, 0 failed, 0 skipped. The first run hit B-14 (a DNS timeout), fixed; the next three runs of that file passed |
| ESLint | 0 errors, 104 warnings (unchanged) |
| Production build and bundle secret check | passed, no secrets |
| pgTAP, disposable PG16 | 35/35 files, 827 assertions |
| pgTAP, local stack | 34/35 files: `07_seed` fails (B-05, by design). The first attempt didn't run at all: `npx` got a network error (ECONNRESET) while downloading the CLI, so it's not counted |
| Signed-out E2E (mocked, `e2e/signed-out.spec.ts`) | 8 passed, 0 failed, 0 skipped (1.5 min, including the warm-up) |
| `bun audit` | 35 advisories (14 high, 16 moderate, 5 low), now including three high `sharp` advisories (B-01) |
| Database state | unchanged: 9 auth users, 5 trips, 11 members, 459 content items, 0 proofs, 27 migrations |

**Not executed in this pass:**
- the full mocked, PWA and live E2E suites (they passed on the same application code earlier the same day and in CI);
- the live invite-join test, which would change local membership;
- everything already listed under "Not executed, and why".

**Memory note:** the host had about 0.7 GB of free RAM. One unit run and one typecheck ran out of memory and were re-run; the re-runs are the results above.

## Hardening (Nov 5, merged by PR #6 as `53e8f5f`)

**Code:** `bf688ee` plus the changes later merged by PR #6 (B-01 zod, B-03, B-04 partial, B-13, B-15, B-16, B-17 repository side, B-18, B-19).

| Suite | Command | Result |
|---|---|---|
| Typecheck | `bun run typecheck` | passed |
| ESLint | `npx eslint .` | 0 errors, 100 warnings (104 before) |
| Prettier, changed code files | `npx prettier --check <files>` | passed |
| Unit (Vitest) | `bun run test` | 208 passed, 0 failed, 0 skipped (20 files) |
| Production build and bundle secret check | `bun run build`, `bun scripts/security/check-bundle.ts` | passed; no secrets in the bundle; 0 `inputValidator()` deprecation warnings (19 before) |
| Mocked E2E | `npx playwright test`, on a fresh dev server on port 8082 so that it ran the new dependencies | Full run: 55 passed, 4 failed. Two `a11y` timeouts came while a Node process ran out of memory; `notifications` failed in the same run; `signed-out` failed because the test expects port 8080. Re-run alone: `a11y` + `notifications` 10/10 on port 8082, `signed-out` 8/8 on port 8080 |
| PWA / offline E2E | `npx playwright test -c playwright.pwa.config.ts` | 13 passed, 0 failed |
| pgTAP, disposable PG16 (CI "Database" job) | `scripts/db/test.sh` in `postgres:16` | 35/35 files, 827 assertions (`28_passport` 43) |
| pgTAP, local stack | `npx supabase test db` | 34/35 files: only `07_seed` fails (B-05, the old local seed); `28_passport` passes |
| `28_passport` under two plans | local stack, rolled back | 43/43 with seq scans on, 43/43 with them off |
| `bun audit` | `bun audit` | 35 (14 high, 16 moderate, 5 low), all in dev tooling; none in production (B-01) |
| Database state | row counts | unchanged: 9 auth users, 5 trips, 11 members, 459 content items, 0 proofs |

**Not executed:**
- the live-stack E2E: it writes a trip membership for a seed account;
- real email, Google, AI and push, which need credentials;
- real devices and staging.

## Authorization review (Nov 6, merged by PR #7 as `36ac013`)

**Targeted review, not a full audit or penetration test.** Scope, method and limits are in [AUTHORIZATION_REVIEW.md](AUTHORIZATION_REVIEW.md). **Code:** `53e8f5f` plus this branch.

| Suite | Command | Result |
|---|---|---|
| Typecheck | `bun run typecheck` | passed |
| ESLint | `npx eslint .` | 0 errors, 100 warnings |
| Prettier, changed code files | `npx prettier --check <files>` | passed |
| Unit (Vitest) | `bun run test` | 219 passed, 0 failed, 0 skipped (22 files) |
| Production build and bundle secret check | `bun run build`, `bun scripts/security/check-bundle.ts` | passed; no secrets in the bundle |
| Mocked E2E | `npx playwright test --workers=2` | 59 passed, 0 failed, 0 skipped (5.6 min) |
| PWA / offline E2E | `npx playwright test -c playwright.pwa.config.ts` | 13 passed, 0 failed |
| Authentication and role checks | scripted browser probe against the local stack | 10/10 passed |
| Live-stack E2E | `npx playwright test -c playwright.live.config.ts --grep-invert "invite link"` | 2 passed, 0 failed; the invite-join test was not executed |
| pgTAP, disposable PG16 (CI "Database" job) | `scripts/db/test.sh` in `postgres:16` | 37/37 files, 871 assertions |
| pgTAP, local stack | `npx supabase test db` | 36/37 files: only `07_seed` fails (B-05) |
| New tests without the fix | replay without the new migration | `37_push_badges_indexes`: 9 assertions fail, as they should. `36_authorization` passes, because no bypass existed there |
| Attack matrix | 266 functions × 8 actors; 161 tables × 6 actors × 4 operations; disposable PG16 | no bypass found (see the review) |
| Migration consistency | replay on PG16; `supabase gen types` | snapshot and inventory regenerated; only this migration differs. Types identical |
| Database state | row counts | same data: 9 auth users, 5 trips, 11 members, 459 content items, 0 proofs. 28 migrations (1 new, applied with `migration up`, no reset) |

**Skipped or blocked:**
- **Skipped, would change data:** the live invite-join test (it adds a seed account to a trip). CI runs it on a fresh stack.
- **Blocked by credentials or infrastructure:** real AI model (mocks only), real push, SMTP and email, Google, every hosted setting.
- **Not run:** real devices, parallel load, penetration test, desktop viewports.

## Final verification (Nov 6, `release/final-beta-readiness`)

**What this is:** automated tests plus targeted code review. It isn't a penetration test, real-device QA or staging verification.

| # | Category | Command | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|---|
| 1 | Typecheck | `bun run typecheck` | pass | 0 | — | |
| 2 | ESLint | `npx eslint .` | pass | 0 errors | — | 100 warnings |
| 3 | Unit | `bun run test` | 260/260 | 0 | 0 | |
| 4 | Production build | `bun run build` | pass | 0 | — | |
| 5 | Bundle secret scan | `bun scripts/security/check-bundle.ts` | pass | 0 | — | |
| 6 | Mocked E2E | `npx playwright test --workers=2` | 70/70 | 0 | 0 | Includes 10 layout checks at 360 and 1280 px |
| 7 | Authentication checks | scripted browser probe | 10/10 in the last 3 runs | see notes | 0 | Local stack, seed accounts, dev server. **5 runs on this code: 3 passed 10/10, 2 passed 9/10.** In both failures `/trips/new` didn't reach `/`: its lazy route file failed to load on the dev server (`Failed to fetch dynamically imported module`; one run also showed `ERR_INSUFFICIENT_RESOURCES`). **Cause not found.** A restarted server and the same page sequence didn't reproduce it, and it wasn't compared against `main`. Treat it as an unexplained flake and watch for it on staging |
| 8 | PWA / offline E2E | `npx playwright test -c playwright.pwa.config.ts` | 18/18 | 0 | 0 | Includes the header tests |
| 9 | Authorization matrix | `36_authorization` | 25 | 0 | 0 | Part of 10 and 11 |
| 10 | pgTAP, disposable PG16 | `scripts/db/test.sh` | 38/38 files, 901 assertions | 0 | 0 | |
| 11 | pgTAP, local stack | `npx supabase test db` | 37/38 files | 1 file | 0 | `07_seed`: B-05, the old local seed. It passes on a fresh database and in CI |
| 12 | Migration consistency | replay on PG16; `supabase gen types` | pass | 0 | — | Snapshot, inventory and types regenerated |
| 13 | AI (mocks only) | `proof-check.server.test.ts`, `ai-quota.server.test.ts`, `itinerary-ai.server.test.ts` | in 3 | 0 | 0 | No real model called |
| 14 | Storage cleanup | `trip-storage.test.ts`, `38_release_hardening` | in 3, 10 | 0 | 0 | No real Storage deletion |
| 15 | Headers | `security-headers.test.ts`, `e2e/pwa/headers.spec.ts` | in 3, 8 | 0 | 0 | Workers runtime, http only |
| 16 | Notification failures | `deliver.test.ts`, `38_release_hardening` | in 3, 10 | 0 | 0 | No real push service |
| 17 | Time zones | `phases.json` (SQL and TypeScript), age checks in `38` | in 3, 10 | 0 | 0 | |
| 18 | Performance | build output sizes; one parallel AI run | see B-34, B-29 | — | — | No Lighthouse or load test |
| 19 | `git diff --check` | `git diff --check` | clean apart from the generated inventory's trailing tabs | | | |
| — | Live E2E | `-c playwright.live.config.ts --grep-invert "invite link"` | 2 | 0 | 1 not run | The invite-join test adds a seed account to a trip; CI runs it on a fresh stack |

**Blocked by credentials or infrastructure:** real AI model, real push, SMTP and email, Google, every hosted setting.
**Not run:** real devices, load test, Lighthouse, penetration test.
