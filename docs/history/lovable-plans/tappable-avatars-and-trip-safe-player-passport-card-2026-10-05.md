# Tappable avatars and trip-safe Player Passport card

**Plan only.** No code, migration, data, image, or publishing changes in this step. A2e is already live; this round remains a separate unpublished draft. Preserve both Original and Cinematic looks. Siam Vibes (`VRFQQM`) and Bink remain read-only.

## What exists today

- A shared avatar renderer and a single `PlayerCardView` sheet already exist. The card currently shows the avatar, game name, role, stamps, badges, and up to three Facts with **See full**.
- The Squad member list and its Pre-Flight/Trip Season boards already open that sheet. The current user's large Squad avatar does not.
- Current avatar renderers and behavior:
  - `HomeDashboard`: the Current Trip stack is inert as individual portraits because the enclosing row opens Trip. Any Home squad row uses the same passive `Avatar` renderer.
  - `SquadView`: other-player rows open the card; the current player's large portrait is inert. `Leaderboard` and `TripSeasonBoard` already support the existing `onMember` opening callback, including the Cinematic podium.
  - `PlayFooter`: the raw-point leaderboard/score strip portraits are inert. `CinematicPlay` renders `Leaderboard` without `onMember`, so its podium and rows are also inert.
  - `GameNightCabin`: its embedded `PlayFooter` is inert; `GameNights` passes crew portraits into `GameScene`, where they are presentation-only.
  - `CaptainTools`: member portraits are inert; related host/calendar, score-sheet, Co-Captain/team, and proof-review member portraits will be audited and wired wherever they represent an approved member.
- The current card receives a full `trip_player_cards` row loaded with `select("*")`. Its trip-member policy protects the row from outsiders, but it does not redact teen Facts. Teen privacy therefore needs a server-shaped response, not a display-only condition.
- `game_board`, `trip_season_score`, and `season_points` already provide authoritative trip standings. `junkie_rank` already permits the subject or a person sharing an approved trip. Passport stamps, rank rows, and existing postcard stickers otherwise have owner-only table policies, so another member's Passport cannot safely reuse the current owner-only `PassportBook` queries.
- Existing `postcard_stickers` are personal At Home collectibles. The separately planned **Trip Postcards** feature does not exist and will not be invented in this round.

## Build

### 1. One reusable, accessible avatar trigger

- Keep one player-card sheet mounted at the app shell and pass the existing `onMember(userId)` callback into every requested surface.
- Make each member portrait a real 44px-minimum button with the label **“Open [game name]'s player card”**, keyboard focus, Enter/Space support, and the existing tap feedback.
- Wire:
  - Home current-trip avatar stack and any Home squad row;
  - the current user's large Squad avatar, Squad member rows, both standings, podiums, champions, and team avatar rows;
  - Play score strip, Pre-Flight and Trip Season leaderboards, and the Game Night cabin's crew/leaderboard portraits;
  - Captain Tools member rows and member/host pickers where an avatar represents a trip member.
- Do not make public creator portraits, invitation previews, sample/mockup avatars, photo authors, or avatar-picker thumbnails open a private player card. They are not authenticated shared-room member surfaces.
- Restructure Home's current-trip row so the trip link and avatar buttons are siblings; do not nest buttons or replace the existing trip navigation.

### 2. Privacy-first server reads

Add one authenticated, read-only public wrapper, **`player_card_read(p_trip, p_user)`**, backed by a private `SECURITY DEFINER` function with pinned `search_path`; revoke `PUBLIC`/`anon` and grant only `authenticated`/`service_role`. It returns the complete card payload, including the read-only Passport summary. Keeping this as one response prevents separate calls from applying different privacy rules.

**`player_card_read(p_trip, p_user)` checks and return contract**

- Requires `auth.uid()` to be an **approved** member of `p_trip` and requires `p_user` to be an approved member of that same trip, using `trip_private.is_trip_member(p_trip, …)` for each person. Group experiences are represented by their linked Trip membership, so the same check covers shared Explore a Culture, Show Your Culture, and Window Seat rooms; Solo has no second person to open. A missing/invalid relationship returns no row, so a non-member gets nothing and cannot test whether an unrelated profile exists.
- Determines teen status server-side from the private DOB source through `trip_private.age_of`; no birthday or age value is returned.
- Returns only safe identity fields: game name and avatar metadata, plus this trip's authoritative points and placement. Role is returned only for adults.
- For adults, returns the six existing optional Facts fields; the UI shows the first three and **See full**. For teens, the server returns no Facts and no role/place/Passport payload—only game name, avatar, and this trip's points. The server decides this before constructing the response.
- Points and `#N of M` are calculated in the same server read from the board applicable to that room/phase (`season_points`, `game_board`, or `trip_season_score`), without changing any scoring function or trusting a client-provided score/place.

- For a non-teen, the same response returns only Passport-safe aggregates: stamp collection/count, crown count, Junkie Rank, and eligible badges. It never returns email, real name, pronouns, birthday/age, private profile fields, Photo wall/proof images, or raw private storage paths.
- Stamp data comes from the private Passport calculation, crowns from `season_champions`, rank from the existing `trip_private.junkie_rank` calculation, and badges from their existing guarded calculations. Direct owner-only table policies remain unchanged and are not widened.
- The response includes a typed `trip_postcards` slot, but returns it as unavailable with no rows. The card displays **“Trip Postcards · Coming in a later round”**. Ty's queued Trip Postcards round can populate that slot without redesigning this card or weakening access.

**Supporting existing protections**

- `trip_members`: its approved-member SELECT policy continues to provide role and membership context.
- `trip_player_cards`: its shared-trip policy remains, but shared list loading will request only the identity/avatar fields needed to render member lists; Facts move behind `player_card_read` so teen facts are not loaded into general squad UI state.
- `player_profiles`, `passport_stamps`, `postcard_stickers`, `junkie_ranks`, `culture_stamps`, `culture_layer_stamps`, and `account_consents`: keep their owner-only policies. The new guarded reads expose only approved aggregate fields; no broad member SELECT policy is added.
- `season_champions`: retain its current trip-member SELECT policy.
- Avatar storage: retain the existing shared-trip avatar SELECT policy. Only the chosen profile avatar is shown; no proof, Photo wall, or other private photo is queried.

### 3. Player card and read-only Passport presentation

- Replace the existing general-purpose card payload with the new server response when a portrait is tapped. Show loading, unavailable, and access-denied states without leaking whether an unrelated account exists.
- Adult card order: avatar + game name; role; **[points] points · #N of M in this trip**; Passport Junkie summary; Trip Postcards placeholder row; Facts top three + **See full**; **View full Passport**.
- Teen card: avatar, game name, and this trip's points only. Omit role, place, Facts, Passport summary, badges, and full-Passport action.
- **View full Passport** opens a read-only in-app Passport view for that member, visually reusing the existing cream paper, slightly angled stamps, and gold details. It has no edit controls, home-country prompt, private profile text, or trip navigation that exposes rooms the viewer does not share.
- Use existing avatar assets at their native 2x quality. Generate no images. Keep both looks themed through the same semantic tokens and card structure.
- Remove emoji/clip-art decoration from this card and its new portrait controls; use the existing Passport typography, CSS stamp shapes, and approved icon set only.

## Verification

- Confirm every requested portrait opens the correct member, while Home's trip title still opens the Trip page.
- Test adult cards as Captain, Co-Captain, and Player: role, authoritative points, exact `#N of M`, top three Facts, **See full**, Passport summary, and read-only full Passport.
- Test a teen subject from an adult viewer and another teen viewer: network response and rendered card contain only game name, avatar, and this trip's points.
- Attempt both reads as a signed-in non-member and with an unrelated target UUID; both return no data and reveal no profile existence. Confirm email, birthday, raw age, proof/photo-wall images, and raw storage paths never appear in response data or rendered text.
- Check tied scores use a stable placement rule matching the visible board, and empty Passport/badge/Facts states remain clear.
- Test Home, Squad, Play, Game Night cabin, and Captain Tools with keyboard and touch in both looks; verify 44px targets, focus order, sheet close/back behavior, and no nested interactive controls.
- Capture six 390px screenshots: card opened from Home, Squad, and Play in Original and Cinematic. Also inspect the same flows at 1440px for clipping and dialog width.
- Run the focused tests and confirm a clean preview build. No protected-room writes are needed; use read-only checks on Siam Vibes and test data elsewhere only if interaction coverage requires it.

## Credit estimate

- **Implementation and database security:** 22–34 credits
- **Surface wiring and both-look styling:** 12–20 credits
- **Privacy, accessibility, responsive tests, and six screenshots:** 10–16 credits
- **Estimated total:** **44–70 credits**
- **Image credits:** **0**
