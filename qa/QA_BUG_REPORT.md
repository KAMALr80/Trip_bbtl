# QA bug report

Defects this audit **confirmed in source** on `fix/review-batch-5` @ `d8c9a2e`. None is fixed in this audit (testing only). None has been reproduced on staging yet, because live access was blocked (see [QA_FINAL_SUMMARY.md](QA_FINAL_SUMMARY.md)). Every report gives the exact code path, so each can be reproduced in a few minutes once someone has a Captain account.

Founder decisions, where the build follows the deck spec but the review asked for something else, are listed separately at the end. They aren't counted as bugs.

| ID | Severity | Module | PDF page | Summary |
|---|---|---|---|---|
| QA-B07 | MEDIUM | DB tests / CI | 15 | New pgTAP test `47_passport_junkie_badge` fails (permission denied). CI on this branch is red, and the 10-country rule has no passing test |
| QA-B01 | MEDIUM | Captain Tools | 11, 12 | Trip-details save checks 2–30 days; rooms allow 1–14. A 1-day trip can't save even a name change |
| QA-B02 | MEDIUM | Squad / seats | 4, 9, 11 | "Add 6 more seats (up to 12)" shown on 12-seat trips; the server flag changes nothing |
| QA-B03 | LOW | Sign-in | 6 | Sign-in screen lists only support@, not hello@ / safety@ |
| QA-B04 | LOW (spec gap) | Setup: Window Seat | 4, 12 | No "Friends off the app" option, though R-006 says it works in every group room |
| QA-B05 | LOW | Culture hub naming | 12, 15 | Legacy culture hub still labels itself "Window Seat" and shows Bronze/Silver/Gold "coming soon" chips |
| QA-B06 | LOW | Pricing copy | 4, 11 | "Big Group add-on (21–30)" copy conflicts with the 12-player cap and the later-phase 13–24 Event Group |

---

## QA-B07: `47_passport_junkie_badge` fails, so the DB release gate is red

- **Module:** Database tests (Passport Junkie badge, R-703)
- **PDF page:** 15 (Passport says 10 countries)
- **Severity:** MEDIUM. Product behaviour looks right; the release gate fails, and the founder's 10-country fix has no passing test.
- **Environment:** `postgres:16-bookworm` container, `scripts/db/test.sh` (the same runner as the CI `db` job; CI also runs `supabase test db` on the same file)
- **Steps to reproduce:** `docker run --rm -v "<repo>:/repo:ro" postgres:16-bookworm bash /repo/scripts/db/test.sh /repo/supabase/tests/database/47_passport_junkie_badge.test.sql`
- **Expected:** 3/3 assertions pass.
- **Actual:**
  ```
  FAIL supabase/tests/database/47_passport_junkie_badge.test.sql
  psql:…/47_passport_junkie_badge.test.sql:15: ERROR:  permission denied for function junkie_rank
  47/48 test files passed
  ```
  Full log: [evidence/logs/db-tests.log](evidence/logs/db-tests.log)
- **DB evidence:** `supabase/baseline/current_schema.sql:28709-28710` `REVOKE ALL ON FUNCTION public.junkie_rank FROM PUBLIC; GRANT … TO service_role` (no `authenticated`). `trip_private.junkie_rank` *is* granted to `authenticated` (`:32619`). Players get the badge through `trip_private.player_card_read` and `trip_private.traveler_level`. The app never calls `public.junkie_rank` (no reference in `src/` outside generated types).
- **Root cause:** the test (added in `cbce966`) calls the public wrapper as a signed-in user. The QA-20 least-privilege pass (`43_least_privilege`) had already removed that grant.
- **Recommended fix:** fix the **test**, not the grant: call `trip_private.junkie_rank(...)` as the user, or assert through `traveler_level` / `player_card_read`. Re-granting `public.junkie_rank` to `authenticated` would widen access for no app need.
- **Regression test:** the corrected file itself; also confirm the CI `db` and `supabase` jobs are green.

## QA-B01: Captain Tools trip-details save uses the wrong length limits

- **Module:** Captain Tools → Trip details
- **PDF page:** 11 (Captain Tools), 12 (length caps)
- **Severity:** MEDIUM (a core Captain edit is blocked for valid trips)
- **Environment:** source review; any environment
- **Test account:** a Captain or Co-Captain of a 1-day trip (any room; Game Night rooms are always 1 day)
- **Preconditions:** a trip whose start date equals its end date
- **Steps to reproduce:**
  1. Open Me → Captain tools → Trip details.
  2. Change only the trip name or motto.
  3. Tap Save.
- **Expected result:** saves. Setup allows 1-day trips (`rooms.ts` `mainDays.min = 1`; setup says "This room runs 1 to 14 days.").
- **Actual result (from code):** `save()` computes `days = 1` and stops with "Trips can be 2 to 30 days long." Nothing is sent, so the name, destination and motto can't be edited either. In the other direction, 15–30 days passes the client check and is only refused by the server's room-rules trigger, with a different message.
- **Evidence:** [src/features/captain-tools/CaptainTools.tsx:132-135](../src/features/captain-tools/CaptainTools.tsx#L132-L135)
  ```ts
  if (days < 2 || days > 30) {
    setError("Trips can be 2 to 30 days long.");
  ```
  compared with [src/features/trip/rooms.ts](../src/features/trip/rooms.ts) `mainDays: { min: 1, max: 14 }` (travel) and `{ min: 1, max: 7 }` (at home).
- **Console / API / DB evidence:** none expected; the request is never sent.
- **Root cause:** a leftover hard-coded limit from before room rules (M2-01). `src/AGENTS.md` and the root `AGENTS.md` say limits live in one table.
- **Recommended fix:** validate against `roomOf(trip.room).mainDays` and reuse the setup wizard's friendly message.
- **Regression test:** unit test that a 1-day trip's details save passes validation and a 15-day trip shows the room message. Live: rename a 1-day trip as Captain and as Co-Captain.

## QA-B02: The extra-seats offer does nothing

- **Module:** Squad / seat cap (`SeatCap`, shown in the members sheet)
- **PDF page:** 4 (group sizes), 9 (member counts), 11 (unlock)
- **Severity:** MEDIUM (a visible paid-feature offer has no effect and confuses the crew-size rules)
- **Environment:** source and schema review
- **Test account:** a Captain of a new-engine "Going on a Trip" crew trip
- **Steps to reproduce:**
  1. As Captain, open the members sheet. It shows "N of 12 seats taken".
  2. Read the line "Need more room? Add 6 more seats (up to 12). Free during beta".
  3. Tap "Add 6 seats".
- **Expected result:** either no offer (12 is already the R-005 maximum; 13–24 Event Group is a later phase) or the cap really grows.
- **Actual result (from code):** the offer shows whenever `!is_window && !extra_seats`, so on every crew trip. `public.unlock_extra_seats` sets `trips.extra_seats = true`, but `trip_private.seat_cap` returns `room_rules(room)->>'maxCrew'` (12) and never reads `extra_seats`. The cap stays "of 12", and the copy promises "up to 12" on a trip that is already 12.
- **Evidence:** [src/features/trip/SeatCap.tsx:62-75](../src/features/trip/SeatCap.tsx#L62-L75); `trip_private.seat_cap` and `public.unlock_extra_seats` in `supabase/baseline/current_schema.sql`.
- **Root cause:** the seat add-on comes from the older 6 + 6 seat model; room rules raised the base to 12 and the add-on was never retired.
- **Recommended fix:** hide the add-on (and make `unlock_extra_seats` refuse) until the Event Group phase. Decide this with the founder, because pricing (`price_rules`, `Checkout.tsx` "+6 seats") refers to it as well.
- **Regression test:** pgTAP: `seat_cap` is unchanged after `unlock_extra_seats`, or the function raises. UI: the offer isn't rendered for crew trips.

## QA-B03: The sign-in screen lists only support@

- **Module:** Auth / sign-in
- **PDF page:** 6 ("Login lists only support@, not hello@ or safety@")
- **Severity:** LOW
- **Steps:** signed out → sign-in screen → footer "Need a hand?".
- **Expected:** hello@, support@ and safety@, as on the welcome splash (`CinematicSplash.tsx:66-68`).
- **Actual (from code):** [src/features/auth/AuthScreen.tsx:337-342](../src/features/auth/AuthScreen.tsx#L337-L342) renders only `common.supportEmail`.
- **Root cause:** the batch fixes added the three addresses to the splash and Me, but not to the sign-in screen.
- **Recommended fix:** reuse the splash's three-row contact list.
- **Regression test:** mocked E2E in `e2e/signed-out.spec.ts` asserting all three `mailto:` links on the sign-in screen.

## QA-B04: Window Seat has no "Friends off the app"

- **Module:** Setup wizard, "Who's playing?"
- **PDF page:** 4, 12
- **Severity:** LOW (spec gap; needs a founder decision)
- **Actual:** [src/features/trip/rooms.ts:84](../src/features/trip/rooms.ts#L84) `window_seat.modes = ["solo", "crew"]`; the server mirrors this in `room_rules`.
- **Spec:** R-003 says "Who's playing?" has three answers. R-006 says Friends off the app "works in every group room". R-001 describes Window Seat as "solo, or a crew of up to 4", which makes it a group room in crew mode.
- **Recommended action:** the founder confirms whether Window Seat counts as a group room for R-006. If yes, add `offline` to both `rooms.ts` and `trip_private.room_rules`, plus `supabase/tests/fixtures/rooms.json`.
- **Crew cap:** 4 is correct (R-001, R-005, R-901). The "5" the reviewer remembered is photo picks per player (R-354).

## QA-B05: The legacy culture hub still says "Window Seat" and shows empty tiers

- **Module:** Culture hub (`CultureExperiences`, reached from Home → inspiration)
- **PDF page:** 12 (naming), 15 (Culture Stories "coming soon")
- **Severity:** LOW
- **Actual:** back buttons and the aria label use "Window Seat" for the culture-sharing track ([CultureExperiences.tsx:240, 604, 987](../src/features/culture/CultureExperiences.tsx#L240)). The "Bronze / Silver / Gold" chips show dimmed with no sample ([:297](../src/features/culture/CultureExperiences.tsx#L297)). The Passport no longer shows them, which fixes the PDF finding there, but the same pattern remains in the hub.
- **Recommended fix:** rename the track label to the room it now belongs to ("Inspire Someone" / "Show Your Culture") and remove or fill the tier chips.

## QA-B06: Big-group pricing copy conflicts with the crew cap

- **Module:** Trip unlock / prices
- **Severity:** LOW
- **Actual:** [TripUnlock.tsx:92](../src/features/trip/TripUnlock.tsx#L92) "Big Group add-on (21–30)", [lib/prices.tsx:45](../src/lib/prices.tsx#L45) "21–30 people (Big Group)", and `season-plan.ts:93` tier "Big Group". R-005 / R-901: crews are 1–12; 13–24 is the Event Group, a later phase. Shown only on legacy trips without `play_arrangement`, so exposure is limited.
- **Recommended fix:** align the copy with R-901, or hide it for archived and legacy trips.

---

## Founder decisions (not counted as bugs)

| Item | PDF | Build today | Spec | Needs |
|---|---|---|---|---|
| Scavenger Hunt unlocks daily | 7 | One drop, open 24 h, every find visible | R-342: drop open 24 hours | Founder: keep R-342 or change the spec |
| "Present it live" as a bonus beside the hunt | 7 | Replaces the drop's photos after a confirm | R-343: photo **or** live | Founder |
| Game Night Calendar | 14 | Not built for Game Night | Not in the spec | Confirm scope |
| Practice vs Start look alike | 14 | Same layout, "LIVE REHEARSAL" badge | Not in the spec | Design call |
| Host role in Test Lab | 18 | Test Lab role switcher only | R-401 "no host" (for players) | Confirm it's QA-only (it is in code) |
| Award ties | 4 | — | Open question Q7 | Founder rule, then a test |

## Earlier review findings now fixed in code (still need a live retest)

36 PDF findings are fixed in code. See the `FIXED-IN-CODE` rows in [QA_PAGE_WISE_CHECKLIST.md](QA_PAGE_WISE_CHECKLIST.md).
