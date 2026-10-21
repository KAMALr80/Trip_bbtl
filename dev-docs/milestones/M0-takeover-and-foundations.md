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
| M0-02 | Supabase access audit (and migration plan if needed) | S–M |
| M0-03 | Staging + production environments | M |
| M0-04 | Local development database + seed | M |
| M0-05 | CI pipeline | S |
| M0-06 | Schema snapshot & function inventory | S |
| M0-07 | Replace Lovable auth (Google) | S |
| M0-08 | Replace Lovable AI gateway | S–M |
| M0-09 | Rescue Lovable-hosted images | S |
| M0-10 | Replace Lovable build config, error reporting, cron secret, preview auth | M |
| M0-11 | Characterisation tests for kept rules | L |
| M0-12 | Sentry + basic analytics | S |
| M0-13 | Founder sign-off on rules & open questions | S (PM) |

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
