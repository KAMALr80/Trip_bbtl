#!/usr/bin/env bash
# Deploy one environment (M0-03): database, auth settings, then the web app.
#
#   scripts/deploy.sh <staging|production> [check|db|auth|web|all]    (default: all)
#
#   check  list which settings are present (no changes)
#   db     push supabase/migrations to the project (`supabase db push`)
#   auth   site URL, redirect URLs, and Google / SMTP when their settings are present
#   web    build with the project's URL + publishable key, create the Vercel project if needed,
#          set its server secrets, deploy, and point the photo-purge and reminder jobs at it
#
# Settings come from the environment (in a cloud session: the environment's secrets). Shared:
#   SUPABASE_ACCESS_TOKEN                       Supabase personal access token
#   VERCEL_TOKEN [, VERCEL_TEAM_ID]             Vercel access token; team id (team_…), default: the
#                                               token owner's own (Hobby) team
#   SUPABASE_DB_VIA_API=true                    db step: apply migrations through Supabase's HTTPS
#                                               API instead of a database connection (for hosts
#                                               that only allow HTTPS, like cloud sessions)
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
#   <ENV>_APP_URL               public URL once a custom domain is set (default: the project's
#                               vercel.app domain)
# Vercel projects: tripjunkies-staging and tripjunkies (override with VERCEL_<ENV>_PROJECT).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
SUPABASE=(npx -y supabase@2.121.0)
VERCEL=(npx -y vercel@65.4.0)

env_name="${1:-}"
step="${2:-all}"
case "$env_name" in
  staging) P=STAGING ;;
  production) P=PROD ;;
  *) echo "usage: scripts/deploy.sh <staging|production> [check|db|auth|web|all]" >&2; exit 2 ;;
esac
var() { local name="$1"; printf '%s' "${!name:-}"; }
REF="$(var "SUPABASE_${P}_REF")"
PROJECT="$(var "VERCEL_${P}_PROJECT")"
[ -n "$PROJECT" ] || { [ "$P" = PROD ] && PROJECT=tripjunkies || PROJECT=tripjunkies-staging; }
APP_URL="$(var "${P}_APP_URL")"
APP_URL="${APP_URL%/}"
valid_url() { [[ "$1" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; }
if [ -n "$APP_URL" ] && ! valid_url "$APP_URL"; then
  echo "${P}_APP_URL must look like https://host (no path): $APP_URL" >&2
  exit 1
fi
API="${SUPABASE_API:-https://api.supabase.com}/v1/projects/$REF" # SUPABASE_API: tests only

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
vercel_team() { # Hobby: without VERCEL_TEAM_ID, the token owner's default team (or the user)
  [ -n "${VERCEL_TEAM_ID:-}" ] && return
  VERCEL_TEAM_ID="$(curl -fsS https://api.vercel.com/v2/user -H "Authorization: Bearer $VERCEL_TOKEN" |
    jq -er '.user.defaultTeamId // .user.id')"
}
vercel_api() { # method path [json]   Vercel REST API, scoped to the team (call vercel_team first)
  local sep='?'; [[ "$2" == *\?* ]] && sep='&'
  curl -fsS -X "$1" "https://api.vercel.com$2${sep}teamId=$VERCEL_TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" ${3:+--data "$3"}
}

check() {
  echo "Settings for $env_name:"
  for v in SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF" "SUPABASE_${P}_DB_PASSWORD" \
           VERCEL_TOKEN "${P}_APP_URL" AI_API_KEY AI_MODEL \
           GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SMTP_HOST SMTP_SENDER_EMAIL VITE_SENTRY_DSN CRON_SECRET \
           VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY EMAIL_API_KEY EMAIL_FROM; do
    if [ -n "${!v:-}" ]; then echo "  ✓ $v"; else echo "  · $v"; fi
  done
}

push_db() {
  if [ "${SUPABASE_DB_VIA_API:-}" = true ]; then push_db_api; return; fi
  need SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF" "SUPABASE_${P}_DB_PASSWORD"
  export SUPABASE_DB_PASSWORD; SUPABASE_DB_PASSWORD="$(var "SUPABASE_${P}_DB_PASSWORD")"
  "${SUPABASE[@]}" link --project-ref "$REF"
  "${SUPABASE[@]}" db push --yes
}

# The same result as `supabase db push`, over HTTPS: each migration not yet recorded in
# supabase_migrations.schema_migrations runs as one request (one implicit transaction, so a failing
# file changes nothing) and is then recorded, so the CLI and this path can be mixed later.
push_db_api() {
  need SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF"
  local applied file base version body status out
  sql "CREATE SCHEMA IF NOT EXISTS supabase_migrations;
       CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations
         (version text PRIMARY KEY, statements text[], name text);"
  applied="$(api POST /database/query \
    '{"query": "SELECT version FROM supabase_migrations.schema_migrations"}' | jq -r '.[].version')"
  body="$(mktemp)"; out="$(mktemp)"
  for file in supabase/migrations/*.sql; do
    base="$(basename "$file" .sql)"; version="${base%%_*}"
    grep -qx "$version" <<<"$applied" && continue
    echo "Applying $base"
    jq -Rs '{query: .}' "$file" >"$body"
    status="$(curl -sS -o "$out" -w '%{http_code}' -X POST "$API/database/query" \
      -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
      --data-binary @"$body")"
    if [ "${status:0:1}" != 2 ]; then
      echo "Migration $base failed (HTTP $status):" >&2; head -c 2000 "$out" >&2; echo >&2
      exit 1
    fi
    sql "INSERT INTO supabase_migrations.schema_migrations (version, name)
         VALUES ('$version', '${base#*_}') ON CONFLICT (version) DO NOTHING;"
  done
  rm -f "$body" "$out"
  echo "Database is up to date."
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
    {site_url: $url, uri_allow_list: ($url + "/**")}
    # B-17: the sign-up email carries the 6-digit code the app asks for (same as config.toml).
    # The Supabase Free plan refuses template changes (entitlement_required) while its built-in
    # sender is used, so the template goes with custom SMTP; until then the default email
    # with its confirmation link is the way in (AuthScreen sends emailRedirectTo).
    # mailer_otp_length: the code box in the app takes 6 digits; new hosted projects default to 8.
    + (if $host != "" then {mailer_otp_length: 6,
                            mailer_subjects_confirmation: "Your TripJunkies sign-up code",
                            mailer_templates_confirmation_content: $confirm} else {} end)
    + (if $gid != "" then {external_google_enabled: true, external_google_client_id: $gid,
                           external_google_secret: $gsecret} else {} end)
    + (if $host != "" then {smtp_host: $host, smtp_port: $port, smtp_user: $user, smtp_pass: $pass,
                            smtp_admin_email: $from, smtp_sender_name: $fromName} else {} end)')"
  api PATCH /config/auth "$body" >/dev/null
  echo "Auth settings updated (site URL $APP_URL$([ -n "${GOOGLE_CLIENT_ID:-}" ] && echo ', Google')$([ -n "${SMTP_HOST:-}" ] && echo ', SMTP'))."
  [ -n "${SMTP_HOST:-}" ] || echo "No SMTP settings: Supabase's built-in sender and default sign-up email (link, no code) stay until SMTP_* is set and 'auth' is re-run."
}

web() {
  need SUPABASE_ACCESS_TOKEN "SUPABASE_${P}_REF" VERCEL_TOKEN
  vercel_team
  local publishable service url project_id secrets
  read -r publishable service < <(keys)
  url="https://$REF.supabase.co"
  rm -rf .vercel/output
  VITE_SUPABASE_URL="$url" VITE_SUPABASE_PUBLISHABLE_KEY="$publishable" \
    VITE_SUPABASE_PROJECT_ID="$REF" VITE_SENTRY_DSN="${VITE_SENTRY_DSN:-}" \
    VITE_SERVICE_WORKER="${VITE_SERVICE_WORKER:-true}" VITE_VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}" \
    bun run build
  bun scripts/security/check-bundle.ts

  # The project: made on the first deploy. Players and pg_cron must reach it without a Vercel
  # login, so Vercel Authentication (deployment protection) is off on projects made here.
  if ! project_id="$(vercel_api GET "/v9/projects/$PROJECT" 2>/dev/null | jq -er .id)"; then
    project_id="$(vercel_api POST /v11/projects "$(jq -n --arg n "$PROJECT" '{name: $n, framework: null}')" | jq -er .id)"
    vercel_api PATCH "/v9/projects/$project_id" '{"ssoProtection": null}' >/dev/null
    echo "Created Vercel project $PROJECT."
  fi

  # Server secrets, before the deploy so it starts with them. Unset optional ones are skipped, so
  # a re-run never blanks a value set by hand.
  secrets="$(jq -n --arg url "$url" --arg pub "$publishable" --arg svc "$service" \
    --arg key "${AI_API_KEY:-}" --arg model "${AI_MODEL:-}" --arg base "${AI_BASE_URL:-}" \
    --arg pin "${AI_PRICE_IN:-}" --arg pout "${AI_PRICE_OUT:-}" \
    --arg vpub "${VAPID_PUBLIC_KEY:-}" --arg vpriv "${VAPID_PRIVATE_KEY:-}" --arg vsub "${VAPID_SUBJECT:-}" \
    --arg ekey "${EMAIL_API_KEY:-}" --arg efrom "${EMAIL_FROM:-}" --arg cron "${CRON_SECRET:-}" '
    {SUPABASE_URL: $url, SUPABASE_PUBLISHABLE_KEY: $pub, SUPABASE_SERVICE_ROLE_KEY: $svc,
     AI_API_KEY: $key, AI_MODEL: $model, AI_BASE_URL: $base, AI_PRICE_IN: $pin, AI_PRICE_OUT: $pout,
     VAPID_PUBLIC_KEY: $vpub, VAPID_PRIVATE_KEY: $vpriv, VAPID_SUBJECT: $vsub,
     EMAIL_API_KEY: $ekey, EMAIL_FROM: $efrom, CRON_SECRET: $cron}
    | to_entries | map(select(.value != ""))
    | map({key, value, type: "sensitive", target: ["production"]})')"
  vercel_api POST "/v10/projects/$project_id/env?upsert=true" "$secrets" >/dev/null

  VERCEL_ORG_ID="$VERCEL_TEAM_ID" VERCEL_PROJECT_ID="$project_id" VERCEL_TELEMETRY_DISABLED=1 \
    "${VERCEL[@]}" deploy --prebuilt --prod --yes --token "$VERCEL_TOKEN"

  [ -n "$APP_URL" ] || APP_URL="https://$(vercel_api GET "/v9/projects/$project_id/domains" |
    jq -r '[.domains[].name] | (map(select(endswith(".vercel.app"))) + .)[0] // empty')"
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
