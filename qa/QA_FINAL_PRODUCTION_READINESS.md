# QA final production readiness

Branch `fix/qa-audit`, 2026-11-26.

## Final status: **READY WITH KNOWN LIMITATIONS** (code), **not yet signed off for production**

Every automated release check passes on this branch, and no CRITICAL or HIGH bug is open. Production sign-off still needs the live pass, which hasn't run: the code isn't deployed to staging, and the test-account passwords aren't configured.

## Summary

| Metric | Result |
|---|---|
| Total reported issues (QA_BUG_REPORT) | 7 (QA-B01 to B07) |
| New issues found while fixing | 2 (QA-B08 CI inventory drift; QA-S01 security test gap) |
| Confirmed bugs | 6 (B01, B02, B03, B05, B07, B08) |
| Bugs fixed | 6 |
| Bugs verified (automated) | 5 verified + 1 fixed with the visual check pending (B05) |
| Still failing | 0 |
| Open requirement | 1 (QA-R01: solo "What kind of traveler are you?", PDF p.12; planned as a separate change on `main`) |
| Blocked | Live multiplayer (TC-MP-01…08), age/teen accounts, devices, staging logs |
| Not a bug | 4 report claims (Practice vs Start and the bell icon were already fixed; `write_journal` isn't a definer function; `CaptainBadge` is never rendered) |
| Needs product decision | 6 (B04, B06, hunt daily unlock, present-live bonus, Game Night Calendar, award tie rule Q7) |
| Security issues | 0 open; 1 hardening test added (S01) |
| Regression failures | 0 |

## Changes

| Area | Files |
|---|---|
| Captain Tools / setup | `src/features/captain-tools/CaptainTools.tsx`, `src/features/setup/wizard-model.ts` (+ test) |
| Seats | `src/features/trip/SeatCap.tsx`, migration `20261126120000_retire_extra_seats_addon.sql` |
| Sign-in | `src/features/auth/ContactLinks.tsx` (new), `AuthScreen.tsx`, `onboarding/CinematicSplash.tsx` |
| Culture hub | `src/features/culture/CultureExperiences.tsx` |
| DB tests | `47` fixed; `49_extra_seats_retired`, `50_definer_allowlist` new |
| E2E | `e2e/signed-out.spec.ts` (+2 tests) |
| Generated | `supabase/baseline/*`, `docs/inventory/*` (regenerated like CI), `eslint-suppressions.json` (pruned) |
| Repo hygiene | `.gitignore` ignores `.env.qa` (for the QA passwords) |

- **Database:** one function body changed (`public.unlock_extra_seats` refuses). Nothing dropped; no data touched.
- **API:** `unlock_extra_seats` now always raises. The app no longer calls it.
- **Security:** no grant widened. A new test pins the public SECURITY DEFINER list and confirms anonymous users can run none.

## Build and tests

Typecheck clean · `eslint . --quiet` exit 0 · Vitest 346/346 · pgTAP 50/50 (Docker, Postgres 16) · build OK · bundle secrets clean · mocked E2E 127/127 · PWA E2E 18/18. Details: [QA_REGRESSION_REPORT.md](QA_REGRESSION_REPORT.md).

## Production blockers (must clear before production)

1. **Merge and deploy to staging.** Batches 3–5 and this branch aren't on `main` or staging. Merge this branch as **one PR**: it holds batches 3–5. Separate PRs for batches 3 and 4 would likely fail CI's inventory check (batch 4 changed the source references behind QA-B08; not run separately), and the inventory is only regenerated here.
2. **Live two-account pass** on staging (TC-MP-01…08 and the P1 cases in [QA_TEST_CASES.md](QA_TEST_CASES.md)) with jay@ and kamal@. Needs `.env.qa` (see [QA_MULTIPLAYER_RETEST.md](QA_MULTIPLAYER_RETEST.md)).
3. **CI's generated-types step** must pass (`world_map` types were written by hand in batch 5).

## Known limitations (acceptable for release, documented)

- Real-device checks (offline in airplane mode, install, push) not run.
- CSP still report-only; 13 images still on Lovable's CDN (`docs/KNOWN_LIMITATIONS.md`).
- The six founder decisions above.
- QA-R01: the solo traveler question (R-351) still needs building; it needs stored traveler types for new trips.
