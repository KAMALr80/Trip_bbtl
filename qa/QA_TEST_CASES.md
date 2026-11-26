# QA test cases: the live pass

These cases are for whoever runs the live pass on **staging** with disposable accounts. Each one traces to a checklist row in [QA_PAGE_WISE_CHECKLIST.md](QA_PAGE_WISE_CHECKLIST.md). Status is `BLOCKED` for every case in this audit (no staging access). Put the result, date, tester and screenshot path in the last column, and save screenshots under `qa/evidence/screenshots/<case-id>.png`.

**Accounts:** **CAP** Captain 21+ · **P2** Player 18–20 · **P3** brand-new account · **TEEN** via a teen invite · **ADM** founder/admin. Phone size 390×844 and desktop 1440 unless noted. Priority: P1 = release-blocking.

## Multiplayer (p.4, 7, 13–14)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-MP-01 | P1 | CAP crew trip in Trip Season. P2 submits a quest photo. CAP opens Crew Check, approves. Both refresh Standings. Try approving twice; P2 tries approving own proof | Points rise once by the quest value; identical on both accounts; second approve and self-approve refused | BLOCKED |
| TC-MP-02 | P1 | Game Night Live open. P2 presents; CAP taps P2's avatar. P2 tries own avatar | P2 +20 once; own avatar not tappable | BLOCKED |
| TC-MP-03 | P1 | Both vote awards. Before Close, each checks Play and the network tab (`/rest/v1/…`) for vote rows | No one sees others' votes in UI **or** API until Close; after Close, winners match on both | BLOCKED |
| TC-MP-04 | P2 | CAP and P2 vote for each other for Best Overall; CAP closes | Winner per founder's Q7 rule; same on both screens; points +10 per rule | BLOCKED |
| TC-MP-05 | P1 | P3 signs up, creates a crew trip, invites P2, jumps the trip to Trip Season (or dates it so) | P3 sees Crew Check (empty state) and Game Night Live | BLOCKED |
| TC-MP-06 | P1 | CAP promotes P2 to Co-Captain, then demotes, then passes the Captaincy and gets it back. P2's tab stays open | P2's Me/Play reflect each role within a refetch; `trip_role_changes` logs 4 rows | BLOCKED |
| TC-MP-07 | P1 | Fill a crew trip to 12 (bots/Test Lab allowed), try a 13th join; Window Seat crew to 4, try a 5th | 13th / 5th refused with a friendly message; members sheet and invite panel show the same "N of cap" | BLOCKED |
| TC-MP-08 | P2 | Friends-off-the-app trip: host types 3 names, plays 3 rounds | Winner screen says rounds won, no points; nothing appears in Standings | BLOCKED |

## Account, age and auth (p.5)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-AU-01 | P1 | Sign up with email; enter a wrong 6-digit code, then an expired one, then the right one | Clear errors; success only with the valid code | BLOCKED |
| TC-AU-02 | P1 | Sign up with a birthday under 13 | Blocked ("ages 13 and up") | BLOCKED |
| TC-AU-03 | P1 | Sign up as 15 by email; then join with the plain join code | Self sign-up refused; plain code never admits a teen | BLOCKED |
| TC-AU-04 | P1 | CAP sends a teen invite; TEEN joins; TEEN tries a 2nd trip | Pending CAP approval; 2nd trip refused; minor card rule applied | BLOCKED |
| TC-AU-05 | P1 | P2 (18–20) joins with the code | Pending approval | BLOCKED |
| TC-AU-06 | P2 | Party-vibe trip, CAP 21+: drink content shows; toggle "No alcohol for me" | Drink prompts replaced everywhere for that player | BLOCKED |
| TC-AU-07 | P1 | Sign out, press Back, open a deep link `/t/<id>/play` | Sign-in screen; no cached trip data visible | BLOCKED |
| TC-AU-08 | P1 | ADM disables P2 while P2 is signed in; P2 taps anything | P2 loses access at once | BLOCKED |
| TC-AU-09 | P1 | Delete P2's account; CAP views Standings and crowns | P2's crowns read "Former player"; points stay in the ledger | BLOCKED |
| TC-AU-10 | P1 | As P2 (non-admin) open the admin and Test Lab URLs, and call `admin_find_users` from the console | UI blocks; RPC raises "Admins only" | BLOCKED |

## Home (p.6)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-HO-01 | P2 | Tap the search bar, type "bingo", then "Japan" | Results list (game; "Plan a trip to Japan"); tour only as a result | BLOCKED |
| TC-HO-02 | P2 | Welcome letter → Our Story → Back | Returns to the welcome letter | BLOCKED |
| TC-HO-03 | P1 | Home → Join with Code → enter CAP's code as P2 | Join flow opens | BLOCKED |
| TC-HO-04 | P2 | Board gate D "Games on Flight"; "Game Night" door | Arcade; one-night room setup | BLOCKED |
| TC-HO-05 | P3 | Signed out: sign-in footer contacts | hello@, support@, safety@ (fails today: **QA-B03**) | BLOCKED |
| TC-HO-06 | P2 | Board gate C "Inspire Someone" | Opens Show Your Culture setup | BLOCKED |

## Play (p.7–8)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-PL-01 | P1 | Compare Play score/place/phase with Trip → Standings, then reload | Identical; one current phase | BLOCKED |
| TC-PL-02 | P1 | Surprise Drop: submit photos; second account presents live instead | Photo path scored per Q4; live 👍 = 10; no double award | BLOCKED |
| TC-PL-03 | P2 | Visual check against deck slide 21 in each phase | Phase art, countdown, crew at the gate, route | BLOCKED |
| TC-PL-04 | P2 | Trip Season before a drop opens | Next drop shown sealed (Bingo visible) | BLOCKED |
| TC-PL-05 | P2 | Open a sealed quest | Wax-seal crack plays once; points pop on award | BLOCKED |

## Trip (p.9)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-TR-01 | P1 | CAP adds itinerary days; P2 reloads | Same items on both; correct trip | BLOCKED |
| TC-TR-02 | P1 | Members sheet vs Invite panel counts | Same "N of 12" | BLOCKED |
| TC-TR-03 | P2 | CAP on a crew trip: members sheet "Add 6 seats" | Today it shows and does nothing (**QA-B02**) | BLOCKED |
| TC-TR-04 | P1 | P2 reports a photo; CAP removes it | Photo hidden; its points reversed | BLOCKED |

## Me (p.10)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-ME-01 | P2 | Edit name, country, about, avatar; reload | All persist | BLOCKED |
| TC-ME-02 | P2 | Pick "Other", type "Snack Captain"; reload | "Trip role: Snack Captain" on Me | BLOCKED |
| TC-ME-03 | P3 | Me as ADM vs P2 | Founder tools only for ADM | BLOCKED |
| TC-ME-04 | P3 | Look for "Bronze Captain" | Not shown | BLOCKED |

## Captain Tools (p.11)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-CT-01 | P1 | As Co-Captain: edit dates, vibe, time zone; remove a player | All allowed | BLOCKED |
| TC-CT-02 | P1 | As Co-Captain: delete trip, pass crown, name a Co-Captain | Refused | BLOCKED |
| TC-CT-03 | P1 | 1-day trip: rename it in Trip details | Should save; today shows "Trips can be 2 to 30 days long." (**QA-B01**) | BLOCKED |
| TC-CT-04 | P2 | 14-day trip: set end date to day 20 | Friendly room message (1 to 14 days) | BLOCKED |
| TC-CT-05 | P2 | Unlock the full trip → checkout → cancel | No card fields in-app; cancel leaves the trip unchanged | BLOCKED |
| TC-CT-06 | P3 | Read paywall copy on every screen | Only "Free during beta" | BLOCKED |
| TC-CT-07 | P3 | Phase names on Captain Tools vs Play | "Baggage Claim" on both | BLOCKED |

## Setup (p.12)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-SU-01 | P1 | Create one trip per room (5) through all 5 steps | Created; room limits enforced (try 15 days → message) | BLOCKED |
| TC-SU-02 | P2 | Explore a Culture: pick 3 focuses | Limited to 2; Show Your Culture skips the step | BLOCKED |
| TC-SU-03 | P2 | Window Seat "Who's playing?" | Solo / crew (Friends off the app missing: **QA-B04**) | BLOCKED |
| TC-SU-04 | P2 | Crowning-night step | Date empty for the Captain to pick; time 19:00 | BLOCKED |
| TC-SU-05 | P3 | Solo setup vibe question; country list search "pseudo" | "What kind of traveler are you?"; no Pseudo-Accents | BLOCKED |

## Games (p.13–14)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-GA-01…14 | P2 | For each of the 14 arcade games: open, read rules, start, play 3 rounds, finish, restart | No repeat prompts; grid tag = detail tag; works by touch | BLOCKED |
| TC-GA-15 | P2 | One-phone Game Night to the end | "Winner / rounds won", no points claimed | BLOCKED |
| TC-GA-16 | P3 | Sign-in → "Try Games on Flight" | Plays as guest; nothing saved | BLOCKED |

## Passport (p.15–16)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-PA-01 | P2 | Open Passport | Identity, 10-country milestone, 3 named badges; no points bar/streak/counters | BLOCKED |
| TC-PA-02 | P1 | Tap a stamp of a finished trip | Postcard: collage, 3 answers, crowns, most excited for | BLOCKED |
| TC-PA-03 | P2 | World map: tap a pin → trip → avatar | Player profile; postcard only for members | BLOCKED |

## Other (p.17–18)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-OT-01 | P2 | Baggage Claim copy | "deleted 7 days after the trip" | BLOCKED |
| TC-OT-02 | P2 | Pre-Flight crown name with a Captain prize "Mystery Prize" | Crown "Early Bird"; prize shown separately | BLOCKED |
| TC-OT-03 | P2 | Baggage Claim → Final standings row | Expands per-season places | BLOCKED |
| TC-OT-04 | P2 | CAP opens own invite link | Opens the trip; no "You're invited" | BLOCKED |
| TC-OT-05 | P1 | Open `/join/BADCODE` | "This invite couldn't be opened…" | BLOCKED |

## Devices (p.5)

| ID | Pri | Steps | Expected | Status |
|---|---|---|---|---|
| TC-DV-01 | P1 | Real phone: load trip, airplane mode, browse, submit a proof, reconnect | Cached screens; offline page; outbox sends once | BLOCKED |
| TC-DV-02 | P2 | Add to Home Screen (iOS and Android) | Icon, standalone launch | BLOCKED |
| TC-DV-03 | P2 | Push reminder on both platforms | Arrives; quiet hours respected | BLOCKED |
