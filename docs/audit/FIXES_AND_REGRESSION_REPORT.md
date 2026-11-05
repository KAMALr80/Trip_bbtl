# Fixes and regression report

**Date:** Nov 5, 2026 · **Base:** `main` at `3d2bfcd`. The fixes in the first table were committed as `4c442c9` on `audit-fixes` and merged into `main` by PR #3 (`50b4e21`); CI passed on the PR and again after the merge. The final-verification changes further down are on the `final-verification` branch and **not merged yet**.

## Fixes

| Bug | Files | Change |
|---|---|---|
| B-08 | `supabase/tests/database/22_live_and_crowns.test.sql` | Lines 73, 97 and 108 are scoped to the test's own trip (`trip_id = (SELECT id FROM ids WHERE k = 'trip')`) |
| B-08 | `supabase/tests/database/21_proofs_crew_check.test.sql` | Asserts the test proof's `crew_status = 'expired'` instead of `expire_proofs()`'s global return count |
| B-08 | `supabase/tests/database/23_reveal_and_drops.test.sql` | Asserts the test drop's `settled_at` instead of `settle_drops()`'s global return count |
| B-09 | `src/features/app-shell/AppShell.tsx` | Signed out: no `is_app_admin` RPC, and the admin state is false |
| B-09 | `e2e/signed-out.spec.ts` | Regression test: a signed-out page load makes no `is_app_admin` request |
| B-10 | `e2e/support/warm-up.ts` (new) | Playwright `globalSetup` that opens `/` once before the specs |
| B-10 | `playwright.config.ts`, `playwright.live.config.ts` | Use the warm-up. No timeout or assertion changed |
| B-11 | `src/integrations/supabase/auth-middleware.ts`, `src/integrations/supabase/client.server.ts` | Missing-variable errors name the variables and `.env.example`, not "Lovable Cloud" |
| Docs | `dev-docs/owner-go-live-steps.md` | The PR #6 item is checked; it was merged as `960f35f` |
| Docs | `docs/audit/*.md` (new) | These six reports |

**Not changed:** application behaviour beyond B-09, migrations, the seed, the schema, RLS, dependencies, environment files and user data.

## Final verification (Nov 5, after PR #3, branch `final-verification`, not merged yet)

| Bug | Files | Change |
|---|---|---|
| B-14 | `src/integrations/ai/proof-check.server.test.ts` | "A model error is unsure" uses a `data:` photo URL, so the test reaches the (failing) model without a network download. Same assertion |
| B-12 | `.gitignore` | Removed the repeated `supabase/.temp/` entry and the empty lines around it. Every pattern that was ignored is still ignored |
| Docs | `docs/audit/*.md`, `README.md`, `dev-docs/README.md`, `dev-docs/08-testing-and-qa.md`, `dev-docs/owner-go-live-steps.md` | Merged state instead of "uncommitted"; final numbers; B-14 and B-15; Q18; the `main` ruleset; the PWA and live E2E commands; the real Playwright viewport |

The final numbers are in [TESTING_REPORT.md](TESTING_REPORT.md#final-verification-nov-5-after-pr-3).

## Regression: baseline vs final

| Suite | Baseline | Final |
|---|---|---|
| Unit (Vitest) | 205 / 205 | 205 / 205 |
| Typecheck | passed | passed |
| ESLint | 0 errors, 104 warnings | 0 errors, 104 warnings (none added) |
| Prettier (changed files) | — | passed |
| Production build and bundle secret check | passed, no secrets | passed, no secrets |
| pgTAP, disposable PG16 | 35/35, 827 assertions | 35/35, 827 assertions |
| pgTAP, local stack | 33/35 (`07_seed`, `22_live_and_crowns`) | 34/35 (`07_seed` only, B-05) |
| Mocked E2E | 57 passed, 1 failed (58), 9.0 min | **59 passed, 0 failed** (59), 5.6 min |
| Signed-out spec alone, cold server | first test fails (60 s timeout) | 8/8, first test 5.9 s |
| PWA / offline E2E | 13/13 | 13/13 |
| Live-stack E2E | 2 passed, 1 not executed | 2 passed, 1 not executed |
| Authentication and role checks | 10/10 | 10/10 |
| `bun audit` | 35 advisories | 35 advisories (B-01, needs approval) |

**Database state** was the same at the start and the end: 9 auth users, 5 trips, 11 members, 459 content items, 0 proofs, 27 migrations, and `solo` pending in Lisbon Crew. Seed-account sign-ins only updated Supabase's own session records.

## Still failing or not executed

- **Failing:** `07_seed` on the long-lived local stack only (B-05). It passes on a fresh database.
- **Not executed:**
  - the live E2E invite-join test, which would change local membership;
  - password reset and email delivery;
  - a real Google provider;
  - desktop viewports;
  - real devices, staging, load and performance.

## Rollback

- **The audit fixes** are merged. To undo them, revert `4c442c9` in a new pull request; don't rewrite `main`'s history.
- **The final-verification changes** aren't merged: close their pull request, or revert their commit in a new one.
- Nothing was migrated, and no database data changed.
