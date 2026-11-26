# QA UI retest

Method: source review, mocked Playwright on the build (iPhone 13 profile), and screenshots of Home, Play, the arcade and the world map taken from the mocked app during batch 5 and checked by eye. **No staging screenshots**: staging runs the older build.

## Fixed in this pass

| ID | PDF | Item | Change | Check |
|---|---|---|---|---|
| QA-B03 | 6 | Sign-in lists hello@, support@, safety@ | `ContactLinks` on sign-in and splash | e2e `signed-out.spec.ts` |
| QA-B02 | 9, 11 | Members sheet "Add 6 seats" | Offer removed | e2e suite; code |
| QA-B05 | 12, 15 | Travel-story hub says "Window Seat"; empty tier chips | "Travel stories"; chips removed | e2e suite; visual check on staging pending |
| QA-B01 | 11 | Trip details error for 1-day trips | Room's own length and message | Vitest |

## Audit rows that were already fixed

| PDF | Item | Where |
|---|---|---|
| 10 | Notification toggle as a small icon | Bell button in the Me header (`TabContent.tsx:431`) |
| 14 | Practice vs Start a Game Night look different | Start is the main button with a hint; Practice is a dashed toggle (`GameArcade.tsx`) |

## Design items (code done, visual check on staging pending)

Home board as one piece of art; welcome letter by the greeting; Connecting flights; Play hero (phase art, countdown, crew at the gate, route); one illustrated style; Passport order; seal-crack, points pop, stamp landing; world map. Screenshots from the mocked app were reviewed in batch 5. Two layout issues found then were fixed: the map hint contrast, and zoom buttons covering a pin.

## Responsive and accessibility

| Check | Result |
|---|---|
| Mocked `responsive.spec.ts`, `a11y.spec.ts`, `shell-navigation.spec.ts` | In the full mocked run (see [QA_REGRESSION_REPORT.md](QA_REGRESSION_REPORT.md)) |
| Real notched phones, safe areas, tablets | BLOCKED: needs devices |
