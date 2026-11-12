# 001 · Host the web app on Vercel

Nov 12, 2026 · founder decision

## Context

The app was built to run as a Cloudflare Worker (Nitro's `cloudflare-module` output, `wrangler.jsonc`,
`wrangler secret bulk`). Nothing had been deployed yet. The founder chose Vercel for hosting.
Supabase stays the database, sign-in, storage and scheduler.

The app code was already portable: server code reads settings from `process.env` and uses no
Worker-only APIs. Only the build target, the deploy step and the local test server were tied to
Cloudflare.

## Decision

- **Build:** Nitro's `vercel` preset (`vite.config.ts`) writes Vercel's Build Output API to
  `.vercel/output`: static files for Vercel's CDN plus one Node.js function (`__server`).
- **Static files:** Cloudflare's `_headers` file has no Vercel equivalent in this output, so
  `scripts/pwa/build-sw.ts` adds routes to `.vercel/output/config.json` (`staticFileRoutes` in
  `src/lib/security-headers.ts`). They give static files the same security headers, keep `sw.js`
  and `/offline` uncached, and serve `/offline` from `offline.html` without a redirect.
- **Deploy:** `scripts/deploy.sh <env> web` builds locally and checks the bundle. On the first run it
  makes the Vercel project (`tripjunkies-staging` / `tripjunkies`) with Vercel Authentication off.
  It sets the server secrets as sensitive Production variables through Vercel's API, then runs
  `vercel deploy --prebuilt --prod`.
- **No Git deploys:** the repo isn't connected to Vercel, so the script's order (database
  migrations, then code) always holds. Preview deployments per pull request are not used.
- **Local tests on a build:** `scripts/serve-build.ts` serves `.vercel/output` with the same route
  rules (headers, rewrites, filesystem, function) for `playwright.build.config.ts` and
  `playwright.pwa.config.ts`, replacing `wrangler dev`.

## Consequences

- No Cloudflare account. The owner needs a Vercel Pro team, because Hobby is non-commercial only.
- The domain's DNS can stay at any provider (e.g. Route 53). Each domain gets the record Vercel
  shows.
- Server functions run on Node.js 22 in Vercel's default region (Washington, D.C., `iad1`). Keep
  Supabase projects in East US (North Virginia) to match.
- Rollback is Vercel's Instant Rollback. Logs are in the Vercel dashboard.
- `scripts/serve-build.ts` is a stand-in for Vercel's routing, not Vercel itself. Header and
  offline behaviour still gets a real check on staging (owner-go-live-steps §8).
