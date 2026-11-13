# 07 — Dev Setup & Leaving Lovable

## 1. Run it locally (today's code, as exported)

**Prerequisites:**
- Node 22 LTS
- **bun** 1.x (`bun.lock` is the lockfile; npm also works)
- Git
- For local DB: **Docker** + **Supabase CLI**
- For deploys: nothing extra; `scripts/deploy.sh` runs the Vercel CLI with `npx`

```bash
bun install
bun run dev          # vite dev server (port picked by the Lovable config's sandbox detection; usually 8080/5173)
npx tsc --noEmit     # typecheck (passes today)
bun run build        # production build → .vercel/output/ (Vercel function + static files); passes today
bun run preview      # preview the build
bun run lint         # eslint
```

> No `.env` is committed any more, and no environment uses the Lovable Cloud project (`kymflipjxxpyxksdfgdw`): the founder chose a fresh start on Oct 23, 2026. Copy `.env.example` to `.env.local` and point it at a local stack or staging.

### Environment variables

| Variable | Where | Used for | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | client (`.env`) | browser Supabase client | Publishable / anon key, safe in the client |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server | SSR / server functions | |
| `SUPABASE_SERVICE_ROLE_KEY` | **server secret** | `client.server.ts` (admin client: sandbox, AI top-ups, purge) | **Never** expose to the client |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` (optional) | server secret | AI provider for all 12 call sites (`src/integrations/ai/index.server.ts`) | Done (M0-08). The Lovable fallback is removed; AI is off until both are set. `AI_PRICE_IN` / `AI_PRICE_OUT` feed the cost report |
| `CRON_SECRET`, `CRON_SECRET_PREVIOUS` | server secret | `/api/public/*` cron auth (`cron-auth.ts`) | Renamed (M0-10). The photo-purge job authenticates with the DB-held key in `trip_private.cron_keys` and reads its URL from `trip_private.cron_endpoints` (set per environment) |
| `VITE_SENTRY_DSN` | client | Browser error reporting (`src/lib/error-reporting.ts`) | Done (M0-12, browser side) |
| *(new)* `SENTRY_DSN` (Worker), `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (web push, M4-08; also `VITE_VAPID_PUBLIC_KEY` at build), `EMAIL_API_KEY` / `EMAIL_FROM` (reminder email, M4-08), `PLACES_API_KEY` | server secrets | M0/M4 | |

### Regenerating DB types
```bash
supabase gen types typescript --project-id <id> --schema public > src/integrations/supabase/types.ts
```
About 100 casts (`supabase as unknown as { rpc: … }`) exist because RPCs weren't in the generated types. Once the types are regenerated, remove those casts as you touch each file.

---

## 2. Target local setup (M0)

```bash
supabase init                      # if not present (config.toml exists with project_id only)
supabase link --project-ref <staging-ref>
supabase db dump --schema public,trip_private -f supabase/baseline/current_schema.sql   # snapshot (M0-06)
supabase start                     # local Postgres + Auth + Storage + Studio
supabase db reset                  # applies migrations + supabase/seed.sql
bun dev                            # with .env.local pointing to http://127.0.0.1:54321
```

**Seed (`supabase/seed.sql`)** should create:
- one founder/admin user and 6 adult test users (plus 1 teen once teen invites are settled)
- one sandbox trip in each room × play mode
- the content library rows

See [08-testing-and-qa.md](08-testing-and-qa.md) for the account matrix.

> **pg_cron + extensions locally:** make sure `pg_cron` (and `pg_net`, if used) are enabled in local config, or the migrations that call `cron.schedule` will fail on `db reset`. A common pattern is to guard them: `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN … END IF; END $$;`

---

## 3. Leaving Lovable: checklist

The project is tied to Lovable in **ten places**. Do them in this order (it's M0-01 … M0-10).

### 3.1 Code ownership
- [ ] Confirm the **GitHub repo** is in your org and the dev team has admin access. Lovable syncs commits both ways today. The README warns against force-pushing because Lovable mirrors history.
- [ ] Decide: **disconnect Lovable** (recommended once M0 starts) or keep it read-only for the founder's previews. **Don't have Lovable and developers committing to the same branch.**
- [ ] Archive `.lovable/plan/*.md` and `roadmap.md` into `docs/history/` (they're useful context), then delete `.lovable/`.
- [ ] Move the four `AGENTS.md` files into `docs/decisions/` as "architecture decision notes". They hold the real database rules.
- [ ] Delete the stray `null` file at the repo root.

### 3.2 Database
- [x] *(Decided Oct 23, 2026: start fresh.)* Nothing moves from the Lovable Cloud project
  (`kymflipjxxpyxksdfgdw`): no users, trips or photos. Staging and production are new Supabase
  projects that start from `supabase/migrations/00000000000000_baseline.sql` (M1-09), which also
  creates the storage buckets, cron jobs and a cron key per database.
- [ ] Create the **staging** and **production** projects, then `scripts/deploy.sh <env> db`.
- [ ] Turn on **daily backups / PITR** on production.

### 3.3 Authentication
- [ ] Google sign-in goes through `@lovable.dev/cloud-auth-js` (`src/integrations/lovable/index.ts`, called from `src/routes/index.tsx` around line 1273). **Replace** it with `supabase.auth.signInWithOAuth({ provider: 'google' })` using **your own Google OAuth client**.
- [ ] ~~Add **Apple** sign-in~~ Not needed: no iOS app (Q16, Oct 31, 2026).
- [ ] Remove `src/integrations/supabase/previewAuthStorage.ts`. It shares the session with the Lovable editor iframe over `postMessage`. Use the default `localStorage` storage.
- [ ] Set up **custom SMTP** (Resend, Postmark or SES) for auth emails. The roadmap says email-code verification is "waiting on an email domain"; turn it on.

### 3.4 Hosting
- [ ] Create a Vercel account (Pro team) and an access token. `scripts/deploy.sh <env> web` makes the projects `tripjunkies-staging` / `tripjunkies` on the first run, builds and deploys ([decision 001](../docs/decisions/001-hosting-on-vercel.md)).
- [ ] Add **`tripjunkies.app`** (production) and `staging.tripjunkies.app` to the Vercel projects and create the DNS records Vercel shows.
- [x] Server secrets per environment: `scripts/deploy.sh <env> web` sets them as sensitive Vercel environment variables from the environment's settings.

### 3.5 AI gateway
- [x] *(Done Oct 21, 2026, see M0 status.)* Twelve call sites read `LOVABLE_API_KEY` and call `https://ai.gateway.lovable.dev/v1` with Lovable model ids (e.g. `openai/gpt-6-astra` in `arcade-mix.server.ts`). Files:
  - `inspiration.functions.ts`, `itinerary-ai.server.ts`, `bug-ai.functions.ts`
  - `content.server.ts`, `arcade-mix.server.ts`, `culture-exp.functions.ts`
  - `trip-day.functions.ts`, `trip-names.server.ts`, `culture-quest.functions.ts`
  - `game-night-ai.functions.ts`
- [ ] Create `src/integrations/ai/index.ts` with your provider (Vercel AI SDK makes this small) and model ids from env. Route every call through it.
- [ ] Keep `trip_private.ai_gate` / `ai_usage` logging and `content-rules.ts` + `safeContent` on every path.

### 3.6 Cron secret
- [x] *(Done.)* Rename `LOVABLE_CRON_SECRET` → `CRON_SECRET` in `src/integrations/supabase/cron-auth.ts`. Keep the rotation support (`_PREVIOUS`).
- [ ] Re-check that the `purge-expired-trip-photos` pg_cron job calls the right URL for each environment.

### 3.7 Error reporting
- [ ] Replace `src/lib/lovable-error-reporting.ts` (uses `window.__lovableEvents`) and its use in `__root.tsx` with **Sentry** (browser + Worker).

### 3.8 Build config
- [ ] Replace `@lovable.dev/vite-tanstack-config` in `vite.config.ts` with an explicit Vite config. Per the comment in `vite.config.ts`, that package bundles:
  - TanStack devtools (dev only), `tanstackStart` (with `server.entry: "server"`), `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-tsconfig-paths`
  - **Nitro** (build only, Vercel target)
  - `VITE_*` env injection, the `@` path alias, React/TanStack dedupe, error-logger plugins, sandbox port detection
- [ ] Check the build output still matches (`.output/server`, `.output/public`).

### 3.9 Lovable-hosted images (⚠ easy to miss)
- [x] **13 images exist only on Lovable's CDN.** The repo had `*.asset.json` pointer files with `url: "/__l5e/assets-v1/…"`, not the image files (done Nov 13, 2026: downloaded from the Lovable deployment with sizes checked, committed as real files, pointers removed; staging QA STG-05):
  - `src/assets/founder-about.jpg.asset.json`
  - `src/assets/founder-headshot.jpg.asset.json`
  - 11 US state flags in `src/assets/state-flags/*.png.asset.json`
- [x] **Download them while the Lovable deployment still works** (from the live site at those `/__l5e/...` paths, or ask Lovable support). Commit them as real files, and change the imports in `AboutStory.tsx`, `WelcomeCopy.tsx` and `TripFlag.tsx`.

### 3.10 Package and tooling cleanup
- [ ] Remove `@lovable.dev/*` packages once the steps above are done.
- [ ] Rename `package.json` `"name": "tanstack_start_ts"` → `"tripjunkies"`.
- [ ] Replace the README with a real one (setup, scripts, environments, links to this pack).

---

## 4. Deploy (target)

| Step | Command / place |
|---|---|
| DB migration | `scripts/deploy.sh staging db`, then `production` (later from CI on merge to `main` / release tag) |
| Web | `scripts/deploy.sh staging web` / `production web` (build with that project's keys, deploy, secrets, cron URL) |
| Version | Bump `src/lib/app-version.ts`. `/api/public/version` + `UpdatePrompt` already ask open clients to reload |
