# TripJunkies™

A mobile-first game for group trips: crews play through Pre-Flight, Takeoff, Trip Season and Baggage Claim, earn two crowns, and keep a passport of stamps and postcards.

- **Handover pack, plans and rules:** [`dev-docs/`](dev-docs/README.md). Start with [`01-current-state`](dev-docs/01-current-state.md) and the [milestones](dev-docs/milestones/).
- **Architecture rules for the current code:** [`docs/decisions/`](docs/decisions/README.md).

## Stack

TypeScript, React 19, TanStack Start / Router / Query, Tailwind v4, shadcn/ui. The app is served by a Cloudflare Worker (Nitro). Supabase provides Postgres, Auth, Storage and pg_cron. Game rules are `SECURITY DEFINER` functions in the `trip_private` schema.

## Setup

Requirements: [bun](https://bun.sh) 1.x and Node 22. For the database tools you also need the PostgreSQL 16 server binaries (`initdb`, `pg_ctl`); Docker isn't required.

```bash
bun install
cp .env.example .env.local     # then fill in the Supabase URL and publishable key
bun run dev                    # http://localhost:8080
```

> Point `.env.local` at a local or staging Supabase project, not production (see [dev-docs/07](dev-docs/07-dev-setup-and-lovable-exit.md)).

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Dev server with SSR |
| `bun run build` | Production build into `.output/` (Cloudflare Worker + static assets) |
| `npx tsc --noEmit` | Typecheck |
| `bun run lint` | ESLint |
| `scripts/db/test.sh` | Replays every migration onto a throwaway Postgres and runs the pgTAP tests ([details](supabase/tests/README.md)) |
| `REPLAY_HOOK='python3 scripts/db/inventory.py' scripts/db/replay-migrations.sh` | Regenerates the schema snapshot and DB inventory ([details](docs/inventory/README.md)) |

## Configuration

All environment variables are listed in [`.env.example`](.env.example). Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `AI_API_KEY`, `CRON_SECRET`) are set per environment with `wrangler secret put` and never go in the client bundle.
