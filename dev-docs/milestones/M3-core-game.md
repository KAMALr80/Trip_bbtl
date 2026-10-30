# M3 — Core Game: Points, Crowns, Daily Play, Surprise Drops, Crew Check, Game Night Live

**Deck priority:** ★05. With M2 + M3 (and offline from M4) **a crew can play a full trip**.
**Goal:**
- Every way to earn points in the deck works and lands in one **points ledger**.
- Crowns are decided by the server.
- Crew Check and Game Night Live replace the old host-led flows.

**Depends on:** M2. **Founder answers needed:** Q3, Q4, Q5, Q7, Q9, Q10, Q22, Q25, Q27 (defaults are in [06](../06-open-questions.md)).
**Exit criteria:** E3–E7, E9–E11, E13, E14 pass ([08 §3](../08-testing-and-qa.md)). The ledger is the only scoring source. The old scoring functions are retired.

| ID | Task | Size |
|---|---|---|
| M3-01 | Points ledger + `award_points` + standings | L |
| M3-02 | Content library (`content_items`) + seed + AI tailoring | L |
| M3-03 | Schedule planner: all content kinds | L |
| M3-04 | Daily Discovery (Home) + Daily Card (Play) | M |
| M3-05 | Sealed quests & Showcase on the new engine | M |
| M3-06 | Proofs + Crew Check | L |
| M3-07 | Game Night Live (Show & Tell, Awards, Close) | L |
| M3-08 | Airport / Home Missions on the ledger | M |
| M3-09 | Surprise Drops (Bingo, Scavenger, Speed, Photo) | L |
| M3-10 | Trip quest | S |
| M3-11 | Crowns: Early Bird & Jet Setter, tie-break, solo goal | M |
| M3-12 | Window Seat: daily quest, journal, shared guide | L |
| M3-13 | Culture rooms on the engine (focuses, finale, solo showcase) | M |
| M3-14 | AI proof-check interface (stub; real vision in M6) | S |
| M3-15 | Standings UI + score strip + tappable avatars | M |
| M3-16 | Retire old scoring functions | S |

## Status (Oct 30, 2026)

Built with the founder's defaults for Q3, Q4, Q5, Q7, Q9, Q10, Q22, Q25 and Q27 (06). Database
tests: `18_points_ledger` – `23_reveal_and_drops`; browser tests: `daily-play`, `crew-check`,
`game-night-live`, `surprise-drop`, `invite-pin`, and `e2e/live` against the real local stack in CI.

| ID | State | What's done · what's left |
|---|---|---|
| M3-01 | ✅ | `points_ledger`, `points_rules` (Q4 values, tunable), `award_points` (missions cap 12, one daily item a day, idempotent), `set_points_status`, `standings` / `trip_standings` with the R-506 tie-break. |
| M3-02 | 🟡 | `content_items` with room/mode/focus/culture/age tags; 453 items seeded by `scripts/content/build-seed.py` (the M1-11 candidates, untagged, plus hand-written starters for Showcase, drops, journal and question days). `{destination}` / `{country}` / `{culture}` filled at plan time. **Left:** AI tailoring at plan time (needs `AI_API_KEY`; templates are used meanwhile), the admin list/edit screen, and the founder's review: most kinds have fewer than the 30 items per mode the launch target asks for. |
| M3-03 | ✅ | `plan_trip` lays out every kind; drops ≈ 0.45 × trip days on random stored days, 9–11 AM for 24h; stable per trip; text hidden until open (`my_schedule`); late joiners get their items; content re-dealt when the trip's room, mode, culture or minors change. |
| M3-04 | ✅ | `answer_daily`; Daily Discovery on Home (both layouts), Daily Card on Play. |
| M3-05 | 🟡 | Sealed quests from the schedule (3 days before each call night), "Open it" with +5 within 3h (`sealed_speed`), difficulty 5/10/15 (untagged = 10), presented at Game Night Live or proved via Crew Check. **Left:** ticket-stub design. |
| M3-06 | ✅ | `proofs`, `proof_votes`, `submit_proof`, `approve_proof`, Crew Check card, 24h expiry (cron), solo self-honor, teen photo privacy. **Left:** telling the owner when a proof expires (M4 notifications). |
| M3-07 | ✅ | `live_sessions`, Show & Tell (first 👍 = 20 + the night's quest), secret awards with ties, Close / Reopen, midnight auto-close. Phones refresh every 4s; Supabase Realtime can replace the polling later. |
| M3-08 | 🟡 | Missions from the schedule, opened 1 → 2 → 3, 4 points each into Trip Season (cap 12), proof until Trip Season starts via Crew Check. The older `mission_claims` screen is gone (M3-16). |
| M3-09 | 🟡 | Drop proofs per square / find, AI check queued for Bingo / Scavenger / Photo, `drop_points` + `settle_drops` (Q4 formula). **Left:** "present live" as drop proof (R-343), the ticket-stub card, a reminder before a drop ends (M4). |
| M3-10 | ✅ | Trip quest per player at Trip Season start, share or keep a surprise, presented at the crowning night. |
| M3-11 | ✅ | `trip_crowns` / `trip_crownings`; Early Bird at Pre-Flight close (none if skipped), Jet Setter at the crowning night's Close or the Q10 fallback, solo goal (60%). **Left:** the luggage-tag celebration; crowns on the trip stamp (M5). |
| M3-12 | 🟡 | Window Seat quest (5) and journal prompt (2) scheduled per player per day. **Left:** journal entries table and screen, the shared guide and its public page. |
| M3-13 | 🟡 | At-home rooms get Home Missions and Daily Discovery from the engine, content filtered by culture and focuses; finale = crowning night on Game Night Live. **Left:** the solo showcase page (R-365); retiring `CultureExperiences`. |
| M3-14 | ✅ | `checkProofPhoto` stub (`unsure`), `checkProof` server function, `record_proof_check` (service role); a pass approves, unsure/fail only flag. |
| M3-15 | ✅ | Play's score, place, R-303 race line, solo goal and breakdown read the ledger. `CrewStandings` on the Trip tab shows both seasons with tappable avatars (R-722). |
| M3-16 | ✅ | Client wrappers of `season_points`, `trip_season`, `trip_season_score`, `game_board`, `finalize_season`, `mission_bonus`, `set_stamp_values` and the older sealed-quest / mission functions are revoked and listed in `trip_private.retired_wrappers`; the `crown-due-seasons` job is gone. Play, the Trip tab standings (`CrewStandings`), the Journey card, the crown celebration and the Home reminders read the ledger, the schedule and `trip_crowns`. `SealedQuests`, `AirportMissions`, `TripSeasonBoard` and the old stamp board are deleted. **Left:** the retired tables move to `legacy_archive` with the rest of 05 §1. |

---

### M3-01 · Points ledger
- Create `points_ledger` ([03 §7](../03-target-architecture.md)). Writes only through `trip_private.award_points(trip, user, season, source, source_ref, points, status)` and `set_points_status(...)`.
- Enforce caps inside `award_points`: Airport Missions ≤ 12 per player per trip; one daily item per day.
- Add a standings view/function: `standings(trip, season)` → user, points, rank, showcase_points, last_earned_at.
- Put the points values in **one SQL table** (`points_rules(source, points_min, points_max, …)`) so the founder can tune them (Q4) without a code change.
- **Rules:** R-501 – R-502, R-509.
- **Acceptance:** pgTAP shows duplicate awards are no-ops (unique key); clients can't insert; the standings match the ledger sum.

### M3-02 · Content library
- `content_items` table ([04 §2.3](../04-data-model.md)) + an admin import (CSV from M1-11 after founder tagging) + a minimal admin list/edit screen.
- Kinds: `daily_discovery`, `daily_card`, `sealed_quest`, `showcase`, `airport_mission`, `home_mission`, `drop_*`, `trip_quest`, `journal_prompt`, `wrapup_question`, `flight_game`.
- Tags: rooms, modes (trip / at_home / solo, **R-007**), focus, vibe, min_age, alcohol.
- **AI tailoring at plan time:** fill `{city}` / `{country}` / `{culture}` and adapt to the vibe. Use `content-rules.ts` RULES + `safeContent` + the DB phrase guard. Keep no-repeat via `content_seen`. Fall back to the untailored template if AI is off (`ai_gate`).
- **Acceptance:** at least 30 items per kind per mode for launch (founder content task); an at-home Japan trip never receives an at-a-place-in-Japan item (test).

### M3-03 · Schedule planner: all kinds
- Extend `plan_trip` (M2-12) to materialise:
  - **Daily Discovery** every day of Pre-Flight and Trip Season; **question days** per Q22
  - **Daily Card** every Pre-Flight day
  - **Sealed quests** 3 days before each call night (short Pre-Flight: day 1) (R-321)
  - **Showcase** (1 per player, Pre-Flight)
  - **Airport / Home Missions** ×3 on Takeoff (R-331, R-333)
  - **Surprise Drop days** about every 2–3 days, random but stored (R-342); open time per Q27
  - **Trip quest** per player when Trip Season opens (R-344)
  - **Window Seat** quest + journal prompt per day (R-351)
- Content stays hidden until `opens_at` (security-definer read). Re-planning after date edits keeps past items.
- **Acceptance:** fixtures check the counts per trip length (4-day trip ≈ 2 drops, 10-day ≈ 4–5); planning is deterministic given a seed.

### M3-04 · Daily Discovery + Daily Card
- **Home:** Daily Discovery card (fact or tip; on question days a 1-tap answer → 1–2 pts).
- **Play (Pre-Flight):** Daily Card (tap to play → 1–2 pts).
- One per player per day, in the phase's zone.
- **Rules:** R-311 – R-313, R-341.
- **Acceptance:** answering twice doesn't double-score; the day rolls over at local midnight of the right zone.

### M3-05 · Sealed quests & Showcase
- Keep the secrecy model of today's `sealed_quests`, but drive drops from `trip_schedule`: a sealed card shows "Opens in 2 days".
- Points 5–15 by difficulty; **+5 if opened within 3h** of the drop (R-322).
- Completion: presented at Game Night Live (M3-07) **or** photo proof → Crew Check (M3-06).
- Showcase = 20 pts (R-324).
- Ticket-stub card design (Airline Look).
- **Acceptance:** the characterisation tests from M0 are updated to the new timing; the speed bonus is in the ledger as `sealed_speed`.

### M3-06 · Proofs + Crew Check
- `proofs` + `proof_votes` ([04 §2.2](../04-data-model.md)). Upload with client-side compression (`compress-image.ts`) to the `quest-proofs` bucket. A ledger row goes in as `pending`.
- **Crew Check card** on Play: "3 to check". It lists other players' pending proofs; 👍 = approve. You can't approve your own.
- First 👍 → approved (ledger `approved`). A **cron job every 5 min** expires proofs older than 24h → ledger `rejected`, and the owner is notified (M4).
- **Solo:** proofs auto-approve (self-honor, R-414).
- **Teen privacy:** if the trip `has_minors`, a proof photo is visible to the uploader + leaders + the approver only (reuse the `proof_read_ok` logic).
- **Rules:** R-411 – R-414, Q3.
- **Acceptance:** E5 passes; pgTAP covers self-vote denied, pending member denied, expiry and double approval.

### M3-07 · Game Night Live
- Tables: `live_sessions`, `live_presents`, `live_award_votes` ([04 §2.4](../04-data-model.md)).
- A session is opened by any member from the call night's card, or by leaders on crowning night. `auto_close_at` = local midnight (R-404).
- **Screen:** crew avatars with names. Tap an avatar after they present → 👍. The **first 👍 per presenter** awards **20 pts** ("show up + present") and marks their sealed quest / trip quest as presented.
- **Awards (end):** each player secretly picks one avatar per award; no self-votes (Q7).
- **Close** (Captain or Co-Captain) → tally: Best Overall +10, Most Creative +5, Best Story +5; ties per Q7. Winners show on Play with a luggage-tag animation.
- **Reopen** (leaders) undoes the award rows (`void`) until the next close.
- **Realtime:** Supabase Realtime on the session's vote counts, so phones update live. No turn order, no host.
- Call links ("Join call", "Join call 2") at the top. Same screen in person at the table.
- **Rules:** R-401 – R-405.
- **Acceptance:** E4 passes with 3 browsers; votes stay secret until Close; auto-close works with nobody online (cron).

### M3-08 · Airport / Home Missions on the ledger
- Keep `mission_action` / `mission_window` behaviour (3 sealed, reveal on Takeoff day, proof until Trip Season starts), but write points through `award_points` into **Trip Season** (cap 12) and proofs through `proofs` / Crew Check. Remove the `checkin` phase.
- At home: Home Missions the day before the first experience day.
- **Rules:** R-331 – R-333.
- **Acceptance:** E7 passes; the M0 mission tests are still green (adjusted).

### M3-09 · Surprise Drops
- The four game types, the same game for the whole group that day, tailored to the city:
  - **Bingo:** 3×3 or 4×4 grid of things to spot. Each square needs a photo. AI check (M3-14). Reuse `bingo_marks`.
  - **Scavenger Hunt:** list of finds with photo per find.
  - **Speed Challenge:** a task with a timer; finish order matters.
  - **Photo Challenge:** one creative photo; crew favourite vote.
- 24h window; points 10–33 from the `drop_points` function (Q4). Proof is a photo or "present live" (counts if 👍'd at the next Game Night Live).
- Ticket-stub card with an "ends 9 PM"-style countdown in viewer time.
- **Rules:** R-342, R-343.
- **Acceptance:** E10 passes; a drop is hidden before its open time (server); late submissions are rejected.

### M3-10 · Trip quest
- When Trip Season opens (arrival or auto-backup), every player gets a random quest. Toggle **"Share it"** or **"Keep it a surprise for the crowning dinner"**; hidden quests are visible only to the owner. Presented at crowning night via Game Night Live.
- **Rules:** R-344, Q25.
- **Acceptance:** assigned once per player; a late joiner gets one on approval.

### M3-11 · Crowns
- **Early Bird:** at Pre-Flight close (`trip_phase` end), crown the top Pre-Flight scorer. **None** if Pre-Flight was skipped (R-105).
- **Jet Setter:** at the crowning night session Close, or by the Q10 fallback.
- **Tie-break:** more Showcase points, then the earliest `earned_at` of the final point (R-506).
- **Solo:** crowned if points ≥ goal (60% of the possible points in the planned schedule, R-507). Show a progress bar.
- Rewrite `crown_due()` (pg_cron, every 15 min) to use the ledger and `trip_phase`. Write to `season_champions` (`preflight` / `trip_season`).
- **Luggage-tag crown** celebration (rework `CrownCelebration`).
- **Rules:** R-503 – R-508.
- **Acceptance:** E6 and E11 pass, including a tie case; crowning is idempotent; crowns appear on the trip stamp (M5).

### M3-12 · Window Seat
- Per day: Daily Discovery (morning push in M4), quest (photo, 5 pts), **journal** (1 prompt + 2 swaps, type or dictate via the OS keyboard mic, 2 pts), random Surprise Drops.
- **Crew ≤ 4:** personal quests, shared drops, journal feeds **one shared guide** (`window_guide_items`).
- **Guide:** auto-built from journal + photos, shareable link (public read-only page), Storyteller progress (M5).
- Pre-Flight lighter: Daily Card + a few sealed quests.
- **Rules:** R-351 – R-355.
- **Acceptance:** E13 passes; the shareable guide hides private photos and names unless the player opts in.

### M3-13 · Culture rooms on the engine
- Explore a Culture: culture + up to 2 of the 11 focuses filter the content (R-361, R-363).
- Show Your Culture: the Captain's culture is the theme (R-362).
- Phases per R-364: Home Missions on Takeoff; 1–7 experience days; **finale night = crowning** via Game Night Live (present, vote, crown).
- **Solo:** no call nights; the finale is their **own showcase page** (R-365).
- Map what's reusable from `CultureExperiences` / `culture_showcase_*` and retire the rest.
- **Acceptance:** E14 passes; the solo culture flow ends with a showcase page and a goal-based crown.

### M3-14 · AI proof-check interface (stub)
- Define `checkProofPhoto({ challenge, photoUrl }) → { verdict: 'pass'|'unsure'|'fail', reason, safety_flags }` in `src/integrations/ai`. For M3 the stub returns `unsure` (everything goes to Crew Check). M6 plugs in vision.
- The proof pipeline already respects `ai_status` (Q3 flow).
- **Acceptance:** switching the stub to `pass` auto-approves in tests.

### M3-15 · Standings UI
- Hub score strip: "Early Bird race · #2 of 6" (R-303); tap it for full standings with a ledger breakdown ("why do I have 47 pts?").
- Avatars everywhere open the player card / profile (R-722; reuse `AvatarButton`, `PlayerCardView`).
- **Acceptance:** standings refresh within a few seconds of an award (Query invalidation or Realtime).

### M3-16 · Retire old scoring
- Once the ledger is live, revoke/archive `season_points`, `trip_season`, `trip_season_score`, `game_board`, `game_stamps`, `finalize_season` (old), `season_quest_bonus`, `mission_bonus`, `trip_speed_finishes` reads ([05](../05-legacy-retire-list.md) L21).
- **Acceptance:** `grep` finds no client references; pgTAP confirms the wrappers are gone.
