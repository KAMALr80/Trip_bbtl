# LATER — Phase 2 and Beyond

Items the deck puts in later phases, or that should wait until Phase 1 is in players' hands. Each has a note on **what Phase 1 should already do** so it's cheap to add later.

| Item | Deck reference | Phase 1 groundwork |
|---|---|---|
| **Payments** (tiers Solo / Crew 2–4 / Squad 5–8 / Big Squad 9–12 / Event 13–24; +add-on for days 8–14; tier upgrade when players join mid-trip) | Slides 19, 23 | `orders`, `price_rules`, `reward_codes`, `checkout_beta`, `beta_free` exist; keep them. Check `price_rules` against the deck tiers. Decide Stripe (web) vs in-app purchase rules for the stores (Q18). Only a verified webhook may flip `paid`. |
| **Event Group** (13–24 players, auto-split into 2 teams of ≤ 12) | Slides 4, 19, 23 | Keep `RoomConfig.maxCrew` and the server size check generic; the ledger has `user_id` only, so add `team_id` to the standings query later. Archived `trip_teams` may be revived. |
| **World map of trips** (pins, clustering, US-state zoom, tap → trips → overview → profile) | Slide 15 | Store `dest_lat/lng` (M2-04) and keep public/private correct (M5-10). Map libraries with built-in clustering: MapLibre GL / Mapbox. A spinning globe is a later look. |
| **Spanish** (+ AI cards in each player's language) | Slide 18 | i18n catalog from M1-07; `content_items.locale`; `profiles.locale`. |
| **Flight-number tracking** (auto "We've arrived") | Slides 3, 18, 23 | `arrived_at` / `arrived_by` support a `system` source. |
| **Second culture in setup** (e.g. Caribbean in London) | Slides 5, 18 | `trips.cultures text[]` from M2. |
| **Kahoot-style synced "Up now" screen + live drumroll reveal** | Slide 11 | Game Night Live on Supabase Realtime (M3-07) can grow into this. |
| **Video proof** | Slide 8 | `proofs` has `photo_path`; add `media_type` + a transcoding pipeline later. |
| **Photo album upgrade** | Slide 23 | Postcard renderer (M5-04) + Storage. |
| **Partner Challenges** | Slide 23 | Content library `kind` can grow. |
| **Animated scenery, players inside scenes, richer airline animations** | Slide 21 | The design system from M1/M2 keeps scenes as presentation-only. |
| **Web offline (service worker)** | — | Native covers offline. If the web needs it, use Workbox behind the existing `UpdatePrompt`. |
| **Re-evaluate a React Native UI** | — | Only if the Capacitor app's feel or performance isn't good enough after launch. |
