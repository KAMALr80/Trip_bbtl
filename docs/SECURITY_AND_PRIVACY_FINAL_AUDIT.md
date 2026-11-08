# Security and privacy audit

**Date:** Nov 8, 2026 · **Branch:** `fix/post-merge-p2-qa` · **Scope:** the database, storage, authorization, account deletion and the client bundle. Hosted Supabase and Cloudflare were not available, so everything here is verified on local stacks.

Earlier reviews this builds on: [`docs/audit/AUTHORIZATION_REVIEW.md`](audit/AUTHORIZATION_REVIEW.md) and [`dev-docs/m6-security-and-privacy-audit.md`](../dev-docs/m6-security-and-privacy-audit.md).

## 1. How access works

- **Writes.** Every privileged write (roles, joins, approvals, points, crowns, proofs, schedule, postcards) goes through a `trip_private` SECURITY DEFINER function behind a `public` invoker wrapper. Each function checks the caller with `auth.uid()`, `is_leader`, `is_captain` or `is_app_admin`. Row-level security (RLS) denies direct writes.
- **`trip_private` schema.** PostgREST doesn't expose it; requests to it get 406. `join_names` and `join_declines` live there with RLS on and no grants to `anon` or `authenticated`.
- **Archived trips.** These are read-only through `<table>_archive_guard` triggers (test `08_archive_mode`).
- **Founder screens.** These need `is_app_admin()` on the server. The client now hides founder views and sections from everyone else (QA-12, QA-13), but the server check is what protects the data.

## 2. What the tests prove

| Area | Evidence | Result |
|---|---|---|
| Visitor (`anon`) and signed-in grants per table | pgTAP `30_security` | Pass |
| TRUNCATE, TRIGGER and REFERENCES removed, including for future tables | pgTAP `43_least_privilege` | Pass (new) |
| Own `profiles` row can't be deleted by a player | pgTAP `43` | Pass (new) |
| AI cost logged by the server only | pgTAP `43`; `ai-quota.server.ts` | Pass (new) |
| Leaders vs Crew, Co-Captain limits | pgTAP `16`; real-stack role matrix | Pass |
| Age gates, teen invites, 21+ content | pgTAP `02_age_gates` | Pass |
| Pending players' names visible to Captain and Co-Captain only | pgTAP `40`; real stack (crew, pending, outsider and founder all got 400) | Pass |
| Declined-request notice readable only by that player | pgTAP `42` | Pass (new) |
| Signed-out trip links make no data calls | E2E QA-18 | Pass (new) |
| Server secrets in the client bundle | `scripts/security/check-bundle.ts` | See the release report |

## 3. Account deletion and retention

The approved retention decisions (Nov 8) are implemented in `trip_private.scrub_deleted_account`. It is a BEFORE DELETE trigger on `auth.users`, so all of it is one transaction on every deletion path. Tests: `41_account_deletion_retention` (49 assertions) and a real-stack run through the delete screen (9/9).

| What | Action |
|---|---|
| Waitlist email; free text (wrap-up, journal, guide, weekly and At Home answers, cost notes, check-ins, drafts, bug reports); passport stamps; cards; non-Captain memberships | Deleted |
| Feedback text, cost report notes, solo stories, proof captions and AI notes, schedule tailored text | Cleared; the row stays |
| Postcard photos of the deleted player | Removed; the crown reads "Former player" with no id |
| `points_ledger`, `trip_crowns`, `season_champions` | Kept |
| `account_consents`, `moderation_log`, `admin_actions`, `photo_moderation`, `teen_accounts` | Untouched; checksums compared in test 41 |
| Join-request declines (N-6) | Deleted by foreign-key cascade |

The operational tables listed in [`FINAL_PROJECT_COMPLETION_AUDIT.md`](FINAL_PROJECT_COMPLETION_AUDIT.md) section 3 are kept. They wait for a founder and legal decision. No retention periods are set.

**Storage.** Photo files are removed by `deleteMyAccount` before the database delete, including trips the player left earlier. If a file can't be removed, the account stays and a retry finishes the job. Storage can't join a database transaction.

## 4. Open risks

| Risk | Severity | Status |
|---|---|---|
| Content Security Policy is report-only until staging (B-28) | P3 | Turn it on after a staging run without violations |
| Global AI cap (150/day) can be used up by about 10 users | P2 | Per-trip cap needs a founder number |
| 35 dev-only dependency advisories (B-01) | P3 | No production exposure found |
| Required CI checks not enforced on `main` (B-02) | P2 | Owner setting |
| Hosted configuration (auth redirect URLs, storage policies, cron secrets) not verified | — | Needs staging |
| Captain deleted from the Supabase dashboard leaves the trip without a leader | P3 | The app path forbids it; support procedure needed |
| No external penetration test | — | Owner decision before public launch |

No critical or high-severity issue is known in the code. Hosted configuration remains unverified until staging exists.
