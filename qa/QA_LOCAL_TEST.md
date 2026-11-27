# QA local test (latest code, two real accounts)

**Date:** 2026-11-26. **Code:** `fix/qa-audit` (batches 1–5 and the QA fixes), plus the QA-B09 fix below. **Where:** this machine only:

- the production build (`bun run build`, served with `scripts/serve-build.ts` on 127.0.0.1:8080)
- the local Supabase stack (Docker, 127.0.0.1:54321), with every migration applied by `supabase migration up`. The database wasn't reset, and data already in it was kept.

**Accounts:** jay@ (Captain, app admin, 21+) and kamal@ (Player, 21+), created on the local stack only. Each accepted the terms and set a birthday through the app's own functions (`accept_legal`, `set_my_dob`). Passwords were kept in a temporary file outside the repo and deleted after the run. No password, key or user ID appears in any file or log.

Unlike staging (see [QA_STAGING_LIVE_TEST.md](QA_STAGING_LIVE_TEST.md)), this run uses the latest code, so it checks the UI fixes from batches 1–5 as well as the server rules.

## Results

| Pass | Result | Log |
|---|---|---|
| Multiplayer, server rules (both accounts signed in at once) | **27 / 27 PASS** | [local-multiplayer.log](evidence/logs/local-multiplayer.log) |
| New server changes from batches 3–5 and the QA pass | **10 / 10 PASS** | [local-features.log](evidence/logs/local-features.log) |
| Screens against the founder PDF (signed in as jay@, iPhone 13 size) | **20 / 20 PASS** (+1 INFO: founder decision) | [local-ui.log](evidence/logs/local-ui.log) |
| Quick join role (new bug QA-B09, after the fix) | **3 / 3 PASS** | [local-quickjoin.log](evidence/logs/local-quickjoin.log) |
| Real-stack E2E (`playwright.live.config.ts` against local Supabase) | **3 / 3 PASS** | — |
| Console and network errors across the screen pass (PDF p.3 said 9) | **0** | [local-ui.log](evidence/logs/local-ui.log) |

Screenshots: [evidence/screenshots/local](evidence/screenshots/local).

## Multiplayer (PDF p.4, 7, 11): 27 / 27

These are the same checks as the staging run (MP-00 … MP-23, MP-99), on the latest code, with every check passing:

- joining with a code
- approval
- the same seat count ("2 of 12")
- Co-Captain powers and limits (R-208)
- role-change log
- "We've arrived" giving the same phase on both accounts
- Game Night Live: no 👍 on your own Show & Tell, no duplicate 👍, secret votes hidden before Close, only the Captain or Co-Captain can close it
- identical standings
- no direct points writes
- Crew Check

**Points:** Captain 30 (Show & Tell 20 + Best Overall 10), Player 10. Each player reads only their own ledger rows.

**Award tie:** this is the same as on staging. When the two players vote for each other, both get Best Overall and +10. This is still open with the founder (Q7).

## New server changes: 10 / 10

| ID | Check | Result |
|---|---|---|
| LF-01 | A 1-day crew trip can be created | PASS |
| LF-02 | Captain Tools rename of a 1-day trip saves (QA-B01) | PASS |
| LF-03 | A 15-day trip is still refused by the room rule | PASS |
| LF-04 | "Add 6 seats" is refused and the cap stays 12 (QA-B02) | PASS |
| LF-05 | A non-Captain is told only the Captain can | PASS |
| LF-06 | Cleanup | PASS |
| LF-07 | World map loads for a signed-in player (batch 5) | PASS |
| LF-08 | World map refused when signed out | PASS |
| LF-09 | `public.junkie_rank` stays closed to players (QA-B07 didn't widen the grant) | PASS |
| LF-10 | Passport progress (level by countries, R-703) loads | PASS |

## Screens against the PDF: 20 / 20

| PDF | Item | Result |
|---|---|---|
| 6 | Sign-in lists hello@, support@, safety@ (QA-B03) | PASS |
| 6 | "Try Games on Flight" without an account | PASS |
| 6 | Board row says Games on Flight | PASS |
| 6 | Join with Code door on Home | PASS |
| 6 | Game Night (one-night room) door on Home | PASS |
| 6 | Inspire Someone on the board | PASS |
| 6 | Welcome letter near the greeting; Connecting flights (batch 5) | PASS |
| 6 | Search bar opens a search, not the tour | PASS |
| 10 | No Bronze Captain badge | PASS |
| 10 | Notification is a small bell icon in the header | PASS |
| 10 | Picked or custom trip role shown on Me | PASS |
| 15 | Passport says 10 countries (not five trips) | PASS |
| 15 | Remove list gone (MY JOURNEY counters, PHASES, CULTURE STORIES) | PASS |
| 16 | World map on the Passport (batch 5) | PASS |
| 13 | Hot Seat, Act It, Would You Rather, Trivia, Sing-off listed | PASS |
| 14 | Practice and Start a Game Night look different | PASS |
| 11 | Last phase named Baggage Claim (not Wrapped) | PASS |
| 7 | Phase art, countdown and crew at the gate on Play (batch 5) | PASS |
| 9 | Seats read "of 12", not "of 30" | PASS |
| 12 | Setup wizard opens | PASS |
| 12 | Window Seat offers no "Friends off the app" | INFO: founder decision (QA-B04) |

## New bug found: QA-B09, the Quick join role was lost (PDF p.10)

- **What happened:** after joining a trip, the player picks a role ("Your role this trip") in the Join sheet. The pick was saved only on the new trip card, and the database trigger `fill_card_from_profile` then overwrote it with the role on their profile. So Me showed no role, or their old one.
- **Found by:** the local screen pass. "Trip role" on Me failed until the role was set on the profile.
- **Fix:** `src/features/players/PlayerCards.tsx`. The Join sheet now saves the role on the player profile, the same way the card editor does, and the trigger copies it to every card. The trip card keeps only "most excited for". No database change.
- **Tests:**
  - `e2e/join-flow.spec.ts` now expects the role in the profile write, not in the card write (it had been checking the old behaviour). It passes.
  - The live check after the fix shows the role on the profile, on the new trip card and on Me ("Trip role: Photographer"; screenshot `10-quickjoin-role-me.png`).

## New bug found: QA-B10, the Play screen was broken on a desktop screen (PDF p.7)

- **What happened:** reported with a screenshot after the run. In the phone-width app frame on a wide screen, the Play hub used two columns. The "You have arrived" banner filled the left column, and the hero, score card and phase strip were squeezed into the right one and cut off.
- **Cause:** the two-column grid (`.play-hub`) switched on the viewport width, not on the width of the hub itself.
- **Fix:** `src/styles.css`. The hub now uses two columns only when it is wide enough itself, and the banner, hero and crew always span the full row.
- **Checked:**
  - at 1910px, 1024px and iPhone 13 widths, the hub is one column with no sideways scroll (screenshots `11-play-layout-desktop.png`, `-tablet.png`, `-phone.png`)
  - e2e `responsive`, `play-engine` and `shell-navigation`: 21/21

## Other tests on this code

All passed after the QA-B09 change:

- typecheck: clean
- `eslint . --quiet`: exit 0
- Vitest: 346 / 346
- mocked join/profile E2E: 10 / 10 (`join-flow`, `join-name`, `profile`, `invite-pin`)
- real-stack E2E: 3 / 3

## Not run locally

- Crew Check approve-and-post with a real photo (covered by pgTAP `21_proofs_crew_check`)
- age and teen accounts (pgTAP `02_age_gates`)
- real devices (offline, install, push)

These need a phone or seeded teen accounts.

## Next

Merge batch 4, then batch 5, then `fix/qa-audit`, each with CI green. Then deploy `main` to staging and rerun the screen pass there to confirm.
