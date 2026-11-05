# Bug register

**Date:** Nov 5, 2026 · **Code:** `main` at `50b4e21`: the audit fixes, committed as `4c442c9` and merged by PR #3, with CI passing on the PR and after the merge. The final-verification changes (B-12, B-14 and these doc updates) are on the `final-verification` branch, waiting for PR review (not merged yet).

Severity scale:
- **P0:** data loss, account compromise or unauthorized access.
- **P1:** a core workflow is broken.
- **P2:** important but contained.
- **P3:** minor, test infrastructure or polish.

**Totals:** 15 findings. P0: 0 · P1: 0 · P2: 2 · P3: 13. **Fixed: 6** (B-08 to B-11 merged by PR #3; B-12 and B-14 in the final verification, on `final-verification`, not merged yet). **Open: 9.** Section B lists potential risks and missing features separately; they aren't counted as bugs.

## A. Confirmed findings

| ID | Sev | Module | Status |
|---|---|---|---|
| B-01 | P2 | Dependencies | Open: needs upgrade approval |
| B-02 | P2 | Repository process | Open: CI not required yet (owner) |
| B-03 | P3 | Server functions | Open: proposal |
| B-04 | P3 | Lint | Open: existing debt |
| B-05 | P3 | Local seed / pgTAP | Open: by design |
| B-06 | P3 | Formatting | Open: existing debt |
| B-07 | P3 | Offline / dead code | Open: product decision |
| B-08 | P3 | pgTAP tests | **Fixed** |
| B-09 | P3 | App shell | **Fixed** |
| B-10 | P3 | E2E infrastructure | **Fixed** |
| B-11 | P3 | Server setup errors | **Fixed** |
| B-12 | P3 | `.gitignore` | **Fixed** (not merged yet) |
| B-13 | P3 | Local tooling | Open: environment |
| B-14 | P3 | Unit tests | **Fixed** (not merged yet) |
| B-15 | P3 | AI proof check | Open: proposal (needs `AI_API_KEY` to verify) |

### B-01 · P2 · Dependency advisories
- **Steps to reproduce:** `bun audit`.
- **Expected:** no high-severity advisories in direct dependencies.
- **Actual:** 35 advisories (14 high, 16 moderate, 5 low).
  - **Direct:** `zod@3.25.76`, "Zod can exhaust memory while validating oversized constrained collections" (fixed in 4.6.6).
  - **Transitive, mostly build and dev tools:** `undici` and `ws` via `wrangler` / `miniflare` / `nitro`, plus others.
  - **`sharp@0.34.5`** (via `wrangler > miniflare` and `nitro > env-runner > miniflare`): three high advisories in its bundled libvips, libheif and librsvg (fixed in 0.35.5). Miniflare is the local Worker simulator (`wrangler dev`, the dev server) and isn't part of the deployed Worker. No app code or script uses `sharp`.
  - Re-checked Nov 5 after PR #3: still 35 (14 high, 16 moderate, 5 low).
- **Root cause:** older dependency ranges. Moving `zod` 3 → 4 is a major upgrade (M6 audit S6, still open).
- **Files:** `package.json`, `bun.lock`.
- **Proposed fix:**
  - Run `bun audit fix`, which stays within the current ranges, then re-run every suite.
  - Plan the zod 4 migration separately: 17 files import zod (27 `z.object` schemas), plus `@hookform/resolvers`.
- **Regression tests:** the full suite. Server-function inputs are covered by E2E.
- **Status:** not done. Dependency upgrades need approval.

### B-02 · P2 · Pull requests are merged before CI finishes
- **Steps to reproduce:**
  - PR #1 was merged at 16:37:54 UTC; its Web and Supabase jobs finished at 16:39:39 and 16:39:01.
  - PR #2 was merged 16 s after it was opened, at 09:57:48; its jobs finished at 09:58:17, 10:00:40 and 10:01:56.
- **Expected:** `main` only takes changes that passed CI.
- **Actual:** both merges happened before CI finished. Both runs passed afterwards.
- **Root cause:** branch protection with required checks isn't enabled ([owner-go-live-steps.md](../../dev-docs/owner-go-live-steps.md) still has this unchecked).
- **Proposed fix:** GitHub → Settings → Branches → protect `main`, and require the three CI jobs.
- **Update (Nov 5, after PR #3):** `main` now has a repository ruleset. GitHub's public API shows `protected: true` with two rules, `deletion` and `non_fast_forward`, so `main` can't be deleted or force-pushed. It has **no required status checks** and no required pull request, so a PR can still be merged before CI finishes.
- **Remaining fix:** add "Require status checks to pass" to the ruleset with the three jobs: `Web (typecheck, lint, tests, build)`, `Database (migrations + pgTAP)` and `Supabase local stack (real pgTAP)`. Optionally, also require a pull request.
- **Regression tests:** none (configuration).

### B-03 · P3 · `createServerFn().inputValidator()` is deprecated
- **Steps to reproduce:** `bun run dev`. The dev log warns: "`inputValidator()` is deprecated. Use `createServerFn().validator()` instead." Seen in `src/lib/proof-check.functions.ts:11` and `src/lib/guide.functions.ts:7`.
- **Root cause:** a TanStack Start API rename. It's used 19 times in 14 files under `src/lib/*.functions.ts`.
- **Proposed fix:** a mechanical rename to `.validator()`, then re-run E2E and the build. Not done here: it touches every server function and has no functional benefit today.

### B-04 · P3 · 104 ESLint warnings
- **Steps to reproduce:** `npx eslint .`.
- **Actual:** 57 `react-hooks/exhaustive-deps` and 47 `react-refresh/only-export-components`. All existed before this audit, and CI runs `--quiet`, which shows errors only.
- **Proposed fix:** handle them screen by screen as each screen is touched. Silencing the hook warnings in bulk could hide real stale-closure bugs.

### B-05 · P3 · The local seed is date-relative, so `07_seed` fails on a long-lived local stack
- **Steps to reproduce:** `supabase test db` on a stack whose seed was applied days ago. It fails with "Airport Missions have closed".
- **Expected and actual:** the seed's "Departure Day" trip starts on the day the seed runs, so the test only holds on that day.
- **Root cause:** by design (M0-04). `supabase db reset` re-applies the seed for today.
- **Fix:** none here, because a reset deletes local data. The test passes in CI and on the disposable PG16 database.

### B-06 · P3 · 48 non-code files aren't Prettier-formatted
- **Steps to reproduce:** `npx prettier --list-different .`.
- **Actual:** only `.md` and `.json` files, for example `eslint-suppressions.json` (written by ESLint), `src/lib/places-data.json` (generated), `supabase/tests/fixtures/*.json` and docs. No `.ts` or `.tsx` file is affected, and CI doesn't check this.
- **Proposed fix:** add the generated files to `.prettierignore`, or format the docs in a separate commit.

### B-07 · P3 · Five unused files, one of them an unfinished offline feature
- **Steps to reproduce:** `npx knip@5 --include files`.
- **Actual:**
  - `src/features/offline/OfflineTripCards.tsx` (and `src/lib/offline-trip-content.ts`, which only it uses) is never rendered. Git history shows no `<OfflineTripCards` since the first commit. `src/pwa/sw-plan.ts:66` still precaches its art, about 3 MB of flight assets.
  - Also unused: `src/features/passport/StampBadge.tsx`, `src/features/play/PhaseCountdown.tsx` and `src/hooks/use-mobile.tsx` (only the unused shadcn sidebar imports it).
- **Expected:** [`dev-docs/01-current-state.md:145`](../../dev-docs/01-current-state.md) and M4 list offline trip cards as part of offline flight play.
- **Proposed fix:** a product decision: mount `OfflineTripCards` on the offline Play screen, or delete it and remove it from `FLIGHT_GAME_SOURCES`. Nothing was deleted without approval.

### B-08 · P3 · FIXED · pgTAP tests depend on other trips' data
- **Steps to reproduce:** `supabase test db` on the long-lived local stack.
- **Actual:** `22_live_and_crowns.test.sql:108` failed with "more than one row returned by a subquery".
- **Root cause:**
  - Some assertions ran as superuser and read whole tables or job return counts: `trip_crownings`, `trip_crowns` and `points_ledger` with no trip filter, and `expire_proofs()` / `settle_drops()` return values, which count every trip.
  - The local cron had crowned three other trips ("Departure Day", "Game Night" and "Batna Solo"). CI's database is empty, which hid the problem there.
- **Fix:** scope these assertions to the test's own trip, proof or drop. The plans and meanings don't change.
  - `22_live_and_crowns`: lines 73, 97 and 108.
  - `21_proofs_crew_check:67`.
  - `23_reveal_and_drops:87/89`.
- **Regression:** local stack 34/35 (only B-05 fails); disposable PG16 35/35, 827 assertions.

### B-09 · P3 · FIXED · Signed-out visitors call `is_app_admin`, and every load logs a 401
- **Steps to reproduce:** open `/` while signed out and watch the console and network.
- **Actual:** `POST /rest/v1/rpc/is_app_admin` returns 401 "permission denied for function is_app_admin", and the console shows "Failed to load resource: 401".
- **Root cause:** `src/features/app-shell/AppShell.tsx:192` ran the admin check whether or not anyone was signed in.
- **Fix:** with no user, skip the RPC and set the admin state to false. `touchLastSeen` behaves as before.
- **Regression test:** `e2e/signed-out.spec.ts`, "a signed-out visitor makes no admin check". The authentication check "Founder sees Founder tools" still passes.

### B-10 · P3 · FIXED · E2E specs time out on a cold dev server
- **Steps to reproduce:** run `e2e/signed-out.spec.ts` alone with no dev server running.
- **Actual:** the first test timed out (60 s) while the page was still on the splash screen. In the full suite, `game-night-live.spec.ts` once failed after Vite reloaded the page during the test.
- **Root cause:** a fresh Vite server compiles the index route and optimises its dependencies on the first visit, which took 20–60 s on this machine. Whichever test runs first takes that cost.
- **Fix:** `e2e/support/warm-up.ts`, a Playwright `globalSetup` that opens `/` once before the specs, used in `playwright.config.ts` and `playwright.live.config.ts`. No test timeout or assertion changed.
- **Regression:**
  - Cold server: signed-out first test 5.9 s, 8/8 passed.
  - Full mocked suite 59/59 (`game-night-live` in 5.0 s), 5.6 min (9.0 min before).

### B-11 · P3 · FIXED · Server setup errors point to "Lovable Cloud"
- **Steps to reproduce:** run the server without `SUPABASE_URL`. The error says "Connect Supabase in Lovable Cloud."
- **Root cause:** leftover text in `src/integrations/supabase/auth-middleware.ts:44` and `src/integrations/supabase/client.server.ts:44`. The project no longer uses Lovable.
- **Fix:** the messages now name the missing variables and `.env.example`, like `client.ts` already did.
- **Regression:** typecheck, build, E2E.

### B-12 · P3 · FIXED (not merged yet) · `.gitignore` has duplicate entries
- **Actual:** `supabase/.temp/` was listed twice, with empty lines around it. `.output` and `.output/` are both listed, too. This came from the owner's own edit on Nov 4.
- **Fix (final verification):** removed the second `supabase/.temp/` and the extra empty lines.
  - `.output` (line 13) already covers `.output/` (with its "Generated build output" comment). Both were kept: the second is harmless and documents the build folder.
  - No pattern was added or dropped, so nothing becomes tracked or untracked: `git status --ignored` lists the same files before and after.

### B-13 · P3 · Local tooling issues (environment, not product)
- **On Node 26, `npx playwright install chromium` stalls** while extracting `chrome.dll`. Seen twice, with 0 CPU and 0 I/O. Running the installer under Bun worked:
  ```
  bun --bun node_modules/@playwright/test/cli.js install chromium
  ```
  Using Node 22/24 LTS is recommended.
- **The local `supabase_vector` container restarts in a loop.** It only collects logs, and the app doesn't need it.
- **`vite-tsconfig-paths` takes 45–92 % of build plugin time.** Vite now resolves tsconfig paths itself (`resolve.tsconfigPaths`), so the plugin could be replaced. This is an optimisation proposal, not done.

### B-14 · P3 · FIXED (not merged yet) · A unit test depended on DNS
- **Steps to reproduce:** `bun run test` on a machine with slow or no DNS.
- **Actual:** `proof-check.server.test.ts`, "a model error is unsure (the crew decides)", timed out after 5,336 ms.
- **Root cause:** the photo URL was `https://x/y.jpg`. The AI SDK downloads an https image before calling the model, so the test spent its time on a DNS lookup for host `x` and never reached the model it meant to test.
- **Fix:** use a `data:` URL. The assertion didn't change.
  - Probes confirmed 0 network requests: with a stub model, the model is now reached and its error gives "unsure"; the test's own `{}` model gives "unsure" too.
  - The production path is unchanged: real proofs use signed https URLs, and a failed download is also "unsure".
- **Regression:** the file passed 7/7, three runs in a row; all unit tests 205/205.

### B-15 · P3 · Proposal · The AI proof check uses a deprecated message part
- **Steps to reproduce:** run the unit tests. The AI SDK warns that the `"image"` content part is deprecated in favour of a `"file"` part with a `mediaType`.
- **Where:** `src/integrations/ai/proof-check.server.ts`.
- **Proposed fix:** switch to a `file` part. Not done: it can only be checked against a real vision model, which needs `AI_API_KEY` (M6-01).

## B. Potential risks and missing features (not counted as bugs)

| Ref | Kind | Description | Source |
|---|---|---|---|
| P3 (M6) | Risk | Signed photo links last 1 hour (Crew Check 10 min, a single proof 5 min) and work if shared | `dev-docs/m6-security-and-privacy-audit.md` |
| P4 (M6) | Decision | Teen avatars are visible to anyone sharing a trip; legal review pending | same |
| P8 (M6) | Risk / decision | Moving a trip's dates re-plans the schedule, and proofs of deleted items cascade away | same |
| M1-08 | Risk | 41 retired tables are still reached by live functions, storage policies, triggers or client code | `dev-docs/m1-08-retired-tables-audit.md` |
| Grants | Risk (low) | Supabase's default table grants include `TRUNCATE` for `authenticated` (for example on `game_cards`). PostgREST can't issue `TRUNCATE`, so it's unreachable from clients; revoke for defence in depth | `supabase/baseline/current_schema.sql` |
| Tests | Gap | No desktop viewport project; no signed-in E2E against the real stack for create, edit, delete, leave or remove (pgTAP covers them) | `playwright*.config.ts` |
| Features | Missing | Ticket-stub designs (M3-05/09), a drop-ending reminder, a server-rendered postcard image (M5-04), AI tailoring (needs `AI_API_KEY`), Worker-side Sentry (M0-12) | milestones |

Checked by inspection and found safe:
- **The 23 client-writable tables** are all owner- or leader-scoped, or `USING (false)`. `trip_player_cards` has column-level `UPDATE` grants without `stamp_count`.
- **XSS sinks:** only two `dangerouslySetInnerHTML`, both with static or developer-made strings.
- **Logs** contain no tokens or secrets.
- **CSRF:** auth uses a Bearer header, not cookies.
- **Signed-out (`anon`) access:** 3 RPCs and 2 tables, all intended.
