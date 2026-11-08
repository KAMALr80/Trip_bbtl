# Final release report

**Date:** Nov 8, 2026 · **Branch:** `fix/post-merge-p2-qa` · **Base:** `1ba9389` · **Status:** ready for a controlled staging deploy, **not** for production.

Nothing has been pushed, merged or deployed. No hosted Supabase project or production resource was touched.

## 1. Summary

**Fixed this round**, each with a regression test:
- every open code-only QA item: N-3 to N-7 and QA-11 to QA-20, except the parts of QA-19 and QA-20 that need input;
- the root cause of the stuck-splash E2E flake.

**Code-complete but not verifiable without hosted accounts and devices:** Google sign-in, email delivery, push, real AI, Cloudflare, storage policies on hosted Supabase.

**Waiting on the founder:** QA-06, QA-07, QA-10, the per-trip AI cap, and the retention of operational tables. Full list: [`FINAL_PROJECT_COMPLETION_AUDIT.md`](FINAL_PROJECT_COMPLETION_AUDIT.md).

## 2. Changes

### Fixes

The full table is in the audit, section 2.

| Area | Change |
|---|---|
| Sign-up (N-4, N-5) | Consent and birthday asked once after email confirmation; an honest message for a wrong or expired code |
| Join (N-6) | A declined player is told, on the private-beta screen and on Home; new table `trip_private.join_declines` |
| Play and postcard (N-3, N-7) | Showcase on Up now; country names instead of codes |
| Trip tab and Home (QA-11, 14, 15, 17) | Pre-Flight line from the phase engine; Explore label; plurals; no setup prompts on finished trips |
| Founder links (QA-12, 13) | Only app admins open founder views; Delete only from its own link |
| Failure states (QA-16) | A failed trip list shows an error with Try again, not "No trips just yet" |
| Signed-out links (QA-18) | No roster calls without a session |
| Accessibility (QA-19) | 44 px switch taps; an `h1` on the sign-in screen |
| Least privilege (QA-20) | TRUNCATE, TRIGGER and REFERENCES revoked; no profile self-delete; AI cost written only by the server |
| Startup (flake root cause) | Google Fonts no longer block the app's scripts |
| Tests | `playwright.build.config.ts` runs the mocked suite against a production build |

### Migrations

`20261108110000_join_decline_notice` and `20261108120000_least_privilege_grants`. Both are forward-only. See [`DATABASE_AND_MIGRATIONS.md`](DATABASE_AND_MIGRATIONS.md).

### Documentation

The nine documents under `docs/` named in the README.

## 3. Test results

| Gate | Result |
|---|---|
| Typecheck | Pass |
| ESLint | 0 errors, 100 warnings (unchanged; two stale suppressions pruned) |
| Unit (Vitest) | 40 files, 309/309 |
| pgTAP, local Supabase (fresh reset, 33 migrations) | 43 files, 1014 assertions, all pass |
| PostgreSQL 16 harness | 43/43 files |
| E2E mocked, against the build, 1 worker | Run 1: **124/124** (8.6 min). Run 2: 123/124. The failure was an axe scan timing out on `/me?view=help` under memory pressure; that page then passed 5/5 in a repeat run, whose only failure was `ERR_NETWORK_IO_SUSPENDED` (the laptop slept). |
| E2E mocked, against the build, 2 workers | 122/124 twice, a different pair of timeouts each run (see below) |
| E2E mocked, dev server, 2 workers | 111/124 in a 35-minute run, every failure a page that never loaded (see below) |
| E2E PWA / offline | 18/18 |
| Production build | Pass |
| Bundle secret scan | Pass: no server secrets in `.output/public` |
| Real stack, previous round | N-2 8/8, N-1 5/5, QA-03 3/3, retention 9/9. Not re-run here; the stack was stopped to free memory. `approve_member` changed since (N-6) and is covered by pgTAP `40` and `42`. |

### E2E reliability

**Root cause 1: fonts.** Google Fonts stylesheets in the head held back every script. With `fonts.googleapis.com` stalled, the app stayed on the splash for 40 s or more; after the fix it starts in 3.6 s. This also affected real users on slow or filtered networks.

**Root cause 2: the dev server.** It serves about 516 modules per cold page and degrades over a long run. Release runs now use a production build.

**Environment.** This machine has 7.7 GB of RAM, and only 0.6 GB was free while the original Supabase stack ran in Docker. With two workers, random tests timed out:
- dev server: 13 failures in one 35-minute run;
- build, two workers: 2 different failures in each of two runs.

All of those were timeouts on pages that never loaded, plus one context teardown. Every one of those tests passed in other runs. No assertion was removed or loosened, and no timeout was raised.

## 4. Original local database

**Unchanged in this round.** Its 31 migrations and its data are as they were after Nov 8's verified apply. The two new migrations are applied only on the disposable stack. Applying them needs the owner's go-ahead (backup first).

## 5. Production readiness

**Not production-ready.** What blocks it:
- **No staging environment exists.** Hosted auth, storage, cron, email and push are unverified.
- **No real AI verdicts, real phones or load test.**
- **Founder and legal decisions:** QA-06 (age wording), QA-07 (unlock flow), Privacy Policy text for the retention rules, the per-trip AI cap, and retention of operational tables.
- **Assets:** QA-10 (13 images).
- **Repository process:** required CI checks on `main` (B-02).

**Ready for:** a controlled staging deploy following [`PRODUCTION_DEPLOYMENT_GUIDE.md`](PRODUCTION_DEPLOYMENT_GUIDE.md), once the owner creates the accounts.
