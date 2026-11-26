# QA staging live test (two real accounts)

**Date:** 2026-11-26. **Where:** https://tripjunkies-staging.vercel.app (Supabase staging). **Accounts:** jay@ (Captain, admin, 21+) and kamal@ (Player, 21+), signed in at the same time. Passwords were held in a temporary file outside the repo for the run and deleted afterwards; they appear in no file or log.

## What staging runs

Staging does **not** run the latest code. Its bundles lack the copy that batch 1 ("Nothing to check right now…"), batch 2 (search: "Nothing matches…") and batch 3 ("Share this trip") added. It's the build deployed after PR #14 (staging QA fixes). Batches 1–3 are merged to `main` but not deployed; batches 4, 5 and `fix/qa-audit` aren't merged yet. So:

- **Server rules** (roles, joins, Game Night Live, votes, points) existed before these batches and were tested live: results below are valid.
- **UI items fixed in batches 1–5 and this QA pass** can't be confirmed on staging until it's deployed. They pass in the automated suites on the branch (see [QA_REGRESSION_REPORT.md](QA_REGRESSION_REPORT.md)).

## Multiplayer: 26 / 26 PASS

A throwaway crew trip was created by jay@, used, and deleted by jay@ at the end of each run. Log: [evidence/logs/staging-multiplayer-live.log](evidence/logs/staging-multiplayer-live.log)

| ID | Check (PDF p.4, 7, 11) | Result |
|---|---|---|
| MP-00 | Both accounts signed in at the same time | PASS |
| MP-01 | Captain creates a crew trip | PASS |
| MP-02, 02a, 02b | Player joins with the code; Captain sees them waiting; approves | PASS |
| MP-03 | Both see the same seats: "2 of 12" | PASS |
| MP-04 | Captain promotes Player to Co-Captain; Player sees the new role | PASS |
| MP-05 | Co-Captain can edit trip details (R-208) | PASS |
| MP-06 | Co-Captain can't delete the trip ("Captain only") | PASS |
| MP-07 | Co-Captain can't hand over the Captaincy | PASS |
| MP-08 | Captain moves Co-Captain back to Player | PASS |
| MP-09 | Role changes logged (2 rows) | PASS |
| MP-10 | Player can't delete the trip | PASS |
| MP-11 | "We've arrived" starts Trip Season, same phase on both | PASS |
| MP-12 | Player can't open the crowning night | PASS |
| MP-13 | Captain opens Game Night Live | PASS |
| MP-14 | Player can't 👍 their own Show & Tell | PASS |
| MP-15 | 👍 for the Captain: first tap counts, second doesn't (no duplicate) | PASS |
| MP-16 | Both cast a secret Best Overall vote; a repeat vote is accepted once | PASS |
| MP-17 | Before Close, the Captain can't read the Player's vote through the API (403) | PASS |
| MP-18 | Before Close, live state shows no winner, only each player's own vote | PASS |
| MP-19 | Player can't close Game Night Live | PASS |
| MP-20 | Captain closes it | PASS |
| MP-21 | Both accounts see identical Trip Season standings | PASS |
| MP-22 | A player can't write points directly (403) | PASS |
| MP-23 | Crew Check loads for the player | PASS |
| MP-99 | Captain deletes the throwaway trip | PASS |

**Points posted (database values):** Captain 30 (Show & Tell 20 + Best Overall 10), Player 10 (Best Overall 10). Each player reads only their own ledger rows; the standings both accounts see are identical.

**Award tie (PDF p.4, open question Q7):** when the two voted for each other, the server gave **both** players Best Overall and +10 each. That is today's tie behaviour. The founder should confirm it (Q7).

**Not run live:** Crew Check approve-and-post with a real photo (needs an image upload and a quest in Trip Season); covered by `21_proofs_crew_check` in the DB suite.

## Screens on staging (signed out and as jay@)

Log: [evidence/logs/staging-ui-live.log](evidence/logs/staging-ui-live.log). Screenshots: [evidence/screenshots/staging](evidence/screenshots/staging). **0 console or network errors** across the pass.

| PDF | Item | Staging today | Why |
|---|---|---|---|
| 6 | Sign-in lists hello@, support@, safety@ | support@ only | QA-B03 fix not deployed |
| 6 | Try Games on Flight signed out | Not there | Batch 5 not deployed |
| 6 | Search, Join with Code, Games on Flight label | Old behaviour | Batch 2 not deployed |
| 6 | Connecting flights / welcome letter | Old layout | Batch 5 not deployed |
| 10 | Bronze Captain badge gone | Still there | Batch 3 not deployed |
| 10 | Bell icon in the header | PASS | — |
| 11 | "Baggage Claim" naming | PASS | — |
| 9 | Seats "of 12" not "of 30" | PASS | — |
| 15–16 | Passport layout, 10 countries, world map | Old page | Batches 4–5 not deployed |
| 13–14 | New games; Practice vs Start | Old arcade | Batches 4–5 not deployed |
| 7–8 | Play hero (phase art, countdown, crew at the gate) | Old Play | Batch 5 not deployed |
| 12 | Setup wizard opens; Window Seat has no off-app mode | As built | Founder decision (QA-B04) |
| 3 | Console errors (PDF: 9) | 0 seen | — |

## Next

Merge batch 4 → batch 5 → `fix/qa-audit`, deploy `main` to staging, then rerun `ui` and `mp` (the scripts live outside the repo with the session; they take about five minutes).
