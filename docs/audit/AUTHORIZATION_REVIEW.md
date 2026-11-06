# Authorization review

**Date:** Nov 6, 2026 · **Code:** `main` at `53e8f5f` plus the branch `audit/trip-authorization-and-beta-readiness`.

**Targeted review, not a full audit or penetration test.** It ran against a local Supabase stack and disposable PostgreSQL. Nothing was checked on a hosted project.

## Result

No way was found for a signed-in player to read or change another trip's data, another player's private records, or a leader's or founder's functions. That covers the checks below, on the IDs and states they used. It isn't proof that no such bug exists.

Confirmed issues, all fixed on this branch except where noted (details in [BUG_REGISTER.md](BUG_REGISTER.md)):

| ID | Severity | Issue | Exposure |
|---|---|---|---|
| B-20 | P2 | Deleting a trip left its proof and guide photos in Storage | Privacy and retention. Nobody could read them, because the trip's gone, but they were never deleted |
| B-21 | P2 | Signing out didn't stop push reminders on that device | A shared phone kept receiving the last player's reminders |
| B-22 | P3 | A push address could be any https URL, with no limit per player | The sender would POST wherever a player chose |
| B-23 | P3 | AI calls had no timeout, and the photo check didn't treat photo text as untrusted | A hung provider held the request open; a photo saying "answer pass" could try to earn points |
| B-25 | P3 | Storyteller ignored players who only contributed photos | Wrong badge, against Q13 and R-355 |
| B-26 | P3 | Foreign keys without indexes on lookups and trip deletion | Slower as data grows; `game_cards` has 1,930 rows |
| B-24 | P3, no change | An older `game_cards` policy is broader than a newer one | Not exploitable: clients have no SELECT on the table |

## How it was tested

1. **Every server function and API route was read** (table below).
2. **An attack matrix ran on a disposable PG16 database:** 266 public functions (every one a client can reach) × 8 actors (signed out, outsider, pending player, crew, another crew member, Co-Captain, Captain, and an outsider passing their own trip with the victim's other IDs), using real IDs. Each call ran in a subtransaction and was undone.
3. **Every public table was read, updated, deleted from and inserted into directly** by 6 actors (3,864 operations), and every bucket was checked for files.
4. **All 202 row-level security policies were read** (183 on `public`, 19 on `storage`; table at the end). None is restrictive, so policies on a table add up; only `game_cards` has overlapping read policies that disagree.
5. **Grants were checked:** no public table lacks RLS, every SECURITY DEFINER function sets `search_path`, no view is exposed, `pg_graphql` isn't installed, and PostgREST exposes only `public` and `graphql_public`. Internal functions such as `award_points`, `stamp_trip` and `crown_season` aren't executable by `authenticated`.

**Limits:**
- The matrix uses simple argument values, so a function can stop at validation before reaching its checks. Those functions were read by hand (`create_*`, `culture_action`, `culture_quest`, `culture_showcase`, `preview_action`, `reclaim_captain`, `respond_host_swap`).
- Most tables were empty, so "0 rows changed" alone proves little. That's why the write policies were read individually.
- 266 functions were called, but not every branch of each. The private functions weren't all read line by line.

The matrix now runs in CI as `supabase/tests/database/36_authorization.test.sql`. A new function that lets an outsider, a pending player or a crew member through fails it until someone reviews it.

## Attack scenarios

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | User A reads trip B | Refused | Matrix; RLS `is_trip_member`; test 36 |
| 2 | User A modifies trip B | Refused | Matrix; no write policy on `trips` |
| 3 | User A deletes trip B's data | Refused | `delete_trip` is Captain-only; direct deletes touch 0 rows |
| 4 | User A reads another player's journal | Refused directly | RLS owner-only. Crew mates do see journals through `trip_guide`, by design (the shared Window Seat guide) |
| 5 | User A reads another player's proof | Refused directly | RLS owner-only. Crew Check and `proof_photo_ok` show proofs to the crew by design, and to leaders only in trips with minors |
| 6 | User A changes another trip's schedule | Refused | No write policy on `trip_schedule`; only the planner writes it |
| 7 | Crew attempts a Captain-only action | Refused | Matrix; test 36 lists what crew can run |
| 8 | Captain attempts a founder or admin action | Refused | Matrix (44 functions); test 36 |
| 9 | User changes an object ID | Refused | `submit_proof`, `open_item`, `approve_proof` and others check the row's owner or trip |
| 10 | Valid ID with an unauthorized trip | Refused | "outsider + own trip" actor; `open_live`, `heart_photo`, `pick_postcard` match the ID to the trip |
| 11 | Replay after membership is revoked | Refused | Removal deletes the row and functions check it on every call; test 36. A JWT stays valid up to its expiry, but it no longer opens anything in that trip |
| 12 | Forged role or user ID | Ignored | Identity comes from the JWT (`auth.uid()`); test 36 tries a self-promotion. `public.is_trip_member` answers only about the caller |

## Server functions (22) and API routes (3)

Identity is always the verified JWT's `sub` (`requireSupabaseAuth`, `getClaims`), never a client value. "DB" means the database checks again on its own.

| Function | File | Auth | IDs from the client | Server-side check | DB | Another user's data reachable? |
|---|---|---|---|---|---|---|
| `deleteMyAccount` | `account.functions.ts` | Yes | None | Only the caller's memberships and folders | `leave_trip` | No |
| `setUserDisabled` | `admin.functions.ts` | Yes | Target user | `is_app_admin`; not self | `record_user_block` rechecks, refuses admins | Admin only |
| `arcadeMix` | `arcade-mix.functions.ts` | Yes | Trip (optional) | `use_ai_quota` | First 3 free ignore the trip; then member and leader | No |
| `suggestSimilarReports` | `bug-ai.functions.ts` | Yes | Report | `is_app_admin` | `founder_bug_reports` rechecks | Admin only |
| `checkoutBeta` | `checkout.functions.ts` | Yes | Trip | None; relies on the RPC | `checkout_beta`: Captain only | No |
| `topUpContent` | `content.functions.ts` | Yes | Trip | Approved member, then service role on that trip | `ai_gate` caps; 6 h cooldown | No |
| `planCultureExperience` | `culture-exp.functions.ts` | Yes | Experience | Creator and leader of its trip | RLS; `spend_credits` leader check | No |
| `summarizeCultureTrip` | `culture-exp.functions.ts` | Yes | Experience | Same | Same | No |
| `draftCultureQuest` | `culture-quest.functions.ts` | Yes | Card | Creator or partner | RLS; `spend_credits` | No |
| `permanentlyDeleteTrip` | `delete-trip.functions.ts` | Yes | Trip, name | Name and Captain, before any service-role call | `delete_trip`: Captain and exact name | No |
| `loadPublicGuide` | `guide.functions.ts` | **No, by design** | 96-bit token | Format check | `public_guide`: published only; names and photos opt-in; photos never in trips with minors | Only what was published |
| `makeInspirationGuide` | `inspiration.functions.ts` | Yes | Trip | Approved member | `spend_credits` | No |
| `analyzeTripPlan` | `itinerary-ai.functions.ts` | Yes | Trip | Leader | `use_ai_quota` | No |
| `createSandbox` | `lab.functions.ts` | Yes | Preset | `is_app_admin` | `lab_create` rechecks | Founder only |
| `prepareLateBot` | `lab.functions.ts` | Yes | None | `is_app_admin` | — | Founder only |
| `deleteSandbox` | `lab.functions.ts` | Yes | Trip | `is_app_admin` | `lab_delete`: guard, sandbox trips only | Founder only |
| `resetSandbox` | `lab.functions.ts` | Yes | Trip | `is_app_admin` | `sandbox_trips` lookup; `lab_delete` | Founder only |
| `createAtHomeSandbox` | `lab.functions.ts` | Yes | Preset | `is_app_admin` | `lab_at_home` rechecks | Founder only |
| `sendTestNotification` | `notifications.functions.ts` | Yes | None | Sender limited to the caller | `queue_test_notification`, one a minute | No |
| `checkProof` | `proof-check.functions.ts` | Yes | Proof | Caller's own proof, then service role on that proof | RLS; `ai_gate_server` | No |
| `suggestTripNames` | `trip-names.functions.ts` | Yes | None | `use_ai_quota` | 10 a day | No |
| `suggestTripMottos` | `trip-names.functions.ts` | Yes | None | `use_ai_quota` | 10 a day | No |
| `POST /api/public/notify` | `routes/api/public/notify.ts` | Cron key | None | Constant-time secret, or `check_cron_key` | Service-only RPCs | No |
| `POST /api/public/purge-photos` | `routes/api/public/purge-photos.ts` | Cron key | None | Same | Service-only RPCs | No |
| `GET /api/public/version` | `routes/api/public/version.ts` | No | None | Returns the app version only | — | No |

**Worth knowing:**
- `deleteMyAccount` needs only a valid session, with no password re-check. A stolen unlocked session could delete the account. That's a product decision, not changed here.
- Some server functions return raw database error text (`error.message`). The database's messages are written for players, but a constraint error can name a column. Low risk; not changed.
- A disabled account (`ban_duration`) keeps a working JWT until it expires, up to an hour.
- The app sends no `Content-Security-Policy` header. React escapes output and only two `dangerouslySetInnerHTML` uses exist, with fixed strings, so this is hardening rather than a hole. It needs a staging check before turning on.

## Other areas reviewed

**Badges and Passport.**
- All three badges were checked against R-711 to R-713 and Q13 (`badge_tier`, `refresh_passport`). Storyteller was wrong for photo-only contributors (B-25).
- Duplicates are prevented by the `(user_id, badge)` and `(user_id, trip_id)` keys and `ON CONFLICT`. Tiers never drop.
- Clients can't grant badges: there's no write policy, and `refresh_passport` and `stamp_trip` aren't executable by `authenticated`.

**Notifications.**
- Queue and subscriptions are unreadable to other players; test 25 and 36 cover this. `claim_notifications` and `finish_notifications` are service-only.
- `dedupe_key` is unique. Retries back off and stop at 5 attempts; a run that dies mid-send is re-claimed after 10 minutes, so a reminder can arrive twice in that rare case.
- A player who leaves or is removed loses their queued reminders of that trip. Sign-out now drops this browser's subscription (B-21). Payloads carry the title and body on purpose, and they show on the lock screen.

**AI photo check.**
- The key stays on the server (bundle check). Without `AI_API_KEY` the verdict is "unsure" and the crew decides.
- Daily caps per player and overall, plus the kill switch, are checked in the database. Uploads are limited to 5 MB and to image types by the bucket.
- Invalid model output becomes "unsure" (`parseVerdict`). Timeouts, one retry and the photo-text rule were added (B-23).
- **Still open:** the cap counts a call after it finishes, so a burst of parallel calls can pass it by a few. Only a real model can show whether the prompt-injection line holds; that belongs in the M6-01 labelled-photo run.
- No real AI call was made: all tests use mocks.

**Concurrency.**
- `award_points` takes an advisory lock and has a unique key, so a repeat is a no-op. `join_trip`, role changes and credit spending lock the trip row. `pick_postcard` serialises per player.
- Proofs and journal entries are unique per item and player, so an offline resend can't duplicate them.
- **Not tested under real parallel load.** This was read from the code; no concurrent-load test ran.

**Time zones.**
- The phase engine uses the trip's zone, and `phases.json` covers DST and far-off zones in both SQL and TypeScript. Client date math uses the safe `T12:00:00Z` pattern.
- 28 functions and policies use `current_date` (UTC). Most are wide scan windows followed by exact checks. Age checks and legacy Inspiration reveals can be off by up to a day near midnight. Not changed: it needs a decision and isn't a security issue.

**Performance and UX (targeted).**
- No timer or listener leaks were found by count, and the root route has error and not-found pages. Axe runs in E2E.
- 54 foreign keys had no leading index; 9 on live paths got one (B-26). The rest are on retired or small tables.
- The largest client chunk, `_shell`, is 768 KB; total JS is about 2.8 MB. Splitting it is a refactor, left for a later pass.
- Bug-report and admin lists were not load-tested.

## Not reviewed

- Hosted Supabase and Cloudflare settings, SMTP, Google, real push, a real AI model.
- Real devices, real parallel load, penetration testing.
- UX and accessibility beyond the existing axe checks, and React re-renders.
- Every branch of every private function; retired Lovable-era functions got the matrix only.

## Row-level security policies (202)

148 tables; 41 policies allow a write. "Intended" is the access the expression gives, grouped by pattern. Each expression was read, and "None found" means no problem was seen in it. Most tables also have no client grant for some operations, which narrows them further. Tables with RLS on and no policy, such as `notification_queue`, deny all direct access and aren't listed.

| Table | Policy | Op | USING | WITH CHECK | Intended | Issue |
|---|---|---|---|---|---|---|
| `public.account_consents` | account_consents_own_read | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.age_guesses` | Players add own guess | INSERT | — | `((user_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()))` | The owner, scoped to their trip or card | None found |
| `public.age_guesses` | Players change own guess | UPDATE | `(user_id = auth.uid())` | `((user_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()))` | The owner only | None found |
| `public.age_guesses` | Players view own guess | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.ai_credit_purchases` | Founder reads credit purchases | SELECT | `trip_private.is_app_admin()` | — | Founder only | None found |
| `public.ai_usage` | Founder reads AI usage | SELECT | `trip_private.is_app_admin()` | — | Founder only | None found |
| `public.airport_claims` | Members view airport claims | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.app_admins` | Admins see own row | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.app_settings` | Anyone reads launch switch | SELECT | `true` | — | Public list data | None found |
| `public.app_settings` | Signed-in users read settings | SELECT | `true` | — | Any signed-in player (reference data) | None found |
| `public.at_home_activities` | No direct access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.at_home_answers` | No direct access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.at_home_pack_items` | Signed-in users read clean pack items | SELECT | `(NOT adult)` | — | See expression | None found |
| `public.at_home_packs` | Signed-in users read packs | SELECT | `true` | — | Any signed-in player (reference data) | None found |
| `public.at_home_song_winners` | Approved members see winning disc | SELECT | `(EXISTS ( SELECT 1 FROM at_home_activities a WHERE ((a.id = at_home_song_winners.activity_id) AND trip_private.is_trip_member(a.trip_id, auth.uid()))))` | — | Approved members of the trip | None found |
| `public.at_home_votes` | No direct access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.beta_access` | Own beta access | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.beta_codes` | Founder reads beta codes | SELECT | `trip_private.is_app_admin()` | — | Founder only | None found |
| `public.bingo_marks` | Members view bingo | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.bug_issues` | Founder reads issues | SELECT | `trip_private.is_app_admin()` | — | Founder only | None found |
| `public.bug_reports` | File own bug reports | INSERT | — | `((user_id = auth.uid()) AND ((trip_id IS NULL) OR trip_private.is_trip_member(trip_id, auth.uid())) AND ((screenshot_path IS NULL) OR (split_part(screenshot_path, '/'::text, 1) = (auth.uid())::text)))` | The owner, scoped to their trip or card | None found |
| `public.bug_reports` | See own or led-trip bug reports | SELECT | `((user_id = auth.uid()) OR ((trip_id IS NOT NULL) AND trip_private.is_leader(trip_id)))` | — | The owner, or trip leaders | Leaders see reports filed from their trip, including the description. Intended |
| `public.call_nights` | members read call nights | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.checkin_responses` | Founder or owner reads check-ins | SELECT | `((user_id = auth.uid()) OR trip_private.is_app_admin())` | — | The owner, scoped to their trip or card | None found |
| `public.content_feedback` | No direct access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.content_seen` | No direct access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.content_topups` | No direct access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.content_variants` | No direct access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.cost_items` | Members view cost items | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.cost_log` | Leaders read cost log | SELECT | `trip_private.is_leader(trip_id)` | — | Trip leaders | None found |
| `public.cost_notes` | Own cost notes | SELECT | `((user_id = auth.uid()) AND is_trip_member(trip_id, auth.uid()))` | — | The owner, scoped to their trip or card | None found |
| `public.cost_shares` | Own share or leader views shares | SELECT | `(((user_id = auth.uid()) AND is_trip_member(trip_id, auth.uid())) OR trip_private.is_leader(trip_id))` | — | The owner, scoped to their trip or card | None found |
| `public.cultural_inspirations` | inspiration_delete | DELETE | `((creator_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()))` | — | The owner, scoped to their trip or card | None found |
| `public.cultural_inspirations` | inspiration_insert | INSERT | — | `((creator_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()) AND ((partner_id IS NULL) OR ((partner_id <> auth.uid()) AND trip_private.is_trip_member(trip_id, partner_id))))` | The owner, scoped to their trip or card | INSERT grants include approval columns, but triggers overwrite them (`inspiration_age_gate`, `inspiration_place_guard`) |
| `public.cultural_inspirations` | inspiration_read | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND ((creator_id = auth.uid()) OR (partner_id = auth.uid()) OR ((captain_approved_at IS NULL) AND trip_private.is_captain(trip_id)) OR ((captain_approved_at IS NOT NULL) AND (reveal_on <= CURRENT_DATE) AND (hidden_at IS NULL) AND (EXISTS ( SELECT 1 FROM culture_stamps st WHERE ((st.card_id = cultural_inspirations.id) AND (st.user_id = auth.uid())))))))` | — | The owner, scoped to their trip or card | None found |
| `public.cultural_inspirations` | inspiration_update | UPDATE | `((hidden_at IS NULL) AND trip_private.is_trip_member(trip_id, auth.uid()) AND ((creator_id = auth.uid()) OR ((mode = 'team'::text) AND (partner_id = auth.uid()))))` | `((hidden_at IS NULL) AND trip_private.is_trip_member(trip_id, auth.uid()) AND ((creator_id = auth.uid()) OR ((mode = 'team'::text) AND (partner_id = auth.uid()))))` | The owner, scoped to their trip or card | None found |
| `public.culture_exp_days` | private days | SELECT | `(EXISTS ( SELECT 1 FROM culture_experiences e WHERE ((e.id = culture_exp_days.experience_id) AND (((e.a2e_kind IS NULL) AND ((e.creator_id = auth.uid()) OR trip_private.is_app_admin() OR ((e.trip_id IS NOT NULL) AND trip_private.is_trip_member(e.trip_id, auth.uid())))) OR ((e.a2e_kind IS NOT NULL) AND trip_private.a2e_culture_access(e.id))))))` | — | The owner, scoped to their trip or card | None found |
| `public.culture_exp_hidden` | own hidden | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.culture_exp_likes` | own likes | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.culture_experiences` | viewable experiences | SELECT | `(((a2e_kind IS NULL) AND trip_private.can_view_culture(id)) OR ((a2e_kind IS NOT NULL) AND trip_private.a2e_culture_access(id)))` | — | See expression | None found |
| `public.culture_layer_stamps` | Creator sees completed layers | SELECT | `(creator_id = auth.uid())` | — | The owner only | None found |
| `public.culture_quest_answers` | quest_answers_own | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.culture_quest_items` | quest_items_creator_add | INSERT | — | `(EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = culture_quest_items.card_id) AND (c.hidden_at IS NULL) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((c.creator_id = auth.uid()) OR (c.partner_id = auth.uid())))))` | The owner, scoped to their trip or card | None found |
| `public.culture_quest_items` | quest_items_creator_edit | UPDATE | `(EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = culture_quest_items.card_id) AND (c.hidden_at IS NULL) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((c.creator_id = auth.uid()) OR (c.partner_id = auth.uid())))))` | `(EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = culture_quest_items.card_id) AND (c.hidden_at IS NULL) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((c.creator_id = auth.uid()) OR (c.partner_id = auth.uid())))))` | The owner, scoped to their trip or card | None found |
| `public.culture_quest_items` | quest_items_creator_read | SELECT | `(EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = culture_quest_items.card_id) AND (c.hidden_at IS NULL) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((c.creator_id = auth.uid()) OR (c.partner_id = auth.uid())))))` | — | The owner, scoped to their trip or card | None found |
| `public.culture_quest_items` | quest_items_creator_remove | DELETE | `(EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = culture_quest_items.card_id) AND (c.hidden_at IS NULL) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((c.creator_id = auth.uid()) OR (c.partner_id = auth.uid())))))` | — | The owner, scoped to their trip or card | None found |
| `public.culture_quest_players` | quest_player_member | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.culture_quest_sessions` | quest_session_member | SELECT | `(EXISTS ( SELECT 1 FROM culture_quest_players p WHERE ((p.session_id = culture_quest_sessions.id) AND (p.user_id = auth.uid()))))` | — | The owner, scoped to their trip or card | None found |
| `public.culture_showcase_ballots` | Viewers see only their own reaction | SELECT | `(viewer_id = auth.uid())` | — | The owner only | None found |
| `public.culture_showcase_rewards` | Creator sees their presentation bonus | SELECT | `(creator_id = auth.uid())` | — | The owner only | None found |
| `public.culture_showcase_viewers` | Viewers see only their own invitation | SELECT | `(viewer_id = auth.uid())` | — | The owner only | None found |
| `public.culture_stamps` | culture_stamps_own | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.daily_answers` | players read their own answers | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.day_votes` | Players view own day votes | SELECT | `(voter_id = auth.uid())` | — | The owner only | None found |
| `public.experience_previews` | Signed-in read shared previews | SELECT | `((unlisted_at IS NULL) OR trip_private.is_app_admin())` | — | Founder only | Previews are anonymous summaries shared on purpose |
| `public.game_cards` | Approved adults see spicy base cards | SELECT | `((trip_id IS NULL) AND (category = 'spicy'::text) AND (EXISTS ( SELECT 1 FROM (trip_members m JOIN game_nights n ON (((n.trip_id = m.trip_id) AND (n.game_number = game_cards.game_number)))) WHERE ((m.user_id = auth.uid()) AND trip_private.is_approved_adult(m.trip_id, auth.uid())))))` | — | The owner, scoped to their trip or card | Not reachable: no SELECT grant (B-24) |
| `public.game_cards` | Members add trip cards | INSERT | — | `((trip_id IS NOT NULL) AND (category <> 'spicy'::text) AND trip_private.is_trip_member(trip_id, auth.uid()))` | Approved members of the trip | None found |
| `public.game_cards` | Members see clean base cards | SELECT | `((trip_id IS NULL) AND (category <> 'spicy'::text))` | — | See expression | Not reachable: no SELECT grant (B-24) |
| `public.game_cards` | Read clean base and own trip cards | SELECT | `(((trip_id IS NULL) AND (category <> 'spicy'::text)) OR ((trip_id IS NOT NULL) AND trip_private.is_trip_member(trip_id, auth.uid())))` | — | Approved members of the trip | Broader than its neighbour for 21+ trip cards, but `authenticated` has no SELECT on this table, so no game_cards read policy is reachable (B-24) |
| `public.game_cards` | Read seed and member cards | SELECT | `(((trip_id IS NULL) AND (category <> 'spicy'::text)) OR ((trip_id IS NOT NULL) AND trip_private.is_trip_member(trip_id, auth.uid()) AND ((category <> 'spicy'::text) OR trip_private.is_approved_adult(trip_id, auth.uid()))))` | — | Approved members of the trip | Not reachable: no SELECT grant (B-24) |
| `public.game_catalog` | Trip members read game catalog | SELECT | `(EXISTS ( SELECT 1 FROM trip_members m WHERE (m.user_id = auth.uid())))` | — | The owner, scoped to their trip or card | None found |
| `public.game_format_prompts` | game_format_prompts_read | SELECT | `true` | — | Any signed-in player (reference data) | None found |
| `public.game_night_card_skips` | game_night_card_skips_own | SELECT | `((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = game_night_card_skips.trip_id) AND (m.user_id = auth.uid()) AND (m.status = 'approved'::text)))))` | — | The owner, scoped to their trip or card | None found |
| `public.game_night_flow` | Trip members see night flow | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.game_night_moments` | game_night_moments_approved | SELECT | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = game_night_moments.trip_id) AND (m.user_id = auth.uid()) AND (m.status = 'approved'::text))))` | — | The owner, scoped to their trip or card | None found |
| `public.game_night_polls` | Captain creates poll | INSERT | — | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = game_night_polls.trip_id) AND (m.user_id = auth.uid()) AND (m.role = 'captain'::text))))` | The owner, or trip leaders | None found |
| `public.game_night_polls` | Captain edits poll | UPDATE | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = game_night_polls.trip_id) AND (m.user_id = auth.uid()) AND (m.role = 'captain'::text))))` | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = game_night_polls.trip_id) AND (m.user_id = auth.uid()) AND (m.role = 'captain'::text))))` | The owner, or trip leaders | None found |
| `public.game_night_polls` | Members view poll | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.game_night_reactions` | game_night_reactions_approved | SELECT | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = game_night_reactions.trip_id) AND (m.user_id = auth.uid()) AND (m.status = 'approved'::text))))` | — | The owner, scoped to their trip or card | None found |
| `public.game_night_turns` | Members see live turns | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.game_night_votes` | Members remove vote | DELETE | `((user_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM game_night_polls p WHERE ((p.trip_id = game_night_votes.trip_id) AND (p.confirmed_option IS NULL)))))` | — | The owner, scoped to their trip or card | None found |
| `public.game_night_votes` | Members view votes | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.game_night_votes` | Members vote | INSERT | — | `((user_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()) AND (EXISTS ( SELECT 1 FROM game_night_polls p WHERE ((p.trip_id = game_night_votes.trip_id) AND (p.confirmed_option IS NULL) AND (game_night_votes.option_index < jsonb_array_length(p.options))))))` | The owner, scoped to their trip or card | None found |
| `public.game_nights` | Members view nights | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.game_pick_log` | Members may see game choices | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.game_scores` | Members view scores | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.guide_prefs` | players read their own guide choices | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.home_day_results` | Read results through checked view only | SELECT | `false` | — | Nobody directly; checked functions only | None found |
| `public.home_day_sessions` | Read sessions through checked view only | SELECT | `false` | — | Nobody directly; checked functions only | None found |
| `public.host_penalties` | Members view hosting misses | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.host_swaps` | Involved members and leaders view host swaps | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND ((from_user = auth.uid()) OR (to_user = auth.uid()) OR (to_user IS NULL) OR (accepted_by = auth.uid()) OR (EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = host_swaps.trip_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['captain'::text, 'co_captain'::text])))))))` | — | The owner, scoped to their trip or card | None found |
| `public.inspiration_votes` | inspiration_votes_insert | INSERT | — | `((voter_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = inspiration_votes.card_id) AND (c.hidden_at IS NULL) AND (c.reveal_on <= CURRENT_DATE) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((inspiration_votes.choice = 'love'::text) OR ((c.mode = 'challenge'::text) AND (c.partner_id IS NOT NULL) AND ((auth.uid() <> c.creator_id) AND (auth.uid() <> c.partner_id))))))))` | The owner, scoped to their trip or card | None found |
| `public.inspiration_votes` | inspiration_votes_read | SELECT | `(EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = inspiration_votes.card_id) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((c.creator_id = auth.uid()) OR (c.partner_id = auth.uid()) OR ((c.hidden_at IS NULL) AND (c.reveal_on <= CURRENT_DATE))) AND ((inspiration_votes.voter_id = auth.uid()) OR ((c.votes_revealed_at IS NOT NULL) AND (c.hidden_at IS NULL) AND (c.reveal_on <= CURRENT_DATE))))))` | — | The owner, scoped to their trip or card | None found |
| `public.inspiration_votes` | inspiration_votes_update | UPDATE | `((voter_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = inspiration_votes.card_id) AND (c.hidden_at IS NULL) AND (c.reveal_on <= CURRENT_DATE) AND (c.votes_revealed_at IS NULL) AND trip_private.is_trip_member(c.trip_id, auth.uid())))))` | `((voter_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = inspiration_votes.card_id) AND (c.hidden_at IS NULL) AND (c.reveal_on <= CURRENT_DATE) AND (c.votes_revealed_at IS NULL) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((inspiration_votes.choice = 'love'::text) OR ((c.mode = 'challenge'::text) AND (c.partner_id IS NOT NULL) AND ((auth.uid() <> c.creator_id) AND (auth.uid() <> c.partner_id))))))))` | The owner, scoped to their trip or card | None found |
| `public.journal_entries` | players read their own journal | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.junkie_ranks` | Own rank row | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.live_sessions` | members read live sessions | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.live_vote_ballots` | Players view own ballot | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.live_votes` | Members view live votes | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.mission_claims` | Own or leader reads claims | SELECT | `((user_id = auth.uid()) OR trip_private.is_leader(trip_id))` | — | The owner, or trip leaders | None found |
| `public.mission_votes` | Members view mission votes | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.notification_prefs` | players read their own notification settings | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.orders` | Captains read own orders | SELECT | `(captain_id = auth.uid())` | — | The owner only | None found |
| `public.passport_progress` | players read their own level | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.passport_stamps` | Travelers read own stamps | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.photo_posts` | Members view photos | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.photo_reactions` | Members add own reactions | INSERT | — | `((user_id = auth.uid()) AND is_trip_member(trip_id, auth.uid()) AND (split_part(photo_path, '/'::text, 1) = (trip_id)::text))` | The owner, scoped to their trip or card | None found |
| `public.photo_reactions` | Members remove own reactions | DELETE | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.photo_reactions` | Members view reactions | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.photo_removed` | Members view removed photos | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.photo_reports` | Leaders view reports | SELECT | `trip_private.is_leader(trip_id)` | — | Trip leaders | None found |
| `public.photo_reports` | Members report photos | INSERT | — | `((user_id = auth.uid()) AND is_trip_member(trip_id, auth.uid()) AND (split_part(photo_path, '/'::text, 1) = (trip_id)::text))` | The owner, scoped to their trip or card | None found |
| `public.player_birthdays` | Birthday owner or trip captain reads | SELECT | `((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM (trip_members m JOIN trip_members c ON ((c.trip_id = m.trip_id))) WHERE ((m.user_id = player_birthdays.user_id) AND (c.user_id = auth.uid()) AND (c.role = 'captain'::text)))))` | — | The owner, or trip leaders | The Captain also sees a pending applicant's birthday. Matches the "owner / Captain" rule; noted for the legal review |
| `public.player_private` | Owner reads private info | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.player_profiles` | Own profile create | INSERT | — | `(user_id = auth.uid())` | The owner only | None found |
| `public.player_profiles` | Own profile edit | UPDATE | `(user_id = auth.uid())` | `(user_id = auth.uid())` | The owner only | None found |
| `public.player_profiles` | Own profile read | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.points_ledger` | players read their own points | SELECT | `((user_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()))` | — | The owner, scoped to their trip or card | None found |
| `public.points_rules` | everyone signed in reads the points table | SELECT | `true` | — | Any signed-in player (reference data) | None found |
| `public.postcard_hearts` | players read their own hearts | SELECT | `(voter_id = auth.uid())` | — | The owner only | None found |
| `public.postcard_picks` | players read their own picks | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.postcard_stickers` | Owners read own postcards | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.preview_hidden` | Own hidden previews | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.price_rules` | Prices are public list info | SELECT | `true` | — | Public list data | None found |
| `public.profile_prefs` | players read their own profile settings | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.profiles` | Users create own profile | INSERT | — | `(auth.uid() = id)` | The owner only | None found |
| `public.profiles` | Users delete own profile | DELETE | `(auth.uid() = id)` | — | The owner only | None found |
| `public.profiles` | Users edit own profile | UPDATE | `(auth.uid() = id)` | `(auth.uid() = id)` | The owner only | None found |
| `public.profiles` | Users view own profile | SELECT | `(auth.uid() = id)` | — | The owner only | None found |
| `public.proofs` | players read their own proofs | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.push_subscriptions` | players read their own subscriptions | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.quest_challenges` | quest_challenges_approved | SELECT | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = quest_challenges.trip_id) AND (m.user_id = auth.uid()) AND (m.status = 'approved'::text))))` | — | The owner, scoped to their trip or card | None found |
| `public.quest_posts` | Members view quests | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.quest_thumbs` | Members view thumbs | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.reward_codes` | Owners read own reward codes | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.room_blocks` | Leaders read room blocks | SELECT | `trip_private.is_leader(trip_id)` | — | Trip leaders | None found |
| `public.room_requests` | Leaders read their room requests | SELECT | `trip_private.is_leader(trip_id)` | — | Trip leaders | None found |
| `public.room_requests` | Requesters read own requests | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.sandbox_bots` | Founder reads bots | SELECT | `trip_private.is_app_admin()` | — | Founder only | None found |
| `public.sandbox_trips` | Founder reads sandbox trips | SELECT | `trip_private.is_app_admin()` | — | Founder only | None found |
| `public.season_champions` | Members view champions | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.season_quests` | season_quests_read | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND (((user_id = auth.uid()) AND (((quest_kind = 'preflight'::text) AND trip_private.quest_unlocked(trip_id, night_week)) OR ((quest_kind = 'carry_on'::text) AND trip_private.carry_quest_unlocked(trip_id)))) OR (trip_private.is_leader(trip_id) AND (status = 'pending'::text))))` | — | The owner, scoped to their trip or card | None found |
| `public.season_settings` | Prizes are read through season_info | SELECT | `false` | — | Nobody directly; checked functions only | None found |
| `public.secret_missions` | Own or revealed missions | SELECT | `((user_id = auth.uid()) OR ((revealed_at IS NOT NULL) AND is_trip_member(trip_id, auth.uid())))` | — | The owner, scoped to their trip or card | None found |
| `public.skip_passes` | Members view skip passes | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.solo_quests` | Owners read their solo quests | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.song_discs` | Approved members read discs | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.stamp_settings` | Members view stamp values | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_adult_activities` | Only approved adults see sip or skip | SELECT | `trip_private.is_approved_adult(trip_id, auth.uid())` | — | See expression | None found |
| `public.trip_adult_approvals` | Owner or captain sees approval | SELECT | `((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_adult_approvals.trip_id) AND (m.user_id = auth.uid()) AND (m.role = 'captain'::text)))))` | — | The owner, or trip leaders | None found |
| `public.trip_adult_settings` | Members see adult setting | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_crownings` | members read crownings | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_crowns` | members read crowns | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_day_games` | Members view released day games | SELECT | `(is_trip_member(trip_id, auth.uid()) AND ((released_at IS NOT NULL) OR trip_private.is_leader(trip_id)))` | — | Approved members of the trip | None found |
| `public.trip_day_tags` | Leaders add day tags | INSERT | — | `(EXISTS ( SELECT 1 FROM (trip_members m JOIN trips t ON ((t.id = m.trip_id))) WHERE ((m.trip_id = trip_day_tags.trip_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['captain'::text, 'co_captain'::text])) AND ((trip_day_tags.day_date >= t.start_date) AND (trip_day_tags.day_date <= t.end_date)))))` | The owner, or trip leaders | None found |
| `public.trip_day_tags` | Leaders change day tags | UPDATE | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_day_tags.trip_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['captain'::text, 'co_captain'::text])))))` | `(EXISTS ( SELECT 1 FROM (trip_members m JOIN trips t ON ((t.id = m.trip_id))) WHERE ((m.trip_id = trip_day_tags.trip_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['captain'::text, 'co_captain'::text])) AND ((trip_day_tags.day_date >= t.start_date) AND (trip_day_tags.day_date <= t.end_date)))))` | The owner, or trip leaders | None found |
| `public.trip_day_tags` | Leaders clear day tags | DELETE | `(EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = trip_day_tags.trip_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['captain'::text, 'co_captain'::text])))))` | — | The owner, or trip leaders | None found |
| `public.trip_day_tags` | Members read day tags | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_day_trivia_keys` | Trivia answers are hidden | SELECT | `false` | — | Nobody directly; checked functions only | None found |
| `public.trip_deletion_log` | No direct deletion audit access | ALL | `false` | `false` | Nobody directly; checked functions only | None found |
| `public.trip_deletion_notes` | Read own deleted trip notes | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.trip_drafts` | players read their own draft | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.trip_feedback` | App owner reads feedback | SELECT | `(trip_private.is_app_admin() AND (NOT (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = trip_feedback.trip_id) AND t.is_sandbox)))))` | — | Founder only | None found |
| `public.trip_guides` | members read the guide state | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_invites` | Leaders read trip invites | SELECT | `trip_private.is_leader(trip_id)` | — | Trip leaders | None found |
| `public.trip_item_alternatives` | Members see group or own swaps | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND ((user_id = auth.uid()) OR (user_id = ( SELECT m.user_id FROM trip_members m WHERE ((m.trip_id = trip_item_alternatives.trip_id) AND (m.role = 'captain'::text)) LIMIT 1))))` | — | The owner, scoped to their trip or card | None found |
| `public.trip_itineraries` | Leaders add itinerary | INSERT | — | `(EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = trip_itineraries.trip_id) AND (trip_members.user_id = auth.uid()) AND (trip_members.role = ANY (ARRAY['captain'::text, 'co_captain'::text])))))` | The owner, or trip leaders | None found |
| `public.trip_itineraries` | Leaders change itinerary | UPDATE | `(EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = trip_itineraries.trip_id) AND (trip_members.user_id = auth.uid()) AND (trip_members.role = ANY (ARRAY['captain'::text, 'co_captain'::text])))))` | `(EXISTS ( SELECT 1 FROM trip_members WHERE ((trip_members.trip_id = trip_itineraries.trip_id) AND (trip_members.user_id = auth.uid()) AND (trip_members.role = ANY (ARRAY['captain'::text, 'co_captain'::text])))))` | The owner, or trip leaders | None found |
| `public.trip_itineraries` | Members read itinerary | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_members` | Members view their squad | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND (status = 'approved'::text))` | — | Approved members of the trip | None found |
| `public.trip_play_state` | Members view play | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_player_cards` | Players create own card | INSERT | — | `((user_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()) AND (stamp_count = 0))` | The owner, scoped to their trip or card | None found |
| `public.trip_player_cards` | Players edit own card | UPDATE | `((user_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()))` | `((user_id = auth.uid()) AND trip_private.is_trip_member(trip_id, auth.uid()))` | The owner, scoped to their trip or card | None found |
| `public.trip_player_cards` | Trip members see player cards | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_postcards` | members read the postcard | SELECT | `trip_private.is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_role_changes` | Leaders and founder read role changes | SELECT | `(trip_private.is_leader(trip_id) OR trip_private.is_app_admin() OR (to_user = auth.uid()) OR (from_user = auth.uid()))` | — | The owner, or trip leaders | None found |
| `public.trip_schedule` | members read the schedule | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND ((user_id IS NULL) OR (user_id = auth.uid())))` | — | The owner, scoped to their trip or card | None found |
| `public.trip_season_finds` | Own or leader season finds | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND ((user_id = auth.uid()) OR trip_private.is_leader(trip_id)))` | — | The owner, scoped to their trip or card | None found |
| `public.trip_season_games` | Squad reads arrived season games | SELECT | `(trip_private.is_trip_member(trip_id, auth.uid()) AND (trip_private.is_leader(trip_id) OR (day_date <= trip_private.trip_today(trip_id))))` | — | Approved members of the trip | None found |
| `public.trip_season_reveals` | Own season reveals | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.trip_team_members` | Members view team members | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trip_teams` | Members view teams | SELECT | `is_trip_member(trip_id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trips` | Members view their trips | SELECT | `trip_private.is_trip_member(id, auth.uid())` | — | Approved members of the trip | None found |
| `public.trivia_answers` | Players view own trivia | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.user_badges` | players read their own badges | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `public.user_credits` | Users read own wallet | SELECT | `(auth.uid() = user_id)` | — | The owner only | None found |
| `public.waitlist` | Founder reads waitlist | SELECT | `trip_private.is_app_admin()` | — | Founder only | None found |
| `public.weekly_answer_votes` | Players see only their own vote | SELECT | `(voter_id = auth.uid())` | — | The owner only | None found |
| `public.weekly_answers` | Own answer or revealed answers in my trip | SELECT | `(is_trip_member(trip_id, auth.uid()) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM weekly_questions q WHERE ((q.trip_id = weekly_answers.trip_id) AND (q.week_number = weekly_answers.week_number) AND (q.revealed_at IS NOT NULL))))))` | — | The owner, scoped to their trip or card | None found |
| `public.weekly_question_pool` | Pool is read only by secure functions | SELECT | `false` | — | Nobody directly; checked functions only | None found |
| `public.weekly_questions` | Questions are read through weekly_question_status | SELECT | `false` | — | Nobody directly; checked functions only | None found |
| `public.window_guide_items` | Authors, Captain, and crew after publish read guide items | SELECT | `((author_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = window_guide_items.trip_id) AND (m.user_id = auth.uid()) AND (m.role = 'captain'::text) AND (m.status = 'approved'::text)))) OR ((status = 'approved'::text) AND (EXISTS ( SELECT 1 FROM trips t WHERE ((t.id = window_guide_items.trip_id) AND (t.guide_published_at IS NOT NULL)))) AND (EXISTS ( SELECT 1 FROM trip_members m WHERE ((m.trip_id = window_guide_items.trip_id) AND (m.user_id = auth.uid()) AND (m.status = 'approved'::text))))))` | — | The owner, or trip leaders | None found |
| `public.wrapup_answers` | players read their own answers | SELECT | `(user_id = auth.uid())` | — | The owner only | None found |
| `storage.objects` | Account avatar view | SELECT | `((bucket_id = 'player-avatars'::text) AND (split_part(name, '/'::text, 1) = 'account'::text) AND (split_part(name, '/'::text, 2)` | `'^[0-9a-f-]{36}$'::text) AND trip_private.shares_trip((split_part(name, '/'::text, 2))::uuid))` | Files by folder: see expression | None found |
| `storage.objects` | Founder views bug screenshots | SELECT | `((bucket_id = 'bug-screenshots'::text) AND trip_private.is_app_admin())` | — | Founder only | None found |
| `storage.objects` | Members view trip game photos | SELECT | `((bucket_id = 'trip-photos'::text) AND CASE WHEN (split_part(name, '/'::text, 1)` | `'^[0-9a-f-]{36}$'::text) THEN trip_private.is_trip_member((split_part(name, '/'::text, 1))::uuid, auth.uid()) ELSE false END)` | Files by folder: see expression | Older photo wall, archived trips only: P4 |
| `storage.objects` | Players replace own trip photo | UPDATE | `((bucket_id = 'player-avatars'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND CASE WHEN (split_part(name, '/'::text, 1)` | `'^[0-9a-f-]{36}$'::text) THEN trip_private.is_trip_member((split_part(name, '/'::text, 1))::uuid, auth.uid()) ELSE false END)` | Files by folder: see expression | None found |
| `storage.objects` | Players upload own trip game photos | INSERT | — | `((bucket_id = 'trip-photos'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND (lower(name)` | Files by folder: see expression | None found |
| `storage.objects` | Players upload own trip photo | INSERT | — | `((bucket_id = 'player-avatars'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND (lower(name)` | Files by folder: see expression | None found |
| `storage.objects` | Shared-trip avatar view | SELECT | `((bucket_id = 'player-avatars'::text) AND (split_part(name, '/'::text, 2)` | `'^[0-9a-f-]{36}$'::text) AND trip_private.shares_trip((split_part(name, '/'::text, 2))::uuid))` | Files by folder: see expression | Teen avatars are visible to anyone sharing a trip: P4, owner and lawyer decision |
| `storage.objects` | Upload own bug screenshots | INSERT | — | `((bucket_id = 'bug-screenshots'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text) AND (lower(name)` | Files by folder: see expression | None found |
| `storage.objects` | View bug screenshots | SELECT | `((bucket_id = 'bug-screenshots'::text) AND ((split_part(name, '/'::text, 1) = (auth.uid())::text) OR (EXISTS ( SELECT 1 FROM bug_reports r WHERE ((r.screenshot_path = objects.name) AND (r.trip_id IS NOT NULL) AND trip_private.is_leader(r.trip_id))))))` | — | Files by folder: see expression | None found |
| `storage.objects` | Window crew read guide photos | SELECT | `((bucket_id = 'window-guide'::text) AND (EXISTS ( SELECT 1 FROM trip_members m WHERE (((m.trip_id)::text = (storage.foldername(objects.name))[1]) AND (m.user_id = auth.uid()) AND (m.status = 'approved'::text)))))` | — | Files by folder: see expression | None found |
| `storage.objects` | Window crew upload own guide photos | INSERT | — | `((bucket_id = 'window-guide'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text) AND (EXISTS ( SELECT 1 FROM trip_members m WHERE (((m.trip_id)::text = (storage.foldername(objects.name))[1]) AND (m.user_id = auth.uid()) AND (m.status = 'approved'::text)))))` | Files by folder: see expression | None found |
| `storage.objects` | culture photos delete own | DELETE | `((bucket_id = 'culture-photos'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text))` | — | Files by folder: see expression | None found |
| `storage.objects` | culture photos read | SELECT | `((bucket_id = 'culture-photos'::text) AND (split_part(name, '/'::text, 1)` | `'^[0-9a-f-]{36}$'::text) AND trip_private.can_view_culture((split_part(name, '/'::text, 1))::uuid))` | Files by folder: see expression | None found |
| `storage.objects` | culture photos upload | INSERT | — | `((bucket_id = 'culture-photos'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND (lower(name)` | Files by folder: see expression | None found |
| `storage.objects` | inspiration_photo_remove | DELETE | `((bucket_id = 'inspiration-photos'::text) AND (split_part(name, '/'::text, 2) = (auth.uid())::text) AND CASE WHEN (split_part(name, '/'::text, 1)` | `'^[0-9a-f-]{36}$'::text) THEN (EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = (split_part(objects.name, '/'::text, 1))::uuid) AND (c.creator_id = auth.uid())))) ELSE false END)` | Files by folder: see expression | None found |
| `storage.objects` | inspiration_photo_upload | INSERT | — | `((bucket_id = 'inspiration-photos'::text) AND (lower(name)` | Files by folder: see expression | None found |
| `storage.objects` | inspiration_photo_view | SELECT | `((bucket_id = 'inspiration-photos'::text) AND CASE WHEN (split_part(name, '/'::text, 1)` | `'^[0-9a-f-]{36}$'::text) THEN (EXISTS ( SELECT 1 FROM cultural_inspirations c WHERE ((c.id = (split_part(objects.name, '/'::text, 1))::uuid) AND trip_private.feature_on(c.trip_id, 'inspiration'::text) AND trip_private.is_trip_member(c.trip_id, auth.uid()) AND ((c.creator_id = auth.uid()) OR (c.partner_id = auth.uid()) OR ((c.hidden_at IS NULL) AND (c.reveal_on <= CURRENT_DATE)))))) ELSE false END)` | Files by folder: see expression | None found |
| `storage.objects` | quest proofs read owner leader shared | SELECT | `((bucket_id = 'quest-proofs'::text) AND trip_private.proof_read_ok(name))` | — | Files by folder: see expression | None found |
| `storage.objects` | quest proofs upload own open quest | INSERT | — | `((bucket_id = 'quest-proofs'::text) AND trip_private.proof_upload_ok(name))` | Files by folder: see expression | None found |
