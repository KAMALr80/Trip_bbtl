# M0 — Takeover & Foundations

**Goal:** the team fully owns the code, data and hosting, has safe environments, and has a test safety net. **No product behaviour changes in this milestone.**
**Depends on:** nothing. **Unblocks:** everything.
**Exit criteria:**
- The app runs in staging and production **without any Lovable service**.
- CI is green with characterisation tests.
- Every developer can run the app against a **local** database.

| ID | Task | Size |
|---|---|---|
| M0-01 | Repo & access takeover | S |
| M0-02 | ✅ | **Not needed:** start fresh (Oct 23), no production database to audit or migrate. The Lovable Cloud project is not used by any environment. |
| M0-03 | 🟡 | `wrangler.jsonc` (staging and production Workers) and `scripts/deploy.sh <env> [check\|db\|auth\|web\|all]`: pushes migrations, sets auth URLs / Google / SMTP, builds with the project's keys, deploys, sets Worker secrets and the cron URL. Checked with `wrangler deploy --dry-run`. **Left (accounts):** the Supabase projects, Cloudflare account and token, domain DNS, then the first real deploy (README, "Environments and deploys"). |
| M0-04 | Local development database + seed | M |
| M0-05 | CI pipeline | S |
| M0-06 | Schema snapshot & function inventory | S |
| M0-07 | 🟡 | Google sign-in uses `supabase.auth.signInWithOAuth`; preview auth storage removed. `scripts/deploy.sh <env> auth` sets the Google client and SMTP sender once their settings exist. **Left (accounts):** Google OAuth client, email provider + DNS. |
| M0-08 | ✅ | `src/integrations/ai/index.server.ts`; all 12 call sites moved; the Lovable gateway fallback is removed (AI runs only with `AI_API_KEY` + `AI_MODEL`); cost estimates read `AI_PRICE_IN` / `AI_PRICE_OUT`. **Left:** the key and model per environment. |
| M0-09 | Rescue Lovable-hosted images | S |
| M0-10 | Replace Lovable build config, error reporting, cron secret, preview auth | M |
| M0-11 | Characterisation tests for kept rules | L |
| M0-12 | Sentry + basic analytics | S |
| M0-13 | Founder sign-off on rules & open questions | S (PM) |

## Status (Oct 23, 2026)

| ID | State | What's done · what's left |
|---|---|---|
| M0-01 | 🟡 | Lovable history archived to `docs/history/`, `.lovable/` and `null` removed, rule files indexed in `docs/decisions/`. **Left (repo admin):** branch protection on `main`, confirm team access. |
| M0-02 | ⬜ | **Needs dashboard access** to project `kymflipjxxpyxksdfgdw`. Also export the sealed-quest card pool and bucket settings (not in migrations). |
| M0-03 | ⬜ | **Needs accounts:** staging Supabase project, Cloudflare Workers (staging + prod), DNS, secrets. |
| M0-04 | 🟡 | `supabase/config.toml` (CLI-validated) and `supabase/seed.sql` (accounts, buckets, trips, placeholder cards), tested on the migration replay; `.env.example`. **Left:** first real `supabase start` (CI job `supabase` runs it). |
| M0-05 | ✅ | CI: web (typecheck, lint, Vitest, build, Playwright), database (replay + pgTAP + snapshot freshness), Supabase stack (non-blocking until first green). **Left:** make CI required in branch protection. |
| M0-06 | ✅ | `supabase/baseline/` snapshot, `docs/inventory/` inventory and findings. **Left:** diff against a real dump after M0-02. |
| M0-07 | 🟡 | Google sign-in uses `supabase.auth.signInWithOAuth`; preview auth storage removed. **Left (dashboard):** own Google OAuth client + redirect URLs in Supabase Auth; custom SMTP. |
| M0-08 | ✅ | `src/integrations/ai/index.server.ts`; all 12 call sites moved. **Left:** set `AI_API_KEY` + `AI_MODEL` per environment, then remove the Lovable fallback. |
| M0-09 | ⬜ | **Blocked:** the 13 images are only on Lovable's CDN and this environment can't reach it. Run `scripts/rescue-lovable-assets.sh` from a machine that can, then switch the imports. |
| M0-10 | ✅ | Explicit `vite.config.ts`, no `@lovable.dev` packages, `CRON_SECRET*`, authenticated purge job reading `trip_private.cron_endpoints`. **Left:** insert the endpoint URL per environment after deploy. |
| M0-11 | 🟡 | 141 pgTAP assertions (7 files), 12 Vitest tests, 4 signed-out Playwright specs. **Left:** signed-in E2E specs (create trip, join in two browsers, open Play) once the local stack runs. |
| M0-12 | 🟡 | Browser errors go to Sentry when `VITE_SENTRY_DSN` is set. **Left:** Worker-side Sentry, source map upload, DSN; optional analytics. |
| M0-13 | 🟡 | Q1, Q6, Q15, Q20 answered (defaults) in 06. **Left:** founder read-through of 02 / 05 for anything to change. |

---

### M0-01 · Repo & access takeover
- Move or confirm the GitHub repo in your org. Add branch protection on `main`.
- **Disconnect Lovable's GitHub sync** (or give it a separate branch). See [07 §3.1](../07-dev-setup-and-lovable-exit.md).
- Archive `.lovable/plan`, `roadmap.md` and the `AGENTS.md` files into `docs/history/` and `docs/decisions/`. Delete the stray `null` file.
- **Acceptance:** only team members can push; Lovable no longer commits to `main`.

### M0-02 · Supabase access audit
- Check which of these you have for project `kymflipjxxpyxksdfgdw`: DB password / connection string, service role key, Auth provider settings, SMTP, Storage, pg_cron, logs, backups.
- If any are missing, plan the **migration to your own Supabase org** ([07 §3.2](../07-dev-setup-and-lovable-exit.md)), including Auth users and Storage objects.
- **Acceptance:** a written access table; a production backup taken and restorable on staging.

### M0-03 · Staging + production environments
- Supabase: separate **staging** project with the same schema.
- Cloudflare: two Workers (staging, production). Move the `tripjunkies.app` DNS.
- Secrets per environment: `SUPABASE_SERVICE_ROLE_KEY`, AI key, cron secret, Sentry DSN.
- **Acceptance:** a `main` merge auto-deploys to staging; a tag deploys to production; staging has its own data.

### M0-04 · Local development database + seed
- `supabase start` works from the migrations, with pg_cron handled ([07 §2](../07-dev-setup-and-lovable-exit.md)).
- `supabase/seed.sql`: admin + test accounts ([08 §4](../08-testing-and-qa.md)), one sandbox trip per room, a minimal content set.
- `.env.local.example`. Move the production values out of the committed `.env` and into deployment secrets. The publishable key is fine to keep, but default local dev to the local DB.
- **Acceptance:** a new developer goes from clone to a signed-in app in under 30 minutes, following the README.

### M0-05 · CI pipeline (GitHub Actions)
- Steps: install (bun) → `tsc --noEmit` → `eslint` → Vitest → `supabase start && supabase test db` (pgTAP) → `vite build` → generated types match.
- **Acceptance:** PRs are blocked on red CI.

### M0-06 · Schema snapshot & function inventory
- `supabase db dump --schema public,trip_private` → `supabase/baseline/current_schema.sql` (reference only for now).
- Generate an inventory listing every table and function, its grants, and which components call it. Use it to confirm the keep/retire calls in [04](../04-data-model.md) / [05](../05-legacy-retire-list.md).
- **Acceptance:** an inventory doc committed; every table in 04 confirmed or corrected.

### M0-07 · Replace Lovable auth (Google)
- Replace `lovable.auth.signInWithOAuth` (`src/integrations/lovable/index.ts`, used in `src/routes/index.tsx`) with `supabase.auth.signInWithOAuth`, using your own Google OAuth client.
- Remove `previewAuthStorage.ts` and use the default storage.
- Configure redirect URLs for local, staging and production.
- Set up custom SMTP (auth emails from your domain).
- **Acceptance:** Google and email login work on staging with no Lovable domain involved; existing users can still sign in.

### M0-08 · Replace Lovable AI gateway
- Create `src/integrations/ai/` (Vercel AI SDK, provider key and model ids from env). Move all 10 files (12 call sites) onto it.
- Keep `ai_gate`, `use_ai_quota`, `logAppAi`, `content-rules.ts` and `safeContent` on every path.
- **Acceptance:** trip names, itinerary reading and content top-ups work on staging; AI usage is still logged; the kill switch still stops all AI.

### M0-09 · Rescue Lovable-hosted images
- Download the 13 assets behind `*.asset.json` (`founder-about.jpg`, `founder-headshot.jpg`, 11 state flags) and commit them. Update imports in `AboutStory.tsx`, `WelcomeCopy.tsx` and `TripFlag.tsx`.
- **Acceptance:** `grep -r "asset.json" src` returns nothing; images show on staging.

### M0-10 · Replace Lovable build config, error reporting, cron secret
- Write an explicit `vite.config.ts` without `@lovable.dev/vite-tanstack-config` ([07 §3.8](../07-dev-setup-and-lovable-exit.md)).
- Replace `lovable-error-reporting.ts` with Sentry (see M0-12).
- Rename `LOVABLE_CRON_SECRET*` → `CRON_SECRET*`; re-point pg_cron URLs per environment.
- Remove the `@lovable.dev/*` packages.
- **Acceptance:** `package.json` has no `@lovable.dev` dependency; build output unchanged; the photo-purge cron job succeeds on staging.

### M0-11 · Characterisation tests for kept rules
pgTAP tests pinning **today's** behaviour of the rules we keep:
- sealed quest drop / open / speed bonus / proof access
- Airport Mission window and cap 12
- `confirm_departure` + `trip_season_start_at`
- join / approve / remove / leave, join-code rate limit
- age gates (`guard_auth_signup_age`, `has_minors` trigger)
- delete trip (Captain + "DELETE")
- RLS: non-member reads nothing; members can't write game tables directly

Plus Playwright smoke tests: sign in, create trip, join with code (2 contexts), open Play.
- **Acceptance:** about 40+ DB assertions and 3 E2E specs green in CI. Bugs found are logged as issues, not fixed here (unless critical).

### M0-12 · Sentry + basic analytics
- Sentry on web (client + Worker). Release tags = app version.
- Optional: PostHog with **no PII**; events like `trip_created`, `joined`, `phase_viewed`.
- **Acceptance:** a forced test error shows up in Sentry with a source map.

### M0-13 · Founder sign-off
- Walk the founder through [02-game-rules-spec.md](../02-game-rules-spec.md), [05-legacy-retire-list.md](../05-legacy-retire-list.md) and [06-open-questions.md](../06-open-questions.md). Record the answers in the files.
- **Must be answered before M1:** Q1, Q6, Q15, Q20.
- **Acceptance:** the files are updated and committed with the decisions.
