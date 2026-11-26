# QA master bug register

Branch `fix/qa-audit` (from `fix/review-batch-5` @ `d8c9a2e`), 2026-11-26. Sources: the eight QA reports in this folder (audit of `d8c9a2e`) and the 19-page *TripJunkies Staging Review*. Every row was checked against the code; none was taken on the report's word.

Statuses: REPORTED · INVESTIGATING · CONFIRMED · FIXING · FIXED · VERIFYING · VERIFIED · BLOCKED · NOT A BUG · NEEDS PRODUCT DECISION. "VERIFIED" here means verified by automated tests on this branch. Nothing is verified on staging yet (see [QA_VERIFICATION_REPORT.md](QA_VERIFICATION_REPORT.md)).

## Bugs from the QA reports

| ID | Source | PDF p. | Module | Description | Severity | Reproduced | Location | Root cause | Fix | Test | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| QA-B07 | QA_BUG_REPORT, QA_DATABASE_TEST_REPORT | 15 | DB tests | pgTAP 47 fails: `permission denied for function junkie_rank` | MEDIUM | Yes, Docker Postgres 16 | `supabase/tests/database/47_passport_junkie_badge.test.sql` | Test called `public.junkie_rank`, which is `service_role` only since the least-privilege pass | Test calls `trip_private.junkie_rank` (granted to signed-in users); no grant widened | pgTAP 47: 3/3 | VERIFIED |
| QA-B01 | QA_BUG_REPORT | 11, 12 | Captain Tools | Trip details save refuses 1-day trips ("2 to 30 days") and lets 15–30 days through to a server error | MEDIUM | Yes, from code (request never sent) | `src/features/captain-tools/CaptainTools.tsx` `save()` | Hard-coded limit from before room rules | Shared `lengthProblem(room, start, end)` in `wizard-model.ts`; Captain Tools uses the room's `mainDays` and the setup message | Vitest `lengthProblem` (3 cases) | VERIFIED |
| QA-B02 | QA_BUG_REPORT, QA_UI_RESPONSIVE_REPORT | 4, 9, 11 | Squad / seats | "Add 6 seats (up to 12)" shown on 12-seat crews; flag doesn't change the cap but adds an add-on price and order | MEDIUM | Yes, from code and schema | `src/features/trip/SeatCap.tsx`; `public.unlock_extra_seats` | `seat_cap` = room `maxCrew` and never reads `extra_seats` (on the deck's retire list) | Offer removed; function refuses with a clear message; migration `20261126120000` | pgTAP 49: 5/5 | VERIFIED |
| QA-B03 | QA_BUG_REPORT | 6 | Sign-in | Sign-in screen lists only support@ | LOW | Yes, from code | `src/features/auth/AuthScreen.tsx` | Batch 2 added the three contacts to the splash, not the sign-in screen | Shared `ContactLinks` on both screens | e2e `signed-out.spec.ts` (3 mailto links) | VERIFIED |
| QA-B04 | QA_BUG_REPORT | 4, 12 | Setup: Window Seat | No "Friends off the app" in Window Seat | LOW | Yes (by design) | `src/features/trip/rooms.ts`, `trip_private.room_rules` | Deck disagrees with itself: R-003/R-006 (every room / every group room) vs R-354/R-901 (Window Seat = solo or crew of 4) | None until the founder decides | — | NEEDS PRODUCT DECISION |
| QA-B05 | QA_BUG_REPORT, QA_UI_RESPONSIVE_REPORT | 12, 15 | Culture hub | Travel-story hub labelled "Window Seat"; empty Bronze/Silver/Gold "coming soon" chips | LOW | Yes, from code | `src/features/culture/CultureExperiences.tsx` | Old A2e naming; tier chips never built | Labels read "Travel stories"; tier chips removed (as on the Passport) | Typecheck, lint, e2e suite | FIXED (visual check on staging pending) |
| QA-B06 | QA_BUG_REPORT | 4, 11 | Pricing copy | "Big Group add-on (21–30)" on legacy trips | LOW | Yes, legacy trips only | `src/features/trip/TripUnlock.tsx:92`, `src/lib/prices.tsx` | Dormant payment model from before room rules | None: legacy trips are archived/read-only and payments are dormant; pricing needs the founder | — | NEEDS PRODUCT DECISION |

## New findings during the fix pass

| ID | Module | Description | Severity | Location | Root cause | Fix | Test | Status |
|---|---|---|---|---|---|---|---|---|
| QA-B08 | CI / inventory | `docs/inventory` out of date: source-reference counts for `cultural_inspirations`, `culture_layer_stamps` and `trip_season` changed with batches 4–5. CI's "snapshot and inventory are up to date" step would fail | MEDIUM (release gate) | `docs/inventory/db-inventory.*` | Earlier inventory edits were made by hand | Regenerated with `replay-migrations.sh` + `inventory.py` in Docker, as CI does | Snapshot regeneration shows no remaining drift | VERIFIED |
| QA-S01 | Security | No test pinned which `public` SECURITY DEFINER functions signed-in users can run (default privileges grant new public functions to `authenticated`) | LOW (hardening) | `supabase/tests/database/50_definer_allowlist.test.sql` | Gap noted in QA_SECURITY_AUDIT | New pgTAP test: allowlist of 7; anon can run none | pgTAP 50: 2/2 | VERIFIED |

## Open requirement (handled in a separate change)

| ID | PDF p. | Item | Finding | Status |
|---|---|---|---|---|
| QA-R01 | 12 | Solo setup asks "What kind of traveler are you?" | Batch 3 relabelled the trip vibe question for solo trips. The batch 3 follow-up on `main` (`1edacc0`) reverted that: the vibe options (Family / Chill / Party) are content settings, not the deck's traveler types (foodie, explorer, chill…, R-351), and new trips don't store traveler types. That commit says the traveler question comes in its own change. Not changed here, to avoid clashing with it | CONFIRMED, pending (other change) |

## Report claims that were wrong or outdated

| Report claim | Finding in code | Status |
|---|---|---|
| Practice and "Start a Game Night" look alike (UI report, checklist P14-02) | Fixed in batch 4: Start is the main button with "Live with your crew · rounds count"; Practice is a dashed toggle with "no points" (`GameArcade.tsx`) | NOT A BUG (already fixed) |
| Notification toggle as a small icon "not confirmed" (P10-05) | Bell icon button in the Me header (`TabContent.tsx:431`) since batch 3 | NOT A BUG (already fixed) |
| `write_journal` is a public SECURITY DEFINER function (security audit) | It isn't; the live allowlist has 7 functions | NOT A BUG (report error) |
| "Bronze Captain" tiers remain (P10-04) | `CaptainBadge` in `TripUnlock.tsx` is exported but rendered nowhere | NOT A BUG (unused code) |

## Founder decisions (not bugs)

| Item | PDF | Build | Spec | Status |
|---|---|---|---|---|
| Scavenger Hunt unlocks daily | 7 | One drop open 24 h | R-342 | NEEDS PRODUCT DECISION |
| "Present it live" as a bonus beside the hunt | 7 | Replaces photos after a confirm | R-343 "photo or live" | NEEDS PRODUCT DECISION |
| Game Night Calendar | 14 | Not built | Not in spec | NEEDS PRODUCT DECISION |
| Award tie rule | 4 | Server tie-break exists for standings (R-506); award ties are Q7 | Q7 open | NEEDS PRODUCT DECISION |
| Window Seat off-app mode (QA-B04) | 4, 12 | Not offered | R-003/R-006 vs R-354/R-901 | NEEDS PRODUCT DECISION |
| Big Group pricing copy (QA-B06) | 4, 11 | Legacy trips only | Payments dormant | NEEDS PRODUCT DECISION |

## Blocked (needs live access)

Everything in [QA_TEST_CASES.md](QA_TEST_CASES.md) marked P1 for staging: two-account multiplayer, age/teen accounts, devices. See [QA_MULTIPLAYER_RETEST.md](QA_MULTIPLAYER_RETEST.md).
