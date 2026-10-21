- [x] Build trip creation and invitation joining with sign-in return path.
- [x] Show active trip countdown, squad roster, trip switching and sharing.
- [x] Add Captain Tools for details, roles, removals and invite reset.
- [ ] Verify trip security and browser flows; authenticated end-to-end checks require a signed-up account.
- [x] Rename and recolor the app as Stampd with travel-stamp styling.
- [x] Add trip-scoped player cards, private avatars, and Squad profile sheets.
- [ ] Verify player card and Squad flows with an authenticated account; no signed-up user exists yet.

- [x] Rename Stampd to TripJunkie across the app and install icon.
- [x] Add the About story under Me with a founder photo placeholder.
- [x] Add AI trip-name suggestions using destination, dates and trip type.
- [x] Add Captain itinerary upload/paste extraction and editable review, quick form and skip option.
- [x] Show the trip-day timeline to members with stays, flights, spots, local today and map links.
- [ ] Verify authenticated itinerary save and viewing with a signed-in account; no account exists yet.
- [x] Build Captain time vote, availability results, confirmation, weekly schedule, calendar download, and rotating hosts.
- [x] Build synchronized 12-game wheel, week-one choice, spin permissions, used-game reset, and game details.
- [x] Build seeded shared card deck, synchronized draw, and trip-tailored AI card generation.
- [ ] Verify game-night votes, live shared play, and calendar with signed-in members; no account exists yet.
- [x] Build anonymous live votes with hidden results, reveal, confetti and history.
- [x] Build Game Season scoring sheets, stamp values, score out of 100, leaderboard and stamp animation.
- [ ] Verify live votes and scoring with signed-in members; no account exists yet.

## Prompt 7 – Trip games (Trip Season)
- [x] Today's Games on Play during trip dates (bingo, quests, trivia, secret missions, photo challenge, Day MVP, airport missions)
- [x] Daily stamp caps (30 / 10 travel) and Trip Season score + Home leaderboard
- [x] Captain editing, Local AI squares, pre-trip preview
- [ ] Verify with two signed-in members on a live trip day

## Email code verification
- [x] 6-digit "Check your email" screen with auto-advance, resend (60s) and friendly errors
- [ ] Turn verification on — waiting on an email domain so the code can go in the sign-up email

## Prompt 8 – Seasons, prizes, teams, photo wall, Wrapped
- [x] Separate Game/Trip Season boards (Home active season, Squad both) and locked-in champions
- [x] Captain prize settings per season, hidden Mystery Prize cards with countdown, full-screen crowning reveal
- [x] Champion crown badges + Passport Junkie for most total stamps
- [x] Optional teams (random/manual, names, colors) with team scoreboard
- [x] Photo wall with reactions, reports, Captain delete, full-screen view
- [x] Trip Wrapped story slides with Save image; Captain preview
- [ ] Verify with signed-in members (no accounts available to test)

## Prompt 8B
- [x] Skip passes (3 per season, server-enforced): card redraw, quest/bingo swap, new mission, host re-spin; tickets in Squad
- [x] End trip (Captain, last day to +1 day; auto-close +48h); read-only enforced on the server
- [x] Photo wall: download all (zip) and collage
- [x] New About page
- [ ] Verify with signed-in members (no test account available)

## Final A
- [x] Trip motto + AI suggestions
- [x] Call links + Join the call + Android help
- [x] Host card
- [x] One-time role tips
- [x] Vote pop-up + End voting

## Final B
- [x] Invite decision screen before joining, with trip and Captain details
- [x] Neon Night Out dark-default reskin; light appearance remains selectable
- [x] Public sign-in screen checked at phone size with no page errors; user will test Home, Play and Squad signed in

## Approved Neon Night Out mockups
- [x] Match the approved four-screen visual system across every app screen
- [x] Verify the public flow and main screen shells at 390px

## Founder and Explore
- [x] Save founder overlook and headshot as app assets; show them on About and sign-in
- [x] Add public introduction and quick FAQ below sign-in
- [x] Add Explore choices after sign-in and keep About, Help, and intro accessible from Me
- [x] Verify sign-in cards, headshot, FAQ expansion, and no overflow or page errors at 390px
- [ ] Verify signed-in Explore and About in browser — blocked until the owner signs in; no matching account is available for this check

## Welcome night illustration
- [x] Replace the pastel welcome illustration with a neon night scene (friends, suitcases with stamps, glowing skyline)
- [x] Add floating plane, camera and passport-stamp icons with a slow float that stops under reduce-motion
- [x] Compress the illustration to ~113 KB and confirm the build is clean; signed-in check blocked on owner sign-in

## Live-testing fixes — round 2
- [x] Link stays and spots to Maps; preserve travel-line notes and tags, including saved Siam Vibes days.
- [x] Show friendly trip dates and make pre-week-one spins assign the earliest unassigned upcoming week or explain why not.
- [x] Restore Passport, bug report and account deletion in Me; let leaders vote on game-night times.
- [x] Use six join-code tiles, optional pronouns on player cards, and the supplied About story.
- [ ] Verify signed-in trip flows in browser — blocked: the requesting owner has no matching test session available here; sign in to the preview to check these screens.

## Round 2, part 2
- [x] Six-card swipeable first-sign-up tour and replay from Me.
- [x] Private birthday, Captain-only 21+ controls, approved-adult sip-or-skip day activities and personal/group alternatives.
- [x] Shared game-night rounds with host-configured order and cards/person, live turn spotlight.
- [x] Replace sign-in picture and welcome art; update About bio.
- [x] Public sign-in at 390px: art loads, no page errors or horizontal overflow.
- [ ] Signed-in tour, Captain settings, day activities and host rounds at 390px: owner preview session unavailable; requester's email did not match an app account. Verify with an owner session in preview.

## Round 3 — before first live game night
- [x] Show the next scheduled night on Play instead of the unconfirmed-time message.
- [x] Format flight dates for people, not as stored dates.
- [x] Add remembered Trip accordions and a short upcoming itinerary with a full-plan view.
- [x] Update Siam Vibes stays and travel dates without touching its spots or notes.
- [x] Check public phone-width rendering at 390px: no page errors or horizontal overflow; latest automatic build is clean.
- [ ] Check signed-in Play and Trip interactions at 390px — blocked until an owner preview session is available.

## Round 4
- [x] Add read-only Captain player view, practice trip-day games, and pre-trip member teaser.
- [x] Add remembered accordions to Play, Captain Tools, Me and About.
- [x] Audit saving, syncing and trip access; basic security scan is clear.
- [ ] Verify two-account live sync and signed-in Round 4 controls — blocked until an owner preview session is available.

## Round 5 — login and onboarding
- [x] Put login above signup without replacing the founder, FAQ or art.
- [x] Show an optional Explore tour card on Home until completion or dismissal; keep replay in Me.
- [x] Preserve invite code through authentication and open the joined trip with player-card setup.
- [ ] Verify a real signup/login invite and player-card flow with an owner account — blocked until an owner preview session is available.

## Round 6 — game-night flow
- [x] Preserve the confirmed Sunday schedule and Week 1 game while adding a shared Warm-up → Cards → Finale flow.
- [x] Add six-game no-repeat featured pool, Captain reroll/lock/reveal, and host controls.
- [x] Connect rounds, card skips, anonymous finale votes, stamps and leaderboard reveal.
- [ ] Verify authenticated night flow with two accounts — blocked until an owner preview session is available.

## Round 7 — Explore tour
- [x] Replace emoji/circle slides with six display-only phone previews using existing app art, avatar styling, player badges and vote card.
- [x] Keep swipe, arrows, dots, Skip and Got it; retain entry points from Home and Me.
- [x] Automatic build clean and public preview responds; signed-in visual tour needs owner preview session.

## Round 7B — Explore tour, lighter
- [x] Make every tour card strictly look-only (pointer-events disabled inside the phone frame).
- [x] Swap the Wrapped card for a simple Captain Tools peek; fold a "Trip Wrapped" hint into Trip day.
- [ ] Verify signed-in tour rendering at 390px — blocked until an owner preview session is available.

## Round 8 – Question of the Week
- [x] Pool, weekly drop, Captain swap/write, answer card, warm-up reveal, stamps, Wrapped slide, RLS
- [ ] Two-account signed-in check (needs a preview login)

## Round 9 – Captain Tools
- [x] Release today's games, checklist, nudges, hand off, skipped nights, place address + booking link
- [ ] Signed-in two-account check (needs a preview login)

## Round 10 Trip costs
- [x] Cost items, shares, I paid, confirm, reminders
- [ ] Signed-in two-account check (no test login)

## Round 11 Feedback + late-joiner splits
- [x] Feedback form, founder view, Wrapped messages, even resplit on join
- [ ] Signed-in check (no test login)

## Round 12A — QOTW voting, late joiners, crowning
- [x] Anonymous read → vote (no self-votes) → name reveal; winner +2; tie-break wheel; Wrapped uses voted winner
- [x] Late joiners start at group average stamps + "Joined Week X" tag
- [x] Crowning reveal: Takeoff Night (default, live) / Departure morning 8 AM; prize note
- [ ] Two-account signed-in check (blocked: no test login)

## Round 12B
- [x] Season scaling, schedule recalculation, skip pass scaling
- [x] Game days (rest, every-other, surprise)
- [x] Group size tiers, team rooms, Big Group unlock, round scaling
- [x] Late-joiner rules
- [ ] Signed-in two-account check (blocked: no test login)
- [x] Round 12C: plan picker, 3-step setup, season arc, tones, room turns, bonus questions

## Round 13: Host swaps
- [ ] Host can swap hosting week with another member (they accept)
- [ ] Host can use a skip pass to skip hosting (no penalty)
- [ ] Host no-show (not here, no swap/pass, night not skipped) = -5 stamps

## Round 14 Founder Test Lab
- [x] Sandbox presets, roles, bots, time travel, reset/delete, screen checklist
- [ ] Signed-in click-through (no test login available)

## Round 16 — visual polish
- [x] Refine game action motion, selective haptics, and big-win effects without changing rules.
- [x] Polish navigation, loading, existing empty states, accordions, crowning, and Wrapped.
- [x] Check public beta entrance at phone and desktop widths; Test Lab checklist labels updated. Signed-in action screens require a requesting-user account.

## Round 20B — display name
- [x] Show TripJunkies in visible app copy, share text, metadata, PWA name and downloadable artwork without changing stored data or internal identifiers.
- [x] Verify the renamed public entrance, invite redirect and installed-app name in the preview.

## Round 21 — At Home experiences
- [x] Trip type, 3 destination packs, plan templates, viewer-morning release, questions/votes/reveal, mark winner, MVP, postcards
- [x] Shared beta checkout + server orders for At Home and real-trip unlocks; returning $1 and Captain $2 code (no stacking)
- [x] Test Lab At Home presets + bots answer/vote
- [ ] Signed-in click-through (no test login used)
- [ ] AI pack expansion (packs are seeded only for now)

## Round 22 — Passport collection
- [x] Earn real-trip country ink stamps or U.S. state road-trip stamps after closure; use existing At Home postcards and exclude sandbox trips.
- [x] Allow travelers to set their home country and Captains to correct the trip's passport destination.
- [x] Show Traveler, Explorer, and Passport Junkie levels independently from Captain badges and game scores.
- [x] Organize My Passport into country, state, and postcard pages with detail sheets and a reduced-motion-safe Wrapped stamp reveal.
- [ ] Verify signed-in trip endings, home-country classification, team detail and multi-member passport/level flows.

## Round 23 — Bug triage
- [x] Founder Reports inbox, status, issues, AI suggest, reporter notes, check-ins, open summary
- [ ] Signed-in check of founder inbox and check-in card
- [x] Round 23B Trip pot (categories, estimates, leader management, group pot, my share, undo+notes, pay note, log)
- [ ] Verify Trip pot signed in (report → confirm → undo note)

## Round 23C — Discover and Home bubbles
- [x] Bubble Home with trip countdown, passport, join, At Home and Explore destinations; existing invite join and tour reused.
- [x] Show closed-night timing and keep game controls out of the pre-night view.
- [ ] Verify signed-in Home, invite, Explore and Game Day at phone size (requesting account has no app login yet).

## Round 23D — Game night calendar
- [x] Replace weekly hosts list with Trip and Game Day calendar cards, list/month and Upcoming/Past views, viewer-zone timing and night status.
- [x] Reuse host swap/pass actions and Captain night controls; per-night ICS and call panel; At Home stays on its own schedule.
- [ ] Verify signed-in calendar actions and phone-size layout; no signed-in test account available.

## Fix C2
- [x] Bug 0 passport crash
- [x] Play anything now + Jump to + View as (sandbox)
- [x] Shuffle teams, challenge labels, At Home packs, Passport USA/Places, Sing-off, host timer
- [ ] Signed-in UI check (needs a preview sign-in)

## Round D — finish requested flows
- [x] At Home Sing-off result; Captain deletion with storage and member note
- [x] Welcome wording/editor, one auth screen/reset, Join room from code
- [x] Home and Explore, Game Day wheel, Me/Captain section tiles
- [x] Wire approved eight Home icons with reduced-motion-safe feedback
- [x] Check public welcome and login at 390px/1280px, typecheck, and confirm Siam Vibes settings unchanged
- [ ] Verify authenticated Round D flows with two members; blocked until a test sign-in is available
- [x] Round E: tester preview level (trip levels, feature switches, library slice, PREVIEW limits, change log)
- [x] Round F: Journey map for real trips and At Home, opened from Home and Trip, using existing stops, results, photos and PREVIEW feature switches.
- [ ] Verify Journey map with signed-in members in FULL and PREVIEW trips; preview sign-in unavailable.

## Round H
- [x] Normalize visible TripJunkies wording, add Home sign-off, At Home label, Game Rooms sample preview, founder subtitle, Me appearance shortcut.
- [x] Add squad-only Travel From Home and Window Seat cards with private uploads, moderation log, Preview switch and credit-limited AI guide.
- [x] Add Home/My Trips and Me/Your trips contextual delete-or-leave sheets using existing Captain deletion.
- [ ] Verify Round H signed-in flows with the requesting user's account; preview session unavailable until they sign in.

## Round I — Culture Quest and Home
- [x] Move Home people below actions, enlarge sign-off and label orbit tiles for 360/390px.
- [x] Connect Culture Quest to Inspiration, Passport stamps, Culture Points, creator badges and player cards; retire Duo voting UI.
- [ ] Visually verify signed-in Home at 360/390px and quest flow; needs an authorized preview session.

## Round J — first game night
- [x] Make warm-up, wheel, cards and finale vote an inline Game Day flow.
- [x] Correct Journey origin/time and polish Inspiration, tiles, flags, Home sign-off, email, preview art and page metadata.
- [ ] Check Captain and player sandbox flows on both phone sizes; blocked until an authorized preview session is available.

## Round L — Games 2.0
- [x] Share one BrandLockup, add seeded talk/do/show prompts, night moments, reactions, skip replacements, showdown, and next-week theme/host reveal.
- [x] Separate Pre-Flight and Touchdown presentation; add phase overview and Explore slide.
- [x] Add optional scavenger photos, two-member verification, and Captain-reviewed challenges with member-scoped access.
- [x] Add local Arcade demos, sample-night rehearsal entry points, and 24 premade traveler portraits.
- [x] Check the public welcome at 360px, 390px, and desktop for overflow and browser errors; confirm Siam Vibes schedule and settings unchanged.
- [ ] Verify Captain and regular-player live nights, proof review, Home orbit, and Arcade on both phone widths; blocked until an authorized preview session is available.

## Round O
- [x] Polish welcome plane/image, About story, Home orbit/header and Arcade icon.
- [x] Lock email-signup birthdays and 21+ Game Room requests; remove unapproved adult sample note; add underage report category.
- [ ] Automatically email safety on underage reports; currently only the stored report and manual safety mail link exist (needs delivery integration).
- [x] Add AI Mix with quota/credits and sample-only gameplay.
- [ ] Finish comprehensive dead-tap and long-list audit across all signed-in screens (needs authorized preview sign-in); Squad standings, key member/room/Inspiration lists, and brand lockup updated.
- [x] Verify public login appearance at 360/390/430/1280, reduced-motion plane, and Siam Vibes unchanged.
- [ ] Verify authenticated Home orbit and all Round O flows (preview account unavailable; requesting user has no matching account).

## Round Q — flight flow and access audit
- [x] Welcome lockup, Home orbit badge, Game Rooms headline, founder icon options.
- [x] Boarding departures-board demos and shared flight journey presentation.
- [x] Preview/At Home and quest preview access fixes; copy and error cleanups.
- [ ] Verify phone layouts, database access, Siam Vibes and signed-in Test Lab checks where possible.

## Round R
- [x] 1-10 done (type check + build clean); signed-in checks still need a preview sign-in

## Final Boarding… tile
- [x] Set tile A as the saved choice and default, use it on Home, Boarding… and Explore, and simplify founder icon options.

## Round S — signed-out welcome
- [x] Center welcome content, keep one brand phrase, simplify email login modes, and move Founding Member note below Explore.
- [x] Verify signed-out and invited login/sign-up layouts at 360px and 390px (also 430px/desktop), no horizontal overflow or browser errors; automatic build clean. No trip data changed.

## Round T — one signed-out first screen
- [x] Show the email/Google welcome immediately; preserve invite-only sign-up and signed-in waiting screen.
- [x] Center the brand name and tagline independently of the animated plane.
- [x] Check 360px, 390px, 430px and desktop, including invite-only email mode and reduced motion; no overflow or browser errors. Preview build clean; Siam Vibes unchanged. Manual type/build commands deferred to automatic validation.

## Round U — cinematic photos and portraits
- [x] Regenerate all 24 traveler portraits in place; retain generic avatar choices.
- [x] Add subtle reduced-motion-safe cinematic photo treatment to existing welcome, At Home, Explore, and Inspiration images.
- [x] Check public welcome at 360/390px and desktop with no overflow/errors; reduced motion removes drift. Preview build clean. Signed-in photo screens unavailable without a matching preview account; Siam Vibes untouched.

## Round V — Travel buddies
- [x] Add 24 original cartoon buddy portraits without touching the 24 Travelers or generic options.
- [x] Show both portrait sets in the shared player-card picker; retain existing saved choices and server rules.
- [ ] Verify signed-in picker at phone widths when an authorized preview account is available.

## Round W — avatar choices and Explore tour
- [x] Add six original animal buddies as seeds 49–54, preserve every earlier seed and file; curate 18 animals and six people in the shared picker.
- [x] Verify all 13 Explore slides at 360/390px and desktop: no overflow, shifting controls, or content under mock navigation; automatic preview build OK; no trip data changed.
- [ ] Verify the saved avatar picker in a signed-in account — blocked until an authorized preview account is available.

## Round Z — small polish
- [x] Remove special Home Passport/My trips avatar headers; keep shared player display elsewhere.
- [x] Show a straight Founding Member pill on Me; preserve real passport stamps.
- [x] Show At Home 1–6 at $2.99 and 7–12 at $4.99; beta $0 unchanged.
- [x] Limit new/changed game names to 15; preserve unchanged existing names.

## Round A — Games alignment and Find It
- [x] Document game types/lenses and label game tiles, boarding passes and lineups in both looks.
- [x] Add identity-checked host game picks and all-unplayed Surprise me; keep assigned nights untouched.
- [x] Share and enforce AI content rules plus a server-side unsafe-phrase filter across generators.
- [x] Repair named content and seed destination-tailored night/Find It pools without changing referenced IDs.
- [x] Link Early Check-In presentation to live-night flow; presentation is informational, never an approval gate.
- [x] Find It kinds on every non-travel trip day, one kind per day slot, city-filled, no repeats.
- [x] Replace template-swap type pools with 24 varied cards each.
- [ ] Signed-in Test Lab checks; blocked by unavailable founder preview session.

## Round 16
- [x] Travel From Home and Window Seat cinematic art, page ordering and shared place entry across forms and browse views; preserve Original and trip data.
- [ ] Check authenticated Travel From Home and Window Seat, At Home, Game Rooms, and trip creation when an authorized preview account is available. Founder session approval was unavailable in this run; do not claim these flows were clicked.

## Round B — crisp presentation
- [x] Permit game picking on revealed but unassigned nights, without changing assigned nights or trip data.
- [x] Refresh cinematic Play, Games on Flight, Home sign-off, Journey, Passport, calendar, and shared Facts sheet; retain Original presentation branches.
- [x] Resize artwork sources, remove unreferenced image files, and check the signed-out flight walkthrough at 390px and 430px.
- [ ] Check signed-in Home, Play, Trip, Passport, Squad Facts, and the Original appearance with an authorized preview session; founder sign-in is unavailable here.

## Round 17 — Private beta lockdown
- [x] Beta codes, /beta/<CODE>, private beta screen, waitlist, Control Tower door
- [x] Reset code, Lock joining, Max squad size
- [x] Pending-join notices (Home, Squad, Manage badge)
- [x] Waiting-member privacy
- [ ] Signed-in click-through (needs founder sign-in)
- [x] Round 19: Custom game plan night count (p_count) — sandbox run needs founder sign-in

- [x] Round 21: split Travel From Home and Window Seat entrances and keep culture experiences and quests on their existing data flows; shared room copy and distinct window art. Authenticated end-to-end verification still needs a signed-in preview account.
- [x] Round 22: Window Seat cabin styling in both looks, first-visit per-account intro, shared art and tile crop; no gameplay or server changes.
- [ ] Verify Round 22 signed-in Home/Window Seat at phone and desktop sizes, including intro persistence and day cards; blocked until the requesting account can sign into the preview.
- [x] Round 23: show the full Window Seat photo without an outer oval, extend the cabin wall to the page edges, update the overview line, scope culture badges to their room, and crop only the Home icon to the window. No gameplay or data changes.
- [ ] Capture Round 23 signed-in 390px and 1440px Home, room, intro, and form/day screenshots in both looks; blocked because preview sign-in is unavailable. Do not substitute public splash screenshots.
- [x] Round 24: Travel From Home title and square samples, shared themed experience paper for both rooms, Save notice, and light-wall wordmark contrast; visual-only.
- [ ] Capture Round 24 signed-in screenshots for both looks at 390px and 1440px; blocked because founder sign-in is unavailable and session minting is prohibited for this request.
- [x] Round 25: restore full-photo square sample tiles, category and place labels, and readable gradient in both looks; visual-only.
- [ ] Capture Round 25 signed-in Travel From Home sample-tile screenshots in both looks at 390px and 1440px; blocked if founder sign-in is unavailable. Do not mint a founder session or substitute public screens.

## Round 26 — Delete trip confirmation: type DELETE
- [x] trip_private.delete_trip accepts exact trip name OR "DELETE" (case-insensitive, trimmed); Captain check, notice, log, cascade unchanged
- [x] Captain Tools + trip options sheet: exact wording, button disabled until DELETE; server function guard accepts both
- [x] Typecheck + build OK; Siam Vibes verified untouched (12 nights, Bangkok + Phuket, VRFQQM)
- [ ] Sandbox end-to-end delete test — blocked: founder sign-in unavailable (no session minting allowed)

- [x] Round 27: Cancel/Leave trip in trip page, Captain Tools, trip-list menus; bottom bar always visible; 4 test trips removed by join code.

## Round 28 — Sample play previews
- [x] Sample-only day plans, Culture Quest and Game Night inside the shared room paper; both culture sides use the same two-tab card and guide/Save notice.
- [x] Travel From Home overview copy updated; no real experience or backend changes.
- [ ] Capture both sample tabs on both culture sides at 390px and 1440px in both looks — blocked while founder preview sign-in is unavailable; do not mint a session or substitute public pages.

## Round 29 — Quick vote placement
- [x] Show vote sheet and pill on Play only; show a small in-flow Play notice on other tabs only while a vote is open.
- [ ] Check open/no-vote player and host screens at 390px in both looks — blocked until an authorized preview sign-in is available; do not mint the founder session.

## Round 30 — First screen, after Wrapped, shared phases
- [x] Account-scoped first-run choices and a repeatable Home link were implemented here; the automatic popup is superseded by the on-demand letter in the Round 30 change below. The nav remains visible and trip creation keeps the existing 21+ restriction.
- [x] Wrapped links to existing trip and At Home flows; “Share your Wrapped” uses the existing image-save action to produce a shareable PNG, without a new sharing backend.
- [x] At Home phase chips and explanatory copy use Pre-Flight · Takeoff · Trip Season · Wrapped. Takeoff retains its distinct Home Missions / Airport Missions page titles.
- [x] Automatic typecheck/build passed after correcting the optional Wrapped callback type error, without changing its behavior.
- [ ] Capture signed-in 390px welcome and Wrapped screenshots in both looks — blocked while preview auth is signed out; no founder session minted or public screenshot substituted.

## Round 30 check — Welcome link and phone captures
- [x] Move the repeatable welcome link below the Home greeting, clear of the header, in both looks with a 44px tap target.
- [ ] Capture signed-in 390px welcome, Wrapped actions and both real-trip/At Home Play chips — blocked while founder preview sign-in is unavailable; no session minting or public-page substitutes.

## Round 30 change — Welcome letter
- [x] Replace automatic first-run popup with an on-demand illustrated welcome page; show the letter in Home's center when shared game-night timing finds no next night.
- [x] Keep the Home link and existing actions; add Window Seat choice and preserve the Captain age gate without changing profile tips.
- [x] Make Wrapped's backdrop solid and its action controls readable in both looks; leave navigation and trip data unchanged.
- [x] Automatic typecheck/build reported build OK after edits; Ty will take phone and desktop screenshots herself.

## Round 30 welcome page update
- [x] Rename Explore a Culture and add exact sublines; four 2×2 glossy rounded cards with Fredoka labels and readable body copy.
- [x] Replace Inspire Someone art with a visible street and overlook; export all five welcome assets at 2× display size as WebP.
- [x] Add sign-in-style secondary links: Home and the shared Our Story view; preserve all four destinations, age guidance, the Home letter, and fixed navigation.
- [x] Code paths and automatic typecheck/build checked; Ty will review 390px screenshots before publishing.

## Round 31 — trimmed
- [x] Replace Test Lab's yes/no Delete sandbox confirmation with typed DELETE, retaining the existing founder-only deletion path; no server changes.
- [x] Straighten and center both “Collect the moments” lines in Our Story, removing the adjacent decorative mark; preserve other art and copy.
- [x] Check automatic typecheck/build and report file by file; do not publish or touch Siam Vibes.

## Round 31B — Welcome visuals
- [x] Label the shared Our Story back button Home when entered through Welcome Aboard, retaining Me for Me entry.
- [x] Replace Inspire Someone's rectangular scene with a transparent 320×320 WebP cut-out traveler and street vignette.
- [x] Check automatic typecheck/build; Ty reviews screenshots, nothing published.

## Round A — Season Points Structure
- [x] Add server-enforced nightly quests, legacy claim preservation, separate Carry-On +5, and At Home local scoring. Pre-Flight quests have a minimum of one point each; combined awards are capped at min(12, max(10, number of nights)).
- [x] Add shared Play score/quest panels in both looks and a live-night presentation step before next week's spin.
- [ ] Complete authenticated, multi-identity security probes and screenshot review before publishing. Siam Vibes settings and existing rows must remain unchanged.

### Round A — finish (Oct 5)
- [x] Play top order via PlayTop (score strip, quest, night status + order card, Daily Card slot, live-only Games)
- [x] Server gate: games_live + draw_game_card live check; spin quest-step gate only when a quest is pending (old app safe)
- [x] Sandbox security probes a–f pass; g partial (Carry-On +5 untested — no meet-up set)
- [ ] Ty screenshot review; full Practice/leaderboard reorder inside CinematicPlay; reschedule via apply_reschedule probe

## Round A2a — Sealed Quests, Showcase, raw points (server)
- [x] sealed_quests table (function-only access), server-timed drops (final 2 weeks for long seasons), open/submit/decline/approve, Showcase 20, +5 speed
- [x] Raw season_points read (preflight / trip / home); live game_board/finalize_season untouched until the publish migration
- [x] quest-proofs private bucket (photo only) + upload/read rules; minimal test card + leader Quest proof feed in PlayTop
- [x] Sandbox probes (waiting member, other trip, hidden text, self-review, double count, expired upload, storage access) all pass
- [ ] Publish-time migration: switch game_board/finalize_season to season_points (wait for Ty)
- [ ] Trip Season challenge +5 speed bonus (needs reveal/finish timestamps on trip-day games) — not built yet
- [x] A2b shared flight Play cards, raw-score strip, quest proof, stage art, and Bink preview cleanup (not published)
- [ ] A2b signed-in sandbox state walkthrough in both looks and widths — blocked: requesting account cannot be minted for preview
- [ ] A2c season lengths, last-minute, age layers, content (separate round)

## Round A2c — Parts 1–3
- [x] New-rule timing for Trips and At Home, Quick Start and Jump straight in; read-only Siam ten-day preview. Do not publish.
- [ ] Probe fresh sandbox timing across 2/5/10 days, Quick Start, Jump straight in and At Home formats — blocked until an authorized preview sign-in is available. Read-only existing-room and Bink-claim comparisons completed; signed-in visual review remains blocked too.
- [x] Part 2: new-room tagged quests, insight text on cards, and minor-aware proof access.
- [ ] Part 2 signed-in sandbox probes — blocked until an authorized preview session is available.
- [x] Part 2 top-up: 30 tagged templates per active context and server-side least-recently-used new-angle fallback.
- [x] Part 3: new-room live cabin embeds night flow, At Home and proof feed; old lower Game Day is hidden for a2c; Home/Play reminder dots and downloadable UTC .ics events.
- [ ] Part 3 signed-in cabin and 390px/desktop walkthrough — blocked without an authorized preview session. Five-stop polish remains for review.
- [ ] Part 4 awaits Ty's review; do not publish.

## A2c Part 4 — done (not published)
- [x] Age layers: 13–17 self sign-up, teen "Join with code" gate, one trip, pending until Captain approval, has_minors Family-only (server), At Home creation 21+, teen Team-up partners
- [x] Trip Season +5 speed bonus (trip_private.trip_speed_finishes → season_points)
- [ ] Signed-in sandbox probes — blocked: no preview sign-in session available
- [ ] Terms/Privacy still say teens need an invite — needs Ty's OK to update before publish

## A2d — done (not published)
- [x] Who's playing? Solo · With others (Explore a Culture / Show your culture / Window Seat)
- [x] Solo traveler types + vibe, solo_guide quests on trip days, guide Showcase, fare class, streak, stamps, personal best, Junkie Rank bonus
- [x] Terms/Privacy teen wording updated (Ty approved)
- [ ] Solo destination stamp on the Passport page itself (shown in solo screen + Junkie Rank for now)
- [ ] Signed-in walkthrough — blocked: no preview sign-in session

## A2e — room-specific culture play (not published)
- [x] Window Seat Solo by default, optional With others; Explore a Culture group-only; Show your culture Solo or With others, with culture layers and series stamps.
- [x] New-room setup, long-trip batch planning, daily solo quests/prep, layered group nights, Captain/code flow, and guest-only Showcase invites, reactions, votes and presentation bonus.
- [x] Existing rooms left unmarked; shared group experiences now appear to approved squad members, while solo quest fallback stays minor-safe.
- [ ] Signed-in 390px/1440px walkthrough in both looks and multi-account guest/score isolation — blocked: no authorized preview session for the requesting account. Ty can sign in to the preview for review.
- [ ] Approved custom A2e art and icon set — blocked pending Ty's separate image approval; existing room art remains in place.

## A2e approved addendum — three ways to play (not published)
- [x] New Plan a Trip and Window Seat setup offers Solo, signed-in squad, or offline one-phone friends after dates; offline names/round scores stay device-local and are not member accounts. Explore a Culture stays group-only; Show Your Culture keeps Solo / With others.
- [x] Date-derived phase banners on Home and Play for newly marked trips, Captain departure confirmation and direct-open after trip creation. Existing unmarked rooms retain their saved schedules.
- [x] Database guard rejects legacy Quick Start on opt-in rooms; old rooms and their saved schedules remain untouched.
- [x] Solo trip guide linked privately with day-by-day sealed quests; signed-in squads keep join codes; offline Play opens a room-keyed local one-phone scoreboard with destination-aware prompts and winner selection.
- [ ] Signed-in Captain/player walkthrough across all three modes and three date boundaries at 390px and 1440px in both looks; no authorized preview session available in this run.
- [ ] Durable mode/destination-aware daily card, sealed-quest, Showcase and game pools with server-side cross-slot no-repeat; current offline prompts are local practice-derived cards, not a server-backed pool. Existing trip-day content is not fully mode-filtered yet.
- [ ] Ten approved room-specific art treatments and additional A2e artwork; descriptions only, no generation until Ty approves.

## Home layout mockups — review only
- [x] Founder-only Test Lab comparison: Classic plus three Trips-first arrangements, each with scheduled, Welcome Letter and active quest samples; no trip reads or writes.
- [x] Save per-account Home layout choice under Me › Settings, default Classic; do not switch the real Home yet.
- [x] Point 8: all three Trips-first samples keep the existing airport photo and branded sign-off at the bottom, a faint stamp above the photo, and a separate, clearly marked destination placeholder up top; commission the real top scene to match the airport's sunset grade.
- [x] Option 4: sample-only Departure Board beside Classic and Options 1–3 in all three states, with existing photo placeholder, icon rows, state-led statuses, airport sign-off and motion-safe staggered flap text. Replace earlier mockup hero placeholders with an existing coastline photograph.
- [x] Capture and review all 15 sample-only Home mockup combinations at 390px, plus 12 airport sign-off views; direct founder-session verification remains unavailable.
- [x] Add reference-inspired Options 5–7 with photographic placeholders, shared airport-photo sign-off and state-led board/strip; capture Classic and Options 1–7 in all three sample states at 390px.

## Round 2 — approved new Home
- [x] Make Option 6 the real default Home with live statuses, four destinations, next Game Night, and airport sign-off.
- [x] Add the approved departures-board hero and preserve the Classic / Trips first account setting.
- [x] Audit image reuse across Explore the App, Home, Travel From Home, Window Seat, Play and Trip without replacing any art.
- [ ] Ty to pick a layout and separately approve final hero art before replacing Home or generating images.

## A2e Part 4 — room art and full review (not published)
- [x] Build one shared Play hub and four compact phase views for both looks, replacing duplicate long Play stacks.
- [x] Re-home quests, missions, game nights, trip-day play, local/solo play and Wrapped behind concise face cards.
- [x] Keep existing score/action functions and truthful Soon hooks for queued Daily Card, Trip Season games and Trip Postcard.
- [x] Capture authenticated Captain/player views at 390px plus shared-shell hub/phase views at 390px and 1440px; both looks use the same Play tree.
- [x] Apply exclusive Window Seat cabin/postcard and Travel From Home lamp-lit/recipe-card presentation across setup, plans, Play, guides, Game Night and Wrapped using existing-image placeholders only.
- [x] Keep Solo out of Game Night cabin; give group Travel From Home the shared host flow in a living-room scene and Window Seat the cabin scene.
- [ ] Signed-in Captain/player walkthrough at 390px and 1440px in both looks, including race and age cases; requires an authorized preview session.
- [ ] Replace the 56 labeled placeholders only after Ty approves the final art direction; no images generated in Part 4.

## Tappable avatars and Player Passport card (not published)

## Play cleanup and phase bands
- [x] Keep Wrapped destination stamps on word boundaries and classify Game Nights by the Trip time zone.
- [x] Reuse the canonical At Home check and replace all four phase bands with approved brand artwork.
- [x] Align Play phases, Airport Mission windows, proof deadlines, and arrival controls with the server timing rules.

- [x] Add the server-shaped, teen-safe player card and read-only Passport summary.
- [x] Open it from requested Home, Squad, Play, Game Night and Captain Tools member portraits.
- [ ] Multi-member and teen visual checks remain blocked until matching signed-in test identities are available; Ty's adult card passed both looks at 390px.
