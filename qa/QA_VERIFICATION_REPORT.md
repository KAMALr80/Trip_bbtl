# QA verification report: the 19 PDF pages

Branch `fix/qa-audit`, 2026-11-26. Every requirement of the *TripJunkies Staging Review* is listed with its category, what the code does, the fix and how it was tested. Row detail is in [QA_PAGE_WISE_CHECKLIST.md](QA_PAGE_WISE_CHECKLIST.md) (the audit, kept as the historical record) and [QA_MASTER_BUG_REGISTER.md](QA_MASTER_BUG_REGISTER.md).

**Verification level.** "Automated" means unit, DB or mocked browser tests on this branch. Nothing is verified on staging yet: staging runs the build from before batches 3–5, and the two test accounts' passwords aren't configured.

Categories: **Bug fixed** · **Already fixed** (earlier batches) · **Expected** (matches the deck) · **Design** (preference, done in code) · **Decision** (founder) · **Future** (planned later) · **Manual** (needs devices or live accounts).

| Page | Requirement | Category | Status / test |
|---|---|---|---|
| 1–2 | Overview, method | — | Nothing to fix |
| 3 | Sealed content hidden server-side; sign-out clears; no tracking; plain-text names | Expected | DB `04_sealed_quests`; code |
| 3 | RLS everywhere | Expected | 161/161 tables; DB `05`, `36`, `43`; new `50_definer_allowlist` |
| 3 | `captain_status` stale for one account | Already fixed (batch 1) | Empty states; live TC-MP-05 **Manual** |
| 3 | 9 console errors | Manual | Needs staging logs |
| 4 | Crew Check points, Live tie-break, secret votes, group sizes, one-phone host | Expected + Manual | DB `21`, `22`, `23`, `13`, `16`; live BLOCKED |
| 4 | Award tie rule | Decision | Q7 |
| 4 | Signup/age, teens, 21+, offline, install, photo AI | Expected + Manual | DB `02`; PWA 18/18; devices BLOCKED |
| 5 | Late start, long trip, At Home, Window Seat days, reminders, points reset | Expected | DB `14`, `19`, `20`, `24`, `25`, `18` |
| 5 | Former player, disabled account, photo points reversal, bad link, Showcase in Up Now, admin server gate | Already fixed | DB `41`, `44`, `31`, `33`; e2e |
| 5 | Test Lab bots, jump keeps itinerary, 404 on 2nd account | Already fixed (batch 2/3) | DB `45`, `46` |
| 6 | Search, Our Story back, Join with Code, Game Night door, try games signed out | Already fixed | e2e (new guest-games test) |
| 6 | Sign-in lists hello@, support@, safety@ | **Bug fixed (QA-B03)** | e2e `signed-out.spec.ts` |
| 6 | Board as one artwork, welcome letter, Connecting flights | Design | Code; staging visual pending |
| 7 | Score/place/phase agree; Live and Crew Check present; present live 10 pts | Expected / Already fixed | DB `18`, `35`; Vitest `final-standings` |
| 7 | Scavenger Hunt daily unlock; present live as a bonus | Decision | R-342, R-343 |
| 7–8 | Phase art behind score; countdown; crew at the gate; route | Design | Vitest `PlayHero`; staging visual pending |
| 9 | Itinerary empty on sandbox; 2 of 30 vs 2 of 12; Photo Wall report/hide | Already fixed | DB `46`; code |
| 9, 11 | "Add 6 seats" on a 12-seat crew | **Bug fixed (QA-B02)** | DB `49` |
| 10 | Role shown, custom role, Founder Tools, no Bronze Captain, bell icon | Already fixed | DB `29`; code |
| 11 | Co-Captain powers, Make Player, paywall copy, Baggage Claim name | Already fixed | DB `16` |
| 11 | Trip details refuses 1-day trips | **Bug fixed (QA-B01)** | Vitest `lengthProblem` |
| 11 | Big Group pricing copy (legacy) | Decision (QA-B06) | Payments dormant |
| 12 | 5 rooms, caps, crowning date, Pseudo-Accents, Inspire Someone | Already fixed | DB `13`, `17`; e2e `setup-wizard` |
| 12 | Solo setup asks "What kind of traveler are you?" | **Open (QA-R01)** | Batch 3 label reverted on `main` (`1edacc0`): the vibe isn't a traveler type; the real question (R-351) is planned as a separate change |
| 12 | Window Seat "Friends off the app" | Decision (QA-B04) | Deck conflict |
| 12, 15 | Travel-story hub labelled "Window Seat"; tier chips | **Bug fixed (QA-B05)** | Code; e2e suite |
| 13 | Missing games; tag mismatch | Already fixed (batch 4/5) | Code |
| 14 | Crown copy, Practice vs Start, Bingo on Play, Home naming | Already fixed | Code |
| 14 | Game Night Calendar | Decision | Not in the deck |
| 15 | Remove list, 10 countries, named badges, layout, stamp overview | Already fixed | DB `28`, `47` (now passing) |
| 15 | 10-country rule had no passing DB test | **Bug fixed (QA-B07)** | DB `47` 3/3 |
| 16 | World map | Already fixed (batch 5) | DB `48`; Vitest `world-map` |
| 17 | Animations; one illustrated style | Design / Already fixed | Code; staging visual pending |
| 18 | 7-day photos, Early Bird, Final standings, own invite link, Host label, stamp room icon | Already fixed | Vitest; code |
| 19 | Closing | — | — |
| CI | Inventory out of date would fail the schema check | **Bug fixed (QA-B08)** | Regenerated |

## Counts

| | Count |
|---|---|
| Requirement rows above | 37 |
| Bugs fixed in this pass | 5 from the reports (B01, B02, B03, B05, B07) + 1 new (B08) + 1 hardening (S01) |
| Already fixed earlier | 18 |
| Founder decisions | 6 (B04, B06, hunt unlock, present-live bonus, calendar, award ties) |
| Manual / BLOCKED (live accounts, devices, staging logs) | 5 groups |
