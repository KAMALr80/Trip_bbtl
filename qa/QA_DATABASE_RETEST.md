# QA database retest

**Runner:** `scripts/db/test.sh` (the CI `db` job's runner) in `postgres:16-bookworm`, repo mounted read-only. Migrations replay onto a throwaway cluster; nothing outside the container is touched. No staging or production database was used.

**Result: 50 / 50 files pass** (was 47 / 48). Log: [evidence/logs/db-tests-retest.log](evidence/logs/db-tests-retest.log)

| File | Result | Note |
|---|---|---|
| 01–46, 48 | ok | Unchanged from the audit |
| 47_passport_junkie_badge | **ok (3)** | Was FAIL (QA-B07). The test now uses `trip_private.junkie_rank` |
| 49_extra_seats_retired | **ok (5), new** | QA-B02: cap stays 12, add-on refused, no flag, no order |
| 50_definer_allowlist | **ok (2), new** | QA-S01: 7 public SECURITY DEFINER functions for signed-in users; 0 for anonymous |

## Schema snapshot and inventory

Regenerated the way CI checks them: `REPLAY_HOOK='python3 scripts/db/inventory.py' scripts/db/replay-migrations.sh`, in Postgres 16.

- `supabase/baseline/current_schema.sql`: no drift from earlier work; the only change is the new body of `public.unlock_extra_seats`.
- `docs/inventory/*`: source-reference counts were out of date (QA-B08); regenerated.

## Migration added

| File | Change | Rollback |
|---|---|---|
| `20261126120000_retire_extra_seats_addon.sql` | `public.unlock_extra_seats` keeps its Captain check, then refuses | Re-run the function from the baseline |

Not destructive: no table, column or row is dropped, and trips that already set `extra_seats` keep it.

## Still not covered

- **Hosted-schema drift:** the suite proves the migrations, not staging. Compare with a `supabase db dump` of staging.
- **Award ties (Q7):** no rule to assert yet.
- **Photo purge at 7 days:** runs from a cron endpoint; no real-time test.
- **Generated types:** `scripts/db/gen-types.sh` needs the Supabase CLI against a replayed DB; not run here. CI runs it. `world_map` types were written by hand in batch 5, so watch that CI step.
