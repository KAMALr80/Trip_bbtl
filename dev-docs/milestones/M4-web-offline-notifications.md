# M4 — Web App: Install, Offline Play, Notifications

**Decision (Oct 31, 2026, founder): no native apps.** TripJunkies ships as a web app only. There are no
App Store or Google Play builds, so Capacitor, store listings, native sign-in and FCM/APNs are out (Q16).
Players **install the web app** from the browser (Add to Home Screen), which gives the home-screen
icon, full-screen launch, offline storage and, on iPhone, web push.

**Deck priorities:**
- ★01 (downloadable app): an installable web app takes the place of store apps.
- ★02 (offline play on flights, sync later).
- 07 (reminders and notification settings).

**Goal:**
- The installed web app opens and plays flight games with no network.
- Actions queued offline sync safely.
- Players get the deck's reminders as web push, with email as backup, per-type mute and quiet hours.

**Depends on:** M1 (routes + data layer) and M3 (the schedule and events the reminders come from).
**Exit criteria:**
- E8 (offline) and E18 (push) pass on a real iPhone (installed web app, iOS 16.4+) and a real Android phone (Chrome).
- Lighthouse's PWA installability checks pass on staging.
- The `src/AGENTS.md` rule "Manifest-only PWA, no service worker" is replaced by the M4-02 update rule in the same PR.

| ID | Task | Size |
|---|---|---|
| M4-01 | Install experience: manifest polish, install prompt, iPhone "Add to Home Screen" guide | S |
| M4-02 | Service worker: precache the app shell, update through `UpdatePrompt` | M |
| M4-03 | Offline snapshot (trip bundle cache) | M |
| M4-04 | Offline outbox + sync with idempotency | L |
| M4-05 | Games on the Flight fully offline | S |
| M4-06 | Photo uploads from the phone browser (compress, strip EXIF, retry) | M |
| M4-07 | Notification data model + preferences UI + quiet hours | M |
| M4-08 | Notification scheduler + sender (Web Push + email) | L |
| M4-09 | Reminder types wired to the schedule (deck list) | M |
| M4-10 | Real-device checks (iPhone installed app, Android Chrome) | S |

Removed with the decision: the Capacitor spike and project, native auth (Apple sign-in), universal and
app links, the native camera plugin, store readiness and the store release pipeline.

## Status (Oct 31, 2026)

| ID | State | What's done · what's left |
|---|---|---|
| M4-01 | ⬜ | Not started. |
| M4-02 | ✅ | `src/pwa/sw.ts` + `src/pwa/sw-plan.ts` (the rules, unit-tested), bundled by `scripts/pwa/build-sw.ts` after `vite build`. Precaches this build's JS/CSS, icons, manifest, the Home shell (`/`) and `/offline` (≈ 3.6 MB). Pages network first (3.5s timeout) → this page's cached copy (the page that installed the worker is cached on activation) → the Home shell, whose router draws the page asked for → the offline page only if the shell is missing; images and Google Fonts cached on first use; Supabase, server functions, `/api`, legal pages and password reset never cached. A new build waits until Refresh on `UpdatePrompt`. On only with `VITE_SERVICE_WORKER=true` (`scripts/deploy.sh` defaults it on); `false` ships the self-removing kill switch, and the app removes any worker and `tj-*` caches when the flag is off. `e2e/pwa` (CI) checks install, offline Home, offline visited and unvisited pages; the update and kill-switch flows were checked by hand against `wrangler dev`. **Left:** check it on staging once deployed. |
| M4-03 | ✅ | `src/data/offline/`: one IndexedDB record per device (`tj-offline`) holding TanStack Query's dehydrated cache, filtered by `rules.ts` (my trips; per trip members, cards, schedule, daily answers, standings, call nights, crowns, journal; never the crew's proof photos, live counts or the guide), plus the account facts the start-up gates need (user, profile, player profile, accepted legal version, access). Written a second after query results arrive, account facts at once, and on hide/close. The open trip's Home and Play data is preloaded while online (`prefetchTripForOffline`). At start-up with no network (`isNetworkError`: offline, or fetch itself failed), the root restores it and opens as the last player; the legal, access and profile gates use the saved facts. A refusal from the server (signed out, expired) never falls back, and deletes the snapshot, as does signing out. `OfflineBanner`: "Offline · Last synced 2 hours ago". Persistent storage is requested in the installed app. `e2e/pwa/snapshot.spec.ts`: airplane mode, a connection that fails, and a server refusal. **Left:** photo avatars (signed links) don't show offline, preset avatars do once seen; flight-game content offline is M4-05; actions offline wait for the outbox (M4-04). |
| M4-04 – M4-10 | ⬜ | Not started. |

---

### M4-01 · Install experience
- Manifest: name "TripJunkies", `id`, `start_url` `/home`, `display: standalone`, theme in the brand navy, maskable icons (already in `public/icons`). Add `screenshots` and `shortcuts` (Play, Trip) so Android Chrome shows the richer install sheet.
- **Android / desktop Chrome:** catch `beforeinstallprompt` and show our own "Install TripJunkies" card at a good moment: after joining a trip, and again before Takeoff ("Install so games work on the plane").
- **iPhone (Safari):** there is no install prompt. Show a short guide (Share → Add to Home Screen) to Safari users who aren't in standalone mode (`navigator.standalone` / `display-mode: standalone`). On iPhone the app **must be installed** for web push (M4-08) and for storage that isn't cleared after 7 days without a visit.
- Dismissals are remembered per device; the card never blocks play.
- **Acceptance:** the install card shows on Android Chrome and the guide on iPhone Safari; neither shows once installed.

### M4-02 · Service worker ✅
- **Only in staging and production builds** (`VITE_SERVICE_WORKER=true`, set by `scripts/deploy.sh`); local dev, tests and other builds run without one.
- A small hand-written worker (`src/pwa/sw.ts`), no Workbox: TanStack Start + Nitro builds don't fit `vite-plugin-pwa`, and the rules are short. `scripts/pwa/build-sw.ts` bundles it after `vite build` with the precache list and a version hashed from the precached files.
- Precache: this build's JS and CSS, icons, manifest, the Home shell and the offline page. Install fails (and retries later) if the Home page it fetched belongs to another build. Images are cached when first shown; **M4-05 adds the flight-game art** to the precache.
- API, Supabase and server-function requests are **never** cached by the worker; the M4-03 snapshot handles data.
- **Updates:** a new worker waits. `UpdatePrompt` asks for an update check when the app becomes visible and shows "New version available" once the new build is installed; Refresh sends `TJ_SKIP_WAITING` and reloads when it takes control. Never take control mid-game without asking.
- **Kill switch:** deploy with `VITE_SERVICE_WORKER=false`. That build's `sw.js` removes itself and its caches and reloads open tabs; the app also unregisters any worker when the flag is off (G12).
- **Acceptance:** with the network off, the app opens to Home from a cold start; a deploy shows the update prompt exactly once. ✅ (`e2e/pwa`, and by hand against `wrangler dev`).

### M4-03 · Offline snapshot ✅
- Whenever online, keep the current trip bundle in IndexedDB: trip, members, cards, revealed schedule items, own answers, standings, call nights, crowns (phase windows are computed from the trip, `phase.ts`). Built: TanStack Query's dehydrated cache, filtered in `src/data/offline/rules.ts`, plus the start-up account facts.
- With no network the app starts from it and shows "Offline · Last synced 2 hours ago". It falls back **only** when the network failed, never when the server refused (that signs out and deletes the snapshot).
- Persistent storage (`navigator.storage.persist()`) is requested in the installed app.
- **Flight game content** moves to M4-05.
- **Acceptance:** with airplane mode on, Home and Play render the last state. ✅ (`e2e/pwa/snapshot.spec.ts`)

### M4-04 · Offline outbox + sync
- Queue user actions offline with a client UUID: Daily Card answers, journal entries, wrap-up answers, proof photos (stored in IndexedDB), Crew Check 👍, award votes only if a session is open.
- Flush in order when the page is online again (`online` event and on app start; Background Sync where the browser has it, which Safari doesn't, so the app must not rely on it). The server keys on `(source, source_ref, user)` / the proof's unique key, so retries are safe. Rejections (deadline passed) show a friendly message.
- **Rules:** ★02, R-109 (deadlines are the server's).
- **Acceptance:** E8 passes; closing the tab mid-sync and reopening causes no duplicates (pgTAP + device test).

### M4-05 · Games on the Flight offline
- `GameArcade` / `OnePhoneNight` / `OfflineTripCards` content in the precache or the snapshot; no AI calls offline (Mix It Up disabled with a note).
- **Rules:** R-334.
- **Acceptance:** works from a cold start in airplane mode in the installed app.

### M4-06 · Photo uploads
- Camera and library through `<input type="file" accept="image/*" capture>`; compress with `compress-image.ts`; **strip EXIF location** before upload (re-encoding through a canvas does this; check it); retry on failure; queue in the outbox when offline.
- **Acceptance:** a 12 MP photo uploads in under 5s on 4G; no GPS EXIF on stored files.

### M4-07 · Notification model + preferences
- Tables `push_subscriptions` (one per browser: endpoint, keys, user agent), `notification_prefs`, `notification_queue`; `profiles.quiet_start/quiet_end` ([03 §11](../03-target-architecture.md)). Every new table gets its `<table>_archive_guard` trigger where it has a `trip_id`.
- **Me → Notifications:** a toggle per type (push / email), quiet hours (default 22:00–08:00 local), a test notification button. On iPhone in Safari (not installed), the push toggle explains it needs the installed app (M4-01).
- Ask for notification permission at a sensible moment, after a tap (browsers require it): after joining a trip, not on first visit.
- **Rules:** R-801, R-812.
- **Acceptance:** preferences persist; a muted type is never sent (pgTAP on the enqueue function).

### M4-08 · Scheduler + sender
- pg_cron (every minute) → `/api/cron/notify` (cron-key auth, same pattern as purge-photos) → picks `queued` rows with `send_after <= now()` → **Web Push** with VAPID keys (Chrome/Android, desktop browsers, Safari on installed iPhone apps). Email backup (Resend / Postmark / SES) when there's no subscription or the push fails, if the user enabled email.
- The service worker shows the notification and, on tap, opens or focuses the app at `deep_link`.
- Expired subscriptions (HTTP 404/410) are deleted.
- Quiet hours: when enqueuing, shift `send_after` to the end of quiet hours in the user's zone, **unless** the deadline would pass (then send just before quiet hours start).
- Dedupe key per (user, type, ref). Retry with backoff. Log failures.
- **Acceptance:** 1,000 queued notifications send in under 1 minute on staging; quiet hours are honoured across zones.

### M4-09 · Reminder types (deck slide 18)
Enqueue when `plan_trip` runs and on events:

| Type | When | Deep link |
|---|---|---|
| `daily` | each morning (08:00 local, or the end of quiet hours), **text = the tip itself** | `/home` |
| `sealed_drop` | on drop (3 days before the night) | quest card |
| `sealed_prep` | day before the night | quest card |
| `night_soon` / `night_live` | 1h before / when the session opens | `/t/:id/live` |
| `preflight_closing` | evening before departure | Play |
| `missions_open` | departure morning | Takeoff page |
| `drop_open` / `drop_ending` | on open / ~3h before close | drop card |
| `crowning_24h` | 24h before, with location | Trip Season page |
| `wrapup` | Baggage Claim day 1, 5, 7 | postcard |
| `crew_check` | a proof waiting for you (batched, max 2/day) | Crew Check |
| `proof_expired` | your proof expired without a 👍 (M3-06) | Crew Check |

- Re-plan the queue when dates, call nights or the crowning time change.
- The `.ics` downloads stay as a backup for players who block notifications.
- **Acceptance:** E18 passes; editing a call night moves its reminders.

### M4-10 · Real-device checks
- iPhone (latest iOS and one version back): install from Safari, offline cold start, push arrives and opens the right screen, storage survives a week without use.
- Android (Chrome): install card, offline, push.
- Desktop Chrome / Safari: push and the update prompt.
- **Acceptance:** E8 and E18 recorded on both phones; findings ticketed.
