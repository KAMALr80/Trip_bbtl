# QA multiplayer retest

**Live status: RUN on staging, 26 / 26 PASS** (2026-11-26, jay@ + kamal@). Details: [QA_STAGING_LIVE_TEST.md](QA_STAGING_LIVE_TEST.md). Staging runs the build from before batches 1–5; the server rules tested here were already deployed.

_Original note, kept for the record:_

Two things are missing for a live two-account run with jay@ and kamal@:

1. **Passwords.** No environment variable holds them, and they must not go into chat, code or reports. Create a file named `.env.qa` in the repo root (it's in `.gitignore`, so git never commits it) with two lines:
   `QA_ACCOUNT_1_PASSWORD=…` (jay@) and `QA_ACCOUNT_2_PASSWORD=…` (kamal@).
   Once the file exists, the live pass reads the passwords from it without printing them. No live two-account script exists yet; it gets written for the deployed build.
2. **The code under test.** Staging runs the build from before batches 3–5 and this branch. A live pass now would test the old code. Merge, deploy to staging, then run the live pass.

## What is verified (server rules, pgTAP with simulated users)

| Flow (PDF p.4) | pgTAP | Result |
|---|---|---|
| Crew Check: submit, approve by someone else, points once; no self-approve | `21_proofs_crew_check` | pass |
| Game Night Live: Show & Tell 👍 = 20 once; can't tap yourself | `22_live_and_crowns` | pass |
| Secret award votes hidden until Close | `22_live_and_crowns`, `23_reveal_and_drops` | pass |
| Role changes (Captain ↔ Co-Captain ↔ Player), logged; Co-Captain powers | `16_limits_and_leaders`, `01_membership` | pass |
| Crew caps: 12 (pending counts), Window Seat 4; no seat add-on | `13_room_rules`, `16_limits_and_leaders`, `49_extra_seats_retired` | pass |
| Points per season, reset per trip; standings tie-break (R-506) | `18_points_ledger` | pass |
| Present live: 👍 = 10, no double award | `35_drop_present_live` | pass |
| Final standings read season by season (client) | Vitest `final-standings.test.ts` | pass |

## Live cases to run after deploy (two browsers: jay@ = Captain, kamal@ = Player)

TC-MP-01 to TC-MP-08 in [QA_TEST_CASES.md](QA_TEST_CASES.md). For each, record the result, the time, and a screenshot under `qa/evidence/screenshots/<case>.png`, and check the row in the database view the app exposes (Standings, Crew Check) on both accounts.

| Case | Status |
|---|---|
| TC-MP-01 Crew Check points post once | Covered by DB suite; live photo upload not run |
| TC-MP-02 Show & Tell +20 once | PASS (live: MP-14, MP-15) |
| TC-MP-03 Secret votes hidden until Close (UI and network) | PASS (live: MP-16–MP-18, API 403) |
| TC-MP-04 Award tie (needs the Q7 rule) | RUN: both get the award and +10; founder to confirm Q7 |
| TC-MP-05 Fresh account sees Crew Check / Game Night Live | Partly: fresh trip, Crew Check and Live load for the player (MP-13, MP-23); a brand-new third account not used |
| TC-MP-06 Role changes reach the other browser | PASS via API (MP-04, MP-08, MP-09); UI refetch not timed |
| TC-MP-07 13th join / 5th Window Seat refused | Not run (needs 11 more accounts); DB suite covers it |
| TC-MP-08 Friends off the app saves nothing | Not run live; nothing is sent to the server by design |
