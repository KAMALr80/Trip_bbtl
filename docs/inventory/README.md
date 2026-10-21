# M0-06 · Schema snapshot & function inventory

| File | What it is |
|---|---|
| [`../../supabase/baseline/current_schema.sql`](../../supabase/baseline/current_schema.sql) | Schema-only dump of `public` + `trip_private` after replaying all 299 migrations. **Reference only, never applied.** Use it to read the current definition of any function (gotcha G5). |
| [`../../supabase/baseline/cron_jobs.tsv`](../../supabase/baseline/cron_jobs.tsv) | The pg_cron jobs the migrations schedule. |
| [`db-inventory.md`](db-inventory.md) | Overview: totals, security checks, unused objects, table list. |
| [`db-inventory.tsv`](db-inventory.tsv) | One row per table/function: grants, RLS, write policies, last defining migration, number of migrations defining it, and the `src/` files that reference it. Open it in a spreadsheet to filter. |

## Regenerate

```bash
REPLAY_HOOK='python3 scripts/db/inventory.py' scripts/db/replay-migrations.sh
```

- Needs Postgres server binaries (`initdb`, `pg_ctl`, `pg_dump`). No Docker or Supabase CLI.
- Takes about 15 seconds.
- `scripts/db/supabase-shim.sql` stands in for the Supabase platform: the API roles and their default privileges, `auth.users`/`auth.uid()`, the `storage` tables, and no-op `cron`/`net` functions. The replay script removes the `CREATE EXTENSION pg_cron/pg_net` lines on the fly. Migration files are never modified.
- **Caveat:** this shows what the migration files define. If anyone changed the live Lovable Cloud database by hand, those changes aren't captured. Once we have DB access (M0-02), diff this snapshot against a real `supabase db dump --schema public,trip_private`.

## Findings (Oct 21, 2026)

1. **The snapshot matches the data-model doc.** All 138 tables (127 `public`, 11 `trip_private`) appear in [04-data-model.md](../../dev-docs/04-data-model.md), and 04 lists no table that doesn't exist. Functions: 303 `public`, 392 `trip_private`, plus 47 trigger functions.
2. **The photo-purge cron job probably fails every night.** `purge-expired-trip-photos` posts to `https://project--ff8fd31b-….lovable.app/api/public/purge-photos` with only a `Content-Type` header. The route requires `Authorization: Bearer <LOVABLE_CRON_SECRET or trip_private.cron_keys.purge_photos>`, so it returns 401 unless the job was edited by hand on the live DB. Low impact today: it only purges trips closed more than 12 months ago, and none exist yet. Fix it when the cron is re-pointed (M0-10): send the `cron_keys` value as a bearer token and use a per-environment URL.
3. **24 public functions can be executed by `anon` (signed-out users).** Some of them write data (`set_welcome_copy`, `save_game_scores`, `manage_trip_member`, `create_trip`…). I ran each one as `anon` on the replayed DB. All except `new_trip_code()` (harmless) fail with `permission denied for schema trip_private`, because they're invoker wrappers and `anon` has no `USAGE` on `trip_private`. **Safe today, but only because of that one schema grant.** In M6-07, `REVOKE EXECUTE … FROM anon` on every wrapper that isn't meant to be public. List: [db-inventory.md → anon](db-inventory.md#public-functions-executable-by-anon-signed-out-24).
4. **23 public tables have an RLS policy that allows a client write**, including `profiles`, `player_profiles`, `trip_player_cards`, `game_night_votes`, `at_home_*`, `photo_reactions`, `content_*`. Most are per-user presentation data or tables being retired. Check the rest against "no direct client writes on game tables" in M6-07.
5. **Every `SECURITY DEFINER` function sets `search_path`.** All tables in `public` have RLS on. ✅
6. **46 public functions are callable but not referenced anywhere in `src/`.** Examples: the four older `create_trip*` variants, `create_at_home`, `apply_reschedule`, `quick_vote_action`, `next_game_turn`. Most belong to retired features. They're the first candidates for `REVOKE` in M1-08.
7. **Some migrations patch functions with regex.** For example, `20261002034338_…` rewrites `release_trip_day` via `pg_get_functiondef` + `regexp_replace`. Searching the migration files can't find the current body of such functions; only the snapshot shows it.

### Data for the tables 04 marks "Review"

| Table | Referenced from `src/` | Notes |
|---|---|---|
| `age_guesses` | `Season.tsx` | Old game-night mini-game; has client INSERT/UPDATE policies → retire with L1 |
| `airport_claims` | `TripDayGames.tsx` | Earlier Airport Mission model; goes with L13 |
| `season_settings` | none | Unused by the client → fold into `trips` crowning columns or retire |
| `culture_quest_sessions`, `_players`, `_answers` | none (server functions only) | `culture_quest_items` is written directly by `CultureQuest.tsx` |
| `song_discs` | `GameExtrasC2.tsx` | Sing-off; goes with L1 |
| `trip_feedback` | `TripFeedback.tsx` | Founder feedback form |
| `checkin_responses` | `BugInbox.tsx` | Read by the founder bug inbox |
| `cultural_inspirations` | 6 files, incl. `delete-trip.functions.ts`, `PassportBook.tsx` | More entangled than L15 suggests; untangle before retiring |
| `experience_previews` | `ExperiencePreviews.tsx` | Goes with L15 |
