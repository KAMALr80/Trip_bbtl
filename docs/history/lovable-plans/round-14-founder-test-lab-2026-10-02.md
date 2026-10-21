# Round 14: Founder Test Lab

A founder-only lab under Me > Test Lab that builds practice trips with bot players. It uses the real screens and the same server rules as real trips. Siam Vibes and every other real trip stay untouched.

## How it works for you
- **Me > Test Lab 🧪** only appears for tymekasmith23@gmail.com. The server also refuses every Test Lab action from any other account, so hiding the button isn't the only protection.
- **Create sandbox trip:** pick group size (4 / 10 / 15 / 25), trip length (3 / 7 / 21 days) and pre-trip window (1 / 10 / 45 / 84 days). It builds a trip with bot players who have names and the real Street/Crew/Hero avatars, plus a sample itinerary with flights, so travel days get skipped. 15 and 25 players get the required teams, a separate room for each team, and the Big Group lock (still locked at 25 until you unlock it). The trip starts locked so you can try the unlock screen. Setup can also start from the real 3-step Captain setup.
- **Open sandbox:** switches the app into the sandbox trip with a striped "🧪 SANDBOX" banner, using the real Home, Play, Trip, Squad and Me screens.
- **Role switcher:** Captain, Host (makes you host of the next night), Regular player, Late joiner (removes you and rejoins you after night 1, so the average-stamps rule kicks in). Your role really changes inside the sandbox only.
- **Bot buttons:** answer Question of the Week, vote (normal or force a tie), take turns, accept or decline your host swap, use a skip pass, no-show as host, tap "I paid", a bot joins late, submit feedback.
- **Time travel:** Before kickoff, Kickoff night, Build-up night, Takeoff Night (crowning), each trip day (bingo, challenges, rest day, travel day, Surprise mode), End trip, Feedback form, Trip Wrapped. This shifts the sandbox trip's dates and game nights around "now", so the real screens show that moment. It does not change the real clock.
- **Photos:** uploads go to a separate sandbox folder and are deleted with the sandbox.
- **Reset** (rebuild with the same presets) and **Delete sandbox** (removes all its data and photos).
- **Screen checklist:** a list of every screen and state, each with a tap-to-open link. Some links time travel first; there are tick boxes saved on your phone.

## Isolation
- Sandbox trips carry a hidden `is_sandbox` flag and only the founder and bots are members, so other users can never see them.
- Founder feedback stats, My Passport, Captain badges and unlocked-trip counts leave sandbox trips out.
- Bots are real accounts created by the server with no way to sign in, tagged as bots, and removed on delete.

## Technical details
- Migration: `trips.is_sandbox boolean default false`; `sandbox_bots(user_id, trip_id)`; private `trip_private.lab_as(p_trip, p_bot, ...)` functions run the existing identity-checked functions with the bot's identity (`set_config('request.jwt.claims', ..., true)`). They are allowed only when `is_app_admin()` is true and the trip is a sandbox. Time travel runs `lab_shift(p_trip, p_target)`, which moves start_date/end_date/game_start/game_nights/weekly_questions by a fixed offset and sets ended_at for End trip and later targets. Delete cascades through every trip table.
- Exclusions: add `and not is_sandbox` to the feedback admin view, `my_passport`, `my_unlocked_trips` and trip lists for non-founders. RLS already scopes to members.
- Server functions in `src/lib/lab.functions.ts` (requireSupabaseAuth + founder check, admin client loaded inside handlers only to create or delete bot accounts and sandbox storage files under `sandbox/<trip>/`).
- UI: `src/components/TestLab.tsx` (lab, presets, roles, bots, time travel, reset/delete) and `src/components/ScreenChecklist.tsx`, opened from Me. Sandbox banner in the main layout.
- Verification: create each preset through SQL as the founder and check the night counts, teams, Big Group, travel days and every time-travel target. Check that a non-founder is refused. Run Delete and confirm nothing is left. Check that Siam Vibes' rows are byte-identical before and after.
