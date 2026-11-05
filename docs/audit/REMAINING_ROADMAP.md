# Remaining roadmap

**Date:** Nov 5, 2026. Built from [`dev-docs/owner-go-live-steps.md`](../../dev-docs/owner-go-live-steps.md), [`dev-docs/06-open-questions.md`](../../dev-docs/06-open-questions.md), [`dev-docs/m6-security-and-privacy-audit.md`](../../dev-docs/m6-security-and-privacy-audit.md), the milestone status tables and this audit. Every term (Q17, Q29, P4, P8) is quoted from those documents, not interpreted.

## Item by item

| Item | Status | Already resolved? | What remains | Depends on | Risk | Next action |
|---|---|---|---|---|---|---|
| `owner-go-live-steps.md` | 3 of 18 items checked (the PR #6 item was checked in this audit) | Partly | Branch protection, staging accounts, VAPID keys, phones, domain, Google, SMTP, Sentry, images, store art, legal, pen test, content, production | Owner | Launch can't start | Owner works through "Now" |
| Staging and production infrastructure (M0-02, M0-03) | Not started | No | Supabase projects, Cloudflare account and Worker, domain, secrets, `scripts/deploy.sh staging` | Owner accounts and payment | Nothing has run hosted | Create staging (owner steps §1) |
| SMTP for auth email (owner steps 2.3) | Not configured | No | Email sender and DNS; `SMTP_*` settings for `deploy.sh auth` | Owner, domain | Sign-up codes and password reset can't be delivered; Supabase's default mailer is rate-limited | Pick Resend, Postmark or SES |
| Full E2E coverage | 59 mocked, 13 PWA, 3 live tests; all pass except one live test not run here | Mostly | Real-stack E2E for create, edit, delete, leave and remove; a desktop project; live invite join on a fresh stack (CI runs it) | Fresh local stack or CI | Real-backend UI gaps | Add live specs for trip management in a later PR |
| Offline and real-device testing (M4-10) | Offline passes in Chromium (13/13) | Browser only | The iPhone and Android checklist at the end of M4 | Staging, phones | iOS Safari PWA differences | After staging |
| CI artifacts and remote CI | CI uploads Playwright artifacts `if: failure()` (7 days); traces `retain-on-failure`. Remote CI passed on PR #1, #2 and both merges | Yes | Make CI required before merge (B-02) | Owner | Merges ahead of CI | Turn on branch protection |
| Legal (M6-09, Q11) | Not done | No | Terms and Privacy for 18+ self sign-up, teen invites, photo deletion after Day 7, AI checks and moderation; lawyer review; legal version bump | Owner, lawyer | Text no longer matches the app | Brief the lawyer |
| Zod 4 migration (S6, B-01) | Not done | No | zod 3 → 4 in 17 files; `bun audit fix` for transitive advisories | Approval | High advisory (memory DoS) | Approve the upgrade PR |
| **Q17** "Sign-in methods: email (password or one-time code?), Google, Apple?" | Open | No | Decision. Default: email code + Google. Google needs an OAuth client (owner steps 2.2) | Founder | Sign-in UX | Founder decides |
| **Q29** "Surprise Drop present live (R-343)" | Built with defaults: flat 10, all four games, expires with the crown, solo sends photos | Built; confirmation pending | Founder confirmation | Founder | Rule changes later | Founder confirms |
| **P4** "teen avatars: whether they should be leader-only too" | Open for legal review | No | Decision; if leader-only, a policy change plus tests | Lawyer, founder | Minors' images | Include in the legal review |
| **P8** "Re-planning: moving dates deletes items' proofs and points" | Ticket (product decision) | No | Lock dates once a trip starts, or move proofs to the new item | Founder | Data loss for live trips if dates move | Founder picks an option, then a migration with tests |
| Content library (M3-02) | Admin screen built; 459 items seeded; most kinds below 30 per mode | Partly | Founder review and tagging of `supabase/seed/content_candidates.csv` (2,938 lines); AI tailoring needs `AI_API_KEY` | Founder, AI key | Repetitive content | Founder tags in the Content admin |
| Monitoring (M0-12, M6-08) | Browser Sentry wired but no DSN; nothing on the Worker | No | Sentry DSN, Worker Sentry, cron alerts | Owner (Sentry account) | Blind in production | Create a Sentry project |
| Load testing (M6-08) | Not done | No | Lighthouse on Slow 4G; 500-player load test | Staging | Unknown capacity | After staging |
| Beta readiness | See [BETA_READINESS_REPORT.md](BETA_READINESS_REPORT.md) | — | — | — | — | — |

## By who acts

**Code issues fixable now (this audit: done):**
- B-08: pgTAP isolation.
- B-09: signed-out admin check.
- B-10: E2E warm-up.
- B-11: setup error text.

**Code changes that need your approval:**
- Dependency upgrades: `bun audit fix` and zod 4 (B-01).
- The `.validator()` rename (B-03).
- Removing or mounting the unused files, including `OfflineTripCards` (B-07).
- Replacing `vite-tsconfig-paths` (B-13).
- Moving the 11 retired tables (M1-08).
- Real-stack E2E for trip management.

**Configuration that needs your input:**
- Branch protection (B-02).
- VAPID keys.
- Google OAuth client.
- SMTP sender.
- Sentry DSN.
- `AI_API_KEY` and `AI_MODEL`.

**External dependencies:**
- Supabase and Cloudflare accounts and billing.
- Domain and DNS.
- Lawyer.
- Designer: the ticket-stub card, the Airline Look and the postcard art.
- Phones for M4-10.
- 3–5 real crews for the beta.

**Product decisions:**
- Q17 and Q18.
- Q29 confirmation.
- P4 and P8.
- Mount or remove offline trip cards (B-07).
- External pen test (M6-07).

**Production launch tasks:**
- Production Supabase on the Pro plan with backups.
- `deploy production`.
- Legal sign-off.
- Data-protection basics.
- Beta with crews, then launch (owner steps §5 and §7).
