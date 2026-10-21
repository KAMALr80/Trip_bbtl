# 07 — Dev Setup & Leaving Lovable

## 1. Run it locally (today's code, as exported)

**Prerequisites:**
- Node 22 LTS
- **bun** 1.x (`bun.lock` is the lockfile; npm also works)
- Git
- For local DB: **Docker** + **Supabase CLI**
- For deploys: **Wrangler** (Cloudflare)

```bash
bun install
bun run dev          # vite dev server (port picked by the Lovable config's sandbox detection; usually 8080/5173)
npx tsc --noEmit     # typecheck (passes today)
bun run build        # production build → .output/ (Cloudflare Worker + public assets); passes today
bun run preview      # preview the build
bun run lint         # eslint
```

> ⚠ **The committed `.env` points at the production Supabase project** (`kymflipjxxpyxksdfgdw`). A local `bun dev` therefore talks to **live data**. Until M0-04 (local Supabase) is done, use only a test account and sandbox trips, or point `.env.local` at a staging project.

### Environment variables

| Variable | Where | Used for | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | client (`.env`) | browser Supabase client | Publishable / anon key, safe in the client |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | server | SSR / server functions | |
| `SUPABASE_SERVICE_ROLE_KEY` | **server secret** | `client.server.ts` (admin client: sandbox, AI top-ups, purge) | **Never** expose to the client |
| `LOVABLE_API_KEY` | server secret | AI gateway (12 call sites) | **Replace** (§3.5) |
| `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS` | server secret | `/api/public/purge-photos` auth (`cron-auth.ts`) | **Replace** (§3.6). pg_cron also uses a DB-held key (`trip_private.cron_keys`, `check_cron_key`) |
| *(new)* `AI_PROVIDER_API_KEY`, `SENTRY_DSN`, `FCM_SERVICE_ACCOUNT`, `EMAIL_API_KEY`, `PLACES_API_KEY` | server secrets | M0/M4 | |

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

### 3.2 Database (Supabase project under "Lovable Cloud")
- [ ] Find out what access you have to project `kymflipjxxpyxksdfgdw`:
  - DB connection string / password
  - service role key
  - Auth settings (providers, redirect URLs, SMTP)
  - Storage
  - pg_cron
  - backups / PITR
  - logs
- [ ] **If you don't have full dashboard access, migrate to a Supabase project in your own org.** Re-check Supabase's current project-migration guide when you do this. The usual steps:
  1. Schema + data: `pg_dump` / `supabase db dump --data-only`, including the `auth` schema for users (password hashes carry over between Supabase projects).
  2. **Storage objects:** copy the 7 buckets with a script (list + download + upload). Bucket policies come from migrations.
  3. Re-create **pg_cron jobs** and the `trip_private.cron_keys` secret.
  4. Re-configure **Auth**: Site URL, redirect URLs (web + native deep links), Google/Apple providers, SMTP sender.
  5. Point the app env vars at the new project. Plan a short read-only window.
- [ ] Turn on **daily backups / PITR** on production.
- [ ] Create a **staging** project with the same schema.

### 3.3 Authentication
- [ ] Google sign-in goes through `@lovable.dev/cloud-auth-js` (`src/integrations/lovable/index.ts`, called from `src/routes/index.tsx` around line 1273). **Replace** it with `supabase.auth.signInWithOAuth({ provider: 'google' })` using **your own Google OAuth client**.
- [ ] Add **Apple** sign-in (needed for iOS when Google is offered; see M4).
- [ ] Remove `src/integrations/supabase/previewAuthStorage.ts`. It shares the session with the Lovable editor iframe over `postMessage`. Use the default `localStorage` storage on web, and Capacitor Preferences / secure storage in native.
- [ ] Set up **custom SMTP** (Resend, Postmark or SES) for auth emails. The roadmap says email-code verification is "waiting on an email domain"; turn it on.

### 3.4 Hosting
- [ ] Create a Cloudflare account/project. Deploy `.output/` with `wrangler deploy` (Nitro generates `wrangler.json`).
- [ ] Move the **`tripjunkies.app`** domain DNS to your Cloudflare and set staging + production routes.
- [ ] Set server secrets with `wrangler secret put …` for each environment.

### 3.5 AI gateway
- [ ] Twelve call sites read `LOVABLE_API_KEY` and call `https://ai.gateway.lovable.dev/v1` with Lovable model ids (e.g. `openai/gpt-6-astra` in `arcade-mix.server.ts`). Files:
  - `inspiration.functions.ts`, `itinerary-ai.server.ts`, `bug-ai.functions.ts`
  - `content.server.ts`, `arcade-mix.server.ts`, `culture-exp.functions.ts`
  - `trip-day.functions.ts`, `trip-names.server.ts`, `culture-quest.functions.ts`
  - `game-night-ai.functions.ts`
- [ ] Create `src/integrations/ai/index.ts` with your provider (Vercel AI SDK makes this small) and model ids from env. Route every call through it.
- [ ] Keep `trip_private.ai_gate` / `ai_usage` logging and `content-rules.ts` + `safeContent` on every path.

### 3.6 Cron secret
- [ ] Rename `LOVABLE_CRON_SECRET` → `CRON_SECRET` in `src/integrations/supabase/cron-auth.ts`. Keep the rotation support (`_PREVIOUS`).
- [ ] Re-check that the `purge-expired-trip-photos` pg_cron job calls the right URL for each environment.

### 3.7 Error reporting
- [ ] Replace `src/lib/lovable-error-reporting.ts` (uses `window.__lovableEvents`) and its use in `__root.tsx` with **Sentry** (web + Capacitor SDKs).

### 3.8 Build config
- [ ] Replace `@lovable.dev/vite-tanstack-config` in `vite.config.ts` with an explicit Vite config. Per the comment in `vite.config.ts`, that package bundles:
  - TanStack devtools (dev only), `tanstackStart` (with `server.entry: "server"`), `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-tsconfig-paths`
  - **Nitro** (build only, Cloudflare target)
  - `VITE_*` env injection, the `@` path alias, React/TanStack dedupe, error-logger plugins, sandbox port detection
- [ ] Check the build output still matches (`.output/server`, `.output/public`).

### 3.9 Lovable-hosted images (⚠ easy to miss)
- [ ] **13 images exist only on Lovable's CDN.** The repo has `*.asset.json` pointer files with `url: "/__l5e/assets-v1/…"`, not the image files:
  - `src/assets/founder-about.jpg.asset.json`
  - `src/assets/founder-headshot.jpg.asset.json`
  - 11 US state flags in `src/assets/state-flags/*.png.asset.json`
- [ ] **Download them while the Lovable deployment still works** (from the live site at those `/__l5e/...` paths, or ask Lovable support). Commit them as real files, and change the imports in `AboutStory.tsx`, `WelcomeCopy.tsx` and `TripFlag.tsx`.

### 3.10 Package and tooling cleanup
- [ ] Remove `@lovable.dev/*` packages once the steps above are done.
- [ ] Rename `package.json` `"name": "tanstack_start_ts"` → `"tripjunkies"`.
- [ ] Replace the README with a real one (setup, scripts, environments, links to this pack).

---

## 4. Deploy (target)

| Step | Command / place |
|---|---|
| DB migration | `supabase db push --linked` (staging, then prod) from CI on merge to `main` / release tag |
| Web | `bun run build && wrangler deploy --env staging` / `--env production` |
| Native | `bun run build:spa && npx cap sync && fastlane ios beta / android beta` (M4) |
| Version | Bump `src/lib/app-version.ts`. `/api/public/version` + `UpdatePrompt` already ask open clients to reload |
