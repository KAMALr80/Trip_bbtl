# Database and migrations

Rules for the database code are in [`supabase/AGENTS.md`](../supabase/AGENTS.md) and the root [`AGENTS.md`](../AGENTS.md). The data model is in [`dev-docs/04-data-model.md`](../dev-docs/04-data-model.md), and the generated catalog in [`docs/inventory/db-inventory.md`](inventory/db-inventory.md).

## Rules

- **Forward-only.** Never edit a migration that has been applied to any environment. Fix it with a new one.
- **Private logic.** Game and permission logic lives in `trip_private` SECURITY DEFINER functions with `SET search_path`, reached through `public` invoker wrappers. Grants: revoke from `PUBLIC` and `anon`; grant `authenticated` and `service_role` only where the app calls the function.
- **New trip tables.** A new public table with `trip_id` gets an `<table>_archive_guard` trigger (test `08` fails otherwise).
- **New free text.** A new table holding a player's free text must be added to `trip_private.scrub_deleted_account` (test `41`).
- **Phases.** Phase rules change in `trip_private.trip_phase` and `src/features/trip/phase.ts` together, with cases in `supabase/tests/fixtures/phases.json`.

## Migrations added after `7bd251d`

| Migration | What it does | Data it changes on apply |
|---|---|---|
| `20261107100000_privacy_and_join_names` | Birthday foreign keys cascade on account deletion (N-1); join names (N-2) | Deletes orphan birthday rows (0 on the original local database) |
| `20261108100000_account_deletion_retention` | Deletion scrub trigger on `auth.users`; `lock_trip` writes "Former player" | None until an account is deleted |
| `20261108110000_join_decline_notice` | `join_declines`, `my_join_declines`, `dismiss_join_decline`; `approve_member` records declines (N-6) | None |
| `20261108120000_least_privilege_grants` | Revokes TRUNCATE, TRIGGER and REFERENCES from `anon` and `authenticated`, also for future tables; removes profile self-delete; `log_ai_call` for the service role only (QA-20) | Grants only |

**Applied on the original local database (Nov 8):** the first two, after a restore-verified backup at `C:\Users\ratho\TripJunkies-local-db-backups\2026-11-08-before-retention-migrations\`.

**Not yet applied there:** the last two. Until they are, two things behave differently on that database:
- The decline notice RPC is missing, so the notice simply doesn't show.
- The server's AI cost logging finds no row, because the old function requires `auth.uid()`.

Neither breaks a screen.

## Generated files (regenerate after any migration)

| File | How |
|---|---|
| `src/integrations/supabase/types.ts` | `scripts/db/gen-types.sh` (replays every migration, then generates), then Prettier |
| `supabase/baseline/current_schema.sql`, `platform_hooks.sql`, `cron_jobs.tsv` | `scripts/db/replay-migrations.sh` in a PostgreSQL 16 container |
| `docs/inventory/db-inventory.{md,tsv}` | The same replay with `REPLAY_HOOK='python3 scripts/db/inventory.py'` |

## Local databases

- **Original** (`supabase start` in the repo, project `tripjunkies`, port 54322): your data. Never `db reset` it. Before applying migrations to it, take a backup:
  1. `docker exec supabase_db_tripjunkies pg_dump -U postgres -d postgres -Fc > <outside the repo>/postgres.dump`
  2. Verify it by restoring into a scratch database somewhere else.
  3. Then run `supabase migration up --local`.
- **Disposable:** a second stack with its own project id and ports, for tests that change data. Mark it with a database comment and check the mark before any reset.
