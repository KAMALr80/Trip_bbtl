# Bug register

**Date:** Nov 6, 2026 · **Code:** `main` at `36ac013` (PRs #1–#7 merged), plus the branch `release/final-beta-readiness`, which adds B-27 to B-35. Statuses marked "final branch" are on that branch until it merges. Findings come from targeted code review and automated tests, not a full audit or penetration test; see [AUTHORIZATION_REVIEW.md](AUTHORIZATION_REVIEW.md).

Severity scale:
- **P0:** data loss, account compromise or unauthorized access.
- **P1:** a core workflow is broken.
- **P2:** important but contained.
- **P3:** minor, test infrastructure or polish.

**Totals:** 35 findings. P0: 0 · P1: 0 · P2: 7 · P3: 28. **Fixed: 26** (B-08 to B-11 by PR #3; B-12 and B-14 by PR #4; B-03, B-13, B-15, B-16, B-18 and B-19 by PR #6; B-20 to B-23, B-25 and B-26 by PR #7; B-27, B-29 to B-35 on the final branch). **Partly fixed: 4** (B-01, B-04, B-17, B-28). **Open: 4** (B-02, B-05, B-06, B-07). **Checked, no change: 1** (B-24). Section B lists potential risks and missing features separately; they aren't counted as bugs.

## A. Confirmed findings

| ID | Sev | Module | Status |
|---|---|---|---|
| B-01 | P2 | Dependencies | **Partly fixed** (PR #6): zod 4 removes the only production advisory; 35 dev-only remain |
| B-02 | P2 | Repository process | Open: owner adds required checks (steps below) |
| B-03 | P3 | Server functions | **Fixed** (PR #6) |
| B-04 | P3 | Lint | **Partly fixed** (PR #6): 104 → 100 warnings |
| B-05 | P3 | Local seed / pgTAP | Open: by design |
| B-06 | P3 | Formatting | Open: existing debt |
| B-07 | P3 | Offline / dead code | Open: product decision |
| B-08 | P3 | pgTAP tests | **Fixed** |
| B-09 | P3 | App shell | **Fixed** |
| B-10 | P3 | E2E infrastructure | **Fixed** |
| B-11 | P3 | Server setup errors | **Fixed** |
| B-12 | P3 | `.gitignore` | **Fixed** (PR #4) |
| B-13 | P3 | Local tooling | **Fixed** (PR #6): Node pinned |
| B-14 | P3 | Unit tests | **Fixed** (PR #4) |
| B-15 | P3 | AI SDK message parts | **Fixed** (PR #6) |
| B-16 | P3 | AI proof check cost | **Fixed** (PR #6) |
| B-17 | P2 | Sign-up email on hosted Supabase | **Partly fixed** (PR #6): template in the repo; verify on staging |
| B-18 | P3 | pgTAP `28_passport` | **Fixed** (PR #6) |
| B-19 | P3 | Sign-out and the query cache | **Fixed** (PR #6) |
| B-20 | P2 | Trip deletion and Storage | **Fixed** (PR #7) |
| B-21 | P2 | Sign-out and push reminders | **Fixed** (PR #7) |
| B-22 | P3 | Push addresses | **Fixed** (PR #7) |
| B-23 | P3 | AI timeouts and photo text | **Fixed** (PR #7); check the prompt on a real model |
| B-24 | P3 | `game_cards` read policies | Checked: not exploitable, no change |
| B-25 | P3 | Storyteller badge | **Fixed** (PR #7) |
| B-26 | P3 | Missing foreign key indexes | **Fixed** (PR #7) |
| B-27 | P2 | Orphaned files in Storage | **Fixed** (final branch) |
| B-28 | P3 | Security headers and CSP | **Partly fixed** (final branch): full policy is report-only until staging |
| B-29 | P3 | AI caps under parallel calls | **Fixed** (final branch) |
| B-30 | P3 | Repeated notification sends | **Fixed** (final branch): at-least-once, repeats collapse |
| B-31 | P2 | Account deletion without re-checking identity | **Fixed** (final branch) |
| B-32 | P3 | A refused account deletion left some trips | **Fixed** (final branch) |
| B-33 | P3 | One bad entry dropped AI safety flags | **Fixed** (final branch) |
| B-34 | P3 | First download size | **Fixed** (final branch): `_shell` 768 → 519 KB |
| B-35 | P3 | Trip screen at 360 px | **Fixed** (final branch) |

### B-01 · P2 · Dependency advisories
- **Steps to reproduce:** `bun audit` (or `bun audit --json`).
- **Actual:** 35 advisories (14 high, 16 moderate, 5 low) in 5 packages. Re-checked Nov 5 on `ec98cef`.
- **Analysis (Phase 2, Nov 5):** paths from `bun why`; production exposure checked against the built Worker in `.output/server`.

| Package | Installed | Advisories (high / moderate / low) | Vulnerable | Fixed in | Comes from | Prod or dev | Exposure here |
|---|---|---|---|---|---|---|---|
| `zod` | 3.25.76 | 1 / 0 / 0 (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized constrained collections) | < 4.6.6 | 4.6.6 (major 3 → 4) | **direct** (`^3.25.76`) | **production** | Authenticated server functions validate client input with zod. Two inputs are arrays with a maximum: `culture-exp.functions.ts:12` and `:90`. A signed-in user could send an oversized body and exhaust a Worker isolate's memory. It needs an account and affects availability, not data |
| `undici` | 7.14.0 | 9 / 14 / 5 | 7.0.0 – < 7.30.1 | 7.30.1 | `wrangler@4.59.1` → `miniflare@4.20260111.0` (exact pin); also `nitro` → `env-runner` → `miniflare` | dev | **None in production**: not in the Worker bundle. Used by the local Worker simulator only. The app's own `undici` (through `ai`) is 7.30.1, already fixed, and is only a Node fallback; Workers use the built-in `fetch` |
| `sharp` | 0.34.5 | 3 / 0 / 0 (libvips, libheif, librsvg) | < 0.35.5 | 0.35.5 | `miniflare` | dev | **None in production**: not in the bundle, and no app code or script uses it |
| `ws` | 8.18.0 | 1 / 1 / 0 | < 8.21.0 | 8.21.0 | `miniflare` (exact pin) | dev | **None in production** |
| `minimatch` | 10.2.6 | 0 / 1 / 0 | 7.0.0 – < 11.0.1 | 11.0.1 (major) | `typescript-eslint@8.65.0` → `typescript-estree` | dev (lint) | Lint only, on the repo's own glob patterns. The latest `typescript-eslint` (8.72.1) still requires `minimatch@^10`, so no upgrade fixes it yet |

- **Why `bun audit fix` won't help:** `miniflare` pins `undici` and `ws` exactly. `sharp`, `zod` and `minimatch` need a new minor-zero or major version, which a range-respecting fix can't pick. It wasn't run.
- **Remediation, in priority order** (each needs approval; none was done):
  1. **`zod` 3 → 4** (the only production exposure; before public launch, ideally before the beta).
     - Scope: 17 files import zod.
     - Zod 4 behaviour changes that apply here: 14 `z.string().uuid()` (Zod 4 checks the RFC version and variant; of the 29 UUID literals in `e2e`, `src` and the seed, only the nil UUID is non-RFC), 4 `.catch()`, 8 `z.infer`.
     - Not used: `z.record`, `errorMap`, `message:`, `nativeEnum`, `zodResolver`. `@hookform/resolvers` accepts Zod 4. `miniflare` keeps its own Zod 3 copy.
     - Tests: typecheck, unit, mocked E2E, build. Breaking-change risk: low to medium.
  2. **`wrangler` 4.59.1 → 4.158.0** (fixes 33: all of `undici`, `sharp` and `ws`). It brings `miniflare@5.20261104.0-beta` (`undici` 7.30.1, `ws` 8.21.0, `sharp` 0.35.5) and `esbuild` 0.28.2.
     - Risks: `miniflare` 5 is a beta, and `nitro`'s `env-runner` declares an optional peer `miniflare@^4.20260515.0` (the installed 4.20260111.0 doesn't satisfy it either).
     - Tests: build, PWA E2E (`wrangler dev`), the dev server, `scripts/deploy.sh staging check`. Breaking-change risk: medium.
     - The latest `miniflare` 4 (4.20260730.0) is only a partial fix: it still has `undici` 7.28.0 and `sharp` 0.35.2.
     - Exposure is local tooling only, so this can follow the Zod upgrade.
  3. **`minimatch`:** accept for now (lint-only). Re-check when `typescript-eslint` moves to `minimatch@11`.
- **Files:** `package.json`, `bun.lock`.
- **Status (PR #6):** **zod upgraded to 4.6.6** (`package.json` `^4.6.6`; `bun.lock` changes only the zod entries, and `bun install --frozen-lockfile` is clean).
  - The app and every TanStack package now use Zod 4.6.6. Only `miniflare` (dev) keeps its own `zod@3.25.76`, so `bun audit` still lists the zod advisory, against that dev copy.
  - Review of the Zod 4 changes that apply here:
    - `.uuid()` is stricter. All local IDs (5 trips, 9 users, 459 content items, 62 schedule items) and every UUID literal in `e2e`, `src` and the seed pass it, and the nil UUID is still accepted.
    - `.catch()`, `.refine(fn, "message")`, `.optional()`, `.nullable()`, `z.enum`, `.trim()` and `z.infer` behave the same.
  - Tests: typecheck, 208 unit tests (`parseVerdict` covers `.catch()`), the mocked E2E suite on a fresh dev server, and the build all pass.
  - **Advisories now:** still 35 (14 high, 16 moderate, 5 low), but **none reaches production**. `undici` (28), `sharp` (3), `ws` (2) and the leftover `zod` (1) all come from `wrangler` → `miniflare`; `minimatch` (1) is lint only.
  - `wrangler` 4.158.0 was **not** done: it brings `miniflare` 5, which is a beta.

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
- **Verified (Phase 2, Nov 5, public API):**
  - The ruleset is "Protect main branch" (id 26611317): enforcement `active`, target `~DEFAULT_BRANCH` (= `main`), rules `deletion` and `non_fast_forward`.
  - The three check names are exactly as above, reported by the GitHub Actions app (id 15368) on `ec98cef`.
  - It wasn't changed here: that needs a signed-in repository admin, and the session has no GitHub API access.
- **Steps for the owner (GitHub web UI):**
  1. Open https://github.com/KAMALr80/Trip_bbtl/settings/rules/26611317.
  2. Leave **Enforcement status** Active, **Target branches** "Default branch", and **Restrict deletions** and **Block force pushes** ticked.
  3. Tick **Require status checks to pass** → **Add checks** → add the three names above. Where it asks for a source, pick **GitHub Actions**, so no other app can report the same name.
  4. Leave **Require branches to be up to date before merging** off. Turning it on means re-running CI after every change to `main`.
  5. Optional: **Require a pull request before merging**, with 0 required approvals (one developer; approvals would block self-merges). Even without it, required checks block direct pushes, because checks only run after a push.
  6. Check the **Bypass list**. Leave it empty if the rules should also apply to admins.
  7. **Save changes**.
- **How to check it worked:**
  - On the next PR, the merge button stays disabled until all three jobs pass.
  - `https://api.github.com/repos/KAMALr80/Trip_bbtl/rules/branches/main` lists `required_status_checks`.
- **Note:** CI cancels a superseded run (`cancel-in-progress: true`). A cancelled required check blocks the merge until the next run passes.
- **Regression tests:** none (configuration).

### B-03 · P3 · `createServerFn().inputValidator()` is deprecated
- **Steps to reproduce:** `bun run dev`. The dev log warns: "`inputValidator()` is deprecated. Use `createServerFn().validator()` instead." Seen in `src/lib/proof-check.functions.ts:11` and `src/lib/guide.functions.ts:7`.
- **Root cause:** a TanStack Start API rename. It's used 19 times in 14 files under `src/lib/*.functions.ts`.
- **Verified (Phase 2):** this is a maintenance issue, not a bug, and the rename is safe on the installed versions (`@tanstack/react-start` 1.168.60).
  - At runtime `validator` and `inputValidator` are the same function (`start-client-core/dist/esm/createServerFn.js:34–35`).
  - The compiler handles both in one loop, which keeps validators out of the client bundle (`start-plugin-core/dist/esm/start-compiler/handleCreateServerFn.js:137`). Only `inputValidator` warns.
- **Fix (PR #6):** the 19 calls are renamed to `.validator()`.
  - Regression guard: an ESLint `no-restricted-properties` rule for `inputValidator` (`eslint.config.js`). A throwaway file using `.inputValidator(` failed lint with it.
  - Typecheck, build and mocked E2E pass.

### B-04 · P3 · 104 ESLint warnings
- **Steps to reproduce:** `npx eslint .`.
- **Actual:** 104 warnings in 50 files. All existed before this audit, and CI runs `--quiet`, which shows errors only.
  - **47 `react-refresh/only-export-components`:** these only affect hot reload in development, not users.
  - **57 `react-hooks/exhaustive-deps`:**
    - 50 missing dependencies;
    - 3 complex expressions (`CultureExperiences.tsx:183`, `Inspiration.tsx:263` and `:277`);
    - 3 `true` literals in a dependency list (`CrownCelebration.tsx:88`, `Seasons.tsx:240` and `:771`);
    - 1 unnecessary dependency (`Season.tsx:24`).
  - Most are in `AppShell.tsx` (11) and `Seasons.tsx` (8).
- **Classification:** maintenance. None was shown to be a user-facing bug, but a missing dependency can mean a stale value, so each needs a look rather than a bulk fix.
- **Proposed fix:** handle them screen by screen as each screen is touched, with a test for any real stale-value bug found. Don't silence the rule in bulk.
- **Done (PR #6):** 104 → 100 warnings.
  - The 3 `true` literals were leftovers of the removed look switch (M1-03). They're gone; this changes nothing at runtime.
  - `Season.tsx`'s `[burst]` is deliberate (a new burst re-rolls the confetti), so it has a commented, line-level suppression.
  - The 11 in `AppShell.tsx` are `[user?.id]`-keyed effects: they re-run when the account changes, not on every new `user` object. That's intended and was left alone.

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
  - `src/features/offline/OfflineTripCards.tsx` (and `src/lib/offline-trip-content.ts`, which only it uses) is never rendered. Git history shows no `<OfflineTripCards` since the first commit. `src/pwa/sw-plan.ts:66` lists it in `FLIGHT_GAME_SOURCES`, but it imports no images. *Correction (Phase 2):* this register used to say it precached about 3 MB of art; that art belongs to the other flight games, so removing it wouldn't shrink the precache.
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

### B-12 · P3 · FIXED (PR #4) · `.gitignore` has duplicate entries
- **Actual:** `supabase/.temp/` was listed twice, with empty lines around it. `.output` and `.output/` are both listed, too. This came from the owner's own edit on Nov 4.
- **Fix (final verification):** removed the second `supabase/.temp/` and the extra empty lines.
  - `.output` (line 13) already covers `.output/` (with its "Generated build output" comment). Both were kept: the second is harmless and documents the build folder.
  - No pattern was added or dropped, so nothing becomes tracked or untracked: `git status --ignored` lists the same files before and after.

### B-13 · P3 · Local tooling issues (environment, not product)
- **On Node 26, `npx playwright install chromium` stalls** while extracting `chrome.dll`. Seen twice, with 0 CPU and 0 I/O. Running the installer under Bun worked:
  ```
  bun --bun node_modules/@playwright/test/cli.js install chromium
  ```
  - **Root cause:** not proven; it's the Node 26 runtime on this machine, not the app.
  - **What's missing:** nothing pins Node. There's no `engines` field and no `.nvmrc`, and CI doesn't run `setup-node`, so it uses the runner's default. The README asks for Node 22.
  - **Fix (PR #6):** `.nvmrc` = `22` and `engines.node` = `>=22` in `package.json`. Bun doesn't enforce the root `engines`, so Bun workflows are unchanged. The README points to `.nvmrc`; the Bun workaround for Node 26 stays documented.
- **The local `supabase_vector` container restarts in a loop.** It only collects logs, and the app doesn't need it.
- **`vite-tsconfig-paths` takes 45–92 % of build plugin time.** Vite now resolves tsconfig paths itself (`resolve.tsconfigPaths`), so the plugin could be replaced. This is an optimisation proposal, not done.

### B-14 · P3 · FIXED (PR #4) · A unit test depended on DNS
- **Steps to reproduce:** `bun run test` on a machine with slow or no DNS.
- **Actual:** `proof-check.server.test.ts`, "a model error is unsure (the crew decides)", timed out after 5,336 ms.
- **Root cause:** the photo URL was `https://x/y.jpg`. The AI SDK downloads an https image before calling the model, so the test spent its time on a DNS lookup for host `x` and never reached the model it meant to test.
- **Fix:** use a `data:` URL. The assertion didn't change.
  - Probes confirmed 0 network requests: with a stub model, the model is now reached and its error gives "unsure"; the test's own `{}` model gives "unsure" too.
  - The production path is unchanged: real proofs use signed https URLs, and a failed download is also "unsure".
- **Regression:** the file passed 7/7, three runs in a row; all unit tests 205/205.

### B-15 · P3 · Proposal · The AI calls use a deprecated message part
- **Steps to reproduce:** run the unit tests. The AI SDK (`ai` 7.0.122) warns: "The "image" content part type is deprecated. Use a "file" part with mediaType: 'image'".
- **Where:**
  - `src/integrations/ai/proof-check.server.ts:103`;
  - `src/lib/itinerary-ai.server.ts:39` (an uploaded itinerary image as a `data:` URL).
- **Verified offline (Phase 2), without `AI_API_KEY`:**
  - A probe used the real `@ai-sdk/openai` Responses provider, a dummy key and a fake `fetch`, so nothing left the machine.
  - `{ type: "file", mediaType: "image", data: new URL(url) }` sends exactly the same `input_image` request as today's `image` part.
- **Fix (PR #6):** both call sites use a `file` part.
  - Proof check: `{ type: "file", mediaType: "image", data: new URL(photoUrl) }`.
  - Itinerary import: `{ type: "file", data: <base64>, mediaType: <the upload's type> }`. The type is still limited to png, jpeg or webp by the server function's validator.
  - Regression tests run offline: `proof-check.server.test.ts` and `itinerary-ai.server.test.ts` (dummy key, a fetch that records and refuses).
    - The itinerary test checks the exact `input_image` the old `image` part sent (`data:image/png;base64,…`).
    - Both files run without the deprecation warning.

### B-16 · P3 · The AI proof check doesn't actually ask for a low-detail image
- **Steps to reproduce:** the same offline probe. Capture the request `visionProofChecker` would send.
- **Expected:** `"detail": "low"` on the image. The code sets `providerOptions: { openai: { imageDetail: "low" } }`, with the comment "A small image is enough … keeps the cost down".
- **Actual:** the request has no `detail`, so the provider uses its default. `store: false` is sent correctly.
- **Root cause:** `@ai-sdk/openai` reads `imageDetail` from the image part's own `providerOptions` (`dist/index.js:5341`), not from the call's. With the option on the part, the probe showed `"detail": "low"`.
- **Impact:**
  - None today: AI checks are off without `AI_API_KEY`.
  - Once they're on, every proof photo costs more image tokens than intended.
- **Proposed fix (with B-15):**
  - Make the part `{ type: "file", mediaType: "image", data: new URL(photoUrl), providerOptions: { openai: { imageDetail: "low" } } }`, and keep `store: false` on the call.
  - Regression test: a unit test with `createOpenAI({ apiKey: "test", fetch })` that captures the request and asserts `detail: "low"` and `store: false`. It runs offline.
  - Low detail changes what the model sees, so confirm accuracy in the M6-01 labelled-photo run.
- **Fix (PR #6):** done as proposed. The unit test asserts `"detail": "low"` on the `input_image` and `store: false`. The old call-level option produced no `detail` (offline probe), so the test would fail on the old code.

### B-17 · P2 · Hosted sign-up emails will send a link, but the app asks for a code (to verify on staging)
- **Steps to reproduce (staging):** turn on email confirmation, sign up with a new address, then open the email.
- **Expected:** a 6-digit code. After sign-up the app asks for one and checks it with `verifyOtp({ type: "signup" })` (`src/features/auth/AuthScreen.tsx:384`).
- **Likely actual:** Supabase's default "Confirm signup" template contains a confirmation link (`{{ .ConfirmationURL }}`), not the code (`{{ .Token }}`).
- **Root cause:** the repo sets no email template:
  - there's no `supabase/templates/` and no `[auth.email.template]` in `config.toml`;
  - `scripts/deploy.sh` (auth step) only sets the site URL, the redirect allow-list, Google and SMTP.
  - Locally, email confirmation is off (CLI default), so no local test ever sees this email.
- **Proposed fix:**
  - Add a "Confirm signup" template with `{{ .Token }}`: in `config.toml` for local use, and in the `deploy.sh` auth step for hosted projects.
  - Decide whether confirmation is on, as part of Q17.
  - Then test sign-up, resend and password reset on staging.
- **Fix (PR #6, repository side):**
  - `supabase/templates/confirmation.html` has the code (`{{ .Token }}`) and the link as a fallback. The app already sends `emailRedirectTo`, so either works.
  - `supabase/config.toml` uses it locally. The Supabase CLI reads the updated config without errors.
  - The `scripts/deploy.sh` auth step now sends `mailer_subjects_confirmation` and `mailer_templates_confirmation_content`. The `jq` body was checked offline (jq 1.6 in a throwaway container).
- **Still to do:**
  - Run `deploy staging auth`, then check that the hosted project accepts these two Management API fields.
  - Sign up, resend and reset a password on staging, with SMTP (2.3).
  - Decide whether confirmation is on (Q17).
  - Local confirmation stays off, so local tests still don't send this email.

### B-18 · P3 · FIXED (PR #6) · `28_passport` fails now and then (tests 34 and 38)
- **Steps to reproduce:**
  - CI run 42070242335, attempt 1 (Supabase local stack): tests 34 "badges: 2 states, 1 culture, 1 Window Seat guide" and 38 "my badges" failed.
  - Attempt 2, on the same commit, passed.
- **Root cause:**
  - The test hung its journal entry on `(SELECT id FROM trip_schedule WHERE trip_id = ws LIMIT 1)`, with no `ORDER BY`, and then moved the trip's dates.
  - Moving the dates re-plans the schedule. On a rolled-back probe, 11 of the 17 Window Seat items were deleted (every date-slotted item), and `journal_entries.schedule_id` is `ON DELETE CASCADE`.
  - When `LIMIT 1` returned one of those, the entry vanished, so no `storyteller` badge. That's P8 showing up in a test.
- **Fix:** the entry is now written after the move, on the first surviving `journal_prompt` (`ORDER BY opens_at, slot`). `plan(43)` and every assertion are unchanged.
- **Regression:** on the local stack, 43/43 with the default plan (seq scan) and 43/43 with seq scans off (index scan).
  - `25_notifications`'s `LIMIT 1` queries pick by kind and player and move no dates, so their result doesn't depend on the row. They were left alone.

### B-19 · P3 · FIXED (PR #6) · After a sign-out without a reload, the next account could briefly see the last one's cached data
- **Steps to reproduce (by inspection):**
  1. A session expires, so supabase-js sends `SIGNED_OUT` and the page doesn't reload.
  2. Another account signs in in the same tab.
- **Actual:** the in-memory React Query cache was kept. Keys such as `["profile"]`, `["account"]` and `["trip", id, "journal"]` aren't per user, so they showed the previous account's data until the refetch finished.
  - The offline snapshot and outbox were already cleared. The sign-out buttons reload the page, so they weren't affected.
- **Fix:** `forgetAccount()` (`src/data/offline/forget.ts`) drops the snapshot first, so nothing is saved, then the outbox, then `queryClient.clear()`. `__root.tsx` calls it on `SIGNED_OUT` and when the server reports no user.
- **Regression:** `src/data/offline/forget.test.ts` (the cache is empty and the snapshot stops before the cache clears); the PWA snapshot and signed-out E2E specs still pass.

### B-20 · P2 · FIXED (PR #7) · Deleting a trip left its proof and guide photos in Storage
- **Steps to reproduce:** delete a trip that has quest proofs, then list `quest-proofs/<tripId>/`.
- **Actual:** `permanentlyDeleteTrip` emptied only `trip-photos` and `player-avatars`. Proof photos stayed for good: the Day 7 purge works from the trip row, which is gone. Nobody could read them, since the storage policy needs the trip, but players and the Privacy Policy expect them deleted.
- **Fix:** `src/lib/trip-storage.ts` lists every bucket with a trip folder (`TRIP_FOLDER_BUCKETS`); trip deletion and the Test Lab both use it.
- **Regression:** `src/lib/trip-storage.test.ts` (buckets, nested files, paging, no other trip's files, stops if Storage fails). It tests the listing with a fake Storage; a real deletion wasn't run against hosted Storage.
- **Later:** the sole-Captain gap noted here, and the risk of deleting a file another row uses, are closed by B-27.

### B-21 · P2 · FIXED (PR #7) · Signing out didn't stop push reminders on that device
- **Steps to reproduce (by code):** turn reminders on, sign out. Only "turn off" in Settings called `delete_push_subscription`; `signOut` and `forgetAccount` left the browser subscribed.
- **Impact:** on a shared phone, the last player's reminders kept arriving, with trip names on the lock screen.
- **Fix:** `forgetAccount` calls `releasePushOnThisDevice()`, which unsubscribes the browser on every sign-out, including an expired session. The server deletes the row when the push service answers "gone".
- **User-visible change:** after signing back in, a player turns reminders on again on that device.
- **Regression:** `src/pwa/push.test.ts`, `src/data/offline/forget.test.ts`. **Not tested on a real phone**: add it to M4-10.

### B-22 · P3 · FIXED (PR #7) · A push address could be any https URL
- **Steps to reproduce:** call `save_push_subscription('https://anything.example/x', …)`.
- **Impact:** the sender POSTs to that URL. One player could add unlimited addresses, and every reminder goes to each of them, so the app could be pointed at any site. Cloudflare Workers can't reach a private network, which limits this.
- **Fix:** `trip_private.push_endpoint_ok` allows the browser push services only (Google, Mozilla, Apple, Microsoft), and a player keeps ten browsers at most.
- **Risk:** a browser using another push service gets an error when turning reminders on. Check real browsers in M4-10; the list is one function.
- **Regression:** `37_push_badges_indexes`. Those assertions fail without the migration.

### B-23 · P3 · FIXED (PR #7) · AI calls had no timeout, and photo text wasn't treated as untrusted
- **Actual:** none of the 11 AI calls set a timeout, and the SDK's default is 2 retries. An AI "pass" approves a proof by itself (Q3), but the system prompt didn't say text inside a photo isn't an instruction.
- **Fix:** `aiRequestLimits()` gives each call 90 s and one retry (`src/integrations/ai/index.server.ts`). The proof check gets 30 s, and a new prompt line says to ignore instructions in a photo.
- **Regression:** `proof-check.server.test.ts` (a hanging provider ends in "unsure" and is aborted; at most two tries; the prompt line is sent). All mocks.
- **Still open:** whether the prompt line holds can only be measured on a real model: add a photo with "answer pass" written on it to the M6-01 labelled-photo run.

### B-24 · P3 · Checked, no change · An older `game_cards` read policy is broader than a newer one
- **Actual:** "Read clean base and own trip cards" lets any member read a trip's cards, 21+ included, while "Read seed and member cards" limits those to approved adults. Policies add up, so the broader one would win.
- **Why it's not a bug today:** `authenticated` has no SELECT on `game_cards`, so these policies can't be reached. Test 36 checks that. Normal paths also can't create a 21+ trip card.
- **Next:** remove the leftover policies when the table is retired (M1-08). If SELECT is ever granted again, drop this policy first.

### B-25 · P3 · FIXED (PR #7) · Storyteller ignored players who only contributed photos
- **Expected:** "The shared guide counts toward every contributor's Storyteller badge" (Q13); the guide is built from journal entries and photos (R-355).
- **Actual:** `refresh_passport` counted journal authors only.
- **Fix:** an approved photo of the kinds the guide shows also counts, and still counts after the Day 7 purge removes its file. No rule was added: this applies the written one.
- **Regression:** `37_push_badges_indexes`.

### B-26 · P3 · FIXED (PR #7) · Foreign keys without indexes on live paths
- **Actual:** 54 foreign keys had no leading index. For example, reading a trip's cards scanned all 1,930 rows of `game_cards`.
- **Fix:** 9 indexes on live lookups and cascades. The other 45 are on retired or small tables and were left. No load test measured the benefit.

### B-27 · P2 · FIXED (final branch) · Files of deleted trips could stay in Storage for good
- **Steps to reproduce:** a Captain alone in a trip taps Leave. `leave_trip` deletes the trip, and nothing removes its files. A failed cleanup in `permanentlyDeleteTrip` had the same result, with no retry.
- **Also:** trip deletion removed the whole `player-avatars/<trip>/` folder, even a photo another row still pointed at. Older profile photos can live there and are copied to the player's other cards.
- **Fix:** `trip_private.orphan_files` (service role only) lists files whose trip, card or experience is gone, and keeps anything `player_profiles` or `trip_player_cards` still uses. `sweepOrphanFiles` (`src/lib/trip-storage.ts`) deletes them, straight after a trip deletion and in the daily cleanup route. It keeps no state: what fails is listed again next run, so it's safe to retry or repeat, and it doesn't depend on any page staying open.
- **Regression:** `38_release_hardening` (last Captain leaving, Captain with a crew refused, other trips, files outside a trip folder, account photos, shared files, batch limit, retry, unauthorized callers); `trip-storage.test.ts` (Storage failures, retry, repeat runs, batches). The trip's single Captain is a schema rule, so "multiple Captains" doesn't occur.
- **Not tested:** removal against hosted Storage. Locally the listing returned 0 files and nothing was deleted.

### B-28 · P3 · PARTLY FIXED (final branch) · No security headers
- **Fix:** every Worker response and static file now has `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` and an enforced CSP of `object-src`, `base-uri`, `frame-ancestors` and `form-action` (`src/lib/security-headers.ts`, `_headers` from `build-sw.ts`).
- **Report-only:** the full policy (`script-src`, `connect-src`, `img-src` and so on) is sent as `Content-Security-Policy-Report-Only`. It can't break anything, and it doesn't block anything either.
- **Zod:** Zod 4 tries `new Function` once, which raised a report on every load. `src/lib/zod-setup.ts` turns that off, so `'unsafe-eval'` isn't needed.
- **Remaining:** check for reports on staging (Supabase, Google sign-in, Sentry, push), then enforce it. `script-src` still has `'unsafe-inline'` because TanStack Start streams inline scripts; removing it needs a per-request nonce.
- **Regression:** `security-headers.test.ts`; `e2e/pwa/headers.spec.ts` on the production build in the Workers runtime (pages, API, static files, no violations on the signed-out screens). Signed-in screens weren't checked for violations.

### B-29 · P3 · FIXED (final branch) · A burst of AI calls could pass the daily caps
- **Steps to reproduce:** 20 parallel calls with a cap of 5. The old flow checked the cap, called the model, then wrote the row. **Measured on PG16: 20 rows.**
- **Fix:** `ai_gate` takes a lock and re-reads the count, and app-paid calls reserve their row first (`ai_reserve_server`, `reserveAppAi`). **Measured after: exactly 5.** A call that then fails stays counted, which errs towards spending less.
- **Regression:** `38_release_hardening`, `ai-quota.server.test.ts`. The parallel measurement was a one-off script, not part of CI.
- **Not added:** a per-trip cap. No number has been decided for one.

### B-30 · P3 · FIXED (final branch) · A crash mid-send could repeat a reminder, without limit
- **Actual:** a row stuck in `sending` was claimed again every 10 minutes with no limit, even after the player left the trip.
- **Fix:** it stops at 5 attempts, and a player who left is skipped. Each push has a `Topic` from its queue row, so the push service replaces an undelivered copy; the notification `tag` replaces a visible one.
- **Honest limit:** delivery is **at-least-once**, not exactly-once. A push service can't confirm what a crashed sender already sent.
- **Regression:** `38_release_hardening`, `deliver.test.ts` (partial failures, gone browsers, same Topic on a resend). Not tested against a real push service.

### B-31 · P2 · FIXED (final branch) · Deleting an account needed only a valid session
- **Fix:** `checkDeleteReauth` (`src/lib/account-delete.ts`), checked before anything changes. An account with a password must give it, and it's verified against the session's own email. A Google-only account has no password to ask for, so it must have signed in within 15 minutes (`amr`), which refreshing a token doesn't reset.
- **Regression:** `account-delete.test.ts` (missing, wrong and right password; the check failing; stale and fresh Google sessions; missing `amr`); `profile.spec` (the screen). Against the local stack, the JWT does carry `providers`, `amr` and `email`, and a wrong password is refused.
- **Not run:** a real deletion, end to end: local accounts are kept. An expired session is refused by `requireSupabaseAuth`; that's covered by the auth checks, not a deletion-specific test.

### B-32 · P3 · FIXED (final branch) · A refused account deletion left the player's other trips
- **Actual:** trips were left one at a time, and a trip with a crew stopped the loop part-way, leaving the account in place but out of some trips.
- **Fix:** `tripsNeedingNewCaptain` checks first, before leaving anything. **Regression:** `account-delete.test.ts`.

### B-33 · P3 · FIXED (final branch) · One bad entry dropped every AI safety flag
- **Steps to reproduce:** a model answer of `"safety": ["drugs", 7]`. The schema rejected the whole list, so the real flag was lost.
- **Fix:** entries are checked one at a time. **Regression:** `proof-check.server.test.ts`, found by the new adversarial tests.

### B-34 · P3 · FIXED (final branch) · Every flag and founder screen was in the first download
- **Actual:** 324 of the 1,369 KB of source in `_shell` was `country-flag-icons`.
- **Fix:** `CountryFlag` loads the flags on first use, holding its place with a same-sized blank, and four founder-only screens load on demand. **`_shell`: 768 → 519 KB, 139 KB gzipped.**
- **Limits:** total JS is unchanged (about 2.8 MB), and no Lighthouse or real-network measurement was run.

### B-35 · P3 · FIXED (final branch) · The Trip screen scrolled sideways on a 360 px phone
- **Found by:** the new `e2e/responsive.spec.ts`. All other specs run at 390 px, so nothing had caught it.
- **Root cause:** a long section title ("What's next · itinerary") couldn't wrap, which pushed its edit button 4 px off the screen.
- **Fix:** the title wraps (`TripOverview.tsx`). **Regression:** `e2e/responsive.spec.ts`, five screens at 360 and 1280 px.
- **Limits:** it checks sideways scrolling on these screens, with mock data. It isn't a full layout review or a real phone.

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
