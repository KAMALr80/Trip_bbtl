# Environment variables

Names only. Never put real values in this file, in Git, in screenshots or in chat. The template is [`.env.example`](../.env.example).

## Browser (bundled into the client)

These are public by design. Never put a secret in a `VITE_` variable: the bundle check fails the build.

| Name | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Publishable (anon) key |
| `VITE_SUPABASE_PROJECT_ID` | Yes | Project ref |
| `VITE_SENTRY_DSN` | No | Browser error reporting; empty means console only |
| `VITE_SERVICE_WORKER` | Staging and production | `true` turns on the offline service worker (`scripts/deploy.sh` sets it) |
| `VITE_VAPID_PUBLIC_KEY` | For push | Public half of the web push key pair |
| `VITE_FEATURE_*` | No | Unfinished features, off unless `true` ([`src/lib/flags.ts`](../src/lib/flags.ts)) |

## Server (Vercel environment variables)

`scripts/deploy.sh <env> web` sets these on the environment's Vercel project as sensitive variables (Production target). To change one by hand: Vercel → the project → Settings → Environment Variables, then redeploy.

| Name | Required | Purpose | If missing |
|---|---|---|---|
| `SUPABASE_URL` | Yes | Server calls | Server functions fail with a setup error |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Calls made as the signed-in user | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Account deletion, photo purge, AI cost logging | Those features fail |
| `CRON_SECRET` / `CRON_SECRET_PREVIOUS` | Yes | Bearer token for pg_cron → `/api/public/*`; `_PREVIOUS` allows rotation | Scheduled jobs are refused |
| `AI_API_KEY`, `AI_MODEL` | For AI | AI features turn on only when both are set | AI is off. Proof checks return "unsure", so the crew decides. Nothing is approved silently. |
| `AI_BASE_URL` | No | An OpenAI-compatible endpoint | OpenAI is used |
| `AI_PRICE_IN`, `AI_PRICE_OUT` | No | USD per 1M tokens for the cost report | Rough defaults |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | For push | Web push. Make the pair once with `bun scripts/pwa/vapid-keys.ts` and never change it. | Push is off |
| `EMAIL_API_KEY`, `EMAIL_FROM` | No | Email backup for reminders (Resend) | Push only |

## Supabase (hosted project settings, not environment variables)

- Auth site URL and redirect allow-list (one per environment).
- Google provider client ID and secret.
- SMTP sender for sign-up codes and password resets.
- Email confirmation on.
- The `cron_keys` row used by the photo purge job: see `supabase/migrations/20261021120000_cron_purge_photos_endpoint.sql`.

## Local

`.env.local` points at the local stack from `supabase start`. Keep it out of Git; it is in `.gitignore`. The E2E configs use a placeholder key and a mocked backend.
