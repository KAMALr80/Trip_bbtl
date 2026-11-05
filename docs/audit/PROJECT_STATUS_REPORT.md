# Project status report

**Date:** Nov 5, 2026 · **Code audited:** `main` at `3d2bfcd` (Phase 1 merged as `0520cd0`, authentication hardening as `d13acf3`) · **Environment:** Windows 11, Node 26.13, Bun 1.4.2, Docker 29.9, Supabase CLI 3.0 (2.121 for tests), local stack only.

Related reports in this folder: [testing](TESTING_REPORT.md), [bug register](BUG_REGISTER.md), [fixes and regression](FIXES_AND_REGRESSION_REPORT.md), [remaining roadmap](REMAINING_ROADMAP.md), [beta readiness](BETA_READINESS_REPORT.md).

## What TripJunkies is

TripJunkies is a mobile-first web app (PWA) that turns a group trip into a game. A Captain creates a trip, and the crew joins by code or invite. The trip runs through four phases: Pre-Flight, Takeoff, Trip Season and Baggage Claim. Along the way players earn points from Daily Cards, sealed quests, Surprise Drops, missions and Game Night Live. Each season crowns a winner (Early Bird and Jet Setter), and players keep a Passport of stamps, badges and a trip postcard. Founders get an in-app admin area: Test Lab, users and trips, photo review and content.

- **Product rules:** [`dev-docs/02-game-rules-spec.md`](../../dev-docs/02-game-rules-spec.md), taken from the founder's deck.
- **Plan:** [`dev-docs/README.md`](../../dev-docs/README.md) and [`dev-docs/milestones/`](../../dev-docs/milestones/).

## Architecture

- **Client:** React 19, TanStack Start / Router / Query, Tailwind v4, shadcn/Radix and i18next. Routes are thin; features live in `src/features/`. All database access goes through `src/data/`, which calls Supabase RPC wrappers.
- **Server:** TanStack server functions in `src/lib/*.functions.ts`, built by Nitro into a Cloudflare Worker.
  - Every function that acts for a player uses `requireSupabaseAuth`. The client sends a Bearer JWT, which the server verifies with `getClaims`.
  - The service-role key is used only after the caller has been checked.
  - `loadPublicGuide` is public by design and validates its token.
  - The cron routes in `src/routes/api/public/*` check a secret.
- **Database:** Supabase Postgres.
  - `public` has 161 tables and 366 functions; `trip_private` has 14 tables and 508 functions.
  - The game rules (phase engine, points ledger, crowns, age gates) are `SECURITY DEFINER` functions.
  - RLS is on for every public table, and the 7 storage buckets are private.
  - There are 7 pg_cron jobs.
- **History:** the code was exported from Lovable and is now maintained in this repository. The Git remote is `KAMALr80/Trip_bbtl`, and CI runs from `.github/workflows/ci.yml` (Web, Database and Supabase jobs).

## Inventory

### Completed (per the milestones, and verified by tests in this audit)

| Area | Milestones | How it was verified |
|---|---|---|
| Ownership, CI, Lovable exit | M0 | CI green on GitHub; local builds |
| Cleanup, one look, real routes, schema baseline | M1 | pgTAP 08–12; mocked E2E (shell navigation) |
| Captain setup wizard, phase engine, rooms, Co-Captain powers | M2 | pgTAP 13–17; E2E setup wizard and captain tiles |
| Points ledger, content library, Daily play, proofs and Crew Check, Game Night Live, crowns, Surprise Drops (including R-343 present live), journal and guide | M3 | pgTAP 18–24 and 35; E2E daily play, crew check, game night, surprise drop, journal |
| Install, offline flight play, outbox, snapshot, web push | M4 (code) | PWA E2E 13/13; pgTAP 25 |
| Postcards, wrap-up, Passport, levels, badges, Me tab | M5 | pgTAP 26–29; E2E postcard and profile |
| Age tiers, least privilege, bucket limits, moderation, Test Lab, admin area, content admin (M3-02) | M6 (code) | pgTAP 02, 30–34; E2E admin and moderation |
| Authentication hardening | `d13acf3` | 10/10 authentication checks; signed-out E2E |

### Partly done

| Item | What's missing |
|---|---|
| M3-02 content library | AI tailoring needs `AI_API_KEY`; the founder has to review content up to 30 items per mode |
| M3-05 / M3-09 | Ticket-stub card designs; a reminder before a drop ends |
| M5-04 postcard | A server-rendered image and the designer's art |
| M1-07 i18n | About 1,870 strings in 89 files are not in the catalog yet |
| M1-08 retired tables | 11 can move now; 41 are still reached by live code ([audit](../../dev-docs/m1-08-retired-tables-audit.md)) |
| M6-01 AI photo checks | The labelled evaluation run needs `AI_API_KEY` |
| Offline trip cards | `OfflineTripCards` exists and its art is precached, but no screen ever renders it ([B-07](BUG_REGISTER.md)) |

### Missing or not started (they need infrastructure or people)

- Staging and production environments (M0-02, M0-03).
- M4-10 checks on real phones.
- M6-08: performance, monitoring and load testing.
- M6-09: legal text.
- M6-10: crew beta.
- M6-11: launch.

### Known bugs

[BUG_REGISTER.md](BUG_REGISTER.md) lists **15 findings**. There are **0 P0 and 0 P1** issues. The two P2 items are dependency advisories (B-01) and CI not being required before a merge (B-02); the other 13 are P3. B-08 to B-11 were fixed in this audit and merged by PR #3 (`50b4e21`). B-12 and B-14 were fixed in the final verification, on the `final-verification` branch (not merged yet).

### Security risks

These are risks and decisions, not open exploits.

- 35 dependency advisories, 14 of them high. Most are in build tooling (including `sharp` under `miniflare`); `zod` is a direct dependency below 4.6.6.
- Signed photo links last 1 hour and still work if shared (P3).
- Teen avatars are visible to the crew, pending legal review (P4).
- Moving a trip's dates after it starts can delete proofs (P8).
- 41 retired tables are still reachable by live code.
- No external penetration test has been done.
- Nothing has been checked against a hosted environment.

### Gaps in test coverage

- Live E2E test 2 (joining through an invite) was not run here, because it changes local membership.
- There are no signed-in E2E tests for the trip-management mutations (create, edit, delete, leave, remove) against the real stack. These are covered by pgTAP and by the mocked E2E.
- Desktop viewports are not covered: every Playwright project is iPhone 13.
- Real devices, staging, load and performance are untested.
- Password reset and email delivery are untested (no SMTP, and no approval to send email).

### Production launch blockers

See [BETA_READINESS_REPORT.md](BETA_READINESS_REPORT.md):

- staging and production infrastructure;
- SMTP for auth email;
- legal text;
- checks on real phones;
- monitoring and load testing;
- product decisions Q17, P4 and P8;
- the content library at launch size.

### Pending product decisions

These are defined in [`dev-docs/06-open-questions.md`](../../dev-docs/06-open-questions.md) and [`dev-docs/m6-security-and-privacy-audit.md`](../../dev-docs/m6-security-and-privacy-audit.md):

- **Q17**, sign-in methods. The default is an email code plus Google; it is not answered yet.
- **Q18**, payments.
- **Q29**, the R-343 defaults. They are implemented, and the founder needs to confirm them.
- **P4**, teen avatars, which needs legal input.
- **P8**, how to protect proofs when trip dates change.
- The other questions without an `Answer:` line (Q2–Q5, Q7–Q10, Q14, Q19, Q21, Q22 and Q25–Q27) are not open. The founder accepted their defaults on Oct 26 (for M2) and Oct 30 (for M3), as the top of the file records.
