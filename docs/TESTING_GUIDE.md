# Testing guide

More background is in [`dev-docs/08-testing-and-qa.md`](../dev-docs/08-testing-and-qa.md). Commands run from the repo root.

## Gates, in order

| Gate | Command | Notes |
|---|---|---|
| Types | `bun run typecheck` | |
| Lint | `bun run lint` | 0 errors expected. Warnings are tracked in `eslint-suppressions.json`. If you remove a suppressed pattern, run `npx eslint . --prune-suppressions`. |
| Unit | `npx vitest run` | |
| Database (Supabase) | `supabase test db` on a fresh local stack | Runs `supabase/tests/database/*.test.sql`. `07_seed` expects the untouched seed, so reset first, and only on a disposable stack. |
| Database (PostgreSQL 16) | `bash scripts/db/test.sh` inside `postgres:16-bookworm` with the repo mounted | Same files with `pgtap-lite`; no Supabase needed |
| DB fixtures | `bun scripts/db/fixture-tests.ts` | Regenerates the fixture-driven tests (rooms, phases) from `supabase/tests/fixtures/*.json` |
| E2E (mocked), while coding | `npx playwright test` | Starts `bun run dev` on 8080 with a placeholder Supabase URL; every Supabase call is mocked per test (`e2e/support/mock-backend.ts`) |
| E2E (mocked), release gate | `npx playwright test -c playwright.build.config.ts` | Same specs against a production build served by `scripts/serve-build.ts` (Vercel's routes) on 4175. Run it twice before a release. |
| E2E (PWA) | `npx playwright test -c playwright.pwa.config.ts` | Production build served by `scripts/serve-build.ts` on 4173, with the service worker on |
| Build | `bun run build` | |
| Bundle secrets | `bun scripts/security/check-bundle.ts` | After the build; fails if a server secret reaches `.output/public` |

## Mocked E2E: making it reliable

- **Fonts.** The stuck-splash failures came from Google Fonts. Its stylesheets in the head held back every script until `fonts.googleapis.com` answered. Fonts now load after start (`src/lib/web-fonts.ts`), and the test "the app starts even when Google Fonts never answers" guards it.
- **Dev server vs build.** On the dev server each cold page is about 516 separate module requests, and the server slows down over a long run. Late tests then waited on pages whose scripts never arrived: 13 failures in one 35-minute run, a different set each time. Against the build the same suite ran 123/124 in 11 minutes; the one failure was a bug in a new test. Use the build config for release runs.
- **First compile.** `e2e/support/warm-up.ts` opens `/` once before the specs, so the first test doesn't pay for it.
- **Sleep.** If a run shows `net::ERR_NETWORK_IO_SUSPENDED`, the computer slept. Run again.
- **What not to do.** Never fix a flaky test by raising timeouts or removing assertions. Find what the page was waiting for. The trace (`test-results/*/trace.zip`) shows every request.

## Real-stack checks

Some flows need a real database: sign-up with email codes, deletion, the role matrix, and the Baggage Claim wrap-up. Run them on a disposable local stack, never on the original one.

The scripts used for the Nov 7–8 runs were throwaway tools and are not in the repo. What they checked is listed in [`FINAL_RELEASE_REPORT.md`](FINAL_RELEASE_REPORT.md).

## Adding tests

| What you changed | Where the test goes |
|---|---|
| A bug fix | Next to the code (`*.test.ts`), or in `e2e/p2-regressions.spec.ts` / `e2e/p3-regressions.spec.ts` with the finding's ID in the name |
| A database rule | A new `supabase/tests/database/NN_*.test.sql` that runs on both pgTAP and `pgtap-lite`. `pgtap-lite` has no `isnt_empty`; use `ok(count > 0)`. |
