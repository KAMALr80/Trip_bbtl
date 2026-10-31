# M6 — Trust, Safety & Launch

**Deck priority:** 08 (AI photo checks + moderation, flags only). Also from slide 23: *"the age and photo-privacy rules"*, *"a simple admin area with test trips"*, and launch (web only, Q16: no store apps).
**Depends on:** M3 (proof pipeline), M4 (install, offline, notifications), M5 (photo retention).
**Exit criteria:**
- AI checks live behind the kill switch.
- Moderation queue in admin.
- Age and privacy audit signed off.
- Full Phase 1 E2E suite (E1–E19) green.
- Production live on `tripjunkies.app`.

| ID | Task | Size |
|---|---|---|
| M6-01 | AI vision proof checks (Bingo, Scavenger, Photo) | M |
| M6-02 | Image safety moderation (flags only) + admin queue | M |
| M6-03 | Age rules audit vs deck (R-904, Q12) + teen invite flow | M |
| M6-04 | Photo-privacy audit (buckets, signed URLs, minors, EXIF, retention) | M |
| M6-05 | Admin area cleanup (users, trips, beta codes, test trips, content) | M |
| M6-06 | Test Lab update for the new engine | M |
| M6-07 | Security review (RLS, grants, server functions, secrets) | M |
| M6-08 | Performance & reliability (load test, slow-network test, cron monitoring) | M |
| M6-09 | Legal pages update (Terms, Privacy, teen consent, photo deletion, AI use) | S (+ lawyer) |
| M6-10 | Full regression + beta round with real crews | L |
| M6-11 | Web launch checklist | S |

---

### M6-01 · AI vision proof checks
- Implement `checkProofPhoto` (M3-14) with a vision-capable model. Input: the downscaled photo (≤ 1024px) + challenge text. Output: `pass / unsure / fail` + short reason + safety flags.
- Store **only the verdict** (no embeddings, no face data).
- Calls go through `ai_gate` caps; on error → `unsure` (goes to Crew Check).
- Only Bingo, Scavenger and Photo Challenge proofs (R-413, Q3).
- **Acceptance:** a labelled test set of about 100 photos → at least 90% agreement on clear pass/fail; the kill switch turns all checks into `unsure`.

### M6-02 · Image moderation (flags only)
- Run a safety check on every uploaded photo (proofs, trip photos, avatars if custom). Flagged items are **hidden from others pending review** but never auto-deleted (R-905).
- Admin queue: approve / remove / warn, with an audit log. Reuse `photo_reports` / `photo_removed`.
- Keep the user "Report" action.
- **Acceptance:** a flagged photo is invisible to the crew until reviewed; reviewers see it with context.

### M6-03 · Age rules audit
- Compare the DB functions (`guard_auth_signup_age`, `set_teen_dob`, `join_trip`, `manage_trip_member`, the `has_minors` trigger, `inspiration_age_gate`) with R-904 and the Q12 decision:
  - 18+ self sign-up
  - **18–20 can't be Captain**
  - **13–17 only by Captain invite**
  - alcohol content only for 21+ **and** never in `has_minors` trips
- Build or adjust the **teen invite** flow (the Captain generates a teen link; the teen account is created via the link; a parent/guardian step if legal requires it).
- **Acceptance:** pgTAP matrix of age × role × action; E16 passes.

### M6-04 · Photo-privacy audit
- Check every bucket: private; signed URLs with a short expiry; path ownership policies; minors' photos visible to uploader + leaders only; EXIF location stripped; retention (M5-05) works; account deletion removes photos.
- **Acceptance:** a written audit with fixes merged.

### M6-05 · Admin area cleanup
- Keep the in-app founder dashboard (Q24): **users** (search, disable), **trips** (search, view, archive), **beta codes / waitlist**, **bug inbox**, **AI guard** (caps, kill switch), **content library** (M3-02), **moderation queue** (M6-02).
- Remove the retired sections (Founder features / preview levels, looks).
- **Acceptance:** guarded by `is_app_admin` on the server; every admin action logged.

### M6-06 · Test Lab update
- Sandbox presets for every room × mode on the new engine.
- Bots can: answer daily items, upload proofs, 👍, vote awards.
- **Time travel** drives `trip_phase(p_at)` for sandbox trips only.
- "Jump to phase" buttons. Reset / delete (type DELETE).
- **Rules:** R-908.
- **Acceptance:** the founder can play a full 5-day trip with bots in under 15 minutes.

### M6-07 · Security review
- Check that RLS is on for all tables.
- List every `SECURITY DEFINER` function: does it check identity and role? Is `search_path` set?
- Grants: nothing to `anon` except public legal/version.
- Server functions use `requireSupabaseAuth` and validate input with zod.
- Secrets are not in the client bundle (scan the build).
- Rate limits: join codes (exists), uploads, AI.
- Dependency audit.
- **Acceptance:** the findings are fixed or ticketed; an optional external pen-test before public launch.

### M6-08 · Performance & reliability
- Lighthouse on mid-range Android at Slow 4G: interactive in under 4s on Home/Play.
- Load test on staging: 500 concurrent players in 50 trips (votes, uploads).
- Cron job monitoring (crowning, Day 7 lock, notifications, Crew Check expiry): alert on failure (Sentry cron monitors / health table).
- **Acceptance:** targets met; alerts reach the team channel.

### M6-09 · Legal pages
- Update Terms / Privacy (`src/lib/legal.ts`, `/legal/$document`) for: photo deletion after Day 7, AI checks on photos, teen accounts, push / email notifications, data retention, account deletion. Re-collect consent if materially changed (`account_consents`).
- **Lawyer review recommended.**

### M6-10 · Full regression + crew beta
- Run E1–E19 on staging: desktop, iPhone (Safari and installed) and Android (Chrome and installed).
- Then a **real beta**: 3–5 crews (one Going on a Trip, one Window Seat, one at-home culture, one off-app) with the founder.
- Triage through the bug inbox.
- **Acceptance:** no P0/P1 open; the founder signs off.

### M6-11 · Web launch
- Production checklist: backups, monitoring, `beta_free` still on until payments, support email, the service worker kill switch tested, VAPID keys set, `app_settings.public_launch` on.
- Landing page explains how to install the app (Android install card, iPhone Add to Home Screen).
- **Acceptance:** production is live on `tripjunkies.app`; a new player can sign up, install and join a trip on both phone types.
