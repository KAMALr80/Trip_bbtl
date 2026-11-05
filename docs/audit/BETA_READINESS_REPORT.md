# Beta readiness report

**Date:** Nov 5, 2026 · **Code:** `main` at `50b4e21`: the audit fixes, committed as `4c442c9` and merged by PR #3, with CI passing on the PR and after the merge. The final-verification changes (B-12, B-14 and these doc updates) are on the `final-verification` branch, waiting for PR review (not merged yet).

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
2. **Email.** An SMTP sender with DNS records (2.3), so sign-up codes and password resets are delivered.
3. **Required CI checks** on `main` (B-02). The ruleset already blocks deleting and force-pushing it.
4. **Phones.** The M4-10 checklist on one iPhone and one Android phone against staging.
5. **Legal.** Terms and Privacy updated and lawyer-reviewed (M6-09), including P4; then the legal version is bumped.
6. **Decisions:**
   - Q17, sign-in methods;
   - P8, protecting proofs when dates move;
   - confirm Q29.
7. **Monitoring.** A Sentry DSN, and cron and error alerts (M0-12, M6-08).
8. **Dependencies.** `bun audit fix`, the zod 4 upgrade and newer `wrangler` / `miniflare` for the `sharp` advisories (B-01).
9. **Content.** The founder reviews the library up to the launch target (M3-02).

## Optional before a beta

- Real-stack E2E for trip management, and a desktop Playwright project.
- The `.validator()` rename (B-03).
- Mount or remove `OfflineTripCards` (B-07).
- Move the 11 retired tables (M1-08).
- An external pen test (M6-07).
- Designer art (ticket-stub card, Airline Look, postcard image).
- `AI_API_KEY` for AI tailoring and photo checks (M6-01 evaluation).

## After staging is up, verify there

- Run `30_security` and the bundle check against staging.
- Run the M6-01 labelled-photo evaluation (needs `AI_API_KEY`).
- Do one full trip end to end (M6-06).
- Run Lighthouse on Slow 4G and the 500-player load test (M6-08).
- Run a regression pass, then a beta with 3–5 real crews (M6-10).
