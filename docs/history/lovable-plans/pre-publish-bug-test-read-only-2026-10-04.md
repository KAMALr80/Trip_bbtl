# Pre-publish bug test (read-only)

This only checks and reports. No code edits, database changes, data changes or publishing.

## Checks (each gets PASS / FAIL / CAN'T VERIFY plus evidence)

1. **Build**: run the typecheck, then read the build, runtime and console logs for recent errors.
2. **Beta gate**: read the signup guard, `redeem_beta_code`, the `beta_codes` table (uses allowed vs used for the 10 "first testers" codes) and the private-beta screen logic in `index.tsx`. Confirm the check runs in the database or server, and that existing `beta_access` rows and approved Siam Vibes members get through.
3. **Trip join and approval**: read `join_trip` and `approve_member`, plus the RLS policies on trip tables, to confirm pending members can read nothing. Query Siam Vibes `require_approval`. It is currently OFF, which may conflict with what you expect; I will report it and change nothing.
4. **Game picker**: read the `pg_proc` source of `pick_night_game` and `surprise_night_game`, then re-run the signature sweep for `is_leader`, `is_captain`, `is_trip_member`, `trip_open` and `require_feature` across every function and policy. Report the mismatch count.
5. **AI caps**: list every server function that calls the AI gateway and the line where each checks the gate (`use_ai_quota`, `spend_ai_credits`, `mix_ai_quota` or `appAiAllowed`). Query the current settings and today's `ai_usage` count.
6. **Security**: run the security scan and the database linter. Query for tables with RLS on but no policies, tables with RLS off, and SECURITY DEFINER functions that anon can execute.
7. **Siam Vibes**: query dates, destination, night count, and members with their roles.
8. **New tester on a phone**: use Playwright at 390px on public routes (sign-in, Games on Flight, legal, `/beta/X`, `/join/X`), plus signed-in tabs if a session can be created. Look for 404s, broken images, console errors and dead buttons. Any screens I cannot reach signed in get marked CAN'T VERIFY.

## Output

One report in chat, ending with a one-line verdict: SAFE TO PUBLISH for a ~5-friend private beta, or NOT SAFE with the items that block it.
