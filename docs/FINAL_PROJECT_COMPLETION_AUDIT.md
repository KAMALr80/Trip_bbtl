# Final project completion audit

**Date:** Nov 8, 2026 · **Branch:** `fix/post-merge-p2-qa`, on top of `1ba9389` · **Scope:** the whole app, against the evidence that exists today.

This is the source of truth for what is finished. A feature counts as **complete and verified** only when a test or a recorded real-stack run proves it. Having a screen or a button is not enough. Earlier evidence lives in [`docs/audit/`](audit/) and [`dev-docs/`](../dev-docs/README.md); the owner's steps are in [`dev-docs/owner-go-live-steps.md`](../dev-docs/owner-go-live-steps.md).

**Status key:**
1. Complete and verified.
2. Implemented, needs improvement.
3. Partly implemented.
4. Not implemented.
5. Blocked: needs credentials, assets, a hosted environment or a founder decision.

**How it was verified**

| Kind of evidence | What it is |
|---|---|
| **Unit** | Vitest |
| **pgTAP** | Database tests, run on a disposable local Supabase stack and on a plain PostgreSQL 16 harness |
| **E2E mocked** | Playwright against the dev server with a mocked backend |
| **E2E PWA** | Playwright against a production build served by `wrangler dev` |
| **Real stack** | Scripted journeys in a real browser against a disposable local Supabase stack (sign-up to postcard, role matrix, deletion; Nov 7–8) |

**Not run anywhere yet:** hosted Supabase, Cloudflare, real AI, real email, real push, Google sign-in, and real phones.

## 1. Feature inventory

| Module | What it does | Implementation | Permissions | Tests | Status |
|---|---|---|---|---|---|
| Sign-up, sign-in, sign-out | Email and password with a 6-digit code; Google button; password reset | `features/auth`, Supabase Auth; `guard_auth_signup_age` trigger | Server checks age at sign-up | E2E `signed-out`, `p3-regressions`; pgTAP `02_age_gates`; real stack | **1** for email. Google **5** (provider setup). Hosted email delivery **5** |
| Consent and birthday | Terms version and birthday, asked once | `LegalConsent`, `AgeGate`, `signup-answers.ts` (N-4) | `accept_legal`, `set_my_dob`, server-checked | Unit `signup-answers`; E2E N-4; pgTAP `02_age_gates` | **1** |
| Private beta | Codes, waitlist, beta lock | `BetaAccess`, `BetaCodes`; `redeem_beta_code` | Admin-only code management | E2E `admin`; pgTAP `30_security` | **1** |
| Account deletion | Re-check identity, leave trips, remove files, scrub, delete | `account.functions.ts`; `scrub_deleted_account` trigger | Owner only, password or recent sign-in | pgTAP `40`, `41`; real stack (9/9) | **1** locally. Hosted storage **5** |
| Create and set up a trip | Wizard: rooms, dates, Pre-Flight, vibe, time zone | `features/setup`, `trips.new` | Room limits in `room_rules` triggers | E2E `setup-wizard`; pgTAP `13_room_rules`, `16_limits_and_leaders` | **1** |
| Join, approve, decline | Join code with a name; Captain or Co-Captain approves; declined player is told | `InvitePreview`, `JoinNameField`, `approve_member`, `join_declines` (N-6) | Leader-checked, RLS | pgTAP `40`, `42`; E2E `join-name`, `join-flow`, N-6; real stack | **1** |
| Roles | Captain, Co-Captain, Crew; pass the crown; remove | `manage_trip_member`, `CaptainTools` | `is_leader` / `is_captain` server checks | pgTAP `16`; real-stack role matrix | **1** |
| Trip phases | Pre-Flight → Takeoff → Trip Season → Baggage Claim → wrapped | `trip_private.trip_phase`, `phase.ts` mirror | Server decides | pgTAP `14_phase_engine` plus fixture cases; unit `phase` | **1** |
| Which trip opens | Live, then upcoming; finished trips through Your Trips | `trip-order.ts` | n/a | Unit; E2E QA-03; real stack | **1** |
| Daily cards, quests, Showcase | Scheduled items per phase; Up now list | `plan_trip`, `PlayHub`, `up-now.ts` (N-3) | Member-scoped reads | pgTAP `14`, `25`; E2E `daily-play`, `play-engine`; unit `up-now` | **1** |
| Proofs and crew check | Photo or text proof, one 👍 approves, 24 h expiry | `submit_proof`, `approve_proof`, `expire_proofs` | Server-checked; RLS on storage | pgTAP; E2E `crew-check` | **1** |
| AI proof check | Pass, or unsure/fail sends it to the crew | `proof-check.server.ts` | Server only; key server-side | Unit (stub, errors, prompt injection) | **2**: fails closed ("unsure"). Real model **5** |
| Points, crowns, standings | Ledger, two crowns, season champions | `points_ledger`, `crown_season`, `CrewStandings` | Written only by private functions | pgTAP `39`; E2E `crew-standings` | **1** |
| Passport and stamps | Stamps at lock, levels, badges | `stamp_trip`, `refresh_passport`, `PassportBook` | Own data | pgTAP `28_passport`; unit `places` (N-7) | **1** |
| Journal and guide | Window Seat journal, shared guide | `write_journal`, `guide_items` | Members; public guide only by choice | pgTAP `24_journal_guide`; E2E `journal` | **1** |
| Wrap-up and postcard | Wrap-up week, Day 7 lock, postcard, photo purge | `lock_trip`, `TripPostcard`, `purge-photos` | Server lock | pgTAP `26_postcards`, `41`; E2E `postcard`; real stack | **1**. Purge on hosted cron **5** |
| Notifications | Queue, quiet hours, web push, email backup | `notification_queue`, `api/public/notify`, `sw.js` | Own preferences | pgTAP `25_notifications`; E2E `notifications`; PWA push test (local) | **2**: queue verified; real delivery **5** (VAPID, email provider, devices) |
| Offline / PWA | Install, offline read, queued writes | `scripts/pwa/build-sw.ts`, `data/offline` | Cache cleared on sign-out | E2E PWA 18/18; unit `offline` | **1** in Chromium. Real phones **5** |
| Founder and admin | Test Lab, reports, moderation, beta codes, AI guard, directory | `features/admin`, `is_app_admin` | Server `is_app_admin`; client hides links (QA-12/13) | E2E `admin`, `moderation`, `p3-regressions`; pgTAP `30_security` | **1** |
| At Home, Window Seat, Culture | Rooms for travel from home | `features/at-home`, `window-seat`, `culture` | Member-scoped | E2E `culture-entry`, `game-night*`; pgTAP | **2**: covered by mocked E2E only, not re-walked on the real stack this round |
| Trip costs | Pot and shares | `TripCosts`, dormant cost functions | Captain-only writes | pgTAP | **3**: dormant by design |
| Map | Trip map | flag `VITE_FEATURE_MAP` | n/a | none | **4** (off by flag) |
| Images | Founder photos, US state flags | `src/assets/*.asset.json` | n/a | none | **5** (QA-10: images still on Lovable) |

## 2. Findings worked in this round

| ID | Finding | Root cause | Fix | Regression test |
|---|---|---|---|---|
| N-3 | Showcase missing from Up now | `showcase` was not in the kind list | `up-now.ts` includes it | `src/features/play/up-now.test.ts` |
| N-4 | Consent and birthday asked twice | Sign-up saved them only when sign-up returned a session; with email confirmation the session comes later | Recorded from sign-up metadata on first load, through the same RPCs | `src/lib/signup-answers.test.ts`, E2E N-4 (2) |
| N-5 | A wrong code said "expired" | Supabase answers `otp_expired` / "Token has expired or is invalid" for both (checked against the real API) | One honest message | E2E N-5 |
| N-6 | Declined player got no notice | `approve_member(false)` deleted the request without a trace | `trip_private.join_declines`, `my_join_declines`, notice on the private-beta screen and Home | pgTAP `42` (14), E2E N-6 (2) |
| N-7 | Postcard header said "PT" | Cultures are stored as country codes | `placeName` on the postcard, passport, profile and AfterTrip | `src/lib/places.test.ts` |
| QA-11 | Trip tab Pre-Flight date wrong | Read legacy `game_start`, plus a placeholder line | `preflightSummary` from the phase engine | `preflight-summary.test.ts` |
| QA-12 | Founder links opened the delete screen | The last `else` branch was Delete | Delete only for `view=delete`; founder views need admin | unit `nav-founder`, E2E (7) |
| QA-13 | Founder sections showed an empty founder shell | Section header rendered without an admin check | `isFounderSection` resolves to the player's Me page | same |
| QA-14 | "Search…" opened the tour | Label promised a search that doesn't exist | Label says Explore | — (copy) |
| QA-15 | "1 days until" | No plural | i18n plural | `src/i18n/plural.test.ts` |
| QA-16 | A failed trip load showed "No trips just yet" and a raw error | Error and empty were the same branch | `TripsLoadFailed` with Try again | E2E QA-16 (2) |
| QA-17 | Finished trips showed setup prompts | No trip-over check | `tripIsOver` hides the to-do, Invite and the first-card sheet | `trip-order.test.ts` |
| QA-18 | Signed-out trip link called `trip_roster` (401) | Loader prefetched without a session | Session check first | E2E QA-18 |
| QA-19 | Small switches; no `h1` on sign-in | — | 44 px tap area; the hook is the `h1` | E2E QA-19 (2) |
| QA-20 | TRUNCATE etc. for signed-in users; own profile deletable; user could write AI cost | Default grants; a delete policy; a user-callable logger | Migration `20261108120000`; logger uses the service role | pgTAP `43` (8) |
| Flake | Mocked E2E sometimes stuck on the splash | Google Fonts stylesheets in the head blocked every script; a slow or blocked `fonts.googleapis.com` left the app without JavaScript. This affected real users too, not only tests. | Fonts preloaded, applied after start (`web-fonts.ts`). Second cause: the dev server serves about 516 modules per cold page and slows over a long run. Release runs now use a production build (`playwright.build.config.ts`). | unit `web-fonts`, E2E "Google Fonts never answers"; two full build runs (release report) |

## 3. Still open

| ID | Item | Why it is open | Needs |
|---|---|---|---|
| QA-06 | Age wording on the sign-up form and Terms | Legal text | Founder and legal wording |
| QA-07 | "Unlock / $5.99" flow shown though there are no locks | Product and pricing | Founder decision |
| QA-10 | 13 images still on Lovable | Files not in the repo | The original images |
| QA-19 (part) | Passport heading level | Couldn't confirm which Passport view lacked an `h1`; the Me → Passport page has one | A screenshot or path |
| QA-20 (part) | Per-trip AI cap | Global cap of 150/day can be used up by about 10 users | A number from the founder |
| Retention | Operational tables kept after deletion (`ai_usage`, `beta_access`, `code_attempts`, `trip_removals`, `trip_role_changes`, `photo_reports.reason`, `reward_codes`, `culture_stamps`, `trip_deletion_notes`, `guide_prefs`, votes) | Not covered by the approved decision | Founder and legal decision |
| Standings | Former players drop off live boards (crowns stay) | Existing rule | Founder decision |
| B-02 | Required CI checks on `main` | GitHub settings | Owner |
| Hosted | Everything in section 1 marked 5 | No staging yet | Staging accounts (owner steps 1.x) |

## 4. Founder questions

1. **QA-06:** which age wording goes on the sign-up form and in the Terms (18+ self sign-up, 13–17 by teen invite only)?
2. **QA-07:** hide the "Unlock / $5.99" flow for beta, or keep it?
3. **QA-20:** the per-trip daily AI cap (a number), alongside today's global 150.
4. **Retention:** what happens to each operational table above when an account is deleted?
5. **Standings:** should a former player stay on a live board, or only on crowns?
6. **Original local database:** apply this round's two migrations to it (backup first, as last time)? They are applied only on the disposable stack.
