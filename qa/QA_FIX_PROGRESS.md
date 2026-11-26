# QA fix progress

Working branch: `fix/qa-audit` (from `fix/review-batch-5` @ `d8c9a2e`). Updated 2026-11-26.

## Last completed

- Last bug: QA-B05 (then QA-S01 hardening). Last test run: full regression (all green).

## Status

| Bug | Status |
|---|---|
| QA-B07 | VERIFIED (pgTAP 47 3/3) |
| QA-B01 | VERIFIED (Vitest) |
| QA-B02 | VERIFIED (pgTAP 49 5/5) |
| QA-B03 | VERIFIED (e2e) |
| QA-B05 | FIXED, visual check on staging pending |
| QA-B08 | VERIFIED (inventory regenerated) |
| QA-S01 | VERIFIED (pgTAP 50 2/2) |
| QA-B04, QA-B06 | NEEDS PRODUCT DECISION |

## Files changed

`src/features/captain-tools/CaptainTools.tsx`, `src/features/setup/wizard-model.ts` (+test), `src/features/trip/SeatCap.tsx`, `src/features/auth/ContactLinks.tsx` (new), `src/features/auth/AuthScreen.tsx`, `src/features/onboarding/CinematicSplash.tsx`, `src/features/culture/CultureExperiences.tsx`, `supabase/migrations/20261126120000_retire_extra_seats_addon.sql`, `supabase/tests/database/47,49,50`, `e2e/signed-out.spec.ts`, `supabase/baseline/*`, `docs/inventory/*`, `eslint-suppressions.json`, `.gitignore`, `qa/*`.

## Tests executed (all on this branch)

Typecheck clean · eslint --quiet 0 · Vitest 346/346 · pgTAP 50/50 · build OK · bundle clean · mocked E2E 127/127 · PWA 18/18.

## Blocked

- Live multiplayer (TC-MP-01…08) with jay@ and kamal@: needs `.env.qa` with the two passwords, and this code deployed to staging.
- Devices (offline, install, push); staging logs for the 9 console errors.

## Exact next task

1. User: merge `fix/qa-audit` as one PR into `main` (after CI is green, including generated types) and deploy to staging.
2. User: create `.env.qa` (`QA_ACCOUNT_1_PASSWORD`, `QA_ACCOUNT_2_PASSWORD`).
3. Then: write and run the live two-account pass (TC-MP-01…08) against staging, update QA_MULTIPLAYER_RETEST.md and QA_FINAL_PRODUCTION_READINESS.md.
