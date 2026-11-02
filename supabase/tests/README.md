# Database tests (pgTAP)

M0-11 characterisation tests. They pin **today's** behaviour of the rules we keep, so the M1 cleanup and the M2/M3 engine work can't change it by accident. When a rule changes on purpose (for example M2-10 Co-Captain powers), update the test in the same PR and cite the rule ID.

| File | Covers |
|---|---|
| `database/01_membership.test.sql` | create trip (21+ Captain, length, play mode), join by code (birthday needed, wrong code, rate limit, pending approval), approve, Co-Captain, remove, pass the crown, leave |
| `database/02_age_gates.test.sql` | sign-up trigger on `auth.users`, `set_my_dob`, teens joining (legacy vs a2c), Family vibe switch, `trips_minor_guard`, no teen Co-Captain |
| `database/03_takeoff.test.sql` | Airport Missions (departure-day window, order, layovers, 2/2/2/3/3 = 12 cap, verify, proof deadline), "We've arrived" and the automatic backup |
| `database/04_sealed_quests.test.sql` | drop schedule, cutoff, hidden text, open/expire/submit/self-destruct, leader review, `sealed_award` scoring, Showcase |
| `database/05_delete_and_rls.test.sql` | read isolation (non-member, pending, anon, birthdays), no direct client writes on game tables, delete trip |
| `database/06_cron_jobs.test.sql` | scheduled jobs exist, the photo purge is authenticated and not Lovable-hosted |
| `database/07_seed.test.sql` | the local seed gives a playable setup (accounts, buckets, trips, quests, missions) |

## Run locally (no Docker)

```bash
scripts/db/test.sh                                         # all files
scripts/db/test.sh supabase/tests/database/03_takeoff.test.sql
```

- The script replays all migrations onto a throwaway Postgres (`scripts/db/replay-migrations.sh`), applies `supabase/seed.sql` twice (like `supabase db reset`, and to prove it can be re-run), then runs each file.
- If the real pgTAP extension isn't installed, it loads `scripts/db/pgtap-lite.sql`. That's a small subset of pgTAP with the same function names and output.
- Needs Postgres server binaries (`initdb`, `pg_ctl`). It takes about 20 seconds.

With the Supabase CLI and Docker (CI, from M0-04/M0-05), the same files run under real pgTAP:

```bash
supabase start && supabase test db
```

## Writing tests

- Each file runs in `BEGIN … ROLLBACK` and starts with `\ir ../_helpers.psql`.
- `tests.create_user(handle, age)` creates an email sign-up through the real `auth.users` triggers, with consent and a birthday. Pass `NULL` as the age for no birthday.
- `tests.authenticate_as(tests.user_id(handle))`, `tests.authenticate_as_anon()` and `tests.clear_authentication()` switch identity like PostgREST does.
- `tests.create_trip(captain, start_offset_days, days, season_rule, home_tz, trip_tz)` and `tests.add_member(trip, user, role, status)` set up fixtures directly.
- Only use the pgTAP functions `pgtap-lite.sql` implements: `plan`, `finish`, `ok`, `is`, `isnt`, `throws_ok`, `throws_like`, `lives_ok`, `pass`, `fail`, `diag`. Add more there if you need them.
- Some rules use `now()` (mission windows, sealed drops). Fixtures place trip dates relative to today, or move timestamps (`opened_at`, `revealed_at`) into the past. Don't depend on the wall clock beyond that. The phase engine (M2-03) takes `p_at` to remove this problem.
- An `UPDATE` that no RLS policy allows changes 0 rows **without an error**. Assert on the data afterwards, not on an exception.
- To check only an error code, use the 4-argument `throws_ok(sql, '42501', NULL, 'description')`. In pgTAP's 3-argument form, a 5-character second argument is the error code and the third is the expected **message**, not a description.
- Supabase Auth sets `auth.users.created_at` itself, and the sign-up age trigger skips rows without it. Raw inserts into `auth.users` must set it (`tests.create_user` does).

## What the tests found (Oct 21, 2026)

These are documented as today's behaviour in the tests; they are **not fixed** here (M0 changes no behaviour).

| # | Finding | Rule | Where it gets fixed |
|---|---|---|---|
| T1 | **Fixed in M6-03.** **Teens can join any a2c trip with the plain join code** (pending Captain approval). Every new trip is a2c. Legacy trips require a teen invite. The published Terms and Privacy pages (`src/routes/legal/$document.tsx`) promise exactly this. The repo-root `AGENTS.md` ("13–17 only via guardian-confirmed teen invites") and the deck (R-904) say otherwise. Changing it needs new legal text and fresh consent. | R-904, Q12 | M6-03 + M6-09 |
| T2 | **Fixed in M6-03** (Q12: 18+, teens only with a teen invite; the legal text follows in M6-09). Email self sign-up is allowed from **13**, and the Terms say 13+. The deck says self sign-up is 18+, and the sign-in screen's checkbox already reads "I'm 18 or older". | R-904, Q12 | M6-03 |
| T3 | Sealed-quest speed bonus is **+5 if proof is submitted within 3h of opening**. The deck says **+5 if opened within 3h of the drop**. | R-322 | M3-05 |
| T4 | Sealed drops are worth **5 or 10** at random. The deck says 5–15 by difficulty. | R-322, Q4 | M3-05 |
| T5 | Quests close at **00:00 home time the day before takeoff**. The deck's Pre-Flight closes at **23:59** that day. | R-101 | M2-03 |
| T6 | `confirm_departure` already allows the **Co-Captain**. Gotcha G9 in the handover pack says Captain-only; the pack is outdated there. | R-103 | doc fix |
| T7 | `approve_member` and `manage_trip_member` (remove, roles) are **Captain-only**. The deck gives the Co-Captain every power except delete. | R-208, R-210 | M2-10 |
| T8 | Trips must be **2–30 days**. The deck says 1–14. Squads go up to `max_squad` (default 20, 30 with Big Group). The deck says 12. | R-112, R-901 | M2-13 |
| T9 | The a2c sealed-quest/Showcase card pool (`security_missions` tagged `video_call` / `trip_meetup`) and all 7 Storage buckets are **not created by any migration**. A fresh database deals no sealed quests and has nowhere to upload photos. | — | M0-04 seed |
| T10 | `ensure_sealed` hard-codes one legacy trip id (`a4842ba8-…`) to skip sealed quests. Probably Siam Vibes or an early test trip. | — | M1-01 archive |
