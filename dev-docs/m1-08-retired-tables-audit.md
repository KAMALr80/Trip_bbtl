# M1-08 — Retired tables audit and move plan (Nov 3, 2026)

The 52 tables in [`scripts/db/legacy-tables.txt`](../scripts/db/legacy-tables.txt) belong to features the
deck retired ([05](05-legacy-retire-list.md), Q20 approved). M1-08's last step is moving them to a
`legacy_archive` schema (05 §1 step 4), then dropping them a release later (step 5). This audit checks
what still reaches each table, so the move can't break a live feature.

**Result: 11 tables can move now (rehearsed, all checks green). 41 are still reached by live code and
must wait for the code that reaches them to be removed or rewritten.** Nothing was moved for real; no
migration was added.

## How it was checked

On the local stack (all migrations through `20261105110000`), read-only queries:

- **Rows:** only content/seed tables hold rows: `game_cards` 1,930, `game_format_prompts` 170,
  `weekly_question_pool` 38, `game_catalog` 15, `junkie_ranks` 1. Every player table is empty.
- **Foreign keys from live tables:** one: `at_home_activities.game_id → game_catalog`.
- **Views:** none. Every table has RLS policies and the `<table>_archive_guard` trigger (they move with it).
- **Live callers, transitively.** Roots: every `public` function `authenticated` or `service_role` can
  run (minus `trip_private.retired_wrappers`), every function named in an RLS or storage policy,
  every trigger function on a non-retired table, every cron command. Then follow calls
  (`name(` in the body) through `public` and `trip_private`. A table is blocked if any function in
  that closure names it. The query is in the appendix.
- **Dynamic SQL:** none of the 11 is named as a string anywhere in the schema
  (`supabase/baseline/current_schema.sql`), so no `EXECUTE format(...)` reaches them.
- **App and test code:** `src/`, `e2e/`, `scripts/` (except `legacy-tables.txt` and the export
  script), `supabase/seed.sql` and `supabase/tests/` don't name any of the 11.

## Can move now (11)

| Table | Feature | Rows | Only callers (all retired / unreachable) |
|---|---|---|---|
| `age_guesses` | L1 old game night | 0 | `resolve_age_guesses` |
| `game_format_prompts` | L1 | 170 (content) | `night_format_action` |
| `game_night_card_skips` | L1 | 0 | `night_format_action` |
| `game_night_moments` | L1 | 0 | `night_format_action` |
| `game_night_reactions` | L1 | 0 | `night_format_action` |
| `game_night_votes` | L1 | 0 | — |
| `room_blocks` | L14 Game Rooms | 0 | `request_room`, `decide_room_request` |
| `room_requests` | L14 | 0 | `request_room`, `decide_room_request`, `game_rooms`, `room_requests_for` |
| `trip_adult_activities` | L10 party cards | 0 | `answer_trivia` |
| `trip_day_trivia_keys` | L13 trip-day games | 0 | `answer_trivia` |
| `trip_season_reveals` | L13 | 0 | `season_game_reveal`, `season_game_submit` |

**Rehearsal (local only, then undone):** created `legacy_archive`, moved the 11 with
`ALTER TABLE … SET SCHEMA`, ran the whole pgTAP suite: 34 of 35 files pass, the same as before the
move (the one failure, `07_seed`, is a stale local seed, unrelated). `authenticated` and `anon` have no
`USAGE` on `legacy_archive`, so the rows are unreachable from clients; the 170 prompt rows were intact.
Moved back with `SET SCHEMA public`; the tables' privileges compared identical before and after.

### Proposed migration (not added yet)

```sql
-- M1-08: move the retired tables nothing live reaches any more into legacy_archive (05 §1 step 4).
-- Data, indexes, policies and archive-guard triggers move with them; clients have no USAGE on the schema.
-- Audit: dev-docs/m1-08-retired-tables-audit.md.
-- rollback: ALTER TABLE legacy_archive.<t> SET SCHEMA public; for each table below; DROP SCHEMA legacy_archive.
CREATE SCHEMA IF NOT EXISTS legacy_archive;
REVOKE ALL ON SCHEMA legacy_archive FROM PUBLIC;
ALTER TABLE public.age_guesses SET SCHEMA legacy_archive;
ALTER TABLE public.game_format_prompts SET SCHEMA legacy_archive;
ALTER TABLE public.game_night_card_skips SET SCHEMA legacy_archive;
ALTER TABLE public.game_night_moments SET SCHEMA legacy_archive;
ALTER TABLE public.game_night_reactions SET SCHEMA legacy_archive;
ALTER TABLE public.game_night_votes SET SCHEMA legacy_archive;
ALTER TABLE public.room_blocks SET SCHEMA legacy_archive;
ALTER TABLE public.room_requests SET SCHEMA legacy_archive;
ALTER TABLE public.trip_adult_activities SET SCHEMA legacy_archive;
ALTER TABLE public.trip_day_trivia_keys SET SCHEMA legacy_archive;
ALTER TABLE public.trip_season_reveals SET SCHEMA legacy_archive;
```

Before adding it: regenerate the schema snapshot, inventory and `types.ts` (they list these tables),
update `scripts/db/export-legacy.sh` to read `legacy_archive.<table>` for moved tables, and mine
`game_format_prompts` into `content_items` if the founder wants those prompts (05 §1 step 6).

## Blocked (41): what still reaches them

Each group moves when the named work removes or rewrites its live callers. Bold = a feature that
is **current**, so the caller must be rewritten, not deleted.

| Tables | Live callers that block the move | Unblocked by |
|---|---|---|
| `game_nights` (49 callers), `game_night_flow`, `game_night_polls`, `game_night_turns`, `game_pick_log`, `trip_play_state`, `game_scores`, `season_quests` | Old setup / room creation (**`create_at_home_a2c`, `create_culture_a2e`, `set_preflight_a2c`**, `apply_game_plan`, `plan_game_nights`), `trip_peek`, `share_preview`, night actions, `game_board` / `season_points`; 9 client files read `game_nights` (`AtHome`, `HomeDashboard`, `PassportBook`, `Seasons`, `CaptainChecklist`, `BugInbox`, …) | M2-05 (old setup code) and M3-13 (old At Home room) |
| `game_catalog` | **`at_home_plan`, `at_home_add`** (and the FK from `at_home_activities`), `pick_night_game`, `surprise_night_game`; `src/lib/content.functions.ts` | M3-13 |
| `game_cards`, `weekly_question_pool` | Trigger function `guard_generated_content`; `pick_weekly_prompt`; `content.functions.ts` (AI card top-ups) | Retire the old card top-up path (L8 / M3-02 AI tailoring) |
| `host_swaps`, `host_penalties`, `skip_passes` | `use_host_pass`, `use_captain_pass`, `use_night_pass`, `request_host_swap`, `respond_host_swap`; `HostSwaps.tsx` | M3-13 |
| `weekly_questions`, `weekly_answers`, `weekly_answer_votes` | `weekly_question_status`, `ensure_weekly_questions`, `answer_weekly_question`, `qotw_*` | Remove the QOTW callers left in live paths (L4) |
| `live_votes`, `live_vote_ballots` | **`guard_open_trip`** (a trigger function on live tables) | Drop the Quick Vote branch from `guard_open_trip` (L5) |
| `cost_items`, `cost_shares`, `cost_notes`, `cost_log` | Cost wrappers (`trip_pot`, `save_cost_item_v2`, …), `log_cost`; `TripCosts.tsx` | M3-13 (TripCosts player view) |
| `junkie_ranks` | `junkie_rank` (still called from a live path) | L7: find and remove the caller |
| `trip_teams`, `trip_team_members` | **`auto_team_trg`** (trigger), `pick_team`, Test Lab `lab_*` | L9: drop the trigger and the old Test Lab views |
| `trip_adult_settings`, `trip_adult_approvals` | **`approve_member`, `set_trip_vibe`, `set_trip_minors`, `revoke_changed_birthday_approvals`**, `is_approved_adult`, `adult_badge` | L10, with care: these are in the age / approval rules (M6-03); rewrite with `02_age_gates` green |
| `checkin_responses` | `submit_checkin`, `founder_checkins`; `BugInbox.tsx` | L11: remove the check-in wrappers and the inbox panel |
| `trip_day_games` | **`claim_airport`** (Airport Missions), `set_wheels_up`, `game_day_status`, `play_day`, `mark_bingo`, `lab_shift` | L13: move the Airport Mission path off `trip_day_games` |
| `bingo_marks`, `quest_posts` | **`trip_photos`** (the photo wall), `trip_season`, `mark_bingo`, `lab_shift` | L13: `trip_photos` stops unioning the old tables |
| `trip_season_games`, `trip_season_finds` | **`proof_upload_ok` / `proof_read_ok`** (storage policies on `quest-proofs`), `season_game_points` | L13: drop the old sealed-quest branch from the storage checks |
| `day_votes`, `mission_votes`, `secret_missions`, `trivia_answers`, `quest_challenges`, `quest_thumbs`, `trip_item_alternatives` | `trip_season` (old stamps, still reachable), `lab_shift` | L12 / L13 with `trip_season` and the old Test Lab shift |

## Risks

- **Runtime, not migration-time, failures.** PL/pgSQL bodies aren't checked when a table moves, so a
  wrong move passes `migration up` and fails the first time a player hits the function. That's why
  only tables with no live caller are eligible, and why the pgTAP suite must pass after the move.
- **The call-graph check is textual.** It finds `name(` calls and `public.<table>` names; it would miss
  a table named only in dynamic SQL built from parts. The 11 were also checked for quoted names.
- **Storage policies and triggers** are live callers even when no screen calls them
  (`proof_upload_ok`, `guard_open_trip`, `auto_team_trg`, `guard_generated_content`).
- **Content rows** (`game_cards`, `game_format_prompts`, `weekly_question_pool`, `game_catalog`) are
  candidate material for `content_items` (05 §1 step 6); moving keeps them, dropping loses them.

## Appendix: live-caller query

```sql
CREATE TEMP TABLE retired_t AS SELECT unnest(ARRAY[/* the 52 names from scripts/db/legacy-tables.txt */]) AS name;
CREATE TEMP TABLE fns AS
  SELECT p.oid, n.nspname, p.proname, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'trip_private') AND p.prokind = 'f';
CREATE TEMP TABLE roots AS
  SELECT f.oid FROM fns f
  WHERE f.nspname = 'public'
    AND (has_function_privilege('authenticated', f.oid, 'EXECUTE') OR has_function_privilege('service_role', f.oid, 'EXECUTE'))
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = f.oid AND d.deptype = 'e')
    AND f.proname NOT IN (SELECT (regexp_match(r::text, '([a-z_0-9]+)'))[1] FROM trip_private.retired_wrappers r)
  UNION SELECT f.oid FROM fns f, pg_policy pol
    WHERE pg_get_expr(pol.polqual, pol.polrelid) ~ ('\m' || f.proname || '\M')
       OR coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') ~ ('\m' || f.proname || '\M')
  UNION SELECT g.tgfoid FROM pg_trigger g WHERE NOT g.tgisinternal
    AND g.tgrelid::regclass::text NOT IN (SELECT 'public.' || name FROM retired_t)
    AND g.tgrelid::regclass::text NOT IN (SELECT name FROM retired_t)
  UNION SELECT f.oid FROM fns f, cron.job j WHERE j.command ~ ('\m' || f.proname || '\M');
WITH RECURSIVE live(oid) AS (
  SELECT oid FROM roots
  UNION
  SELECT callee.oid FROM live JOIN fns caller ON caller.oid = live.oid
  JOIN fns callee ON callee.oid <> caller.oid AND caller.prosrc ~ ('\m' || callee.proname || '\s*\(')
)
SELECT r.name, string_agg(DISTINCT f.nspname || '.' || f.proname, ' ')
FROM retired_t r LEFT JOIN (live JOIN fns f USING (oid)) ON f.prosrc ~ ('\m(public\.)?' || r.name || '\M')
GROUP BY r.name ORDER BY r.name;
```
