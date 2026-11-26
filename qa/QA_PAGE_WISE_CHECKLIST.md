# QA page-wise checklist: TripJunkies Staging Review (pages 1–19)

Branch `fix/review-batch-5` @ `d8c9a2e`, audited 2026-11-26.

## How to read the two status columns

| Column | Meaning |
|---|---|
| **Code / automated** | What this audit verified from source, the schema snapshot, and the automated suites run in this session (typecheck, 343 unit tests, pgTAP DB suite, build). `FIXED-IN-CODE` means the fix exists and is wired where the finding pointed. It does **not** mean a person saw it work on staging. |
| **Live E2E** | The status the prompt asked for, on a running staging app with real accounts. **No item is PASS here.** This session had no staging credentials, no second real account and no phone, so every live check is `BLOCKED` until someone runs the manual pass in [QA_TEST_CASES.md](QA_TEST_CASES.md). |

Code / automated values: `FIXED-IN-CODE` · `FAIL` (defect confirmed in code) · `OPEN-DECISION` (the build matches the deck spec, but the founder asked for something different) · `COVERED-BY-DB-TEST` (a pgTAP test asserts the rule) · `N/A` (confirmed out of approved scope) · `NOT VERIFIABLE` (needs a running app, device or data).

Bug IDs (`QA-Bxx`) are in [QA_BUG_REPORT.md](QA_BUG_REPORT.md). Rule IDs (`R-xxx`) are from [dev-docs/02-game-rules-spec.md](../dev-docs/02-game-rules-spec.md).

---

## Page 1: Overview

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P1-01 | Every module, game, role, phase, and Passport works as one connected system | NOT VERIFIABLE | BLOCKED | Covered by the per-page rows below |

## Page 2: Methodology

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P2-01 | Two simultaneous accounts (Captain + Player) | NOT VERIFIABLE | BLOCKED | No staging credentials |
| P2-02 | All 5 room types × all phases | COVERED-BY-DB-TEST | BLOCKED | `13_room_rules`, `14_phase_engine`, `15_trip_engine`; `src/features/trip/phase.test.ts` |
| P2-03 | Score, phase and standings agree across screens | COVERED-BY-DB-TEST | BLOCKED | Points only in `points_ledger` (`18_points_ledger`); phase only from `trip_phase` |
| P2-04 | Only one phase is ever current | COVERED-BY-DB-TEST | BLOCKED | `14_phase_engine`, fixtures `phases.json` |
| P2-05 | Mobile and desktop widths | NOT VERIFIABLE | BLOCKED | Mocked `e2e/responsive.spec.ts` exists; not run this session |

## Page 3: Back end

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P3-01 | Sealed quest content withheld server-side | COVERED-BY-DB-TEST | BLOCKED | `04_sealed_quests` |
| P3-02 | Sign-out clears the session and query cache | FIXED-IN-CODE | BLOCKED | B-19 in `docs/audit`; push stops on sign-out (B-21) |
| P3-03 | User text renders as text, not HTML | FIXED-IN-CODE | BLOCKED | Only 2 `dangerouslySetInnerHTML`: static theme script (`routes/__root.tsx:228`) and shadcn chart CSS. No user data reaches either |
| P3-04 | No tracking scripts | FIXED-IN-CODE | BLOCKED | Sentry only, DSN optional |
| P3-05 | RLS on every public table | **Verified** | BLOCKED | Schema snapshot: 161/161 `public` tables `ENABLE ROW LEVEL SECURITY` ([QA_SECURITY_AUDIT.md](QA_SECURITY_AUDIT.md)) |
| P3-06 | Privileged writes only via identity-checked functions | COVERED-BY-DB-TEST | BLOCKED | `36_authorization` (25), `05_delete_and_rls` (24), `43_least_privilege`. 12 `public` SECURITY DEFINER functions each check identity (see security audit) |
| P3-07 | `captain_status` stale for one account | NOT VERIFIABLE | BLOCKED | Batch 1 (`4c43574`) traced it to a solo trip and finished crew trips, not caching. Needs the fresh third-account test (P4-04) |
| P3-08 | Console errors (2×401, 4×404, 3×400) | NOT VERIFIABLE | BLOCKED | Needs staging and server logs. Known 404s: 13 images still on Lovable (QA-10, `KNOWN_LIMITATIONS.md`) |

## Page 4: Two-player and account-dependent

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P4-01 | Crew Check: submit, approve, points post once | COVERED-BY-DB-TEST | BLOCKED | `21_proofs_crew_check`; mocked `e2e/crew-check.spec.ts` |
| P4-02 | Game Night Live award tie-break | COVERED-BY-DB-TEST (partly) | BLOCKED | `22_live_and_crowns`. Tie rule is open question Q7 in the spec. Confirm the tie case is asserted |
| P4-03 | Secret award votes hidden until Close | COVERED-BY-DB-TEST | BLOCKED | `22_live_and_crowns`, `23_reveal_and_drops` |
| P4-04 | Fresh third account sees Crew Check / Game Night Live | NOT VERIFIABLE | BLOCKED | Needs three real accounts |
| P4-05 | Crew sizes: 2, 12 cap, Window Seat 4 | COVERED-BY-DB-TEST | BLOCKED | `rooms.ts`: trip 12, Window Seat 4 (= R-005); `16_limits_and_leaders`, `13_room_rules`. See **QA-B02** (seat add-on) |
| P4-06 | Friends off the app, one-phone host | FIXED-IN-CODE | BLOCKED | `OnePhoneNight.tsx`; not offered in Window Seat (**QA-B04**) |

## Page 5: Advanced flows and account rules

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P5-01 | Signup: 6-digit code, consent, birthday | FIXED-IN-CODE | BLOCKED | `b8532fa` sets code length 6 on hosted projects. Email delivery is unverified (`KNOWN_LIMITATIONS.md`) |
| P5-02 | Under-13 blocked; teens only via a Captain's teen invite; 18–20 pending; Captain 21+ | COVERED-BY-DB-TEST | BLOCKED | `02_age_gates` |
| P5-03 | Teen filtering, one-trip limit, minor player card | COVERED-BY-DB-TEST | BLOCKED | `02_age_gates`, `40_privacy_and_join_names`. Test Lab Teen view is cosmetic, so it isn't evidence |
| P5-04 | 21+ content and "No alcohol for me" | COVERED-BY-DB-TEST (age gate) | BLOCKED | `inspiration_age_gate` |
| P5-05 | Offline: cache, offline page, sync queue | Mocked PWA specs exist | BLOCKED | `e2e/pwa/offline,outbox,snapshot`; needs a real phone in airplane mode |
| P5-06 | Install to home screen | NOT VERIFIABLE | BLOCKED | Real phone |
| P5-07 | Photo Wall + AI check with real photos | NOT VERIFIABLE | BLOCKED | Needs real images and `AI_API_KEY` |
| P5-08 | Late start: trip opens in today's phase | COVERED-BY-DB-TEST | BLOCKED | `14_phase_engine` (R-105) |
| P5-09 | Long trip full phase run (Daily Card, Showcase, Takeoff missions, Carry-On, long-flight screen) | COVERED-BY-DB-TEST (schedule) | BLOCKED | `19_content_schedule`, `20_daily_play` |
| P5-10 | At Home arc; Window Seat Discover / Quest / Journal | COVERED-BY-DB-TEST | BLOCKED | `24_journal_guide` |
| P5-11 | Reminders, locked-phase Preview, Postcard Picks, call-night screen | COVERED-BY-DB-TEST (partly) | BLOCKED | `25_notifications`, `26_postcards` |
| P5-12 | Points reset per trip; exact point values | COVERED-BY-DB-TEST | BLOCKED | `18_points_ledger` |
| P5-13 | Deleted account shows "Former player", points kept | COVERED-BY-DB-TEST | BLOCKED | `41_account_deletion_retention` |
| P5-14 | Disabled account loses access immediately | COVERED-BY-DB-TEST | BLOCKED | `44_qa_moderation_and_disabled`, `33_admin` |
| P5-15 | Removing a reported photo takes back its points | COVERED-BY-DB-TEST | BLOCKED | `44_qa_moderation_and_disabled`, `31_moderation` |
| P5-16 | Bad invite link: "link isn't valid" | FIXED-IN-CODE | BLOCKED | `InvitePreview.tsx:72` |
| P5-17 | Showcase in Up Now | FIXED-IN-CODE | BLOCKED | `d94d40d` |
| P5-18 | Admin screens blocked server-side for non-founders | COVERED-BY-DB-TEST | BLOCKED | `33_admin`: players get "Admins only"; `set_price_rule` checks `is_app_admin` |
| P5-19 | Test Lab: "Not enough bots ready" | FIXED-IN-CODE (partly) | BLOCKED | Still raised when fewer than `size-1` free bots exist (`20261125100000…sql:32`). Depends on staging's bot pool |
| P5-20 | Test Lab: "Jump to phase" resets itinerary | COVERED-BY-DB-TEST | BLOCKED | `45_lab_jump_itinerary`, `46_lab_engine_itinerary` |
| P5-21 | Test Lab 404 on the second account | NOT VERIFIABLE | BLOCKED | Test Lab is admin-only, so a 404 for a non-admin account is likely expected. Confirm the second account isn't an admin |

## Page 6: Home

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P6-01 | Search searches, not the tour | FIXED-IN-CODE | BLOCKED | `HomeDashboard.tsx:466-473` opens `HomeSearch`; searches rooms, games, doors, countries, not inside trips |
| P6-02 | "Our Story" back goes back one step | FIXED-IN-CODE | BLOCKED | `AppShell.tsx:800-810` returns to the welcome letter |
| P6-03 | Join with Code on Home | FIXED-IN-CODE | BLOCKED | `HomeDashboard.tsx` "Connecting flights" |
| P6-04 | One-night Game Night room has a Home door; casual games labelled "Games on Flight" | FIXED-IN-CODE | BLOCKED | Board gate D = "Games on Flight"; "Game Night" door opens the `game_night` room |
| P6-05 | Try Games on Flight without an account | FIXED-IN-CODE | BLOCKED | `AuthScreen.tsx` "tryGames" (guest, nothing saved) |
| P6-06 | Login lists hello@, support@, safety@ | **FAIL** | BLOCKED | **QA-B03**: `AuthScreen.tsx:339` lists support@ only. The welcome splash lists all three |
| P6-07 | Board is one piece of art with varied backgrounds | FIXED-IN-CODE | BLOCKED | 4 illustrated scenes rotated daily |
| P6-08 | Welcome letter near the greeting; "More ways to play" doesn't repeat the board | FIXED-IN-CODE | BLOCKED | `cbce966` |
| P6-09 | "Inspire Someone" has its own identity / opens Show Your Culture | FIXED-IN-CODE | BLOCKED | Gate C opens `room: show_culture` |

## Page 7: Play tab

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P7-01 | Score / place / phase agree with Trip | COVERED-BY-DB-TEST | BLOCKED | `trip_standings` |
| P7-02 | Game Night Live and Crew Check present | FIXED-IN-CODE | BLOCKED | Empty states added in batch 1 |
| P7-03 | Surprise Drop photo or present live (10 pts) | COVERED-BY-DB-TEST | BLOCKED | `35_drop_present_live` (19 assertions) |
| P7-04 | Phase banners match deck (R-107) | FIXED-IN-CODE | BLOCKED | |
| P7-05 | Account bug (role-dependent sections) | NOT VERIFIABLE | BLOCKED | See P3-07 / P4-04 |
| P7-06 | Scavenger Hunt unlocks tasks daily | **OPEN-DECISION** | BLOCKED | Build matches R-342 (one drop, open 24 h, all finds visible). Daily unlocking would be a spec change |
| P7-07 | "Present it live" as a bonus beside the hunt | **OPEN-DECISION** | BLOCKED | R-343 says photo **or** live; code replaces the photos after a confirm (`SurpriseDrop.tsx:57-60`) |
| P7-08 | Destination / phase art behind score card and strip | FIXED-IN-CODE | BLOCKED | `PlayHero.tsx` (+ `PlayHero.test.ts`) |

## Page 8: Play look (deck slide 21)

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P8-01 | Countdown over destination art | FIXED-IN-CODE | BLOCKED (visual) | `PlayHero.tsx` |
| P8-02 | "Your crew at the gate" with roles and Invite | FIXED-IN-CODE | BLOCKED (visual) | `PlayHero.tsx:141` seats from the server cap |
| P8-03 | Route through the phases | FIXED-IN-CODE | BLOCKED (visual) | |
| P8-04 | Home stays the lobby; game lives on Play | FIXED-IN-CODE | BLOCKED (visual) | |

## Page 9: Trip tab

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P9-01 | Itinerary / Pre-Flight / Photo Wall not empty | FIXED-IN-CODE (sandbox) | BLOCKED | Empty because new-engine sandboxes had no itinerary; fixed in `20261125100000`. Real trips depend on Captain input |
| P9-02 | Members "of 30" vs Invite "of 12" | FIXED-IN-CODE | BLOCKED | `CaptainTools.tsx:567` uses the room's real cap; `seat_cap` = `maxCrew` |
| P9-03 | Photo Wall Report / Hide | FIXED-IN-CODE | BLOCKED | `report_proof_photo` (`data/moderation.ts:16`); Captain `remove_photo` |
| P9-04 | Standings ranked and persistent | COVERED-BY-DB-TEST | BLOCKED | |

## Page 10: Me

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P10-01 | Picked role shown (Planner, Hype…, custom) | FIXED-IN-CODE | BLOCKED | `MeHome.tsx:101-109` shows `trip_persona` |
| P10-02 | Type your own role | FIXED-IN-CODE | BLOCKED | "Other" with free text saves (`29_profile`) |
| P10-03 | Founder Tools | FIXED-IN-CODE | BLOCKED | `FounderDashboard` lazy-loaded for app admins only; server checks in `33_admin` |
| P10-04 | "Bronze Captain" badge removed | FIXED-IN-CODE (partly) | BLOCKED | Not shown on Me (`TabContent.tsx:439`). `CaptainBadge` tiers remain as dead code in `TripUnlock.tsx:114` |
| P10-05 | Notification toggle as a small icon | NOT VERIFIABLE | BLOCKED (visual) | |

## Page 11: Captain Tools

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P11-01 | Co-Captain edits dates/vibe/zone, removes players | FIXED-IN-CODE + COVERED-BY-DB-TEST | BLOCKED | `CaptainTools.tsx:83` `leader`; `16_limits_and_leaders` (`is_leader`) |
| P11-02 | Co-Captain back to Player | FIXED-IN-CODE | BLOCKED | `demote` action (`CaptainTools.tsx:611`) |
| P11-03 | Delete trip / hand-off Captain-only | COVERED-BY-DB-TEST | BLOCKED | |
| P11-04 | Paywall copy consistent | FIXED-IN-CODE | BLOCKED | Only "Free during beta" (`BETA_LINE`) remains |
| P11-05 | "Baggage Claim" everywhere (not "Wrapped") | FIXED-IN-CODE | BLOCKED | `PlayHub.tsx:115` |
| P11-06 | Edit trip dates within room limits | **FAIL** | BLOCKED | **QA-B01**: client allows 2–30 days, rooms allow 1–14 |
| P11-07 | Extra seats offer | **FAIL** | BLOCKED | **QA-B02** |

## Page 12: Trip setup and Window Seat

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P12-01 | 5 rooms, 5-step setup, length caps | COVERED-BY-DB-TEST | BLOCKED | `13_room_rules`, `17_setup_and_schedule`; mocked `setup-wizard.spec.ts` |
| P12-02 | Window Seat "Friends off the app" | **OPEN-DECISION / FAIL vs R-006** | BLOCKED | **QA-B04**: `rooms.ts:84` modes `solo, crew` |
| P12-03 | Window Seat cap 4 vs 5 | Matches spec | BLOCKED | R-001/R-005/R-901 all say 4. The "5" in R-354 is photo picks per player |
| P12-04 | Captain picks the crowning-night date | FIXED-IN-CODE | BLOCKED | `WizardScreens.tsx:569` only the time gets a default |
| P12-05 | Solo setup asks "What kind of traveler are you?" | FIXED-IN-CODE | BLOCKED | `en.json:207` `vibeSolo` |
| P12-06 | No "Pseudo-Accents" in the country list | FIXED-IN-CODE + unit test | BLOCKED | `lib/places.test.ts:16` |
| P12-07 | Explore a Culture: 11 focuses, pick 2; Show Your Culture skips it | COVERED-BY-DB-TEST | BLOCKED | `maxFocuses: 2` |
| P12-08 | Trip-tab button no longer says "Window Seat" for the culture hub | FIXED-IN-CODE (partly) | BLOCKED | Button reads `trips.shareTrip`; the hub's own back labels still say "Window Seat" (**QA-B05**) |

## Pages 13–14: Game Night

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P13-01 | Hot Seat, Act It, Would You Rather, Trivia, Sing-off added | FIXED-IN-CODE | BLOCKED | `GameArcade.tsx:137-182` (14 games) |
| P13-02 | Category tag same on grid and detail | FIXED-IN-CODE | BLOCKED | Both use `arcadeGameType(title)` (`GameArcade.tsx:443, 1186`) |
| P13-03 | No repeat cards across rounds | FIXED-IN-CODE | BLOCKED | Used prompts tracked per device (`OnePhoneNight.tsx:116`) |
| P14-01 | One-phone night doesn't claim points/crown | FIXED-IN-CODE | BLOCKED | `LocalCrownCelebration` says "winner" / "rounds won" |
| P14-02 | Practice vs Start look different | NOT VERIFIABLE | BLOCKED (visual) | Not in the spec |
| P14-03 | Bingo visible on Play in Trip Season | FIXED-IN-CODE | BLOCKED | Next drop shown sealed (`PlayHub.tsx:1090`) |
| P14-04 | Game Night Calendar | N/A | — | Not in `02-game-rules-spec.md`. At-home month calendar exists. Founder to confirm scope |
| P14-05 | Home button reads "Games on Flight"; Game Night Live stays present-and-vote | FIXED-IN-CODE | BLOCKED | |

## Pages 15–16: Passport

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P15-01 | Remove list (points bar, streak, 4 counters, Phases, Culture Stories) gone | FIXED-IN-CODE | BLOCKED | `PassportBook.tsx` sections: identity, stamps, postcards, trips, this trip, about me |
| P15-02 | Milestone says 10 countries | FIXED-IN-CODE; **DB test FAILS** | BLOCKED | `room-copy.ts:3` and migration `20261126100000`; the test `47_passport_junkie_badge` errors (**QA-B07**) |
| P15-03 | Badges: U.S. Explorer, Culture Collector, Storyteller | FIXED-IN-CODE | BLOCKED | `en.json:716-719` |
| P15-04 | Culture Stories "Bronze/Silver/Gold · coming soon" | FIXED-IN-CODE on Passport | BLOCKED | Still in the culture hub (`CultureExperiences.tsx:297`) (**QA-B05**) |
| P15-05 | Stamp opens trip overview (collage, answers, crowns, most excited for) | FIXED-IN-CODE | BLOCKED | `cbce966` |
| P15-06 | Role + most excited for up top, then about me, then journey | FIXED-IN-CODE | BLOCKED (visual) | |
| P16-01 | World map: pins, trips, crew, player Passport | FIXED-IN-CODE + DB test | BLOCKED | `48_world_map`, `world-map.test.ts` |

## Page 17: Design

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P17-01 | Seal-crack reveal | FIXED-IN-CODE | BLOCKED | `QuestProofs.tsx:108-127` `quest-wax-breaking` |
| P17-02 | Points pop | FIXED-IN-CODE | BLOCKED | `PlayHub.tsx:695` |
| P17-03 | Stamp landing | FIXED-IN-CODE | BLOCKED | `PassportBook.tsx:359`, `PassportProgress.tsx:93` |
| P17-04 | One illustrated look (no stock photos) | FIXED-IN-CODE | BLOCKED (visual) | `cbce966` |

## Page 18: Other findings

| ID | Requirement | Code / automated | Live E2E | Evidence |
|---|---|---|---|---|
| P18-01 | Photos kept 7 days, not 15 | FIXED-IN-CODE | BLOCKED | `en.json:986`; R-104 |
| P18-02 | Pre-Flight crown named Early Bird, not the prize name | FIXED-IN-CODE | BLOCKED | `Seasons.tsx:182, 278` |
| P18-03 | Wrapped "Final standings" arrow opens something | FIXED-IN-CODE | BLOCKED | `PlayHub.tsx:1219` toggles per-season places |
| P18-04 | Captain opening own invite link sees no "You're invited" | FIXED-IN-CODE | BLOCKED | `AppShell.tsx:323-333` |
| P18-05 | Host role in admin switcher | N/A (QA tool) | — | Test Lab only (`TestLab.tsx:456, 784`); R-401 "no host" applies to players |
| P18-06 | Stamp picker shows room icon for every trip | FIXED-IN-CODE + unit test | BLOCKED | `RoomMark.tsx` falls back to ✈️ |

## Page 19

Closing slide; nothing to test.
