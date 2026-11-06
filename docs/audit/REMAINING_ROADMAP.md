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
| CI artifacts and remote CI | CI uploads Playwright artifacts `if: failure()` (7 days); traces `retain-on-failure`. Remote CI passed on PRs #1–#3 and their merges | Yes | `main`'s ruleset blocks deletion and force-push; make the three CI jobs required before merge (B-02) | Owner | Merges ahead of CI | Add required status checks to the ruleset |
| Legal (M6-09, Q11) | Not done | No | Terms and Privacy for 18+ self sign-up, teen invites, photo deletion after Day 7, AI checks and moderation; lawyer review; legal version bump | Owner, lawyer | Text no longer matches the app | Brief the lawyer |
| Zod 4 migration (S6, B-01) | **Done** (zod 4.6.6, PR #6) | Yes | `wrangler` 4.158.0 is still open: dev-only; brings the `miniflare` 5 beta | zod 3 → 4 in 17 files (14 `.uuid()`, 4 `.catch()`; no `zodResolver`). Then `wrangler` 4.59.1 → 4.158.0 for 33 dev-only advisories (brings `miniflare` 5 beta). `bun audit fix` can't fix any of them | Approval | The only production advisory (authenticated memory DoS) | Approve the zod upgrade PR first |
| **Q17** "Sign-in methods: email (password or one-time code?), Google, Apple?" | Open | No | Decision. Default: email code + Google. Google needs an OAuth client (owner steps 2.2) | Founder | Sign-in UX | Founder decides |
| **Q18** "Payments (Phase 2): provider and when to turn them on? Tier change when players join mid-trip (R-902)?" | Open, scheduled "Later" | No | Decision. Suggested: Stripe on the web, keep `beta_free` on until then. The payment and cost functions stay dormant | Founder | None for the beta: payments are off | Decide before Phase 2 |
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
- Final verification (merged by PR #4): B-12 `.gitignore` duplicates, B-14 the network-dependent unit test.
- Merged by PR #6: zod 4 (B-01), `.validator()` (B-03), lint leftovers (B-04), Node 22 pin (B-13), AI `file` parts and low detail (B-15, B-16), the sign-up code template (B-17), the `28_passport` fixture (B-18), and clearing the query cache on sign-out (B-19).
- Authorization branch (`audit/trip-authorization-and-beta-readiness`): trip deletion cleans every bucket (B-20), sign-out stops push (B-21), push address rules (B-22), AI limits (B-23), Storyteller (B-25), indexes (B-26), and the standing attack matrix.

**Code changes that need your approval:**
- Dependency upgrades: `bun audit fix` and zod 4 (B-01).
- The `.validator()` rename (B-03).
- Removing or mounting the unused files, including `OfflineTripCards` (B-07).
- Replacing `vite-tsconfig-paths` (B-13).
- Testing the sign-up code email on staging (B-17); the template is in the repository now.
- Password re-check before deleting an account, and a `Content-Security-Policy` header ([review](AUTHORIZATION_REVIEW.md)).
- Storage cleanup when a Captain alone in a trip taps Leave (B-20).
- Splitting the 768 KB `_shell` chunk.
- `wrangler` 4.158.0 (B-01, dev-only).
- Moving the 11 retired tables (M1-08).
- Real-stack E2E for trip management.

**Configuration that needs your input:**
- Required CI checks on `main` (B-02).
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

**Decision notes (Phase 2, Nov 5).** These are recovered from `06-open-questions.md` and `m6-security-and-privacy-audit.md`. A "recommendation" is a suggestion, not a decision. Nothing is implemented until you approve.

| Item | What needs deciding | Choices | Technical impact | User impact | Recommendation |
|---|---|---|---|---|---|
| **Q17** sign-in methods | "email (password or one-time code?), Google, Apple?" Today: email + password, with a 6-digit code to confirm sign-up; Google works when the provider is configured, otherwise the app says so | a) email + password, as today; b) the written default: email code + Google; c) b plus Apple | b) needs SMTP (2.3), the code template (B-17), a Google OAuth client (2.2) and the redirect URIs. The code already handles Google on or off. c) needs an Apple developer account | Google is the fastest sign-up on phones; codes avoid forgotten passwords | The written default (b). Apple only if players ask |
| **Q18** payments | "provider and when to turn them on? Tier change when players join mid-trip (R-902)?" | a) the written suggestion: Stripe on the web, later; b) decide now | None for the beta: `beta_free` stays on, and the payment and cost functions stay dormant | None for the beta | Decide before Phase 2 (a) |
| **Q29** Surprise Drop "present live" | Built with defaults (flat 10, all four games, expires with 0 at the Trip Season crown, solo sends photos); "founder to confirm" | a) confirm; b) change points, games or expiry | Changing it is a migration plus pgTAP 35 | Scoring of Surprise Drops | Confirm (a), unless playtests say otherwise |
| **P4** teen avatars | "whether teen avatars should be leader-only too" (proof photos in trips with minors already are) | a) as today: visible to everyone sharing a trip; b) leader-only for minors; c) initials only for minors | b and c are a storage policy and avatar-read change, plus pgTAP | Teens' crew-mates see a photo, or initials | Ask the lawyer as part of M6-09. Until then, b or c is the more cautious default |
| **P8** re-planning | "Moving a trip's dates re-plans the schedule; items that no longer fit are deleted and their proofs (and points) cascade with them" | a) lock the dates once the trip has started; b) move proofs to the new item | a) a server-side check on date changes after the start, plus a test. b) mapping old items to new ones, which is harder. Today only the setup wizard limits date changes to before the trip; the database doesn't enforce it | a) Captains can't move dates mid-trip; b) points survive a move | a), enforced in the database |
| **OfflineTripCards** (B-07) | The component and `offline-trip-content.ts` were never rendered; M4-05 lists offline trip cards as part of flight play | a) mount it on the offline Play screen; b) delete both files and remove the `sw-plan.ts:66` entry | a) a place in Play, plus a PWA test. b) removes 2 files; the precache doesn't change (no images) | a) an extra card to play offline on a flight | Product owner decides. If M4-05 has no plan for it, b |

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
