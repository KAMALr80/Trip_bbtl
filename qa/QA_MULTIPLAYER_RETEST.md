# QA multiplayer retest

**Live status: BLOCKED.**

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
| TC-MP-01 Crew Check points post once | BLOCKED |
| TC-MP-02 Show & Tell +20 once | BLOCKED |
| TC-MP-03 Secret votes hidden until Close (UI and network) | BLOCKED |
| TC-MP-04 Award tie (needs the Q7 rule) | BLOCKED |
| TC-MP-05 Fresh account sees Crew Check / Game Night Live | BLOCKED |
| TC-MP-06 Role changes reach the other browser | BLOCKED |
| TC-MP-07 13th join / 5th Window Seat refused | BLOCKED |
| TC-MP-08 Friends off the app saves nothing | BLOCKED |
