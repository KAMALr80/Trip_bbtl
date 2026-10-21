# M5 — Memories & Passport: Postcard Picks, Wrap-up, Collage, Profile, Levels, Badges, Me Tab

**Deck priority:** 06 (Postcard Picks, collage, passport stamps), plus the profile / Me tab / tour pieces the founder chooses for Phase 1 (Q23).
**Goal:**
- Every finished trip turns into a postcard and a stamp automatically.
- Players have a Passport Junkie profile with levels and badges.

**Depends on:** M3 (crowns, proofs, photos).
**Exit criteria:** E12 and E19 pass; the Day 7 lock runs unattended on staging; the photo purge follows R-607 / Q11.

| ID | Task | Size |
|---|---|---|
| M5-01 | Postcard Picks (nominate during the trip) | M |
| M5-02 | Wrap-up week: hearts + 3 questions | M |
| M5-03 | Day 7 lock job | M |
| M5-04 | Collage / Trip Postcard renderer | L |
| M5-05 | Photo retention & purge (non-kept photos) | M |
| M5-06 | Captain tie-break / swap one photo | S |
| M5-07 | Passport stamps v2 (country vs state, crowns, solo marker, postcard link) | M |
| M5-08 | Levels | S |
| M5-09 | Badges (U.S. Explorer, Culture Collector, Storyteller) | M |
| M5-10 | Passport Junkie profile (pages 1 & 2, public / private) | L |
| M5-11 | Me tab rebuild | M |
| M5-12 | After-trip view (overview, answers, kept photos) | S |
| M5-13 | Explore tour: 7 swipe cards | S |

---

### M5-01 · Postcard Picks
- A card on Play during Trip Season: pick **2** photos from your own trip photos (Window Seat crew: **5**, R-354). Swap any time **until the last trip day**.
- Tables `postcard_picks` ([04 §2.5](../04-data-model.md)).
- **Rules:** R-601.
- **Acceptance:** a 3rd pick is rejected by the server; picks freeze at the end of the last trip day (trip time).

### M5-02 · Wrap-up week
- Baggage Claim page:
  - **Heart the crew's picks** (one heart per photo per player; your own allowed? → default **no**)
  - **3 questions**: "Moment you'll never forget" + 2 drawn from the pool (R-603); about 60 chars; the emoji question takes exactly 3 emojis (grapheme-aware validation)
  - **No AI rewriting** (R-604)
- Tables `postcard_hearts`, `wrapup_answers`.
- **Rules:** R-602 – R-604.
- **Acceptance:** E12 steps 1–2; the validation matches on client and server.

### M5-03 · Day 7 lock job
- Cron job, idempotent, at the end of Baggage Claim day 7 (trip/home zone per room):
  1. Pick the top photos by hearts: **6 group / 10 solo**. Ties → the Captain's choice if set, else earliest upload.
  2. Gather answers (**no names**), crowns, and each player's "most excited for".
  3. Write `trip_postcards`.
  4. Render the collage (M5-04).
  5. Attach a stamp to **every member's passport**.
  6. Set `trips.locked_at`.
  7. Queue the photo purge (M5-05).
- **Rules:** R-605, R-606, R-104.
- **Acceptance:** re-running it changes nothing; with no hearts at all, it still produces a postcard.

### M5-04 · Collage / Trip Postcard renderer
- Template: **3 photos each side, answers grouped by question in the middle** (R-608), in the Airline Look.
- **Render on the server** to a PNG/JPEG in Storage, so it's shareable and stable. Today the client uses `html-to-image`; a server render (e.g. Satori / resvg in the Worker, or an Edge Function) is more reliable.
- Share sheet + download. Solo version with up to 10 photos.
- **Acceptance:** renders correctly for 1–6 (or 10) photos and 1–12 players' answers; long emoji / RTL text doesn't break the layout.

### M5-05 · Photo retention & purge
- After the lock: delete **all other trip photos** (photo wall, proofs, drop photos) except stamp / postcard photos (R-607). Confirm the scope per **Q11**.
- Send the "download your photos" reminders before the lock (M4 `wrapup`).
- Keep the existing 12-month `purge-photos` as a backstop for archived trips. Update the Privacy Policy text (`src/lib/legal.ts`).
- **Acceptance:** Storage objects are actually removed (not just DB rows); kept photos remain; the job is logged.

### M5-06 · Captain tie-break / swap
- Captain tools → Baggage Claim tile:
  - **break ties** (choose between tied photos)
  - **swap one photo** (once per trip)
- Co-Captain allowed (R-210).
- **Acceptance:** limited to one swap; available only during wrap-up week.

### M5-07 · Passport stamps v2
- The stamp type comes from the player's `from_country` vs the trip country: **passport stamp** (abroad) or **state stamp** (US domestic, and the equivalent for other countries if wanted).
- Stamps carry the crowns won, a solo marker, room icon, season + year, and a link to the postcard.
- At-home culture rooms give a **postcard** (Postcard Wall), not a country stamp (R-366).
- "From" is auto-filled from the device region (R-702) and editable.
- **Acceptance:** one stamp per member per trip; tap a stamp → its postcard (R-701).

### M5-08 · Levels
- Level from the distinct stamp countries: Tourist 1 · Explorer 3 · Voyager 5 · Globetrotter 7 · Passport Junkie 10 · ★15 · ★★20 · ★★★30.
- Compute it in the same function that adds a stamp; nothing runs in the background (R-703, R-704). Replace today's Traveler / Explorer / Passport Junkie logic.
- **Acceptance:** pgTAP checks each boundary.

### M5-09 · Badges
- U.S. Explorer 1/5/15 states; Culture Collector 1/5/10 cultures; Storyteller 1/3/10 Window Seat guides. Tiers: **Carry-On → Checked Bag → First Class**.
- Computed on stamp / postcard / guide publish (R-711 – R-713, Q13).
- **Acceptance:** a badge tier-up shows a small celebration; tiers never go down.

### M5-10 · Passport Junkie profile
- **Page 1:** title, level, about me, this trip's role and "most excited for". **Page 2:** stamps · postcards · your trips.
- **Public vs private:** private shows avatar, game name and level only (R-714). Removes the old counters / rank bars (R-715).
- Hide a trip or photo (Q28). Pick top stamps.
- Route `/p/$userId`. Opened by tapping any avatar (R-722).
- **Acceptance:** a non-crew viewer of a private profile sees only the three fields (server-enforced read function).

### M5-11 · Me tab rebuild
- Sections:
  - profile (name, avatar, From, About me)
  - current trip (role, most excited for)
  - passport shortcuts (top stamps, hide trip/photo)
  - privacy (public / private)
  - notifications (from M4)
  - Captain tools (M2)
  - help / about / legal / delete account
- Reuse the avatar picker (`PlayerCards`, 54 seeds).
- **Rules:** R-801, R-802.
- **Acceptance:** every item in deck slide 16 is reachable within 2 taps.

### M5-12 · After-trip view
- After the lock: the trip shows **overview, answers and kept photos only** (R-609); download / share the postcard.
- Archived old trips (M1-01) use the same view where possible.

### M5-13 · Explore tour (7 cards)
- Welcome · Going on a Trip · Window Seat · Explore a Culture · Show Your Culture · Game Night · Crowns + Our Story.
- **Swipe only**; the only buttons are **Skip** and **Get started**; one image per room; **no rules, points or setup details** (R-907).
- Replaces the 13-slide `ExploreTour` / `CinematicTourSlides`. Art: placeholders until the founder supplies "real art showing diverse travelers".
- **Acceptance:** works signed-out and from Me → "Replay tour".
