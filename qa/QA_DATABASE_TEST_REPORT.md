# QA database test report

**Runner:** `scripts/db/test.sh` (the CI `db` job's runner) in `postgres:16-bookworm`, repo mounted read-only. The migrations replay onto a throwaway cluster; the seed is applied twice to prove it can be re-run; `pgtap-lite` stands in for pgTAP. Nothing outside the container was touched.

**Result: 47 / 48 files pass, 1,052 assertions OK. One file fails (QA-B07).** Full log: [evidence/logs/db-tests.log](evidence/logs/db-tests.log)

| File | Assertions | Result | PDF area |
|---|---|---|---|
| 01_membership | 32 | ok | Join, roles (p.4, 11) |
| 02_age_gates | 24 | ok | Signup / teens / 21+ (p.5) |
| 03_takeoff | 27 | ok | Phases (p.5) |
| 04_sealed_quests | 27 | ok | Sealed content (p.3) |
| 05_delete_and_rls | 24 | ok | RLS, deletion (p.3) |
| 06_cron_jobs | 7 | ok | |
| 07_seed | 10 | ok | Seed immutability |
| 08_archive_mode | 23 | ok | Archived trips |
| 09_no_preview_levels | 10 | ok | |
| 10_retired_wrappers | 8 | ok | |
| 11_one_look | 2 | ok | |
| 12_baseline | 4 | ok | |
| 13_room_rules | 6 | ok | 5 rooms, caps (p.12) |
| 14_phase_engine | 147 | ok | One current phase, late start (p.2, 5) |
| 15_trip_engine | 10 | ok | |
| 16_limits_and_leaders | 15 | ok | Co-Captain powers (p.11) |
| 17_setup_and_schedule | 37 | ok | Setup (p.12) |
| 18_points_ledger | 32 | ok | Points, per-trip reset (p.5, 7) |
| 19_content_schedule | 25 | ok | Long-trip content (p.5) |
| 20_daily_play | 12 | ok | Daily Card (p.5) |
| 21_proofs_crew_check | 22 | ok | Crew Check (p.4) |
| 22_live_and_crowns | 27 | ok | Game Night Live, awards, crowns (p.4) |
| 23_reveal_and_drops | 20 | ok | Secret votes, Surprise Drops (p.4, 7) |
| 24_journal_guide | 19 | ok | Window Seat journal (p.5) |
| 25_notifications | 33 | ok | Reminders (p.5) |
| 26_postcards | 58 | ok | Postcard Picks (p.5, 16) |
| 27_wrapup_answers | 21 | ok | 3 questions (p.16) |
| 28_passport | 43 | ok | Stamps, levels (p.15) |
| 29_profile | 22 | ok | Me, custom role (p.10) |
| 30_security | 7 | ok | |
| 31_moderation | 19 | ok | Reported photos (p.5) |
| 32_test_lab | 14 | ok | |
| 33_admin | 8 | ok | Admin server gate (p.5) |
| 34_content_admin | 13 | ok | |
| 35_drop_present_live | 19 | ok | Present live (p.7) |
| 36_authorization | 25 | ok | Attack matrix |
| 37_push_badges_indexes | 19 | ok | |
| 38_release_hardening | 30 | ok | |
| 39_no_skipped_crown | 9 | ok | |
| 40_privacy_and_join_names | 33 | ok | |
| 41_account_deletion_retention | 49 | ok | "Former player" (p.5) |
| 42_join_decline_notice | 14 | ok | |
| 43_least_privilege | 8 | ok | |
| 44_qa_moderation_and_disabled | 14 | ok | Disabled account, photo points (p.5) |
| 45_lab_jump_itinerary | 9 | ok | Test Lab jump (p.5) |
| 46_lab_engine_itinerary | 6 | ok | Sandbox itinerary (p.9) |
| **47_passport_junkie_badge** | 0 / 3 | **FAIL** | `permission denied for function junkie_rank` (**QA-B07**) |
| 48_world_map | 9 | ok | World map (p.16) |

## Gaps the DB suite doesn't cover

- **Hosted-schema drift:** the suite proves the migrations, not the staging database. Compare with `supabase db dump` on staging.
- **Seat add-on:** no test asserts that `unlock_extra_seats` changes `seat_cap`. It doesn't (**QA-B02**).
- **Award ties (Q7):** the tie rule is still an open question; there's no explicit tie assertion.
- **Photo purge at 7 days:** the copy says 7 days; the purge job runs through a cron endpoint (`20261021120000`), and no test runs it in real time.
- **Function grants:** see the default-privileges note in [QA_SECURITY_AUDIT.md](QA_SECURITY_AUDIT.md).
