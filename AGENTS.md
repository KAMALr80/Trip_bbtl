# Architecture rules (from the Lovable build rounds)

These are the database and app rules the code was built against. They still describe the current
code; the target design and the rules from the founder deck are in [`dev-docs/`](dev-docs/README.md).
When a rule here conflicts with the deck spec ([`dev-docs/02-game-rules-spec.md`](dev-docs/02-game-rules-spec.md)),
the deck wins and this list is updated. More rules: `src/AGENTS.md`, `src/components/AGENTS.md`,
`supabase/AGENTS.md`. Index: [`docs/decisions/`](docs/decisions/README.md).

- Season prizes are read only through season_info (hidden until crowning); champions are locked in server-side by finalize_season so they can't be forged.
- Photo wall unions existing game-photo tables via trip_photos; Captain deletes hide photos via photo_removed rather than deleting game rows.

- The app shell is the pathless `_shell` layout route: tabs are URLs (`/home`, `/me`; `/` is Home; Home · Play · Trip · Me per Q6, crew list inside Trip) and sub-screens are search params (`src/features/app-shell/nav.ts`). Play and Trip name the trip (`/t/$tripId/play`, `/t/$tripId/trip`); plain `/play` and `/trip` open the current trip. Sign-in, onboarding and invites still start at `/`, and invite links return there.
- There is one visual look (M1-03): the former Cinematic look. No look switch, no `useLook`, no Original branches.
- `profiles` holds only per-user presentation state; trips/roles live in `trips`/`trip_members` for member-scoped access.
- All privileged trip mutations (roles, spins, draws, hosts, scores, trip games) go through identity-checked private DB functions behind invoker wrappers; RLS denies direct writes so results can't be forged.
- Player cards are trip-scoped via player_card_read; photos are signed and saved avatar seeds still resolve.
- AI calls (names, itinerary, cards, trip games) run in authenticated server functions with the key server-side; uploads are processed in memory only.
- Games/catalog seed data stay immutable; shared Play uses one component tree and member-scoped state.
- Hide ballots and trivia answers from other players; reveal counts only on reveal or the next day.
- Trip motto/call links use leader-checked `set_trip_extras`; signed-in invite previews use `trip_invite_preview`. Role tips live in `profiles.seen_tips`.

- Keep travel notes with itinerary days and derive Travel tags on save; preserve incomplete flight lines.
- Sync profile pronouns to trip cards without exposing profiles publicly.
- Assign the next unplayed game through the private spin function, including before week one.
- Birthdays stay private to owner/Captain; server-check age and Captain approval for 21+ content.
- Game-night turns and alternatives use private functions and member-scoped reads.
- Call `spendAiQuota` (`use_ai_quota`) before AI calls to enforce access and daily limits.

- Captain-only setup (dates, plan, vibe, time zone, costs, unlock, invites/approval, members, hand-off) checks trip_private.is_captain; game-night actions use is_leader; Co-Captain team edits only while a night is live; every role change is logged in trip_role_changes so support can trace them.
- Display viewer time zone (`profiles.time_zone`) with trip zone second; server rules ignore viewer zone.

- Preserve invite codes across auth (24h); pin Join room on Home and call `join_trip` only on tap.
- Season scores use game_board/scoreOf: clamp(round(100×stamps/max) − penalties,0,100); raw stamps stay internal. season_scoring=false excludes trips from external competitive boards, crowns and Captain badges; At Home/Travel From Home and Window Seat still earn separate server-calculated Junkie Rank points, never the Passport Junkie 👑 badge (5 international real-trip stamps).
- At Home branches on trips.kind; sing-off winners are per activity, and TripSectionIcon reserves flags for places. Reuse member-scoped Trip pot components and feature gate across trip types so cost display cannot fork payment rules.
- Trip deletion uses Captain auth, logged DB cascade and scoped storage cleanup so members receive a notice.
- Travel From Home and Window Seat cards belong to a trip with creator/Team up writes and emoji reactions; Culture Quest keeps answer keys and scoring in identity-checked private functions, grants full stories and culture stamps only after completion, and keeps unrevealed content hidden on all reads and writes.
- Keep A2e room presentation exclusive in the shared UI: Window Seat uses the bright cabin/postcard system, while Travel From Home uses the lamp-lit living-room/recipe-card system; Solo never enters Game Night cabin.
- Home mockups stay read-only; live Home defaults Trips first, with Classic switchable per profile.

- Account consent and Founding Member eligibility use identity-checked private functions, while public legal pages stay readable without sign-in; this keeps legal history and badges private.
- There are no trip levels or per-trip feature switches (M1-10, 09_no_preview_levels.test.sql): every trip gets the same features, and unfinished ones are hidden with environment flags (`src/lib/flags.ts`).
- Age tiers (13+ self sign-up; 13–17 join a trip only with Captain approval — via the join code on a2c trips, or a guardian-confirmed teen invite — and in one trip at a time; Captains 21+; under-21 joins pending; see supabase/tests/database/02_age_gates.test.sql. The deck's target, 18+ self sign-up and teen invites only, is M6-03) are enforced in trip_private functions/triggers (guard_auth_signup_age, set_teen_dob, join_trip, manage_trip_member, inspiration_age_gate), so the client can't bypass them.
- Play uses shared flight cards and raw-point footer; a2c rooms enter the full-screen live cabin and show Home/Play reminders and .ics exports. Legacy Play remains unchanged; no scoring fork.
- Use season_rule to opt new Trips and At Home rooms into short-season timing; preserve legacy schedules and quest behavior so existing rooms are not retroactively changed.
- Window Seat prep is creator-checked; A2c quest templates use filtered tags/insights and minor proof excludes squad; legacy stays unchanged.
- A2e uses a2e_kind/a2e_room opt-in; group rooms share with approved members, solo quests stay private, and Showcase guests only vote, so old rooms and scores stay isolated.
- Archived trips (`trips.rules_version = 1`, set only by app admins via `archive_legacy_trips` / `set_trip_archived`, logged) are read-only for players: every public table with a `trip_id` has a `<table>_archive_guard` trigger calling `trip_private.guard_archived_trip()`. Give new trip tables the same trigger (08_archive_mode.test.sql fails otherwise). The client shows `ArchivedTrip` for them.
