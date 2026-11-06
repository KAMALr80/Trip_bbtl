#!/usr/bin/env bash
# Deploy one environment (M0-03): database, auth settings, then the web app.
#
#   scripts/deploy.sh <staging|production> [check|db|auth|web|all]    (default: all)
#
#   check  list which settings are present (no changes)
#   db     push supabase/migrations to the project (`supabase db push`)
#   auth   site URL, redirect URLs, and Google / SMTP when their settings are present
#   web    build with the project's URL + publishable key, deploy the Worker, set its secrets,
#          and point the photo-purge cron job at it
#
# Settings come from the environment (in a cloud session: the environment's secrets). Shared:
#   SUPABASE_ACCESS_TOKEN                       Supabase personal access token
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID Workers deploy (read by wrangler)
#   AI_API_KEY, AI_MODEL [, AI_BASE_URL, AI_PRICE_IN, AI_PRICE_OUT]   AI features (optional)
#   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET      Google sign-in (optional)
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SENDER_EMAIL [, SMTP_SENDER_NAME]  (optional)
#   VITE_SENTRY_DSN                             browser error reporting (optional)
#   VITE_SERVICE_WORKER                         offline service worker (default true; false = kill switch)
#   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY [, VAPID_SUBJECT]  web push reminders (optional; make the pair
#                                               with `bun scripts/pwa/vapid-keys.ts`, once per environment)
#   EMAIL_API_KEY, EMAIL_FROM                   email backup for reminders, Resend API (optional)
# Per environment (STAGING / PROD):
#   SUPABASE_<ENV>_REF          project ref (the id in https://<ref>.supabase.co)
#   SUPABASE_<ENV>_DB_PASSWORD  database password (db step only)
#   <ENV>_APP_URL               public URL once a custom domain is set (default: the workers.dev URL)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SUPABASE=(npx -y supabase@2.121.0)
WRANGLER=(npx wrangler)

env_name="${1:-}"
step="${2:-all}"
case "$env_name" in
  staging) P=STAGING ;;
  production) P=PROD ;;
  *) echo "usage: scripts/deploy.sh <staging|production> [check|db|auth|web|all]" >&2; exit 2 ;;
esac
var() { local name="$1"; printf '%s' "${!name:-}"; }
REF="$(var "SUPABASE_${P}_REF")"
APP_URL="$(var "${P}_APP_URL")"
APP_URL="${APP_URL%/}"
valid_url() { [[ "$1" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; }
if [ -n "$APP_URL" ] && ! valid_url "$APP_URL"; then
  echo "${P}_APP_URL must look like https://host (no path): $APP_URL" >&2
  exit 1
fi
API="https://api.supabase.com/v1/projects/$REF"

need() {
  local missing=()
  for v in "$@"; do [ -n "${!v:-}" ] || missing+=("$v"); done
  if [ ${#missing[@]} -gt 0 ]; then
    echo "Missing settings for '$step' on $env_name: ${missing[*]}" >&2
    exit 1
  fi
}
api() { # method path [json]
  curl -fsS -X "$1" "$API$2" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" ${3:+--data "$3"}
}
sql() { api POST /database/query "$(jq -n --arg q "$1" '{query: $q}')" >/dev/null; }

check() {
  echo "Settings for $env_name:"
  for v in SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF" "SUPABASE_${P}_DB_PASSWORD" \
           CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID "${P}_APP_URL" AI_API_KEY AI_MODEL \
           GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SMTP_HOST SMTP_SENDER_EMAIL VITE_SENTRY_DSN \
           VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY EMAIL_API_KEY EMAIL_FROM; do
    if [ -n "${!v:-}" ]; then echo "  ✓ $v"; else echo "  · $v"; fi
  done
}

push_db() {
  need SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF" "SUPABASE_${P}_DB_PASSWORD"
  export SUPABASE_DB_PASSWORD; SUPABASE_DB_PASSWORD="$(var "SUPABASE_${P}_DB_PASSWORD")"
  "${SUPABASE[@]}" link --project-ref "$REF"
  "${SUPABASE[@]}" db push --yes
}

keys() { # prints "<publishable> <service_role>"
  local json; json="$(api GET "/api-keys?reveal=true")"
  jq -r '[(map(select(.type == "publishable"))[0].api_key // map(select(.name == "anon"))[0].api_key),
          (map(select(.type == "secret"))[0].api_key // map(select(.name == "service_role"))[0].api_key)]
         | @tsv' <<<"$json"
}

auth() {
  need SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF"
  [ -n "$APP_URL" ] || { echo "Set ${P}_APP_URL (or run the web step first and pass its URL)." >&2; exit 1; }
  local body
  body="$(jq -n --arg url "$APP_URL" \
    --arg gid "${GOOGLE_CLIENT_ID:-}" --arg gsecret "${GOOGLE_CLIENT_SECRET:-}" \
    --arg host "${SMTP_HOST:-}" --arg port "${SMTP_PORT:-587}" --arg user "${SMTP_USER:-}" \
    --arg pass "${SMTP_PASS:-}" --arg from "${SMTP_SENDER_EMAIL:-}" \
    --arg fromName "${SMTP_SENDER_NAME:-TripJunkies}" \
    --rawfile confirm supabase/templates/confirmation.html '
    {site_url: $url, uri_allow_list: ($url + "/**"),
     # B-17: the sign-up email carries the 6-digit code the app asks for (same as config.toml).
     mailer_subjects_confirmation: "Your TripJunkies sign-up code",
     mailer_templates_confirmation_content: $confirm}
    + (if $gid != "" then {external_google_enabled: true, external_google_client_id: $gid,
                           external_google_secret: $gsecret} else {} end)
    + (if $host != "" then {smtp_host: $host, smtp_port: $port, smtp_user: $user, smtp_pass: $pass,
                            smtp_admin_email: $from, smtp_sender_name: $fromName} else {} end)')"
  api PATCH /config/auth "$body" >/dev/null
  echo "Auth settings updated (site URL $APP_URL$([ -n "${GOOGLE_CLIENT_ID:-}" ] && echo ', Google')$([ -n "${SMTP_HOST:-}" ] && echo ', SMTP'))."
}

web() {
  need SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF" CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  local publishable service url log
  read -r publishable service < <(keys)
  url="https://$REF.supabase.co"
  VITE_SUPABASE_URL="$url" VITE_SUPABASE_PUBLISHABLE_KEY="$publishable" \
    VITE_SUPABASE_PROJECT_ID="$REF" VITE_SENTRY_DSN="${VITE_SENTRY_DSN:-}" \
    VITE_SERVICE_WORKER="${VITE_SERVICE_WORKER:-true}" VITE_VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}" \
    bun run build
  log="$(mktemp)"
  "${WRANGLER[@]}" deploy --config .output/server/wrangler.json --env "$env_name" | tee "$log"
  [ -n "$APP_URL" ] || APP_URL="$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' "$log" | head -1)"

  # Server secrets: unset optional ones are skipped, so a re-run never blanks a value set by hand.
  jq -n --arg url "$url" --arg pub "$publishable" --arg svc "$service" \
    --arg key "${AI_API_KEY:-}" --arg model "${AI_MODEL:-}" --arg base "${AI_BASE_URL:-}" \
    --arg pin "${AI_PRICE_IN:-}" --arg pout "${AI_PRICE_OUT:-}" \
    --arg vpub "${VAPID_PUBLIC_KEY:-}" --arg vpriv "${VAPID_PRIVATE_KEY:-}" --arg vsub "${VAPID_SUBJECT:-}" \
    --arg ekey "${EMAIL_API_KEY:-}" --arg efrom "${EMAIL_FROM:-}" '
    {SUPABASE_URL: $url, SUPABASE_PUBLISHABLE_KEY: $pub, SUPABASE_SERVICE_ROLE_KEY: $svc,
     AI_API_KEY: $key, AI_MODEL: $model, AI_BASE_URL: $base, AI_PRICE_IN: $pin, AI_PRICE_OUT: $pout,
     VAPID_PUBLIC_KEY: $vpub, VAPID_PRIVATE_KEY: $vpriv, VAPID_SUBJECT: $vsub,
     EMAIL_API_KEY: $ekey, EMAIL_FROM: $efrom}
    | with_entries(select(.value != ""))' |
    "${WRANGLER[@]}" secret bulk --config .output/server/wrangler.json --env "$env_name"

  if [ -n "$APP_URL" ] && valid_url "$APP_URL"; then
    sql "INSERT INTO trip_private.cron_endpoints (name, url)
         VALUES ('purge_photos', '$APP_URL/api/public/purge-photos'), ('notify', '$APP_URL/api/public/notify')
         ON CONFLICT (name) DO UPDATE SET url = excluded.url, updated_at = now();"
    echo "Deployed $env_name: $APP_URL (photo-purge and reminder jobs point here)."
  else
    echo "Deployed $env_name, but no URL was found: set ${P}_APP_URL and re-run 'web'." >&2
  fi
}

case "$step" in
  check) check ;;
  db) push_db ;;
  auth) auth ;;
  web) web ;;
  all) push_db; web; auth ;;
  *) echo "unknown step: $step" >&2; exit 2 ;;
esac
