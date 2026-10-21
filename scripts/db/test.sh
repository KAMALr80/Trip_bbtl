#!/usr/bin/env bash
# Run the pgTAP tests in supabase/tests/database/ against a fresh replay of all migrations on a
# throwaway local Postgres. No Docker or Supabase CLI needed; uses scripts/db/pgtap-lite.sql when
# the real pgTAP extension isn't installed. In CI with the Supabase CLI, `supabase test db` runs
# the same files.
#
# Usage: scripts/db/test.sh [test-file ...]   (default: every supabase/tests/database/*.sql)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ $# -gt 0 ]; then FILES=("$@"); else FILES=("$ROOT"/supabase/tests/database/*.sql); fi
export TEST_FILES="${FILES[*]}"
SNAP="$(mktemp -d)"
trap 'rm -rf "$SNAP"' EXIT

REPLAY_HOOK='
set -uo pipefail
if ! psql -X -At -c "SELECT 1 FROM pg_available_extensions WHERE name = '"'"'pgtap'"'"'" | grep -q 1; then
  psql -X -q -v ON_ERROR_STOP=1 -f "'"$ROOT"'/scripts/db/pgtap-lite.sql" >/dev/null
fi
# Like `supabase db reset`: apply the seed after the migrations. Twice, to prove it can be re-run.
for _ in 1 2; do psql -X -q -v ON_ERROR_STOP=1 -f "'"$ROOT"'/supabase/seed.sql" >/dev/null || exit 1; done
failed=0; total=0
for f in $TEST_FILES; do
  total=$((total + 1))
  out="$(psql -X -q -At -v ON_ERROR_STOP=1 -f "$f" 2>&1)"; rc=$?
  name="${f#'"$ROOT"'/}"
  if [ $rc -ne 0 ] || grep -qE "^not ok|^# Looks like" <<<"$out"; then
    failed=$((failed + 1)); echo "FAIL $name"; grep -vE "^ok " <<<"$out" | sed "s/^/    /"
  else
    echo "ok   $name ($(grep -cE "^ok " <<<"$out") assertions)"
  fi
done
echo; echo "$((total - failed))/$total test files passed"
[ $failed -eq 0 ]
' "$ROOT/scripts/db/replay-migrations.sh" "$SNAP" | grep -vE '^(Applied|Wrote) '
