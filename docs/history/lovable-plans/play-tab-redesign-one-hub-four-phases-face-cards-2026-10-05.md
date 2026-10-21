# Play Tab Redesign — One Hub, Four Phases, Face Cards

## Scope and assumptions

- Redesign the existing Play tab only. Keep the shared app shell and its current five tabs: Home, Play, Trip, Squad, Me. The mockup’s four-item bottom bar is treated as visual reference, not a navigation change; Passport remains inside Me.
- Build one shared layout for Original and cinematic looks, with each look supplying its existing tokens and art treatment rather than maintaining separate Play trees.
- Reuse existing artwork only. No image generation, publishing, or writes to Siam Vibes (VRFQQM) or Bink.
- Daily Card, the named Trip Season games, and Trip Postcard remain honest `Soon` hooks where their backing feature is not implemented. No placeholder awards, fake progress, or invented content.
- Keep `game_board`, `finalize_season`, `spin_next_game`, and `draw_game_card` unchanged.

## What exists today

- Play is assembled from separate `PlayTop`, `CinematicPlay`, `PlayNights`, `TripDayGames`/`AtHomePlay`, and `PlayFooter` trees. This causes duplicate Game Night, leaderboard, phase, and preview sections and creates a long page.
- The current score strip already uses `season_points`, opens the player card from the avatar, and includes a phase/type breakdown.
- The current player card and read-only Passport are already built; the hub avatar can open the same card directly at its Passport view without adding another identity UI.
- Existing working feature surfaces include sealed quests and Showcase, Game Night/cabin, Airport Missions, proof review, Pre-Flight and Trip Season standings, Trip Wrapped, solo fare targets, offline one-phone play, and Window Seat/Travel From Home modes.
- Daily Card for online rooms is currently only `Coming soon`. Bingo/scavenger/speed concepts and Trip Postcard are queued separately.
- Existing reusable art includes `play-sealed-pass.webp`, `play-showcase-stage.webp`, `play-flight-screen.webp`, `security-check.jpg`, `how-game-nights.jpg`, `how-play-together.jpg`, `how-crowning.jpg`, destination/journey photography, and the current Window Seat/Travel From Home room placeholders. The relevant assets are large enough for crisp mobile bands.
- Existing motion primitives include ticket/card flips, stamp thunk, crown celebration, live/reminder glow tokens, light haptics, and reduced-motion fallbacks.

## Build plan

### 1. One Play hub

Create a single Play composition used by both looks and all room arrangements.

- Compact header: Trip name, destination/date range, and overlapping approved-member avatars. Every avatar opens the existing player card.
- Compact score card: my tappable avatar, raw phase points, current phase/day, place, and total approved players. Keep the existing expandable breakdown by games, sealed quests, Showcase, legacy items, and other phase points.
- Tapping my avatar opens the existing player card directly into its read-only Passport view.
- Add one four-segment cream boarding-pass rail: Pre-Flight, Takeoff, Trip Season, Wrapped. It shows current, completed, and locked states plus the relevant day/date/status copy. Completed segments receive the existing stamp treatment.
- Each rail segment opens its phase page. Locked phases open a read-only preview, not a dead control.
- “Up now” renders at most two applicable items in this order: unopened sealed quest; current implemented Daily Card or trip-day game; pending proof. If none apply, show “You’re all caught up” and the next known drop/start time.
- “Next up” shows only the next Game Night, regardless of whether it falls in Pre-Flight or Trip Season. Live state opens the existing Game Night flow.
- Keep the hub near one 390px viewport by removing every long-form activity, proof feed, lineup, leaderboard, Practice, and duplicate Game Night section from the hub.

### 2. Shared phase-page shell

Build an internal Play view state rather than new public routes, preserving the app’s all-in-one `/` shell and invite flow.

- Shared header: 44px “Back to Play” control, existing phase art band, phase/day label, phase title, and one-line tagline over a soft dark backdrop.
- Shared crown/goal area: group modes show top three plus the viewer, slim progress bars, tappable avatars, and “Full board.” Solo shows the existing server-calculated fare-class target instead of a crown race. Offline friends show local-only progress and never account standings. Window Seat and other non-scoring modes omit crown UI.
- Shared face-card primitive: left icon tile, title, one status line, points at right, and one status pill. Each entire row is a 44px-or-larger control opening an existing detail sheet/page.
- Maintain phase-page scroll positions per Trip and phase. Closing any detail returns to the same phase and scroll position.

### 3. Phase contents

**Pre-Flight**
- Pre-Flight crown board for group rooms.
- Face cards for Sealed Quests, the next video Game Night, Showcase, Mystery Game, and Daily Card.
- Mystery Game and Daily Card use truthful locked/`Soon` states when their later-round content is unavailable.

**Takeoff**
- Airport Missions summary opening the existing mission detail.
- Sealed travel-day quest when applicable.
- Games on Flight opening the existing free, offline-capable arcade.
- Captain-only departure confirmation using the existing `confirm_departure` action.
- Pre-Flight standings labeled as closing/closed on landing.
- Culture rooms use their no-flight language and never show flight/landing claims.

**Airport Missions detail**
- Restyle existing mission states into face cards: completed/pending, open, and sealed.
- Preserve current reveal order, points, layover rules, Captain/Co-Captain verification, no-self-approval, and server-side caps.
- Return to Takeoff at the saved scroll position.

**Trip Season**
- Show only currently implemented, applicable trip-day items.
- Existing trip-day experience opens from a compact “Today’s games” face card; queued Bingo/scavenger/speed summary cards remain `Soon` unless their actual backing data exists at build time.
- Photo challenge, sealed quest, and in-person Game Night appear only when existing data and room mode make them applicable.
- “Coming up” uses existing schedule/itinerary data only; no generated future content.
- Trip Season crown board uses the current protected Trip Season score read.

**Wrapped**
- Reuse actual season champions, final standings, Trip duration, approved-member count, and earned stamps.
- Run the crown shimmer/drop once for an already-awarded server result; never award or alter results in the UI.
- Trip Postcard remains a `Soon` face card/hook. Do not invent collage data or sharing.
- Preserve the existing 15-day trip-photo removal notice.

### 4. Mode-aware filtering

- Group trips: show crown races, Game Nights, leaderboards, applicable quests, and proof status.
- Solo: show fare-class target, personal progress, sealed quests, streak/stamps, and personal guide; hide crown races, group Game Night cabin, squad standings, and group proof review.
- Offline friends: show local-only roster, one-phone games, local Daily Card/quest, and Captain winner controls; never mix local names or wins into account scores, ranks, proofs, or leaderboards.
- Travel From Home: use the same hub/phase structure with existing lamp-lit room styling and no false flight language; group Game Night opens the existing home scene.
- Window Seat: use existing postcard/cabin styling and guide actions; hide unrelated crown/Game Night cards unless the room’s current contract enables them.
- Teens retain the existing Family-only content and proof privacy. This round changes presentation, not eligibility or visibility rules.

### 5. Motion and polish

- Reuse and consolidate existing animations into shared Play states: approximately 600ms wax-seal crack/card flip, floating point gain with score count-up, phase-complete stamp thunk, one-time Wrapped crown shimmer/drop, soft `New` pulse, and live Game Night glow.
- Use the existing quiet haptic for reveal and point acknowledgement where supported.
- Under reduced motion, replace transforms, pulses, count-up movement, and crown/drop motion with short fades and static state changes.
- Reuse semantic design tokens, glossy pills, glowing avatar rings, cream ticket styling, and existing photographic art. No emoji or clip-art in the redesigned Play surfaces.
- Verify all text, art crops, tap targets, and fixed navigation at 390px and 1440px in both looks.

## Old section → new home

| Current section | New location |
|---|---|
| `PhaseNotice` and cinematic phase tabs | Hub boarding-pass rail |
| `SeasonQuests` score strip | Hub score card and breakdown sheet |
| Current sealed quest card | Hub “Up now”; full state in Pre-Flight/Trip Season detail |
| Showcase ticket | Pre-Flight face card and detail |
| Repeated next/live Game Night blocks | Hub “Next up” plus the phase where that night occurs |
| Season lineup and Mystery Game | Pre-Flight face cards |
| Airport Missions long page | Takeoff face card → Airport Missions detail |
| Trip-day preview and long activity stack | Trip Season face cards → existing activity detail |
| Cinematic inline Wrapped teaser and separate Wrapped entry | One Wrapped phase page |
| Bottom leaderboard and duplicate cinematic leaderboard | Relevant phase crown board; full board sheet |
| Practice block | Opened from the applicable Game Night/Games on Flight detail, not the hub |
| Captain proof feed | Relevant quest detail/review sheet, never the hub |
| Trip pot | Remains on Trip; removed from Play composition |

## Backend and function changes

No table or scoring migration is expected for this layout round.

- Reuse `season_points(p_trip, p_season)` for raw points, category breakdown, and group place.
- Reuse `game_board(p_trip)` and `trip_season_score(p_trip)` only for their existing crown/Trip Season displays; do not modify them.
- Reuse `sealed_quest_state(p_trip)`, `sealed_proof_feed(p_trip)`, and `a2c_quest_insights(p_trip)` for quest states, points, proof status, and “the why.”
- Reuse `games_live(p_trip)`, member-scoped `game_nights`, `game_day_status(p_trip,p_date)`, `season_info(p_trip)`, and existing season-champion rows for live nights, phase cards, and Wrapped.
- Reuse `solo_action('state', ...)` for solo fare target, points, streak, stamps, and quests.
- Reuse `player_card_read(p_trip,p_user)` for avatar/player-card privacy; tapping the current user may open the already-returned Passport portion directly.
- Reuse `mission_action`, `sealed_quest_action`, and `confirm_departure` for existing writes; do not add a new write path.
- If implementation profiling shows the hub’s existing parallel reads cause visible loading churn, add one authenticated, read-only `play_hub(p_trip)` wrapper that checks approved membership before composing only these existing results. It will be `SECURITY DEFINER` with a pinned search path, revoked from `PUBLIC`/`anon`, granted to `authenticated`/`service_role`, and return no photo paths or private identity fields. This optimization is conditional; it will not replace or alter core game functions.
- Non-members continue to receive no Play data through existing membership checks and RLS. Captain/Co-Captain proof feeds remain leader-only; own quest state remains viewer-only.

## Verification after build

- Use new throwaway sandbox trips only; do not write to Siam Vibes or Bink.
- Capture 390px screenshots of Hub, Pre-Flight, Takeoff, Airport Missions detail, Trip Season, and Wrapped as both Captain and Player in both looks.
- Also verify 1440px layout in both looks, keeping phase content under roughly 1.5 mobile screens before a detail opens.
- Test current/done/locked rail states; exact phase dates; trip-local midnight and time-zone boundaries; culture no-flight wording; locked previews; empty “Up now”; two-card priority; pending proof; live Game Night glow; and back-scroll restoration.
- Test group, solo, offline-friends, Travel From Home, and Window Seat filtering; ensure solo has fare goal and no crown/cabin, and offline results remain local only.
- Test avatar → player card/Passport, score breakdown, all face-card destinations, Captain-only departure confirmation, proof privacy/no-self-approval, and non-member denial.
- Test reveal, point gain, phase completion, and Wrapped crown motion with normal and reduced-motion settings.
- Confirm no duplicate Game Night, leaderboard, or Wrapped sections remain; run TypeScript and preview build checks.
- Recheck protected-room snapshots before and after; no updates/deletes are planned.

## Estimate

- **Implementation:** 90–145 build credits.
- **Backend:** 0–12 build credits, only if the optional read-only hub aggregator is needed after profiling.
- **Verification and screenshots:** 25–40 build credits.
- **Total:** **115–197 build credits**.
- **Image credits:** **0**.
