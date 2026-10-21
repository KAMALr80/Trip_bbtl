# 02 — Game Rules Spec (from the founder deck)

This file rewrites the October 2026 deck as **numbered, testable rules**. Tickets and tests should cite rule IDs (`R-xxx`).

- **"Slide"** = deck page number.
- **⚠ Qn** = the rule has an open question in [06-open-questions.md](06-open-questions.md). Build the recommended default unless the founder says otherwise.
- **"Today"** = what the current code does, where it matters.

> **Get founder sign-off on this file before M2 starts.** Once agreed, changes to rules go through a PR to this file first.

---

## Glossary

| Term | Meaning |
|---|---|
| **Room** | The kind of experience: Going on a Trip, Window Seat, Explore a Culture, Show Your Culture, Game Night |
| **Phase** | Pre-Flight → Takeoff → Trip Season → Baggage Claim. The same four in every room |
| **Captain** | Whoever created the trip. One per trip |
| **Co-Captain** | Named by the Captain. Every Captain power except deleting the trip |
| **Crew** | Players on the app, each on their own phone, who joined with the trip code |
| **Off-app friends** | Names typed into one phone; no accounts; no points saved |
| **Season** | A scoring window that ends in a crown: Pre-Flight (Early Bird) and Trip Season (Jet Setter) |
| **Crown** | 🔵 **Early Bird** (Pre-Flight) and 🟡 **Jet Setter** (Trip Season) |
| **Passport Junkie profile** | What a player keeps forever: stamps, postcards, badges, level |
| **Home time** | Captain's phone time zone. **Trip time** = destination time zone |

---

## R-0xx · Rooms & "Who's playing?"

| ID | Rule | Slide |
|---|---|---|
| R-001 | Five rooms: **Going on a Trip** (group trip, home or abroad), **Window Seat** (solo, or a crew of up to 4), **Explore a Culture** (a culture at home), **Show Your Culture** (share your own), **Game Night** (one night, any time). | 2 |
| R-002 | **Rooms change content and theme, never the flow.** Every room uses the same four phases and the same Play engine. | 3, 6 |
| R-003 | The first question in every room is **"Who's playing?"** with three answers: **Just me**, **My TripJunkies Crew** (working name ⚠ Q19), **Friends off the app**. The answer changes content, never the flow. ⚠ Q2 (where in setup) | 4 |
| R-004 | **Just me** works in every room except Game Night: trip, Window Seat, Explore, Show Your Culture. Solo gets a daily quest, a journal, and up to 10 photos. Solo earns crowns by hitting each season's **goal** (R-507). | 4, 18 |
| R-005 | **Crew**: up to **12** in one group. 13–24 = Event Group, split into 2 teams (**later phase**). Window Seat crew: up to **4**. Each player uses their own phone and joins with the trip code. Full competition for both crowns. | 4, 19 |
| R-006 | **Friends off the app**: one phone runs the games. The host types first names and taps who wins. No points, no accounts. Names stay on that device and nothing is saved for them. **Only the host earns stamps.** Off-app scores never mix into account scores, leaderboards or passports. Works in every group room. | 4 |
| R-007 | Content is tagged **trip / at home / solo**, so a Japan-at-home group never gets a task at a place in Japan. | 10 |
| R-008 | **Game Night (one-night) room**: instant, free; no points, no crowns, no stamp. Same-day at-home plans use this room. ⚠ Q21 (one phone vs codes) | 5, 19 |

*Today:* `PlayingChoice` offers `solo` / `online` / `offline`. Explore a Culture is **group-only** today, but R-004 says solo works there; see M2-07. Offline roster lives in `localStorage` (`tj-offline-roster:<tripId>`), capped at 10 names.

---

## R-1xx · Phases & timing

| ID | Rule | Slide |
|---|---|---|
| R-101 | **Pre-Flight** runs **0–10 days** before the trip's first day. The Captain picks the number, or **Skip**. It counts back from the first trip day and **closes 11:59 PM home time the night before takeoff**. | 3, 5 |
| R-102 | **Takeoff** = **takeoff day, 12:00 AM–11:59 PM home time**. Takeoff day is the trip's first day. ⚠ Q8 | 3 |
| R-103 | **Trip Season** starts when the Captain **or Co-Captain** taps **"We've arrived"**. **Automatic backup: 11:59 PM the next night** (trip time). It runs to the **last trip day**. *Today:* backup ✅ (`trip_season_start_at`), but only the Captain can tap. | 3 |
| R-104 | **Baggage Claim** starts the **day after the trip** and lasts **7 days**. On Day 7 everything locks (R-6xx). After that, the trip shows overview, answers and kept photos only. | 3 |
| R-105 | **Late start / Skip:** if setup finishes late, or Pre-Flight is skipped, the group starts in **whatever phase today falls in**. Skipping Pre-Flight means **no Early Bird crown**. A free Game Night still works. | 3, 5 |
| R-106 | Every phase opens with its **banner at the top of the page (no pop-up)**. The Trip Season banner fills in the destination city, or the culture/country for at-home rooms. Banner copy is in R-107. | 3 |
| R-107 | Banner copy: Pre-Flight *"Now boarding. Your trip starts here."* · Takeoff *"Get ready for takeoff. Seatbelts on."* · Trip Season *"You've arrived. Welcome to {city}."* · Baggage Claim *"Thank you for flying with us. Collect your memories."* | 3, 6 |
| R-108 | **Time zones are automatic.** Home time (Captain's phone) applies **before the flight**. Trip time (destination) applies **after arrival**. **At-home rooms use home time only.** No live GPS. Flight-number tracking is a later phase. | 3, 18 |
| R-109 | **Every deadline is one moment for the whole group**, shown in each player's own phone time. | 18 |
| R-110 | **At-home rooms:** Trip Season = the **experience days (1–7)**. Crowning night = **finale night**. Takeoff = **Home Missions**, which must be the day before. So at-home experiences must be **created at least the day before**; same-day plans use the free one-night Game Night (R-008). | 5, 10, 19 |
| R-111 | **Long flights:** Takeoff shows flight games plus the **"We've arrived"** button **until landing**. | 8 |
| R-112 | Maximum length: **14 trip days** for Trips and Window Seat; **1–7 experience days** at home. Longer than 14 days → start a second trip. | 19 |

**Reference timeline (Going on a Trip, 5-day Pre-Flight, trip June 10–14):**

```
Jun 5 00:00 home ─ Pre-Flight ─ Jun 9 23:59 home │ Jun 10 00:00–23:59 home = Takeoff │ "We've arrived" (or auto Jun 11 23:59 trip time) ─ Trip Season ─ Jun 14 end │ Jun 15 – Jun 21 Baggage Claim (Day 7 = Jun 21 locks)
                       Early Bird crowned ▲                                                                       Jet Setter crowned at crowning night ▲
```

---

## R-2xx · Captain setup & roles

| ID | Rule | Slide |
|---|---|---|
| R-201 | Setup is **five short screens**, one at a time, with a **Next** button and no long scrolling. After that, the app runs the trip. | 5 |
| R-202 | **Screen 1 · Where to?** Destination: country, state or city, with place suggestions (beta note: city field shows none today). **Culture to explore** is pre-filled with the destination's culture; the Captain can add a second (e.g. Caribbean in London) ⚠ Q14. **At home:** pick the culture. | 5, 18, 20 |
| R-203 | **Screen 2 · Trip basics.** Dates: tap first and last day. Vibe. Ages / minors. Room details. | 5 |
| R-204 | **Screen 3 · Pre-Flight.** One-line intro. How many days before: **0–10 or Skip**. **Up to 4 call nights**, each with date · time · optional call link, plus an optional **2nd link** for a split call (FaceTime, Zoom, Google Meet, etc.). | 5 |
| R-205 | **Screen 4 · Trip Season.** One-line intro. **Crowning night: date · time · location** (never pre-set; the Captain picks it). Optional call link for anyone who can't make it. **At home: finale night picker** (beta note). | 5, 20 |
| R-206 | **Screen 5 · Invite.** Who's playing. **Trip code + invite link made automatically**; tap **Share**. **Done**: Play fills in for this trip. | 5 |
| R-207 | **Whoever creates the trip is the Captain** automatically. Everyone joins with the same trip code. | 5 |
| R-208 | The Captain names a **Co-Captain from the Me tab** once people have joined. The Co-Captain has **every Captain power except deleting the trip**. | 5, 6, 16 |
| R-209 | Captain and Co-Captain **play the same game and earn points the same way**. Their extra controls live in **Me tab → Captain tools**, **one tile per phase**. | 6 |
| R-210 | Captain tools by phase: **Pre-Flight**: call nights + optional call links · **Takeoff**: tap "We've arrived" · **Trip Season**: crowning night details · **Baggage Claim**: break photo ties or swap one photo. Also: share the trip code, edit dates / call nights / links any time, **remove a player**. **Delete trip is Captain-only.** | 6, 16 |
| R-211 | Setup answers must **save and show on Trip / Play** (beta note). | 20 |
| R-212 | **Joining a trip asks only two things:** your role this trip (pre-filled) and "most excited for". | 14 |

---

## R-3xx · Play content

### Play tab structure

| ID | Rule | Slide |
|---|---|---|
| R-301 | Play = **one hub + four phase pages + a card for everything**. The hub shows **score** and the **phase track**. Tap a phase → its page. Tap a card → its detail. | 7 |
| R-302 | **Play fills in for every room.** Rooms only change setup and content (beta note: Play is empty for at-home and Window Seat today). | 6, 20 |
| R-303 | The hub score line reads like *"Early Bird race · #2 of 6"* or *"Jet Setter race · #1 of 6"*. | 6 |

### Daily content

| ID | Rule | Slide |
|---|---|---|
| R-311 | **Daily Discovery** lives on **Home**: one thing to know about where you are (or are going) today. On **question days** it is worth points (1–2). Runs in Pre-Flight and Trip Season. ⚠ Q9, Q22 | 3, 8, 9, 12 |
| R-312 | **Daily Card** lives on **Play** during Pre-Flight: tap to play, worth 1–2 points. ⚠ Q4, Q9 | 3, 6, 12 |
| R-313 | The **daily push shows the tip itself**, like a word of the day (R-8xx). | 18 |

### Sealed quests & Showcase (Pre-Flight)

| ID | Rule | Slide |
|---|---|---|
| R-321 | A **sealed quest drops 3 days before each game night**. If Pre-Flight is short, it drops **on day 1**. | 3, 8 |
| R-322 | Sealed quest = **5–15 points**, **+5 if opened within 3 hours** of the drop. ⚠ Q4 | 12 |
| R-323 | A quest is completed by **presenting it at game night** (R-402) or by **photo proof** that passes Crew Check (R-411). | 8, 11 |
| R-324 | **Showcase** is a Pre-Flight task worth **20 points**. | 8, 12 |

*Today:* `sealed_quests` (kinds `sealed` / `showcase`), `sealed_drops`, `sealed_award`, `quest-proofs` bucket. Re-check the drop timing and the 3-hour bonus against R-321/322.

### Takeoff

| ID | Rule | Slide |
|---|---|---|
| R-331 | **3 sealed Airport Missions**, open for 24h on departure day. Revealed one at a time ("Airport Mission 1 · Reveal; 2–3 Sealed"). | 3, 6, 8 |
| R-332 | Proof can be uploaded **until Trip Season starts**. Points (**up to 12 total**) **count toward Trip Season**. | 3, 12 |
| R-333 | **At home:** **Home Missions** the day before (prep and set the scene). | 3, 10 |
| R-334 | **Games on the Flight**: free, **offline**, **no points**. | 3 |

*Today:* ✅ `mission_claims`, `mission_action`, `mission_window`. Slot points: 1–3 = 2, 4–5 = 3. Capped at 12.

### Trip Season

| ID | Rule | Slide |
|---|---|---|
| R-341 | **Daily Discovery every day** of Trip Season. | 8 |
| R-342 | **Surprise Drops**: about **one every 2–3 days** (4-day trip ≈ 2, 10-day ≈ 4–5) on **random days**. Same game for the **whole group** that day: **Bingo, Scavenger Hunt, Speed Challenge or Photo Challenge**, tailored to that day's city. Open for **24 hours** (reminder a few hours before it ends). Worth **10–33 points**. ⚠ Q4, Q27 | 3, 8, 12, 18 |
| R-343 | Surprise Drop proof is a **photo**, or **presenting live** at game night / crowning night. Photos only for now; video later. | 8 |
| R-344 | **Trip quest**: when Trip Season opens, **every player gets a random quest**. They can share it or **keep it a surprise for the crowning dinner**. | 3, 8 |
| R-345 | **Crowning night**: on the date, time and place the Captain set. Present quests, play, crown (R-505). | 3 |

### Window Seat (solo or crew ≤ 4)

| ID | Rule | Slide |
|---|---|---|
| R-351 | Every trip day: **Morning**: Daily Discovery. **Daytime**: one small **quest** for that city and the player's vibe (foodie, explorer, chill…), photo proof, **5 pts**. **Evening**: **journal**, one fun prompt tied to the day's quest plus 2 others to swap to; type or dictate; **2 pts**. **Random days**: Surprise Drop (same games as groups). | 9 |
| R-352 | Journal example prompts. Foodie: *"Rate today's best bite 1–10. Who would you bring back to try it?"* Explorer: *"Where did you get lost today, and what did you find?"* Chill: *"Best seat you sat in today, and what was the view?"* | 9 |
| R-353 | Pre-Flight works the same way but lighter: Daily Card plus a few sealed quests. | 9 |
| R-354 | **Crew of up to 4:** daily quests stay **personal** (so they compete). Surprise Drops are played together. The journal feeds **one shared guide**. Each player nominates up to **5 photos**; everyone hearts favourites in wrap-up week; the **top 10** go on the shared stamp. **Truly solo:** they pick their own 10. | 9 |
| R-355 | What they keep: a **shareable guide** built from their journal and photos; a **stamp with a solo marker** that opens the full trip story; progress on the **Storyteller** badge (R-713). | 9 |

### Cultural experience (at home)

| ID | Rule | Slide |
|---|---|---|
| R-361 | **Explore a Culture**: a group picks a culture and **up to 2 focuses**. Cook it, learn it, wear it, play it. | 10 |
| R-362 | **Show Your Culture**: share your own. In a group, **the Captain's culture is the theme**. Solo hosts a **Showcase Night**. | 10 |
| R-363 | Focuses (11): Food & drink · Music & dance · Language & slang · Fashion & dress · Holidays & traditions · History & heroes · Art & crafts · Games & sports · Manners & customs · Folklore & stories · Film & pop culture. | 10 |
| R-364 | Phases: **Pre-Flight** 0–10 days (game nights on a group call, quests, Daily Discovery) · **Takeoff** Home Missions (prep, set the scene) · **Trip Season** 1–7 experience days, then the **finale night** (present, vote, crown) · **Baggage Claim** wrap-up week, **postcard + Culture Collector badge**. | 10 |
| R-365 | **Solo at home:** no game nights; the finale is their **own showcase page**. | 10, 18 |
| R-366 | Both culture rooms give the **same Postcard on the Postcard Wall**. Group rooms put **6 photos** on the postcard. | 10 |

---

## R-4xx · Game Night Live & Crew Check

| ID | Rule | Slide |
|---|---|---|
| R-401 | **No host.** Turns happen out loud (on the video call, or at the table on the trip); the app only collects votes. The **same screen** is used for Pre-Flight call nights and the crowning night. | 11 |
| R-402 | Tap **Game Night Live** on Play → a screen of the crew's avatars, name under each. **Show & Tell:** when someone finishes presenting, others tap their avatar → **1 👍 approves their quest: show up + present = 20 pts**. **You can't tap your own avatar.** | 11, 12 |
| R-403 | **Awards** at the end: each player taps **one avatar per award, in secret**. 🏆 **Best Overall +10** · 🎨 **Most Creative +5** · 📖 **Best Story +5**. ⚠ Q7 (award ties) | 11, 12 |
| R-404 | The **Captain or Co-Captain taps Close**; points add up and winners show on Play. The Captain **can reopen** if it closed too early. **Auto-closes at midnight** (whose midnight: see R-109 / Q8). | 11 |
| R-405 | Video stays in FaceTime / Zoom / group chat. Call link is optional in setup; an optional **2nd link** lets a big crew split into two calls, but **everyone votes on the same screen**. | 11 |
| R-406 | *Later upgrade (not Phase 1):* Kahoot-style synced "Up now" screen and live drumroll reveal. | 11 |
| R-411 | **Crew Check (any day):** photo proof that needs approval **goes to the crew**. **1 👍 from any other player approves it.** **No 👍 within 24h = not approved.** | 11 |
| R-412 | There is **one Crew Check card on Play**, e.g. "3 to check". | 11 |
| R-413 | **AI still checks Bingo, Scavenger and Photo games.** ⚠ Q3 (how AI and Crew Check combine) | 11, 19 |
| R-414 | **Solo self-honors** (no Crew Check). | 11 |

*Today:* none of R-401–R-414 exists in this form. The current game night (`GameNights`, `game_night_*`, spin wheel, turns, finale vote) is host-led and should be replaced (see [05](05-legacy-retire-list.md)).

---

## R-5xx · Points & crowns ("Mario Kart model")

| ID | Rule | Slide |
|---|---|---|
| R-501 | **Points only live inside one trip.** They decide two crowns, then reset. There are **no lifetime point totals.** | 2, 12 |
| R-502 | Points table: | 12 |

| Way to earn | Points | Season | Rule |
|---|---|---|---|
| Daily Discovery (question days) · Daily Card | 1–2 | Pre-Flight / Trip | R-311, R-312 |
| Sealed quest | 5–15, +5 if opened within 3h | Pre-Flight | R-322 |
| Window Seat: daily quest · journal | 5 · 2 | Pre-Flight / Trip | R-351 |
| Airport Missions | up to 12 total | **Trip Season** | R-332 |
| Showcase (Pre-Flight task) | 20 | Pre-Flight | R-324 |
| Game night: show up + present (crew 👍) | 20 | season of that night | R-402 |
| Awards: Best Overall · Most Creative · Best Story | +10 · +5 · +5 | season of that night | R-403 |
| Surprise Drop | 10–33 | Trip Season | R-342 |
| Free Game Night, Games on the Flight, off-app play | **0** | — | R-008, R-334, R-006 |

| ID | Rule | Slide |
|---|---|---|
| R-503 | **Early Bird (blue)** = Pre-Flight crown. Decided when Pre-Flight closes (11:59 PM home time, night before takeoff). | 3, 12 |
| R-504 | **Jet Setter (gold)** = Trip Season crown, decided at **crowning night**. ⚠ Q10 (no crowning night set) | 3, 12 |
| R-505 | **Groups win by beating each other.** Highest points in the season wins. | 12 |
| R-506 | **Tie-breaker (proposed):** more Showcase points, then **earliest finish**. ⚠ Q7 | 12 |
| R-507 | **Solo wins by hitting the goal**: about **60% of the points possible in that phase**. ⚠ Q5 | 4, 12, 19 |
| R-508 | Crowns are **saved on the trip's stamp**. | 12 |
| R-509 | Group limits and length caps are **checked on the server** as well as on screen. | 19 |

---

## R-6xx · Postcard Picks & Baggage Claim

| ID | Rule | Slide |
|---|---|---|
| R-601 | **During the trip:** each player **nominates 2 photos** from the **Postcard Picks** card on Play, and can swap them any time **until the last trip day**. (Window Seat crew: up to 5 each, R-354.) | 13 |
| R-602 | **Wrap-up week (Baggage Claim days 1–7):** **heart the crew's picks**; answer **3 quick questions**: *"Moment you'll never forget"* plus **2 from a fun pool**. Short answers only. | 3, 13 |
| R-603 | Question pool: Your trip in 3 emojis · Best bite · Song of the trip · Something new you learned · Funniest moment in 5 words · One thing you'd do again tomorrow. | 13 |
| R-604 | Answers are capped at **about 60 characters**; the emoji question takes **exactly 3 emojis**. **Real words only, no AI rewriting.** | 13 |
| R-605 | **Day 7 locks:** the top photos plus everyone's answers (**no names**) form the **collage**, which attaches to **every passport automatically**, together with crowns and "most excited for". Download or share. | 3, 13 |
| R-606 | **Photos kept:** **6 for group rooms**, **10 for solo**. The Captain or Co-Captain **only breaks ties or swaps one photo**. | 13 |
| R-607 | **All other trip photos are deleted** after Day 7. **Stamp photos are kept permanently.** ⚠ Q11 | 3, 13 |
| R-608 | Collage template: **3 photos each side**, answers grouped by question in the middle. It doubles as the shareable **Trip Postcard**. | 13 |
| R-609 | After Baggage Claim: the trip shows **overview, answers and kept photos only**. | 3 |

---

## R-7xx · Passport Junkie profile, levels, badges, map

| ID | Rule | Slide |
|---|---|---|
| R-701 | **Page 1:** title, level, about me, this trip's role and "most excited for". **Page 2:** stamps (trips) · postcards (culture) · your trips. Tap a stamp → that trip's postcard. | 14 |
| R-702 | **"From"** holds the player's country, **auto-filled from the phone** (locale/region, not GPS). It decides whether a trip gives a **passport stamp** (abroad) or a **state stamp** (home country). | 14 |
| R-703 | **Levels by number of countries:** Tourist 1 · Explorer 3 · Voyager 5 · Globetrotter 7 · Passport Junkie 10 · ★ 15 · ★★ 20 · ★★★ 30. | 14 |
| R-704 | **Level is computed when a stamp is added.** Nothing runs in the background. | 14 |
| R-711 | Badges have three tiers each: **Carry-On → Checked Bag → First Class**. | 14 |
| R-712 | **U.S. Explorer**: 1 / 5 / 15 states · **Culture Collector**: 1 / 5 / 10 cultures | 14 |
| R-713 | **Storyteller**: 1 / 3 / 10 Window Seat guides. | 14 |
| R-714 | **Public** profile shows everything. **Private** shows avatar, game name and level only. | 14, 15 |
| R-715 | **Removed** from today's profile page: rank points bar, nights in a row, the four counters, Phases, Culture Stories. | 14 |
| R-721 | **World map** *(Phase 1 or next, ⚠ founder to decide; see LATER)*: every finished trip of a **public** player gets a pin; zoom in for US states. Nearby pins **cluster** into a numbered bubble. Tap a place → list of trips (name, room icon, season + year, crowns). Tap a trip → overview (collage, answers, crew avatars). Tap an avatar → profile. At-home experiences pin to the culture's country with a small home marker. | 15 |
| R-722 | **Tap any avatar anywhere** (crew list, leaderboard, map, trip overview) → that person's profile. | 15 |

---

## R-8xx · Me tab & notifications

| ID | Rule | Slide |
|---|---|---|
| R-801 | Every player edits their own: name, avatar, From, About me; this trip's role and "most excited for"; **pick top stamps**; **hide a trip or photo**; **public / private profile**; **notification settings and quiet hours**. | 16 |
| R-802 | Captain + Co-Captain also get **Captain tools** (R-210). | 16 |
| R-811 | **Reminder schedule:** see the table below. | 18 |
| R-812 | **Push first, email backup.** Players can **mute any reminder type**. **Quiet hours** are respected. | 18 |

| Reminder | When |
|---|---|
| Daily Discovery / Daily Card | Each morning, with the tip in the push text |
| Sealed quest dropped | On drop (3 days before game night) |
| Sealed quest prep | Day before game night |
| Game night | 1 hour before, and when it goes live |
| Pre-Flight closing | Night before departure |
| Airport Missions open | Departure morning |
| Surprise Drop | On drop, and a few hours before its 24h ends |
| Crowning night | 24-hour countdown, with location |
| Wrap-up week | Day 1, Day 5, last day |

---

## R-9xx · Limits, ages, AI, language, onboarding

| ID | Rule | Slide |
|---|---|---|
| R-901 | Group size 1–12. Event Group 13–24 (2 teams, **later phase**). Window Seat: solo or up to 4. | 19 |
| R-902 | **Adding players mid-trip moves the group to the next price tier** (the Captain pays the difference once payments are live). | 19 |
| R-903 | **Price tiers** (payments are **Phase 2**): Solo · Crew 2–4 · Squad 5–8 · Big Squad 9–12 · Event Group 13–24; add-on for trip days 8–14. | 19 |
| R-904 | **Ages:** sign-up is 18+. **18–20 can't be Captain.** **13–17 only by Captain invite.** **Alcohol content is 21+.** ⚠ Q12 | 19 |
| R-905 | **AI is included.** There is a **quiet daily limit on remixes**. AI checks Bingo, Scavenger and Photo proof. Moderation is **flags only** (humans decide). | 19, 23 |
| R-906 | **Languages:** English first, Spanish next. Ideally AI cards follow each player's language (can wait). ⚠ Q15 | 18 |
| R-907 | **Explore tour:** a swipe-through with **one image per room**: Welcome · Going on a Trip · Window Seat · Explore a Culture · Show Your Culture · Game Night · Crowns + Our Story. **Swipe only**; the only buttons are **Skip** and **Get started**. **No rules, points or setup details.** | 17 |
| R-908 | **Founder tools:** an admin area (users, trips, beta codes) and a **sandbox for test trips**. The main need is a way to run test trips. | 18 |
| R-909 | **Design direction:** the "Airline Look". Palette: navy, indigo, cyan, pink, orange, sun yellow. Glossy wordmark; avatars with a sunset-glow ring; missions as ticket stubs; crowns as luggage tags; stamps on a passport page; boarding-pass Play hub; departures board on Home; the destination photo set once from the trip's location and dates. Phase 1 stays simple (layout, colours, stubs, tags, stamps, 1–2 light animations). | 21, 22 |
