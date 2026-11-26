# QA bug fix log

Branch `fix/qa-audit`, 2026-11-26. One entry per fix. Logs are in [evidence/logs](evidence/logs).

## QA-B07: pgTAP 47 permission denied

- **Root cause:** the test called `public.junkie_rank` as a signed-in user. That wrapper is `service_role` only since the least-privilege pass (`43_least_privilege`). The app reads the badge through `trip_private` functions, never through the public wrapper.
- **Changed:** `supabase/tests/database/47_passport_junkie_badge.test.sql`.
- **Fix:** the test calls `trip_private.junkie_rank` (granted to `authenticated`). No grant was widened.
- **Test:** `scripts/db/test.sh …/47_passport_junkie_badge.test.sql` in `postgres:16-bookworm`.
- **Result:** fails before (`permission denied for function junkie_rank`), passes after (3 assertions). Full suite 50/50.
- **Status:** VERIFIED (automated).

## QA-B01: Captain Tools rejects 1-day trips

- **Root cause:** `save()` in Captain Tools checked a hard-coded 2–30 days. Rooms allow 1–14 (trip, Window Seat) and 1–7 (at home).
- **Changed:** `src/features/setup/wizard-model.ts` (new `lengthProblem`), `src/features/captain-tools/CaptainTools.tsx`, `src/features/setup/wizard-model.test.ts`.
- **Fix:** one rule for setup and Captain Tools: `lengthProblem(roomOf(trip.room), start, end)`, with setup's message "This room runs {min} to {max} days." The server's room-rules trigger is unchanged and still refuses anything outside the room.
- **Test:** Vitest: a 1-day trip and a 1-day Game Night pass; 14 days passes and 15 fails for a trip; 7 passes and 8 fails at home; reversed or missing dates flagged.
- **Result:** pass (wizard-model 14/14).
- **Status:** VERIFIED (automated). Live: rename a 1-day trip as Captain and Co-Captain (TC-CT-03).

## QA-B02: "Add 6 seats" did nothing

- **Root cause:** `trip_private.seat_cap` returns the room's `maxCrew` (12; Window Seat 4) and never reads `trips.extra_seats`. `unlock_extra_seats` still set the flag, wrote a `seat_addon` order and made `trip_cost` add the add-on price. `extra_seats` is on the deck's retire list (`dev-docs/04-data-model.md`); 13–24 is the later-phase Event Group.
- **Changed:** `src/features/trip/SeatCap.tsx`; `supabase/migrations/20261126120000_retire_extra_seats_addon.sql`; `supabase/tests/database/49_extra_seats_retired.test.sql`; regenerated snapshot and inventory.
- **Fix:** the members sheet no longer offers seats; `unlock_extra_seats` keeps the Captain check and then refuses ("This crew already has every seat its room allows. Bigger groups come in a later update."). Trips that already set the flag keep it.
- **Test:** pgTAP 49: cap is 12; a player gets "Only the Captain"; the Captain gets the new message; the flag stays false; no order row.
- **Result:** 5/5.
- **Status:** VERIFIED (automated).

## QA-B03: sign-in lists only support@

- **Root cause:** batch 2 added hello@, support@ and safety@ to the welcome splash. The founder meant the sign-in screen (`AuthScreen`), which still listed only support@.
- **Changed:** new `src/features/auth/ContactLinks.tsx`; `AuthScreen.tsx` and `CinematicSplash.tsx` use it; `e2e/signed-out.spec.ts`.
- **Fix:** one shared contact list on both screens.
- **Test:** e2e: the sign-in screen has the three `mailto:` links; plus a guest "Try Games on Flight" check.
- **Result:** `signed-out.spec.ts` 10/10.
- **Status:** VERIFIED (automated).

## QA-B05: travel-story hub labelled "Window Seat"; empty tier chips

- **Root cause:** older A2e naming; the tier chips were a placeholder for a feature never built.
- **Changed:** `src/features/culture/CultureExperiences.tsx`.
- **Fix:** the travel track (reached from Trip → "Share this trip · inspire someone") reads "Travel stories"; its button reads "Share your travel story"; the Bronze/Silver/Gold "coming soon" chips are gone, as on the Passport (R-715).
- **Test:** typecheck, lint, full mocked e2e.
- **Status:** FIXED. Visual check on staging pending.

## QA-B08: inventory out of date

- **Root cause:** inventory rows record which source files reference each object. Batches 4–5 changed those references, and the earlier inventory edits were made by hand.
- **Changed:** `docs/inventory/db-inventory.md`, `docs/inventory/db-inventory.tsv`, `supabase/baseline/*` (regenerated).
- **Fix:** ran `REPLAY_HOOK='python3 scripts/db/inventory.py' scripts/db/replay-migrations.sh` in `postgres:16-bookworm` (Postgres 16, as on the CI runner).
- **Result:** the snapshot itself had no drift; the inventory drift is fixed.
- **Status:** VERIFIED (re-running the generator gives no diff).

## QA-S01: SECURITY DEFINER allowlist

- **Changed:** new `supabase/tests/database/50_definer_allowlist.test.sql`.
- **Fix:** pins the 7 reviewed public SECURITY DEFINER functions open to signed-in users, and asserts that anonymous visitors can run none.
- **Result:** 2/2. (The first run showed the audit's list was wrong about `write_journal`.)
- **Status:** VERIFIED.

## Lint gate

`npx eslint . --quiet` (the CI lint step) exited 2 because some suppressions no longer matched after these edits. Pruned with `--prune-suppressions`; exit 0.
