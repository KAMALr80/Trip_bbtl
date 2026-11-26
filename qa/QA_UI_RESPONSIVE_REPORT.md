# QA UI and responsive report

**Method:** source review of each UI item in the PDF, plus the mocked Playwright suites (`e2e/responsive.spec.ts`, `e2e/a11y.spec.ts`, `e2e/shell-navigation.spec.ts`; iPhone 13 profile) run against the production build. Results are in [QA_API_TEST_REPORT.md](QA_API_TEST_REPORT.md). **Visual comparison with the Game Flow deck needs eyes on staging and is BLOCKED.** No screenshots of staging were taken.

Visual mismatches are listed separately from functional bugs, as the prompt asked.

## Design items from the PDF

| PDF | Item | Code status | Visual check |
|---|---|---|---|
| 6 | Departures board as one piece of art, varied backgrounds | 4 illustrated scenes, one per day (`HomeDashboard.tsx`) | BLOCKED |
| 6 | Welcome letter near the greeting; "More ways to play" → "Connecting flights", no repeats | Done (`cbce966`) | BLOCKED |
| 7–8 | Destination/phase art behind score and phase strip; countdown; crew at the gate; route | `PlayHero.tsx` | BLOCKED |
| 10 | Notification toggle as a small icon | Not confirmed in code | BLOCKED |
| 11 | "Baggage Claim" everywhere | Done (`PlayHub.tsx:115`) | BLOCKED |
| 12 | "Inspire Someone" identity | Opens Show Your Culture; the culture hub still says "Window Seat" (**QA-B05**) | BLOCKED |
| 14 | Practice vs Start a Game Night look alike | Unchanged; design call | BLOCKED |
| 15 | Passport order: role, most excited for, about me, then journey/badges | Restructured (`PassportBook.tsx`) | BLOCKED |
| 17 | One illustrated style (no stock photos) | Last stock photos replaced (`cbce966`) | BLOCKED |
| 17 | Seal-crack, points pop, stamp landing | Wired: `QuestProofs.tsx:108`, `PlayHub.tsx:695`, `PassportBook.tsx:359` | BLOCKED |

## Responsive and layout

| Check | Status | Evidence |
|---|---|---|
| Phone column centred on desktop | Mocked E2E | `responsive.spec.ts` |
| Trip screen at 360 px | Fixed earlier (B-35) | `docs/audit` |
| Tap targets ≥ 44 px | Code uses `min-h-11` on primary actions | Spot-checked; full audit BLOCKED |
| Contrast | Mocked E2E helper `e2e/support/contrast.ts` | |
| Accessibility labels | `a11y.spec.ts`; stamps, rooms and Passport sections have `aria-label`s | |
| Safe areas / horizontal overflow on real notched phones | BLOCKED | Needs a device |

## Visual mismatches (not functional bugs)

- **QA-B05** (culture hub naming, empty tier chips) is both a naming and a visual issue.
- Members sheet offers "Add 6 seats" on a 12-seat trip (**QA-B02**): visual noise as well as a functional gap.
