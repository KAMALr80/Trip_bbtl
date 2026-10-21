# M4 — Native Apps, Offline Play, Notifications

**Deck priorities:** ★01 (App Store + Google Play), ★02 (offline play on flights, sync later), 07 (reminders + notification settings).
**Goal:**
- The same app ships as iOS and Android builds.
- It opens and plays flight games with no network.
- Queued actions sync safely.
- Players get the deck's reminders as push (email backup), with per-type mute and quiet hours.

**Depends on:** M1 (routes + data layer). It can run **in parallel with M2/M3**: notification *types* are added as M3 features land.
**Exit criteria:**
- TestFlight + Play internal-testing builds.
- E8 (offline) and E18 (push) pass on real devices.
- Store listings drafted.

| ID | Task | Size |
|---|---|---|
| M4-01 | Spike: SPA build inside Capacitor calling Cloudflare server functions | M |
| M4-02 | Capacitor project setup (iOS + Android), app ids, icons, splash | M |
| M4-03 | Native auth: Google, Apple, email code, secure session storage | M |
| M4-04 | Deep links: universal links / app links for `/join/$code` and push | M |
| M4-05 | Offline snapshot (trip bundle cache) | M |
| M4-06 | Offline outbox + sync with idempotency | L |
| M4-07 | Games on the Flight fully offline | S |
| M4-08 | Native camera / photo picker + background-safe uploads | M |
| M4-09 | Notification data model + preferences UI + quiet hours | M |
| M4-10 | Notification scheduler + sender (FCM/APNs + email) | L |
| M4-11 | Reminder types wired to the schedule (deck list) | M |
| M4-12 | Store readiness: privacy labels, data safety, review notes | M |
| M4-13 | Release pipeline (Fastlane / EAS-like) | M |

---

### M4-01 · Spike (do first, timebox 3 days)
- Build the app in TanStack Start **SPA mode** (`spa.enabled`; the option exists in the installed `start-plugin-core` schema). Load it in a Capacitor WebView.
- Prove these work against the deployed Worker:
  - server functions (`createServerFn`) from the native origin: absolute base URL, CORS, auth header via `requireSupabaseAuth`
  - Supabase auth session persistence
  - a camera upload
- **Output:** a short decision record. **If server functions are awkward from native**, move the few that the native app needs (AI, checkout, delete) to plain `/api/*` routes or Supabase Edge Functions.

### M4-02 · Capacitor project
- `capacitor.config.ts`, iOS + Android projects in the repo. Bundle id such as `app.tripjunkies`.
- Icons from `docs/brand/app-icon-badge-728.png`. **Ask for a 1024×1024 master** (BRAND.md notes it's missing). Splash in the brand navy.
- Plugins: app, push-notifications (or Firebase messaging), preferences / secure storage, camera, share, haptics, network, splash-screen.
- **Acceptance:** the app installs on a device and opens to sign-in with no network (shows an offline notice).

### M4-03 · Native auth
- Google and **Apple** native sign-in → `supabase.auth.signInWithIdToken`. Email one-time code.
- Session in secure storage. Age gate on first sign-up (same server rules).
- **Acceptance:** all three methods work on iOS + Android; logout clears the tokens.

### M4-04 · Deep links
- Universal Links (iOS `apple-app-site-association`) + Android App Links (`assetlinks.json`) on `tripjunkies.app`.
- `/join/$code` opens the app if installed, otherwise the web.
- Push taps route to `deep_link`.
- **Acceptance:** tapping a shared invite in Messages/WhatsApp opens the join preview in the app.

### M4-05 · Offline snapshot
- Whenever online, and specifically at Takeoff, cache the current trip bundle in IndexedDB / SQLite: trip, members (names + avatars), phase windows, revealed schedule items, **flight game content**, own standings.
- The UI reads the cache first and shows "Offline · last synced 2h ago".
- **Acceptance:** with airplane mode on, Home and Play render the last state; flight games run.

### M4-06 · Offline outbox + sync
- Queue user actions offline with a client UUID: Daily Card answers, journal entries, wrap-up answers, proof photos (stored locally), Crew Check 👍, award votes only if a session is open.
- Flush in order on reconnect. The server keys on `(source, source_ref, user)` / the proof's unique key, so retries are safe. Rejections (deadline passed) show a friendly message.
- **Rules:** ★02, R-109 (deadlines are the server's).
- **Acceptance:** E8 passes; killing the app mid-sync and reopening causes no duplicates (pgTAP + device test).

### M4-07 · Games on the Flight offline
- `GameArcade` / `OnePhoneNight` content bundled or cached; no AI calls offline (Mix It Up disabled with a note).
- **Rules:** R-334.
- **Acceptance:** works from a cold start in airplane mode.

### M4-08 · Camera + uploads
- Native camera / photo picker; compress (reuse `compress-image.ts` logic); resumable or retrying upload; EXIF location **stripped** before upload (privacy).
- **Acceptance:** a 12 MP photo uploads in under 5s on 4G; no GPS EXIF on stored files.

### M4-09 · Notification model + preferences
- Tables `device_tokens`, `notification_prefs`, `notification_queue`; `profiles.quiet_start/quiet_end` ([03 §11](../03-target-architecture.md)).
- **Me → Notifications:** a toggle per type (push / email), quiet hours (default 22:00–08:00 local), a test notification button.
- Permission prompt at a sensible moment (after joining a trip, not on first launch).
- **Rules:** R-801, R-812.
- **Acceptance:** preferences persist; a muted type is never sent (pgTAP on the enqueue function).

### M4-10 · Scheduler + sender
- pg_cron (every minute) → `/api/cron/notify` (cron-key auth, same pattern as purge-photos) → picks `queued` rows with `send_after <= now()` → FCM HTTP v1 (Android + iOS via APNs). Email backup (Resend / Postmark / SES) when there's no token or the push fails, if the user enabled email.
- Quiet hours: when enqueuing, shift `send_after` to the end of quiet hours in the user's zone, **unless** the deadline would pass (then send just before quiet hours start).
- Dedupe key per (user, type, ref). Retry with backoff. Log failures.
- **Acceptance:** 1,000 queued notifications send in under 1 minute on staging; quiet hours are honoured across zones.

### M4-11 · Reminder types (deck slide 18)
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

- Re-plan the queue when dates, call nights or the crowning time change.
- **Acceptance:** E18 passes; editing a call night moves its reminders.

### M4-12 · Store readiness
- Apple privacy nutrition labels + Google Data safety form (photos, email, birth date, usage data).
- Account deletion in-app (exists: `deleteMyAccount`).
- Age rating questionnaire (UGC + photos → likely 12+ / Teen).
- Review notes with a demo account + sandbox trip.
- Screenshots in the Airline Look.
- Make sure the app does enough natively to clear "minimum functionality" review: push, camera, offline, haptics.
- **Acceptance:** the listings are drafted; internal-testing builds are approved by TestFlight beta review.

### M4-13 · Release pipeline
- CI job: `build:spa` → `cap sync` → Fastlane (iOS signing, TestFlight upload; Android AAB, Play internal track).
- Version = web version.
- Over-the-air web updates (e.g. Capgo / Appflow live updates) are optional, **only if** they comply with store rules. Otherwise ship store builds.
- **Acceptance:** one command / tag produces both builds.
