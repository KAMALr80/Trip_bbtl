# Round 17: Real Captain Experience

Keeps the Neon Night Out look, all existing data, and Siam Vibes' schedule and settings. Reuses existing components and database functions; no duplicated logic.

## What you'll see
1. **Game Day hub (Play tab):** one page for everyone during a game night: the current stage (Warm-up / Cards / Finale), the spin, votes, scores and a "Join call" button.
   - Host and Co-Captain also get run-the-night controls on the same page: spin, next player, add round, start finale, end voting, I'm here.
   - The Captain gets all of that plus a small "Manage" button. Nobody has to open Captain Tools during a game night.
2. **Inline editing on the Trip tab:** Captains get small pencil buttons on itinerary days and spots, excursions, vibe, Game Day start date, trip time zone and teams.
   - "Change game plan" is renamed "Game Day start date" everywhere and opens the same flow as today.
   - Captain Tools keeps only setup and settings: dates, invites and approval, costs, unlock and hand-off.
3. **Call panel:** opens from "Join call". It shows the call link, a copy button, 3 short join steps (iPhone FaceTime, other phones) and "Back to game". There is no in-app camera.
4. **Co-Captain = game partner (enforced on the server):**
   - **Can:** run game nights, back up the host, release trip-day games, and manage teams during a game night.
   - **Cannot:** approve 21+, or change dates, plan, vibe, time zone, costs, unlock or invites/approval. Also can't remove members or hand off Captain.
   - The Captain picks or replaces the Co-Captain from the member list.
5. **Captain takeover:**
   - "Step down" lets the Captain pick who takes over.
   - If the Captain hasn't opened the app for 14 days, the Co-Captain sees "Take over as Captain".
   - The old Captain can reclaim the role within 7 days.
   - Every role change is logged (who, when, why) for future admin support.
6. **Teams:**
   - The Captain chooses "I'll assign" or "Players pick".
   - Each team has a capacity: by default players divided by teams, rounded up, and the Captain can edit it.
   - In Players-pick mode, team cards show spots left and full teams are greyed out. The server locks the team while someone joins, so two people can't take the last spot.
   - Players can switch teams until the first game night starts. After that, only the Captain or Co-Captain can move people.
   - Late joiners automatically join the smallest team. Teams stay required at 13+ players.
7. **Test Lab:** new scenarios for Co-Captain limits, takeover (including the 14-day inactivity and 7-day reclaim), players-pick teams filling up, and viewing the Game Day hub as each role.

## Technical details
- **Migration:**
  - `profiles.last_seen_at`, updated by a `touch_last_seen` function on app open.
  - `trip_role_changes(trip_id, from_user, to_user, role, reason, actor, created_at)`: readable by trip leaders and the founder, written only by private functions.
  - `trips.team_mode ('assign'|'pick')`, `trip_teams.capacity`.
  - New functions: `pick_team` (locks the team row with `SELECT ... FOR UPDATE`, checks capacity, and allows changes only before the first night unless the caller is a leader), `set_co_captain`, `step_down`, `take_over_captain` (Captain inactive 14+ days), `reclaim_captain` (within 7 days).
  - Late-joiner auto-team goes into `apply_join_baseline`.
- **Captain-only audit:** split the leader check into `captain_of` (Captain only) and `leader_of` (Captain or Co-Captain).
  - Captain only: `approve_adult_player`, `edit_trip`, `apply_game_plan`/`apply_reschedule`/`confirm_game_nights`, `set_trip_vibe`, `set_trip_timezone`, cost functions, `unlock_trip`, invite/access/approval functions, `manage_trip_member` remove/pass_crown, and `set_trip_extras` dates.
  - Leaders: `night_flow_action`, turns, spin/draw, `release_trip_day`, and `save_teams` while a night is live.
  - Matching UI gating via `myRole`.
- **UI:**
  - New `GameDayHub` that composes the existing GameNights flow, HostNightActions and the Season leaderboard.
  - New `CallPanel` sheet.
  - New `InlineEdit` pencil wrapper used in TripOverview and Itinerary that opens the existing editors (ItineraryEditor, GamePlanPicker, TripVibeTools, TripTimezoneField, team editor).
  - `TeamPicker` cards.
  - CaptainTools sections trimmed and moved, not deleted.
- **Test Lab:** new `lab_extra` actions: `co_captain_try` (attempts every Captain-only call and reports which were refused), `captain_idle` (backdates `last_seen_at`), `bots_pick_teams`, and a role switch that opens Game Day.
- **Verification:**
  - Run SQL as a Co-Captain against every Captain-only function and expect each to be refused.
  - Run a concurrent last-spot `pick_team` and expect one success.
  - Run takeover and reclaim timing checks.
  - Confirm the build passes and compare Siam Vibes' rows before and after.
