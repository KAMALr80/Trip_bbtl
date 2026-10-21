# M2 — Captain Setup, Phase Engine, Time Zones, Play in Every Room

**Deck priorities:** ★04 (Captain setup + Play in every room), 03 (automatic time zones), beta fixes (slide 20).
**Goal:** a Captain in **any room** sets up a trip in 5 screens. The server knows the phase at every moment, in the right time zone. Play shows the right phase pages and cards for every room (cards can still be placeholders until M3).
**Depends on:** M1.
**Exit criteria:**
- E2 (create trip → invite → join) passes for all 4 rooms × 3 play modes.
- The phase fixtures pass in SQL and TS.
- A Bali trip shows Bali time.
- All 8 beta notes are closed.

| ID | Task | Size |
|---|---|---|
| M2-01 | Room config (TS + SQL) | M |
| M2-02 | `trips` schema for the new engine | M |
| M2-03 | Phase engine `trip_phase()` + TS mirror + fixtures | L |
| M2-04 | Places autocomplete + automatic trip time zone | M |
| M2-05 | Captain setup wizard (5 screens) | L |
| M2-06 | Call nights (up to 4, links, 2nd link) | M |
| M2-07 | "Who's playing?" for every room, incl. solo and Captain + 1 | M |
| M2-08 | Join flow: role + "most excited for" | S |
| M2-09 | Phase banners + Play hub & phase pages for every room | L |
| M2-10 | Co-Captain powers audit + "We've arrived" for Co-Captain | M |
| M2-11 | Captain tools: one tile per phase | M |
| M2-12 | Schedule planner skeleton (`plan_trip`) | M |
| M2-13 | Server-side limits (group size, days, ages for Captain) | S |
| M2-14 | One-night Game Night room | M |

---

### M2-01 · Room config
- Define `RoomConfig` ([03 §5](../03-target-architecture.md)) for `trip`, `window_seat`, `explore_culture`, `show_culture`, `game_night`. Mirror it as `trip_private.room_rules(room) → jsonb`.
- Add a CI test comparing TS vs SQL.
- **Rules:** R-001, R-002, R-005, R-110, R-112, R-606.
- **Acceptance:** one source of limits; the UI reads the config; server functions validate against it.

### M2-02 · `trips` schema for the new engine
- Add `room`, `play_mode`, `preflight_days`, `preflight_skipped`, `cultures[]`, `focuses[]`, `dest_lat/lng/place_id`, `arrived_at/by` (rename of `departure_confirmed_at`), `crowning_at/place/call_link`, `locked_at`. Add `call_nights` ([04 §3](../04-data-model.md)).
- Backfill `room` / `play_mode` for archived trips (display only).
- **Acceptance:** migration + pgTAP; generated types updated.

### M2-03 · Phase engine
- `trip_private.trip_phase(p_trip, p_at)` → `phase, starts_at, ends_at, tz, day_index` ([03 §6](../03-target-architecture.md)). It covers:
  - Pre-Flight 0–10 / Skip; closes 23:59 home time the night before
  - Takeoff day 00:00–23:59 home time
  - Trip Season from `arrived_at`, or the backup at 23:59 next night in trip time, to the last trip day
  - Baggage Claim from the day after, for 7 days → then `archived`
  - at-home: home time only; Takeoff = Home Missions the day before; Trip Season = experience days
  - late start / skip: drops into the current phase
- Replace `trip_season_started`, `trip_season_start_at`, `datePhase`, `phaseBanner` and the other date helpers with calls to it.
- TS mirror in `src/features/trip/phase.ts`, used for display and countdowns only.
- **Shared fixtures:** at least 40 cases, including DST, the date line, Skip, late start and auto-backup ([08 §2](../08-testing-and-qa.md)).
- **Rules:** R-101 – R-112.
- **Acceptance:** fixtures pass in pgTAP and Vitest; every write function that depends on phase calls `trip_phase`.

### M2-04 · Places autocomplete + automatic time zone
- Replace the free-text city in `PlacePicker` with a places search that returns lat/lng (Google Places, Mapbox or GeoNames; decide on cost). Keep country / US state picking.
- Server function: lat/lng (or country) → IANA zone (`geo-tz` or similar). For multi-zone countries without a city, ask the Captain.
- Home zone from the Captain's device at creation.
- Show "Trip time: Bali (UTC+8) · Change" on screen 2. The manual picker (`TripTimezoneField`) becomes the fallback. Captain **or Co-Captain** can change it.
- **Rules:** R-108, R-202; beta notes "City field shows no suggestions", "Destination time zone not looked up".
- **Acceptance:** Bali → `Asia/Makassar`; New York → `America/New_York`; an at-home room has no trip zone; changing the zone re-plans future schedule items.

### M2-05 · Captain setup wizard (5 screens)
- Route `/trips/new?step=1..5` (plus a step-0 "Who's playing?" if Q2 = default). One screen at a time, Next/Back, draft saved to the server after each step (`trips` row in `setup` status), so a refresh doesn't lose answers.
  1. **Where to?** Destination with suggestions; culture to explore pre-filled from the destination (second culture hidden, Q14); at home: pick culture (+ up to 2 focuses for Explore, R-361/363).
  2. **Trip basics.** Tap first + last day (range picker; enforce max days per room); vibe; ages/minors (`has_minors`); room details.
  3. **Pre-Flight.** One-line intro; 0–10 days or Skip; up to 4 call nights (M2-06).
  4. **Trip Season.** One-line intro; **crowning / finale night**: date, time, location (required, never pre-set, R-205); optional call link. At home: finale night picker (beta note).
  5. **Invite.** Trip code + link auto-made; Share (Web Share API / Capacitor Share); off-app: names; solo: "You're all set". **Done** → opens Play.
- Replaces `TripSheets` (create mode), `CultureA2eSetup`, `GamePlanPicker` and the setup parts of `CultureExperiences`.
- **Rules:** R-201 – R-207, R-211.
- **Acceptance:** E2 for each room; answers show on Trip / Play right after Done (beta note "Setup answers don't show after saving"); no screen needs scrolling at 390×844 except long lists; Captain can edit everything later from Captain tools.

### M2-06 · Call nights
- The `call_nights` table: up to 4 per trip, each with date/time (home time), call link, optional 2nd link. All must fall inside Pre-Flight; one write function validates this.
- `.ics` per night (reuse `flight-calendar.ts`). "Join call" button(s) on the Play card.
- **Rules:** R-204, R-405.
- **Acceptance:** a 5th night is rejected by the server; editing dates outside Pre-Flight warns and re-validates.

### M2-07 · "Who's playing?" for every room
- `play_mode` = `solo` / `crew` / `offline` for all rooms allowed by config (solo now allowed for **Explore a Culture**, R-004).
- Off-app roster: allow **1+ names** (today it starts at 2; beta note "allow Captain + 1"). Crew: allow the Captain + 1.
- **Rules:** R-003 – R-006.
- **Acceptance:** each room × mode can be created; off-app names never reach the server (network check in the E2E test).

### M2-08 · Join flow
- After a code / invite link: invite preview (keep `InvitePreview`) → **two questions only**: role this trip (pre-filled) and "most excited for" (R-212) → Play.
- Age rules still apply server-side (`join_trip`).
- **Acceptance:** the join takes 3 taps after sign-in; answers appear on the player's card and (from M5) on the passport.

### M2-09 · Phase banners + Play for every room
- `PhaseBanner` at the top of Home and Play with the R-107 copy; Trip Season fills in the city / culture. No pop-ups.
- Play hub ([R-301](../02-game-rules-spec.md)): score strip (placeholder until M3), phase track, four phase pages. Each page lists the room's cards; cards not built yet show "Coming in this phase" (not "Soon").
- Window Seat, Explore and Show Your Culture get the **same hub** (beta note "Play tab is empty for at-home and Window Seat").
- Airline Look: `BoardingPass` header on the hub.
- **Rules:** R-106, R-107, R-301 – R-303.
- **Acceptance:** each room shows four phases with the right labels (Home Missions vs Airport Missions; Finale vs Crowning night); time travel in the Test Lab moves the banner correctly.

### M2-10 · Co-Captain powers audit + "We've arrived"
- Audit every function using `is_captain`. Switch to `is_leader` everywhere except **delete trip** (and handing over Captaincy).
- Change `confirm_departure` → `mark_arrived`: Captain **or Co-Captain**, available from Takeoff until the auto-backup.
- "Name a Co-Captain" lives in Me tab → Captain tools (R-208).
- **Rules:** R-103, R-208, R-210.
- **Acceptance:** pgTAP: the Co-Captain can do everything the Captain can except `delete_trip`; the arrival tap works for both and only once.

### M2-11 · Captain tools: one tile per phase
- `/me/captain/$tripId`: tiles for Pre-Flight (call nights + links), Takeoff ("We've arrived"), Trip Season (crowning details), Baggage Claim (tie-break/swap, built in M5). Always available: share code, edit dates, remove player, name Co-Captain, delete trip (Captain only, type "DELETE").
- Reuse pieces of `CaptainTools`, `CaptainExtras`, `CaptainChecklist`.
- **Rules:** R-209, R-210, R-801.
- **Acceptance:** non-leaders can't open it (route guard + server); every action audited in `trip_role_changes` where relevant.

### M2-12 · Schedule planner skeleton
- `trip_private.plan_trip(trip_id)` creates `trip_schedule` rows ([03 §9](../03-target-architecture.md)) from the room config and dates. In M2 it only creates the **phase markers and call nights**; M3 adds the content kinds.
- It re-runs on date changes and keeps past rows.
- **Acceptance:** creating or editing a trip produces a stable schedule; re-running it is idempotent.

### M2-13 · Server-side limits
- Group size ≤ 12 (Window Seat ≤ 4), counting approved + pending. Days ≤ 14 (at home 1–7). Pre-Flight 0–10. Call nights ≤ 4. Captain must be 21+ (18–20 can't be Captain).
- **Rules:** R-112, R-509, R-901, R-904.
- **Acceptance:** pgTAP for each limit; the UI shows friendly errors.

### M2-14 · One-night Game Night room
- Instant: no setup beyond "Who's playing?" (one phone or code). Uses Games on the Flight content. **No points, crowns or stamp.** Same-day at-home requests are routed here (R-110).
- In M2 it ships with the one-phone mode (`OnePhoneNight`). The "everyone on their phone" mode uses the Game Night Live screen and is switched on once M3-07 lands.
- **Rules:** R-008, Q21.
- **Acceptance:** it can be started in under 3 taps from Home; nothing is written to the ledger or passport.
