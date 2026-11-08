# TripJunkies™

A mobile-first game for group trips: crews play through Pre-Flight, Takeoff, Trip Season and Baggage Claim, earn two crowns, and keep a passport of stamps and postcards.

- **Handover pack, plans and rules:** [`dev-docs/`](dev-docs/README.md). Start with [`01-current-state`](dev-docs/01-current-state.md) and the [milestones](dev-docs/milestones/).
- **Architecture rules for the current code:** [`AGENTS.md`](AGENTS.md) and [`docs/decisions/`](docs/decisions/README.md).

## Stack

TypeScript, React 19, TanStack Start / Router / Query, Tailwind v4, shadcn/ui, i18next. The app is served by a Cloudflare Worker (Nitro). Supabase provides Postgres, Auth, Storage and pg_cron. Game rules are `SECURITY DEFINER` functions in the `trip_private` schema.

```
src/routes/     thin route files (tabs, /t/$tripId/…, invites, legal, /api/public/*)
src/features/   one folder per product area (see src/features/README.md)
src/data/       typed RPC calls and TanStack Query hooks: the only place that talks to Supabase
src/i18n/       English copy catalog (en.json)
src/components/ ui/ (shadcn) and a few pieces shared across features
supabase/       migrations (one baseline + newer), seed, pgTAP tests
scripts/        database tooling and the deploy script
```

## Local development

Requirements: [bun](https://bun.sh) 1.x and Node 22 (`.nvmrc`; `nvm use` picks it). For the database tools you also need the PostgreSQL server binaries (`initdb`, `pg_ctl`, 16 or newer); Docker isn't required for them.

```bash
bun install
cp .env.example .env.local     # point VITE_SUPABASE_URL / key at a local stack or staging
bun run dev                    # http://localhost:8080
```

A local Supabase stack (`npx supabase start`, needs Docker) applies `supabase/migrations/` and `supabase/seed.sql`, which creates test accounts and sample trips. Never point a dev server at production.

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Dev server with SSR |
| `bun run build` | Production build into `.output/` (Cloudflare Worker + static assets) |
| `bun run typecheck` / `bun run lint` | TypeScript; ESLint (existing exceptions in `eslint-suppressions.json`) |
| `bun run test` | Unit tests (Vitest) |
| `npx playwright test` | End-to-end tests, including the accessibility pass, against a mocked backend |
| `npx playwright test -c playwright.pwa.config.ts` | Service worker and offline tests against a production build served by `wrangler dev` |
| `npx playwright test -c playwright.live.config.ts` | Signed-in tests against the local Supabase stack. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `npx supabase status -o env` first. They write to the local database: one test adds a seed account to a trip |
| `npx supabase test db` | pgTAP against the local stack. `07_seed` only passes on the day the seed was applied ([B-05](docs/audit/BUG_REGISTER.md)) |
| `scripts/db/test.sh` | Replays the migrations onto a throwaway Postgres and runs the pgTAP tests ([details](supabase/tests/README.md)) |
| `REPLAY_HOOK='python3 scripts/db/inventory.py' scripts/db/replay-migrations.sh` | Regenerates the schema snapshot and DB inventory ([details](docs/inventory/README.md)); CI fails if they're stale |
| `scripts/db/gen-types.sh` | Regenerates `src/integrations/supabase/types.ts` from the migrations; CI fails if it's stale |

The Playwright configs open `/` once before the tests (`e2e/support/warm-up.ts`), so the first test doesn't wait for the dev server's first compile. Install the browser with `npx playwright install chromium`. On Node 26 that can stall; use Node 22, or run `bun --bun node_modules/@playwright/test/cli.js install chromium`.

The current state of the app is in [`docs/FINAL_PROJECT_COMPLETION_AUDIT.md`](docs/FINAL_PROJECT_COMPLETION_AUDIT.md) (Nov 8, 2026): what is verified, what is open, and the founder questions. With it:

- [`FINAL_RELEASE_REPORT`](docs/FINAL_RELEASE_REPORT.md): this release's fixes and test results
- [`SECURITY_AND_PRIVACY_FINAL_AUDIT`](docs/SECURITY_AND_PRIVACY_FINAL_AUDIT.md): permissions, account deletion and retention
- [`PRODUCTION_DEPLOYMENT_GUIDE`](docs/PRODUCTION_DEPLOYMENT_GUIDE.md) and [`ENVIRONMENT_VARIABLES`](docs/ENVIRONMENT_VARIABLES.md): staging, production and rollback
- [`DATABASE_AND_MIGRATIONS`](docs/DATABASE_AND_MIGRATIONS.md) and [`TESTING_GUIDE`](docs/TESTING_GUIDE.md)
- [`ADMIN_AND_FOUNDER_GUIDE`](docs/ADMIN_AND_FOUNDER_GUIDE.md) and [`KNOWN_LIMITATIONS`](docs/KNOWN_LIMITATIONS.md)

Earlier audits (Nov 6) are in [`docs/audit/`](docs/audit/PROJECT_STATUS_REPORT.md).

## Database changes

`supabase/migrations/00000000000000_baseline.sql` is the whole schema as of M1-09; the Lovable-era history is in [`supabase/migrations_archive/`](supabase/migrations_archive/README.md). Add each change as a new timestamped file after it, then regenerate the snapshot, inventory and types (above). Every new table with a `trip_id` needs an archive guard trigger ([`AGENTS.md`](AGENTS.md)).

## Environments and deploys

There are two environments, each a Supabase project plus a Cloudflare Worker: **staging** (`tripjunkies-staging`) and **production** (`tripjunkies`). Both start from the baseline migration; no data came over from the Lovable prototype.

**One-time setup, per environment**

1. Create the Supabase project. Note its ref (`https://<ref>.supabase.co`) and database password.
2. In Google Cloud Console, create an OAuth client (web) with the redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
3. Set up an email sender (Resend, Postmark or SES) for sign-up codes and password resets, with its DNS records on the domain.
4. Provide these settings as environment variables (in a cloud session, as the environment's secrets):

| Variable | |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token |
| `SUPABASE_STAGING_REF`, `SUPABASE_STAGING_DB_PASSWORD` | the staging project (`PROD` instead of `STAGING` for production) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | a token that can edit Workers |
| `AI_API_KEY`, `AI_MODEL` (+ optional `AI_BASE_URL`, `AI_PRICE_IN`, `AI_PRICE_OUT`) | AI features stay off without them |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_EMAIL` | auth emails |
| `STAGING_APP_URL` / `PROD_APP_URL` | only once a custom domain is set; otherwise the workers.dev URL is used |
| `VITE_SENTRY_DSN` | optional browser error reporting |

**Deploy**

```bash
scripts/deploy.sh staging check   # which settings are present
scripts/deploy.sh staging         # db push → build + deploy + Worker secrets + cron URL → auth URLs
```

Steps can also run alone: `db`, `web`, `auth`. Publishable values (`VITE_*`) are baked in at build time, so each environment gets its own build; the script fetches the project's keys from Supabase. Server secrets go to the Worker with `wrangler secret bulk` and never into the client bundle or the repo.

**Custom domain:** once the domain is on the Cloudflare account, uncomment the `routes` lines in [`wrangler.jsonc`](wrangler.jsonc), set `<ENV>_APP_URL`, and run `scripts/deploy.sh <env> web` and `auth` again.
