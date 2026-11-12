# TripJunkies™ — Developer Handover Pack

**Prepared:** October 19, 2026
**Inputs:**
- the `tripjunkie-main` repository (exported from Lovable)
- *TripJunkies Game Flow & Points* deck, founder draft, October 2026, 23 slides

**Audience:** the development team taking the project over from Lovable AI.

The deck is the **source of truth for product rules**. It says so itself: *"This deck is the latest version and replaces earlier briefs and PDFs."* The code was built in about 40 Lovable prompt "rounds" against earlier briefs. A lot of it is reusable, but it carries older game rules that the deck no longer asks for.

---

## TL;DR for the team lead

1. **The stack is fine; keep it.** It's TypeScript + React 19 + TanStack Start on Cloudflare Workers, with Supabase (Postgres, Auth, Storage, pg_cron) behind it.
2. **It typechecks and builds cleanly**, but it has **zero automated tests**. 66 roadmap items are marked "verify signed-in…, blocked", so **signed-in flows have never been tested end to end**.
3. **The game rules live in Postgres.** There are about 125 tables and about 720 SQL functions, mostly in the `trip_private` schema. This is the most valuable part of the codebase, and also the riskiest.
4. **Up to three rule generations run side by side**, switched by trip columns: `legacy`, `season_rule='a2c'`, and `a2e_room`/`a2e_kind`. The code was told never to change existing trips, especially the live **"Siam Vibes" trip (join code `VRFQQM`)**. Ending that requires a founder decision; see [06-open-questions.md](06-open-questions.md) Q1.
5. **Recommended order:**
   - take ownership and add a safety net (M0)
   - remove what the deck dropped and restructure (M1)
   - build the deck's Phase 1, which is M2 → M6
6. **No native apps** (founder, Oct 31, 2026): the product is a web app players install from the browser. M4 covers install, offline play and notifications on the web.

---

## Where we are and what's next (Nov 6, 2026)

**Nov 6:** the stabilization, authentication-hardening, audit-fix, verification, documentation, hardening and authorization branches are merged (PRs #1–#7, `main` at `36ac013`), and CI passes. The audit's reports (status, tests, bugs, roadmap, beta readiness) are in [`docs/audit/`](../docs/audit/PROJECT_STATUS_REPORT.md).

**Done:** M1 and M2 (small leftovers in their status tables), M3 mostly done, M4's code (M4-01 –
M4-09). M0's code side is done; **nothing is deployed yet** because the staging accounts don't exist
([owner-go-live-steps.md](owner-go-live-steps.md) §1).

**M5 — memories & Passport** ([M5](milestones/M5-memories-and-passport.md)) is built with the
founder's defaults for Q11, Q13, Q23 and Q28: Postcard Picks, wrap-up week, the Day 7 lock, the Trip
Postcard, the Captain's tie-break and swap, the photo purge, stamps v2, levels, badges, the
after-trip view, the Passport Junkie profile, the Me tab and the 7-card tour. Its leftovers: a
server-rendered postcard image and the designer's art (M5-04, M5-13), hiding single photos once
something public shows them (M5-10), and running the lock on staging.

**M6 — trust, safety & web launch** ([M6](milestones/M6-trust-safety-and-launch.md)): the code
tasks are done with the founder's defaults for Q12 and Q24: age rules to the deck (teens only by
teen invite), the security review and photo-privacy audit ([write-up](m6-security-and-privacy-audit.md)),
image moderation, AI proof checks (waiting for `AI_API_KEY`), the admin area and the Test Lab for
the new engine. What's left of M6 needs staging, production, real crews or a lawyer (M6-08 – M6-11).

**Next in development, in order:**
1. **Staging first** (owner steps §1): then M4-10, M6-01's labelled-photo run, M6-06's full-trip run,
   M6-08 performance and monitoring, and M6-10 regression + crew beta.
2. **M4-10**, the real-phone checklist, once staging exists (step 12 covers wrap-up week and the postcard).
3. **M3 leftovers:** "present live" as Surprise Drop proof (R-343) and the content admin list/edit
   screen (M3-02) are built (Nov 3; R-343 uses the Q29 defaults, founder to confirm). AI tailoring of
   content waits for `AI_API_KEY`. The ticket-stub card designs
   (M3-05, M3-09) and the luggage-tag crown celebration (M3-11) wait for the designer.
4. **Cleanup that can be slotted in anywhere:** move the 52 retired tables to `legacy_archive` (M1-08,
   M3-16; [the audit](m1-08-retired-tables-audit.md) found 11 movable now, 41 still reached by live
   code), and move the remaining strings into the translation catalog as screens are touched (M1-07).
   The unreachable old setup code (M2-05) was removed on Nov 3.

---

**Your to-dos as the owner** (accounts, keys, decisions, phone checks) are one checklist at the top
of [owner-go-live-steps.md](owner-go-live-steps.md).

---

## What's in this pack

| File | What it's for | Who reads it |
|---|---|---|
| [01-current-state.md](01-current-state.md) | Stack, architecture, repo map, code health, Lovable dependencies, built-vs-deck gap matrix | Everyone, first |
| [02-game-rules-spec.md](02-game-rules-spec.md) | The deck rewritten as numbered, testable rules (`R-xxx`) that tasks refer to | Devs, QA, founder (to confirm) |
| [03-target-architecture.md](03-target-architecture.md) | Where we're going: routing, phase engine, points ledger, rooms as config, offline, web push | Tech lead, senior devs |
| [04-data-model.md](04-data-model.md) | Existing tables grouped by area with keep/change/retire, plus proposed new tables (SQL sketches) | Backend devs |
| [05-legacy-retire-list.md](05-legacy-retire-list.md) | Features, components, tables and functions to remove, and how to remove them safely | Tech lead, founder (to approve) |
| [06-open-questions.md](06-open-questions.md) | Decisions needed from the founder, each with a recommended default | Founder + PM |
| [07-dev-setup-and-lovable-exit.md](07-dev-setup-and-lovable-exit.md) | Run locally, environment variables, deploy, step-by-step move off Lovable | Devs, DevOps |
| [08-testing-and-qa.md](08-testing-and-qa.md) | Test strategy, test-account matrix, time-travel testing, critical flows | Devs, QA |
| [09-engineering-conventions.md](09-engineering-conventions.md) | Branching, migrations, PR checklist, Definition of Done, code style | Devs |
| [10-risks-and-gotchas.md](10-risks-and-gotchas.md) | Things that will bite you if nobody tells you | Everyone |
| [owner-go-live-steps.md](owner-go-live-steps.md) | Accounts, keys, decisions and legal steps only the owner can do | Founder |
| [milestones/](milestones/) | One file per milestone: tasks, files touched, acceptance criteria, dependencies | Devs, PM |

### Milestones at a glance

| Milestone | Theme | Deck priorities covered | Depends on |
|---|---|---|---|
| [M0](milestones/M0-takeover-and-foundations.md) | Take ownership, environments, CI, test harness, leave Lovable | — (enables everything) | — |
| [M1](milestones/M1-cleanup-and-restructure.md) | Remove dropped features, one visual look, real routes, schema baseline | Beta fixes (partly) | M0 |
| [M2](milestones/M2-captain-setup-and-phase-engine.md) | 5-screen Captain setup, phase engine, automatic time zones, Play in every room | ★04, 03, beta fixes | M1 |
| [M3](milestones/M3-core-game.md) | Points ledger, crowns, Daily Card/Discovery, Surprise Drops, Crew Check, Game Night Live | ★05 | M2 |
| [M4](milestones/M4-web-offline-notifications.md) | Installable web app, offline flight play + sync, web push + email reminders | ★01 (as a web app), ★02, 07 | M1, M3 |
| [M5](milestones/M5-memories-and-passport.md) | Postcard Picks, wrap-up week, collage, Passport profile, levels, badges, Me tab | 06 | M3 |
| [M6](milestones/M6-trust-safety-and-launch.md) | AI photo checks, moderation, age/photo-privacy audit, admin, web launch | 08, launch | M3, M4, M5 |
| [Later](milestones/LATER-phase-2-and-beyond.md) | Payments, Event Group, world map, Spanish, flight tracking, synced live screen | Phase 2+ | — |

★ = the deck's "core of the experience": with these four done, a crew can play a full trip.

### Suggested team shape
- **1 tech lead / backend (Postgres-heavy).** Owns `trip_private`, the points ledger, the phase engine, migrations and Row Level Security (RLS).
- **2 frontend devs (React/TypeScript).** Own setup, Play, Me and Passport.
- **1 web-platform-leaning dev**, who can be one of the above. Owns the service worker, offline sync, web push and real-device checks.
- **QA (part-time from M0, full-time from M3)** and a **designer** for the "Airline Look" (deck slides 21–22).

### How to use the task IDs
- Tasks are numbered `M<milestone>-<nn>`, e.g. `M3-04`. Rules are numbered `R-<nnn>` in [02-game-rules-spec.md](02-game-rules-spec.md).
- Put both in ticket titles and PR descriptions so anyone can trace code → task → rule → deck slide.
- Sizes are relative: **S** ≈ ≤2 dev-days, **M** ≈ 3–5, **L** ≈ 1–2 weeks, **XL** = split it before starting.
