#!/usr/bin/env bash
# Regenerate src/integrations/supabase/types.ts from a fresh replay of every migration (M1-05).
# Needs what replay-migrations.sh needs, plus npx (downloads the Supabase CLI; no Docker).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/src/integrations/supabase/types.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
REPLAY_HOOK='npx -y supabase@2.121.0 gen types typescript --schema public --db-url "postgresql://postgres@localhost/$PGDATABASE?host=$PGHOST&port=$PGPORT" > '"$TMP" \
  "$ROOT/scripts/db/replay-migrations.sh" "$(mktemp -d)" | grep -vE '^(Applied|Wrote) ' || true
[ -s "$TMP" ] || { echo "type generation failed" >&2; exit 1; }
# Keep the PostgREST version marker the hosted generator adds (supabase-js reads it for typing).
python3 - "$TMP" "$OUT" <<'PY'
import sys
src, out = sys.argv[1], sys.argv[2]
s = open(src).read()
marker = "export type Database = {\n"
block = (marker + "  // Allows to automatically instantiate createClient with right options\n"
         "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)\n"
         "  __InternalSupabase: {\n    PostgrestVersion: \"14.18\";\n  };\n")
assert marker in s
open(out, "w").write(s.replace(marker, block, 1))
PY
npx prettier --write "$OUT" >/dev/null
echo "Wrote $OUT"
