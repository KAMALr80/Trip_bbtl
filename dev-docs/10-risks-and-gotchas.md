# 10 — Risks & Gotchas

Things that will cost days if nobody mentions them.

## Gotchas in the existing code

| # | Gotcha | What to do |
|---|---|---|
| G1 | **`.env` points at production.** `bun dev` on a laptop reads and writes live data. | Local Supabase / staging first (M0-04). |
| G2 | **13 images live only on Lovable's CDN** (`*.asset.json` pointers: founder photos + 11 state flags). | Download now, before Lovable access changes (M0-09). |
| G3 | **Google sign-in goes through Lovable's auth broker.** Turning off Lovable breaks Google login. | Replace with your own OAuth client first (M0-07). |
| G4 | **AI calls go through Lovable's gateway with Lovable model ids.** | Own provider key + model ids from env (M0-08). |
| G5 | **Before M1-09, the latest definition of a SQL function was whatever the last of 304 migrations said** (now archived in `supabase/migrations_archive/`; the baseline holds the current one). Searching the migrations finds several versions. | Use the schema dump (M0-06) as the reference. |
| G6 | **Rule generations branch on `trips.season_rule`, `a2e_room`, `a2e_kind`, `kind`, `play_arrangement`.** Some code paths are dead for new trips but live for old ones. | Decide Q1, then use `rules_version` and the archive view. |
| G7 | **Siam Vibes (`VRFQQM`) is a real group** that earlier rounds were told to protect ("verify Siam Vibes unchanged"). | Coordinate the cutover with that Captain. |
| G8 | **Two scoring readouts can disagree:** `season_points` (raw) vs `trip_season_score` (/100). The roadmap has an open item "switch game_board/finalize_season to season_points (wait for Ty)". | Replaced by the ledger in M3; don't patch it in between. |
| G9 | **Several functions are Captain-only** (`is_captain`) where the deck allows the Co-Captain, e.g. `approve_member` and `manage_trip_member` (remove player). `confirm_departure` already uses `is_leader`. See `supabase/tests/README.md` T7. | Audit every `is_captain` call against R-208 (M2-10). |
| G10 | **Trip time zone is chosen by hand** and defaults to home time → "Bali showed New York time". | Automatic lookup (M2-04). |
| G11 | **The app is one route**, so a push notification can't deep-link to anything today. | Routes split (M1-04) before push (M4). |
| G12 | **No service worker on purpose** ("so previews never go stale"). Adding one to the web build needs a careful update strategy; `UpdatePrompt` + `/api/public/version` already exist. | Native offline comes from bundled assets. If web offline is wanted, use Workbox with skip-waiting behind the existing update prompt. |
| G13 | **pg_cron can't read platform secrets**, which is why `trip_private.cron_keys` exists. | Keep this pattern for new cron → HTTP jobs (notifications). |
| G14 | **The 227 KB `styles.css`** mixes both looks and per-page scenes. Deleting the "Original" look is the easiest win. | M1-03. |
| G15 | **AI-generated content safety** relies on the `RULES` prompt, `safeContent` and a DB phrase guard. New generators must use all three. | Code review checklist item. |
| G16 | **Lovable still syncs to GitHub** until it's disconnected. Lovable and developers committing to the same branch will fight. | Disconnect at M0 start (or give Lovable its own branch). |

## Product & delivery risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| P1 | **Hidden bugs in signed-in flows** (never verified) surface once real testers play. | High | M0 characterisation tests + an early QA pass on staging with real accounts. |
| P2 | **Rules ambiguity** (28 open questions) causes rework. | Medium | Founder signs off [02](02-game-rules-spec.md) + [06](06-open-questions.md) before M2; build defaults behind config (points values in SQL, not hard-coded). |
| P3 | **App Store review**: thin web wrappers get rejected (Guideline 4.2); login options must meet Guideline 4.8; teen + photo features get a closer look; trip purchases may count as digital goods (in-app purchase rules) once payments exist. | Medium | Native features (push, camera, offline, haptics) in the first build; Sign in with Apple; clear privacy labels; payments later with a policy check. Re-read the current guidelines at submission. |
| P4 | **Minors + photos + location-ish data** → privacy/legal exposure. | Medium | Keep DB-enforced age rules; get legal review of teen consent, photo retention (Q11) and Privacy Policy before launch; no GPS (deck); AI vision stores verdicts only. |
| P5 | **Time-zone bugs** (DST, date line, deadlines in 2 zones). | High | One phase engine with shared fixtures; the time-travel test suite (08 §2). |
| P6 | **Offline sync conflicts / double points.** | Medium | Idempotency keys + ledger unique constraint; the server is the authority; most offline play gives no points by design. |
| P7 | **AI cost spikes** (vision checks per photo). | Low/Medium | Existing `ai_gate` global/user caps; check only Bingo/Scavenger/Photo; downscale images before sending. |
| P8 | **Scope creep from the "nice-to-have" list** (animated scenery, map, globe, synced live screen). | High | Milestone scope is fixed; extras go to [LATER](milestones/LATER-phase-2-and-beyond.md). |
| P9 | **Notification fatigue** (up to ~5 reminder types a day in Trip Season). | Medium | Per-type mute, quiet hours, one combined morning push (Daily Discovery + what's open today). |
| P10 | **Data migration for existing beta users** (stamps, profiles) during the cleanup. | Low | Archive, don't delete; keep `passport_stamps` and profiles intact; dry-run the migrations on a staging copy of production. |
