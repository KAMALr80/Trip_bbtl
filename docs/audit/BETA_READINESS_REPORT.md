# Beta readiness report

**Date:** Nov 5, 2026 · **Code:** `main` at `ec98cef` (PRs #1–#4 merged; CI passed on PR #4 and after its merge). The Phase 2 review the same day (B-16, B-17, the dependency table, decision notes) changed documentation only: no code, dependency or setting.

## Verdict: **Not ready for a beta with real crews.** Ready to go to staging once the owner provides the accounts.

The code is in good shape locally:
- unit tests 205/205 and typecheck pass;
- ESLint has 0 errors, and the build passes with no secrets in the bundle;
- pgTAP: 35/35 on a fresh PG16 database;
- E2E: mocked 59/59, PWA/offline 13/13, live 2 run of 3 (both passed);
- authentication and role checks: 10/10.

The audit found no P0 or P1 issue.

A beta needs real people to sign in from a hosted URL. None of that exists yet: no staging or production environment, no email sender for sign-up codes, legal text that doesn't match the app, and no tests on real phones.

## Scorecard

| Area | State | Evidence |
|---|---|---|
| Application functionality | Strong locally | Every M1–M6 code task is built; E2E and pgTAP pass ([TESTING_REPORT.md](TESTING_REPORT.md)) |
| Database and RLS | Strong | RLS on every public table; 30_security; client-writable tables reviewed; artifacts match migrations |
| Authentication | Strong | 10/10 checks, including role access, session expiry and the Google disabled state |
| Security | Good, with open items | No exploit found. Open: dependency advisories (B-01), P3/P4/P8, no pen test, nothing checked hosted |
| Testing | Good locally | Gaps: real devices, desktop, a live-stack E2E for trip management, staging, load |
| Deployment | **Blocked** | No Supabase or Cloudflare accounts, domain or secrets |
| Operations | **Blocked** | No monitoring (Sentry DSN), no alerts, no load test, no backups (production Pro plan) |
| Process | Needs a setting | `main` can't be deleted or force-pushed now, but CI isn't required before a merge (B-02) |
| Legal and content | **Blocked** | Terms and Privacy outdated (M6-09); content below the launch target |

## Blockers before a beta, in order

1. **Staging.** The owner creates the Supabase and Cloudflare accounts, VAPID keys and secrets, then runs `deploy staging` (owner steps §1).
2. **Email.** An SMTP sender with DNS records (2.3), so sign-up codes and password resets are delivered. The sign-up template with the code is in the repository now (B-17); check it on staging.
3. **Required CI checks** on `main` (B-02). The ruleset already blocks deleting and force-pushing it; the exact UI steps are in B-02.
4. **Phones.** The M4-10 checklist on one iPhone and one Android phone against staging.
5. **Legal.** Terms and Privacy updated and lawyer-reviewed (M6-09), including P4; then the legal version is bumped.
6. **Decisions:**
   - Q17, sign-in methods;
   - P8, protecting proofs when dates move;
   - confirm Q29.
7. **Monitoring.** A Sentry DSN, and cron and error alerts (M0-12, M6-08).
8. **Dependencies.** The zod 4 upgrade is on the hardening branch, so no advisory reaches production. The 35 dev-only ones wait for a stable `wrangler` / `miniflare` (B-01).
9. **Content.** The founder reviews the library up to the launch target (M3-02).

## Optional before a beta

- Real-stack E2E for trip management, and a desktop Playwright project.
- The `.validator()` rename (B-03).
- Mount or remove `OfflineTripCards` (B-07).
- Move the 11 retired tables (M1-08).
- An external pen test (M6-07).
- Designer art (ticket-stub card, Airline Look, postcard image).
- `AI_API_KEY` for AI tailoring and photo checks (M6-01 evaluation).

## Beta QA plan (Phase 2, Nov 5)

"Local" can run today on this machine or in CI. The other columns need what they name. Mark each row only from a real run; none of the right-hand columns has been run yet.

| Area | Local (already passing) | Needs staging | Needs credentials / accounts | Needs physical devices |
|---|---|---|---|---|
| Mobile layouts | Mocked E2E at iPhone 13 (390×844); a11y (axe) | — | — | 360 px Android, a small iPhone, a large phone; no 360/430 Playwright project yet |
| PWA install | `e2e/pwa` install test (Chromium) | HTTPS staging URL | — | M4-10 steps 1–2 on iPhone (Safari → Add to Home Screen) and Android (Chrome) |
| Offline, reconnection, sync | PWA suite 13/13 (offline Home and pages, outbox, snapshot) | ✓ | — | M4-10 steps 4–7 and 11 (airplane mode, 12 MP camera photo, no duplicates, EXIF stripped, 7-day snapshot on iPhone) |
| Push notifications | PWA push test (mocked) | ✓ | VAPID keys (6.1) | M4-10 steps 3, 8–10 (test push, quiet hours, mute, update prompt) on both phones |
| Sign-in, sign-up code, password reset | 10/10 role and session checks; Google off, on and unknown (mocked) | ✓ | SMTP sender (2.3), template (B-17) | Inbox on a phone |
| Google OAuth | Mocked only | ✓ | Google OAuth client (2.2), redirect URI | One Android and one iPhone |
| Trips, invites, Captain and Crew permissions | pgTAP 01, 02, 05, 13, 16, 30; E2E join, invite, Captain tiles | Two or three real accounts | — | Invite link opened on a second phone |
| Proofs and Crew Check | pgTAP 20–23; E2E `crew-check` | ✓ (storage, signed links) | `AI_API_KEY` for AI verdicts (optional) | Camera upload on both phones |
| Surprise Drops | pgTAP 23, 35; E2E `surprise-drop` | Hosted cron (`settle_drops`) | — | — |
| Game Night Live | pgTAP 22; E2E `game-night-live` | Hosted cron (auto-close); real-time with 3+ players | — | 3+ phones at once |
| Postcards and Passport | pgTAP 26–29; E2E `postcard`, `profile` | Photo purge cron after Day 7 (M4-10 step 12) | — | Download my photos on iPhone |
| Moderation and admin | pgTAP 31–34; E2E `admin`, `moderation` | ✓ | `AI_API_KEY` for image moderation | — |
| Performance and load | — | Lighthouse on Slow 4G, 500-player load test (M6-08) | — | A mid-range Android |

**Exit criteria for a beta with 3–5 crews:** every row passes on staging and both phones; no open P0 or P1; B-02 closed; B-17 checked on staging; the hardening branch merged.

## After staging is up, verify there

- Run `30_security` and the bundle check against staging.
- Run the M6-01 labelled-photo evaluation (needs `AI_API_KEY`).
- Do one full trip end to end (M6-06).
- Run Lighthouse on Slow 4G and the 500-player load test (M6-08).
- Run a regression pass, then a beta with 3–5 real crews (M6-10).
