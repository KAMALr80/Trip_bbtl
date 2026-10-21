#!/usr/bin/env bash
# Replay supabase/migrations/*.sql onto a throwaway local Postgres (no Docker, no Supabase CLI)
# and write a schema snapshot. Used for M0-06 (schema snapshot & function inventory).
#
# This reflects what the migration files define, NOT necessarily the live database:
# anything changed by hand in the Lovable Cloud dashboard is not captured. Compare with a
# real `supabase db dump --schema public,trip_private` once we have DB access (M0-02).
#
# Usage: scripts/db/replay-migrations.sh [out_dir]   (default: supabase/baseline)
#        REPLAY_HOOK='python3 scripts/db/inventory.py' scripts/db/replay-migrations.sh
# Needs: Postgres server binaries (initdb, pg_ctl) and psql / pg_dump on PATH or in PG_BIN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${1:-$ROOT/supabase/baseline}"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PGPORT_REPLAY:-54329}"
WORK="$(mktemp -d)"
DB=replay

cleanup() { "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

# initdb refuses to run as root; use the postgres user when we are root.
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
if [ "$(id -u)" = 0 ]; then chown postgres "$WORK"; fi

as_pg "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses='' -c wal_level=logical" -l "$WORK/pg.log" -w start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $DB"
"${PSQL[@]}" -d "$DB" -f "$ROOT/scripts/db/supabase-shim.sql" >/dev/null

count=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  # pg_cron / pg_net are not available on plain Postgres; the shim provides cron.* / net.* stand-ins.
  if ! sed -E 's/^\s*(DROP|CREATE) EXTENSION (IF (NOT )?EXISTS )?pg_(cron|net)\b[^;]*;//I' "$f" \
      | "${PSQL[@]}" -d "$DB" --single-transaction -f - >"$WORK/out.log" 2>&1; then
    echo "FAILED at $(basename "$f"):" >&2
    cat "$WORK/out.log" >&2
    exit 1
  fi
  count=$((count + 1))
done
echo "Applied $count migrations."

mkdir -p "$OUT"
pg_dump -h "$WORK" -p "$PORT" -U postgres -d "$DB" --schema-only --no-owner \
  --schema=public --schema=trip_private --schema=legacy_archive \
  -f "$OUT/current_schema.sql" 2>/dev/null || \
pg_dump -h "$WORK" -p "$PORT" -U postgres -d "$DB" --schema-only --no-owner \
  --schema=public --schema=trip_private -f "$OUT/current_schema.sql"
"${PSQL[@]}" -d "$DB" -At -c "SELECT jobname || E'\t' || schedule || E'\t' || regexp_replace(command, '\s+', ' ', 'g') FROM cron.job ORDER BY jobname" \
  > "$OUT/cron_jobs.tsv"
echo "Wrote $OUT/current_schema.sql and $OUT/cron_jobs.tsv"

# Optional: run a command against the replayed DB before it is thrown away (e.g. the inventory).
if [ -n "${REPLAY_HOOK:-}" ]; then
  PGHOST="$WORK" PGPORT="$PORT" PGUSER=postgres PGDATABASE="$DB" bash -c "$REPLAY_HOOK"
fi
