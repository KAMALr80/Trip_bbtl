# 08 — Testing & QA Plan

**Starting point:**
- **Zero automated tests.**
- **66 open roadmap items** reading "verify signed-in … blocked". Lovable's agent could never sign in, so **assume every signed-in flow is untested.**
- The scoring and timing rules live in SQL, which makes them very testable.

---

## 1. Test layers

| Layer | Tool | What | Where it runs |
|---|---|---|---|
| Pure logic | **Vitest** | Phase calculation (TS mirror), time-zone helpers, room config, points formatting, collage layout maths | CI on every PR |
| Database rules | **pgTAP** (`supabase test db`) | Every `trip_private` function that awards points, changes phase, checks a role or age, or reveals content. **The most important layer.** | CI against `supabase start` |
| Security | pgTAP + scripted probes | RLS: non-member can't read; member can't write directly; pending member sees nothing; teen photo privacy; sealed text hidden before reveal | CI |
| Component | Vitest + Testing Library | Setup wizard steps, Play hub states, Crew Check card, Game Night Live voting UI | CI |
| End to end | **Playwright** (mobile viewport 390×844, plus 360 and 430) | Critical flows (§3) with 2–3 real accounts in parallel browser contexts | CI on preview deploy; nightly on staging |
| Offline | Playwright `e2e/pwa` (`playwright.pwa.config.ts`: build with the service worker, `wrangler dev`) | Worker install, offline Home and pages, offline page, nothing from `/api` cached | CI |
| Real devices | Manual (iPhone with the app installed from Safari, Android Chrome) | Install, service worker updates, offline outbox, web push, camera upload | Before each release that touches them |

**Shared fixtures:** `supabase/tests/fixtures/phases.json` drives **both** the pgTAP phase tests and the Vitest phase tests. That's how the SQL and TypeScript phase engines are kept identical (03 §6).

## 2. Time travel

The phase engine takes `p_at` (03 §6). Tests pass explicit instants. **No test should depend on the real clock.** For E2E, keep the **Test Lab** time travel (`trip_private.lab_*`), allowed **only on sandbox trips** and **only for admins**.

**Must-cover time cases:**
- Pre-Flight close at 23:59:59 vs 00:00:00 home time (R-101)
- Takeoff day across **DST changes** (US/EU March/October/November)
- Home zone UTC−5 and trip zone UTC+8, with "We've arrived" tapped at various local times; auto-backup at 23:59 the next night (R-103)
- Trip zone **UTC+13/+14** (Tonga, Kiribati) and **UTC−10** (Hawaii): date-line edge cases
- Late start: setup finished on Trip Season day 3 → starts in Trip Season (R-105)
- Pre-Flight = 0 / Skip → no Early Bird (R-105)
- Game Night auto-close at midnight (R-404); Crew Check 24h expiry (R-411)
- Baggage Claim Day 7 lock (R-605)

## 3. Critical end-to-end flows (Phase 1 exit criteria)

| # | Flow | Accounts |
|---|---|---|
| E1 | Sign up (email code) → age gate → Explore tour → Home | new adult |
| E2 | Captain creates a **Going on a Trip** (5 screens) → shares code → 2 friends join → crew visible | Captain + 2 |
| E3 | Pre-Flight day: Daily Discovery (Home), Daily Card (Play), sealed quest opens within 3h → +5 | Captain + 2 |
| E4 | **Game Night Live**: present → 👍 → 20 pts; secret Awards; Co-Captain closes; reopen; auto-close | 3 |
| E5 | **Crew Check**: photo proof → another player 👍 → approved; no 👍 → expired after 24h | 2 |
| E6 | Pre-Flight closes → **Early Bird** crowned (tie-break case too) | 3 |
| E7 | Takeoff: 3 Airport Missions reveal, proof, cap 12, points land in Trip Season | 2 |
| E8 | **Offline**: airplane mode in the installed web app → flight games work → journal/answers queued → back online → synced once (no duplicates) | 1 phone (installed) |
| E9 | "We've arrived" by **Co-Captain** → Trip Season banner with city; trip quest assigned | 3 |
| E10 | Surprise Drop: opens, all play, AI check pass → auto-approve; AI unsure → Crew Check | 3 |
| E11 | Crowning night → **Jet Setter** crowned | 3 |
| E12 | Baggage Claim: nominate → heart → 3 questions → Day 7 lock → collage on every passport; other photos purged | 3 |
| E13 | **Window Seat solo**: daily quest 5 + journal 2, goal-based crowns, guide, Storyteller progress | 1 |
| E14 | **Explore a Culture** group (at home): finale night, Culture Collector badge, postcard | 3 |
| E15 | **Friends off the app**: one phone, names, winners tapped, nothing saved, host gets stamp only | 1 |
| E16 | **Teen**: Captain teen invite → teen account → `has_minors` effects (no alcohol content, photo privacy) | Captain + teen |
| E17 | Remove a player; Co-Captain cannot delete the trip; Captain deletes with "DELETE" | Captain + Co + 1 |
| E18 | Push reminders arrive at the right local time; quiet hours defer; muting a type stops it | 2 phones (iPhone installed, Android) |
| E19 | Passport: level changes when a new country stamp is added; public vs private view | 2 |

## 4. Test accounts matrix (seed)

| Account | Age | Role in seeded trips | Notes |
|---|---|---|---|
| `founder@…` | adult | admin | `app_admins` |
| `cap@…` | 25 | Captain | home zone America/New_York |
| `cocap@…` | 30 | Co-Captain | home zone Europe/London |
| `p1@…`, `p2@…`, `p3@…` | 22, 19, 40 | members | p2 (19) can't be Captain (R-904) |
| `teen@…` | 15 | member via teen invite | once Q12 is settled |
| `solo@…` | 28 | solo Window Seat | |

Use **plus-addressing** on a team inbox, or Supabase local Inbucket for codes.

## 5. Regression baseline before refactoring (M0)

Before changing behavior, write **characterisation tests** for the rules being **kept**:
- sealed quests (drop, open, speed bonus, proof access)
- Airport Missions (window, cap 12)
- `confirm_departure` / `trip_season_start_at`
- join / approve / remove
- age gates
- delete trip

They pin down current behavior, so the M1 cleanup can't silently break it.

## 6. QA checklist per release
- [ ] All CI green (unit, pgTAP, Playwright smoke)
- [ ] Migrations applied to staging; `supabase db diff` is empty afterwards
- [ ] Manual pass on iPhone (Safari + installed app) and Android (Chrome + installed app) at 360/390/430 widths
- [ ] Reduced-motion and dark-mode spot check
- [ ] AI kill switch tested (`ai_gate` off → app falls back to pre-written content)
- [ ] Release notes list any rule built on a default from [06](06-open-questions.md)
