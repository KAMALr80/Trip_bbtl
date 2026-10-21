# TripJunkies™ — Play tab, Takeoff missions and Experience rules

Product rules agreed with the founder on Oct 3, 2026. Visual layer sits behind `useLook` (cinematic vs original). Server rules, scoring, roles, credits and Siam Vibes (VRFQQM) are not changed by visual work.

## Play tab
- Order: cinematic header → Game Day + AI credits + Manage → season chips → chip content → Leaderboard (top 3 + "See all").
- Question of the Week lives on Home only. The Game Night Calendar lives on Trip (Play links to it).
- Everyone follows the host's current step through shared play state; no live cursors.
- Real trip and At Home chips: Pre-Flight · Takeoff · Trip Season · Wrapped. Inside Takeoff, the At Home page is titled Home Missions and the real-trip page is titled Airport Missions. Highlight by date; Captain can move to the next phase.
- Crowning: Pre-Flight and Trip Season each crown the highest scorer.
- Quick Vote: anonymous "Cleared for Takeoff" / "Grounded", one vote each, changeable until the host locks; totals only, revealed by the host.
- Host, Co-Captain and Captain see the same page with a few extra controls.

## Games on Flight (on-demand play)
- The only on-demand play (plus Explore the App and Practice). Free, local pretend data. Local practice is never capped; only AI-powered content spends credits.
- No practice for photo-upload games (Bingo, Scavenger Hunt).
- "Add credits" appears only where AI credits are spent: custom / Mix It Up games, regenerating a set, extra destination activities, themed team challenges, new At Home pack, extra itinerary re-reads.
- Beta: purchases show "coming soon" with a Back button.

### Game Night on one phone (added Oct 3, 4:35 PM)
- Games on Flight offers two modes: **Practice** (solo, as before) and **Start a Game Night** (one phone, pass it around).
- No account is needed to play a Game Night. Signed-out visitors reach Games on Flight from the sign-in screen's "Take a look around".
- Flow: Players (2–10, type names) → Format ("One game, X rounds" or "Mix it up: a new game each round"; rounds 3 / 5 / 8) → each round shows the prompt, whose turn it is (names rotate) and a built-in timer only where the game has one → the host taps the round winner (one winner or "nobody") → winner screen with the Crowned celebration (local version) and scoreboard → Play again / Done.
- Nothing from a Game Night is saved to accounts, passports, leaderboards or trips. The night survives a page refresh on that phone (local storage) and is cleared on Done.
- Built-in content is free and unlimited. AI content (Mix It Up custom cards) needs a signed-in user and spends credits; a guest who taps AI sees "Sign in to use AI credits".
- Multi-phone play with points on passports is a trip or an At Home experience (create one, send the code) — Games on Flight never grows a code system of its own.

## Credits (added Oct 3, 4:35 PM)
- Two sources, one spend path: every trip or At Home experience includes credits by tier (20/35/50/70) for Captain/Co-Captain trip actions; purchased credits go to the buyer's **personal wallet** and work anywhere (trip extras as a leader, Games on Flight AI, Travel From Home / Window Seat AI).
- Spend order: the trip's included credits first, then the acting user's personal wallet. Leftover purchased credits stay on the profile; one-time packs, no auto re-up.
- A guest who runs out of free content or tries to buy sees: "Create a profile to keep unused credits" — credits always attach to a profile, never to a device.
- Wallet balance and ledger are server-only writes (payment webhook / founder); the client only reads. Beta: wallet shows, purchase shows "coming soon".

## Joining
- Real trips and At Home experiences join the same way: the Captain creates it, the app issues a join code, members tap the code (join_trip only on tap; age tiers apply). Travel From Home / Window Seat is individual — no Captain, no code.

## Junkie Rank and badges (decided Oct 3, 6:23 PM)
- Junkie Rank replaces the Traveler → Explorer ladder: one overall activity rank, server-calculated, separate from game scores (scores and crowns never mix with it). Points: trip completed 100 · captained +25 · Pre-Flight or Trip Season crown 50 each · At Home completed 40 · Travel From Home / Window Seat finished 40 · At Home crown 20 · Early Check-In or Takeoff task approved 5 each. Tiers: Carry-On 0 · Frequent Flyer 250 · First Class 750 · Jet Setter 1,500 · World Class 👑 3,000. Sandbox excluded; trips count only with 3+ approved members; At Home max 4 per month; tiers never drop. Sample rewards shown as coming soon until payments.
- At Home and Travel From Home / Window Seat earn Junkie Rank activity points, but At Home still never appears on competitive leaderboards, seasons or crowns outside its own experience.
- "Passport Junkie 👑" stays as one special badge (not a ladder), earned with 5 international trip stamps, shown next to the Junkie Rank badge. At Home can never earn it.
- Experience previews (text only, no photos, no member info, after the trip ends, Captain opt-in) feed destination pages under the Leaderboards door; destination pages are open to teens, the public leaderboard tab stays 18+.

## Passport Junkie
- One place, separate shelves: Trips (stamps, Pre-Flight and Trip Season crowns, traveler level), At Home (postcards, in-experience crowns), Travel From Home / Window Seat (creator badge tiers — placeholder tiers until likes/downloads exist). Points never merge across shelves; only counts roll up into the summary. Public leaderboards rank real-trip seasons only.

## Takeoff = Airport Missions (Home Missions for At Home)
- Security-checkpoint theme (not the boarding pass look). States up to 12 bonus points; safe note: nothing here should keep you from clearing security.
- Tap Reveal → random airport-safe mission → Complete / Not completed → next. No time limit.
- Missions 1–3 = 2 pts each; layover/connection unlocks 4–5 = 3 pts each; max 12, capped server-side; score still clamps at 100.
- No upload. Points stay pending until the Captain or Co-Captain verifies; a leader cannot verify their own claim.
- 80+ pre-written missions by phase, shuffled per member per trip, no repeats within a trip. Safe, fun, never explicit, never holds up a line, ask before photographing strangers or staff.
- At Home / Cultural use their own Takeoff mission pool with the same points and verification.
- Teams are only a label; team total = sum of members' individual points.

## Experience structure
- Length 1–12 days chosen by the creator; phases built around the chosen days (day blocks, not clock time), at least 1 day lead time.
- At Home / Cultural-from-home: no on-demand play. Each day is a Game Day with one scheduled session time set by the Captain. Daily card asks for a real, culture-related action; people present, group votes, points for doing/presenting/voting, top scorer crowned. In-experience only; never on global leaderboards, badges or levels.
- Travel From Home (from home): creator maps up to 12 days; AI asks a few questions and curates, or generates; points come from likes.
- Window Seat (travel): individual, no Captain; two lanes — "Create it for me" (AI builds fun daily cards around the traveler's dates and destination) or their own cards; document photos/reviews/places; solo self-confirm, groups may confirm each other; at the end "Summarize my trip" (AI preview from their own stops, reviews and photos). The shared preview is what people like.
- Badges: first on first experience; Bronze/Silver/Gold from likes, usage and downloads, not trip count. Separate Home and Travel tracks.

## Later (needs privacy/safety review first)
Public browsing of experiences, downloads, credit rewards, membership tiers, creator payouts, world map pins. Opt-in only, no exact addresses, under-18s never public, report/hide tools, anti-abuse for likes.

## Travel From Home / Window Seat experiences (added Oct 3, 4:50 PM — build now)
- **From Home** and **On a Trip** are full flows, not samples: the creator goes through the whole process (From Home: map up to 12 days around a culture, AI asks a few questions and curates or the creator writes it, do it, upload results; On a Trip: daily game-style cards documenting photos, reviews and places; solo self-confirm, travel groups may confirm each other).
- Signed-in members can open a shared experience, like it (one like per person, no self-likes) and see a likes leaderboard. Creators earn their **first badge** on their first finished experience. Tier climbing (Bronze/Silver/Gold from likes, usage, downloads) and downloads are shown as "coming soon" until the later phase.
- Sharing is **opt-in per experience** (default: private to the creator/squad). Under-18 creators can never share publicly. City level only, never exact addresses. Report/hide on every shared experience. Likes only from approved accounts.

## Content tone (added Oct 3, 4:50 PM)
- **Game types** (presentation labels, not catalog renames): Act It (reenact a scene or moment), Make It (cook/build/craft), Taste It (guess the dish), Sing It (karaoke/Sing-Off), Move It (dance/gestures), Dress It (themed colors and patterns, not costumes of a people), Tell It (stories/presentations), Know It (trivia), Guess It (price/place/phrase), Pitch It (business/money ideas), Draw It (quick draw), Know Each Other (getting to know each other), Team Up (team challenges), Vote It (group votes), Find It (trip-day hunts).
- **Learning lenses** on cards: culture, history, food, music, language, business, money, health, sports, landmarks and traditions. The host chooses games; catalog pools should cover every type.
- Group-trip games are about **interaction**: working together, digging a little deeper, doing things, not only answering trivia. The trip must feel worth more than a single game night.
- "Spicy" (21+) means **bolder, deeper, harder** — never sexual, unsafe, unethical or illegal. "Sip or skip" prompts only where the trip allows alcohol. Everything stays fun and clean, not cheesy or boring.
- A one-phone Game Night can be more flexible: a mix of interaction, questions and small challenges.
- Avatars are pick-only from the built-in cartoon set; see `docs/AVATARS.md`.
- During a live round, any interactive feature a game has (for example the quick-draw canvas) is available on **every player's own phone**, local to that phone; the host marks the winner.

## Early Check-In tasks (added Oct 3, 5:45 PM)
- Hands-on culture tasks before Takeoff (and during At Home / Cultural experiences), presented at any group call or Game Day, approved by the Captain or Co-Captain, worth bonus points. Same flow and infrastructure as Takeoff missions. Never branded "TSA" or "PreCheck".
- Always 3 tasks per member, worth 4 / 3 / 3 = up to 10 bonus points, regardless of trip length. Reveal in order → Complete / Not completed → pending until presented and approved → points release. Deadline: Takeoff for trips, the end of the experience for At Home / Cultural. Everyone has their own tasks; teaming up is social only, no split points.
- Lives on Play as an "Early Check-In" tile under the four chips (which stay Pre-Flight · Takeoff · Trip Season · Wrapped). Approvals sit in Captain Tools › Pending missions.

## Content policy — every pool, every AI prompt (added Oct 3, 5:48 PM)
- Tailor everything to the destination / chosen culture: questions, cards, tasks, missions, At Home packs, Travel From Home / Window Seat content. Never content about a different place.
- Heavy randomization; cover the full spread of how a person learns a culture: food, music, dance, art, sports, language, history, business, real estate, money and livelihood, traditions and holidays, etiquette, geography, local games, landmarks, how people live and work. Mix learning, bonding, challenging friends, competing and doing things together.
- Out completely, in every format: politics, religion, sex, drugs, anything unsafe, unethical or illegal. (The founder allows a light, harmless joke as the only political exception; default to leaving politics out.)
- Alcohol only inside 21+ content, in all forms, and only where the trip allows it (`is_approved_adult`, `no_alcohol`).
- "Spicy" means bolder, deeper, harder — never sexual. Fun and clean, never cheesy or boring.
- Card format for tasks and culture cards (Early Check-In, At Home daily cards, Travel From Home / Window Seat cards): title · what to do · a 1–3 sentence backstory (why this dish, song, tradition or place matters there) · 2–4 "search for…" keywords so people can dig deeper on their own (recipes, history, how-to) · points. The app never writes long articles; the keywords do that job.
- AI does the heavy lifting only when the person asks for it: "Create my itinerary" on a trip, "Plan it for me" on an At Home experience, or "Create it for me" on a Travel From Home / Window Seat experience. Everything else comes from the written pools, filled in with the destination.

## AI rules
All AI runs server-side behind `spendAiQuota` (`use_ai_quota`). Content is tailored to the trip location, trip kind, vibe, age tier and chosen rules; no repeated questions within a game or trip. The content policy above applies to every prompt and every seed pool.
