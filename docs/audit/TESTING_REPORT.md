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

**Code:** `main` at `50b4e21`, plus the B-12 and B-14 fixes on the `final-verification` branch. That tree has the same application code as `4c442c9`, which the full browser suites above tested, and CI passed on PR #3 (run 42023808424) and after the merge (run 42026792076), all three jobs. So the browser suites weren't repeated in full here.

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
