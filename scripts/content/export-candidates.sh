#!/usr/bin/env bash
# M1-11: writes supabase/seed/content_candidates.csv from the content in the migrations (via a local
# replay) plus src/lib/practice-prompts.ts. Production may hold more (AI top-ups, the a2c card pool);
# rerun with PGHOST/PGDATABASE pointing at a restored production dump to include it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/supabase/seed/content_candidates.csv"
mkdir -p "$(dirname "$OUT")"
if [ -n "${PGDATABASE:-}" ]; then
  psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/content/content-candidates.sql" > "$OUT"
else
  SNAP="$(mktemp -d)"; trap 'rm -rf "$SNAP"' EXIT
  REPLAY_HOOK="psql -X -q -v ON_ERROR_STOP=1 -f '$ROOT/scripts/content/content-candidates.sql' > '$OUT'" \
    "$ROOT/scripts/db/replay-migrations.sh" "$SNAP" >/dev/null
fi
(cd "$ROOT" && bun run scripts/content/practice-prompts.ts) >> "$OUT"
echo "Wrote $OUT ($(($(wc -l < "$OUT") - 1)) rows)"
