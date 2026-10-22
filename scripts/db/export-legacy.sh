#!/usr/bin/env bash
# M1-08: export the tables of retired features to CSV for the founder (dev-docs/05 §1 step 4).
#   scripts/db/export-legacy.sh [DATABASE_URL] [OUT_DIR]
# Without DATABASE_URL, psql uses the usual PG* environment variables. Use a read-only or
# service-role connection to production. The files hold user ids, names and photo paths: keep them
# private (a founder-only Storage bucket, not the repo). OUT_DIR defaults to legacy-export-<date>.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
URL="${1:-}"
OUT="${2:-legacy-export-$(date -u +%Y%m%d)}"
mkdir -p "$OUT"
psql_() { if [ -n "$URL" ]; then psql -X -q -v ON_ERROR_STOP=1 "$URL" "$@"; else psql -X -q -v ON_ERROR_STOP=1 "$@"; fi; }

grep -vE '^\s*(#|$)' "$ROOT/scripts/db/legacy-tables.txt" | while read -r item table; do
  if [ "$(psql_ -At -c "SELECT to_regclass('public.$table') IS NOT NULL")" != "t" ]; then
    echo "skip  $item $table (not found)"
    continue
  fi
  psql_ -c "\\copy public.$table TO '$OUT/$item-$table.csv' WITH (FORMAT csv, HEADER)"
  echo "wrote $OUT/$item-$table.csv ($(($(wc -l < "$OUT/$item-$table.csv") - 1)) rows)"
done
