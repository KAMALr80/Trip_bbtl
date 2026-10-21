#!/usr/bin/env bash
# M0-09: download the images that exist only on Lovable's CDN (src/assets/**/*.asset.json pointers)
# and save them next to their pointer as real files, checking each size against the pointer.
# Run it from any machine that can reach the live site, then switch the imports to the real files.
# Usage: scripts/rescue-lovable-assets.sh [host ...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOSTS=("${@:-tripjunkies.app project--ff8fd31b-2c16-4b96-b5ff-87031aed303d.lovable.app}")
read -r -a HOSTS <<<"${HOSTS[*]}"
failed=0
while IFS= read -r pointer; do
  target="${pointer%.asset.json}"
  read -r url size < <(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["url"], d["size"])' "$pointer")
  ok=""
  for host in "${HOSTS[@]}"; do
    tmp="$(mktemp)"
    if curl -fsSL -o "$tmp" "https://$host$url" && [ "$(wc -c <"$tmp" | tr -d ' ')" = "$size" ]; then
      mv "$tmp" "$target"; ok="$host"; break
    fi
    rm -f "$tmp"
  done
  if [ -n "$ok" ]; then echo "ok    ${target#"$ROOT"/} ($size bytes, from $ok)"; else echo "FAIL  ${target#"$ROOT"/}"; failed=1; fi
done < <(find "$ROOT/src/assets" -name '*.asset.json' | sort)
exit $failed
