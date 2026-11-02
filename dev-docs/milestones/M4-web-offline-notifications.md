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
| M4-01 | ✅ | `InstallCard` on Home: the browser's own prompt (`beforeinstallprompt`, caught early in `src/pwa/install.ts`) or, in iPhone Safari, Share → Add to Home Screen. Offered once the player is in a trip, again in the 3 days before their next trip after "Not now", never in the installed app (`install-rules.ts`, unit-tested; `e2e/install.spec.ts`). Manifest: `id`, categories, Play / Trip shortcuts. **Left:** `screenshots` in the manifest (needs the owner's phone screenshots); the 1024×1024 master icon. |
| M4-02 | ✅ | `src/pwa/sw.ts` + `src/pwa/sw-plan.ts` (the rules, unit-tested), bundled by `scripts/pwa/build-sw.ts` after `vite build`. Precaches this build's JS/CSS, icons, manifest, the Home shell (`/`) and `/offline` (≈ 3.6 MB). Pages network first (3.5s timeout) → this page's cached copy (the page that installed the worker is cached on activation) → the Home shell, whose router draws the page asked for → the offline page only if the shell is missing; images and Google Fonts cached on first use; Supabase, server functions, `/api`, legal pages and password reset never cached. A new build waits until Refresh on `UpdatePrompt`. On only with `VITE_SERVICE_WORKER=true` (`scripts/deploy.sh` defaults it on); `false` ships the self-removing kill switch, and the app removes any worker and `tj-*` caches when the flag is off. `e2e/pwa` (CI) checks install, offline Home, offline visited and unvisited pages; the update and kill-switch flows were checked by hand against `wrangler dev`. **Left:** check it on staging once deployed. |
| M4-03 | ✅ | `src/data/offline/`: one IndexedDB record per device (`tj-offline`) holding TanStack Query's dehydrated cache, filtered by `rules.ts` (my trips; per trip members, cards, schedule, daily answers, standings, call nights, crowns, journal; never the crew's proof photos, live counts or the guide), plus the account facts the start-up gates need (user, profile, player profile, accepted legal version, access). Written a second after query results arrive, account facts at once, and on hide/close. The open trip's Home and Play data is preloaded while online (`prefetchTripForOffline`). At start-up with no network (`isNetworkError`: offline, or fetch itself failed), the root restores it and opens as the last player; the legal, access and profile gates use the saved facts. A refusal from the server (signed out, expired) never falls back, and deletes the snapshot, as does signing out. `OfflineBanner`: "Offline · Last synced 2 hours ago". Persistent storage is requested in the installed app. `e2e/pwa/snapshot.spec.ts`: airplane mode, a connection that fails, and a server refusal. **Left:** photo avatars (signed links) don't show offline, preset avatars do once seen; flight-game content offline is M4-05; actions offline wait for the outbox (M4-04). |
| M4-04 | ✅ | `src/data/offline/outbox.ts` + `outbox-rules.ts` (unit-tested). Daily answers, journal entries, quest and Surprise Drop proofs (photo compressed and kept in IndexedDB) and Crew Check 👍 go through `sendOrQueue`: sent at once when online, queued with no network or when the send fails for lack of it (mutations use `networkMode: "always"` so they aren't paused). Sent oldest first when the browser comes online, the app starts or becomes visible. Each action is safe to resend: journal and proofs upsert, a 👍 is `ON CONFLICT DO NOTHING`, points are keyed per item, a repeated daily answer ("already played") counts as sent, the photo path is chosen once and a duplicate upload counts as uploaded. The server still decides: a deadline that passed meanwhile refuses the action, and `OfflineBanner` shows why ("Couldn't send your answer: …", OK). Screens show "Saved on this phone · sends when you're back online" from the outbox, so it survives a restart. Signing out deletes the player's queue. `e2e/pwa/outbox.spec.ts`: answer offline → restart → sent once; a refusal shown; a photo proof uploaded to the path it names. **Not queued:** award votes and Show & Tell (Game Night Live needs everyone online), opening a sealed card (its speed bonus is timed by the server). **Left:** E8 on a real phone (M4-10). |
| M4-05 | ✅ | The build reads which images the flight-game files import (`FLIGHT_GAME_SOURCES` in `sw-plan.ts`) and precaches them (≈ 3 MB, 20 files; precache now ≈ 7 MB). Game content is bundled code. Mix It Up says "Needs a connection" offline. `e2e/pwa`: the art is precached before it's ever shown. |
| M4-06 | ✅ | `compressImage` re-encodes through a canvas, which drops EXIF; `e2e/pwa/outbox.spec.ts` uploads a JPEG with a GPS EXIF block and checks the stored file has none. Retry and offline queueing come from the outbox (M4-04). **Left:** the 12 MP / 4G timing on a real phone (M4-10). |
| M4-07 | ✅ | `20261101100000_m4_notifications.sql`: `push_subscriptions`, `notification_prefs`, `profiles.quiet_start/quiet_end`, server-only `notification_queue`. Me → Notifications (`NotificationSettings`): reminders on this phone, push / email per type, quiet hours, "Send me a test" (`sendTestNotification`). "Turn on reminders" card on Home after joining a trip, once the install card is out of the way; on iPhone only in the installed app. pgTAP `25_notifications`, `e2e/notifications.spec.ts`. |
| M4-08 | ✅ | Web Push without a library (`src/integrations/push/web-push.server.ts`: RFC 8292 VAPID + RFC 8291 aes128gcm on WebCrypto), checked against `http_ece` and Node's crypto; email backup through Resend's API (`EMAIL_API_KEY`, `EMAIL_FROM`). `/api/public/notify` (pg_cron every minute with the `notify` cron key, only when something is due) claims due rows, pushes to every browser, emails when no push got through and the player wants email, retries 1/2/4/8 min then fails, deletes subscriptions the push service says are gone. The service worker shows the push and opens its screen on tap (`e2e/pwa`: a push delivered to the real worker shows its notification). Keys: `bun scripts/pwa/vapid-keys.ts`; `scripts/deploy.sh` sets them and points the job at the Worker. **Left:** the 1,000-in-a-minute load check on staging. |
| M4-09 | ✅ | Planned from `trip_schedule` by `desired_notifications` and re-planned by triggers whenever the schedule or the crew changes (moving a call night moves its reminder): daily (8 AM in the player's zone, the tip itself), sealed drop / due tomorrow, call night in an hour, Pre-Flight closing, Airport Missions open, drop open / ending, crowning in 24h. Events by triggers: Crew Check (max 2 a day), proof expired, Game Night live. Quiet hours move a reminder to their end, or just before they start if the deadline would pass, and never send content before its item opens. `.ics` downloads stay. `wrapup` (Baggage Claim days 1/5/7 and "your postcard is ready") came with M5-02 / M5-03. |
| M4-10 | ⬜ | Needs real phones and staging: the checklist is below. |

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

### M4-04 · Offline outbox + sync ✅
- Queue user actions offline with a client UUID: Daily Card answers, journal entries, proof photos (stored in IndexedDB), Crew Check 👍. Wrap-up answers join when M5-02 builds them (add a kind to `outbox-rules.ts`). Award votes stay online-only: Game Night Live runs with everyone connected.
- Flush in order when the page is online again (`online` event, app start, app visible; no Background Sync, which Safari lacks). Every action is safe to resend (journal and proofs upsert, 👍 ignores repeats, points are keyed per item, a repeated daily answer counts as sent, a duplicate photo upload counts as uploaded). Rejections (deadline passed) show a friendly message.
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

**Checklist** (staging, with `VAPID_*` set; tick each on iPhone and Android):

| # | Step | Expect |
|---|---|---|
| 1 | Open staging in Safari / Chrome, sign in, join a trip | Home shows the install card (iPhone: Share → Add to Home Screen steps) |
| 2 | Install, open from the Home Screen | Full screen, no browser bar; the install card is gone |
| 3 | Me → Notifications → turn on, then "Send me a test" | The test arrives within seconds; tapping it opens Me |
| 4 | Answer today's Daily Discovery, open Play, then airplane mode | — |
| 5 | Force-close the app, reopen it in airplane mode | Home and Play show the trip with "Offline · Last synced …"; Games on the Flight play with their art |
| 6 | Still offline: write the journal, send a quest photo (12 MP from the camera) | "Saved on this phone · sends when you're back online"; the banner counts 2 |
| 7 | Back online | Both send once (no duplicates in Crew Check or points); the photo has no location (check the stored file's EXIF) |
| 8 | Set quiet hours to include the next few minutes; queue a Crew Check from a second phone | It arrives when the quiet hours end, not before |
| 9 | Mute "A crew proof needs your 👍"; repeat 8 | Nothing arrives |
| 10 | Deploy a new build while the app is open | "New version available" once; Refresh switches; play isn't interrupted before that |
| 11 | iPhone: leave the installed app unopened for 7+ days, then open offline | The snapshot is still there |
| 12 | In a Test Lab trip in Baggage Claim: heart a pick, answer the 3 questions, Download my photos, then lock it (M5) | The wrap-up reminder arrives; the zip opens on the phone; after the lock "Your Trip Postcard is ready" arrives and Download or share opens the share sheet |
