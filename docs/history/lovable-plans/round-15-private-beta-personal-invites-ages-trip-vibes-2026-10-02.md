# Round 15: Private beta, personal invites, ages, trip vibes

Keeps the Neon Night Out look. The game night flow, host rules, Siam Vibes' schedule and the Test Lab's existing tools stay as they are.

## What you'll see

1. **Private beta lock**
   - A founder-only "Public launch" switch in Me, off by default.
   - While it's off, signed-out visitors without a valid invite see only the logo, "Private beta · invite only" and **Log in**. There's no sign-up, Explore tour or other screens.
   - Visitors who arrive with a valid invite see sign-up as normal.
   - The app also tells search engines not to list it (a robots.txt file plus a "don't index" tag on every page).
2. **Personal invite links**
   - Captain Tools → "Invite someone" makes a single-use link that expires after 7 days.
   - A list shows each link as invited, joined, unused or expired, with **Cancel**.
   - A switch turns the shared join code on or off. Siam Vibes keeps VRFQQM on.
   - "Reset join code" already exists and kills the old code.
3. **Captain approval**
   - A trip setting, "Approve new members". It's on for new trips and off for Siam Vibes.
   - New members see a "Waiting for your Captain ⏳" screen.
   - The Captain sees their name, avatar and age range, with **Approve** or **Decline**.
   - Until approved, the server hides the whole trip from them.
4. **Ages**
   - Sign-up asks for a date of birth, stored privately. Captains only ever see the age range: Teen 13–17, 18–20 or 21+.
   - Under 13 can't continue.
   - Only people 18+ can start a trip or become Captain.
   - Teens can only join through a personal invite plus Captain approval, and never get Party or drink content.
   - 21+ content still needs the Captain's manual 21+ approval.
   - People who already have an account are asked for their date of birth once, the next time they open the app.
5. **Trip vibe** (replaces the 21+ switch)
   - **Family 👨‍👩‍👧:** no drink or party cards for anyone.
   - **Chill 😎:** light drink mentions, which swap to alternatives automatically for teens.
   - **Party 🎉:** bolder cards for approved 21+ players only; everyone else gets alternatives automatically.
   - Picked in Step 1 of setup and changeable in Captain Tools.
   - Each vibe has its own header badge, card-back pattern and glow colour.
   - Siam Vibes is set to Chill.
6. **No alcohol for me:** a private switch on your player card. Drink cards and challenges swap to alternatives, and nobody else can see who has it on.
7. **Explore tour:** one extra display-only card showing the three vibes.
8. **Privacy note**
   - A short "What we collect and why" page, linked from sign-up.
   - Sign-up needs an "I'm 13 or older and agree" tick.
9. **Test Lab additions:**
   - a vibe picker for the sandbox
   - a teen bot and a no-alcohol bot
   - "A bot waits for approval", which turns approval on and leaves a bot pending
   - "Make a personal invite link"
   - "Preview the private beta lock", which shows the locked screen without signing you out

## Technical details

- **Sign-up enforcement:** sign-up is through Google and email, so the account itself is created by the sign-in service. The server-side gate is a `beta_access` row, which is created only when:
  - the launch switch is on, or
  - a valid invite is redeemed (`redeem_beta_invite`), or
  - for existing users (backfilled).

  Every trip function and RLS policy that matters (create_trip, join_trip, profiles writes) checks `has_beta_access()`. An account made without an invite can sign in, but sees only the lock screen and can do nothing.
- **New tables:**
  - `app_settings` (public_launch): anyone can read it; only the founder can change it, through `set_public_launch`.
  - `beta_access(user_id)`.
  - `trip_invites` (token, trip_id, created_by, expires_at, used_by, used_at, cancelled_at): Captain reads their own trip's invites; changes go only through `create_trip_invite`, `cancel_trip_invite` and `redeem_trip_invite`.
  - `player_private` (user_id, dob, no_alcohol): owner-only. Captains get the age range only through `member_age_range`.
- **New trip columns:**
  - `trips.vibe` (family / chill / party; default chill, and new trips pick in setup)
  - `trips.join_code_enabled` (default true)
  - `trips.require_approval` (default true for new trips; false for existing trips, including Siam Vibes)
- **New member column:** `trip_members.status` (approved / pending, existing rows approved).
  - `is_trip_member` and the RLS helpers count only approved members, so pending members see nothing.
  - `trip_status_for_me` drives the waiting screen.
- **Rules enforced in the server's own checks:** `join_trip` refuses a disabled shared code and refuses teens without an invite; approval rules are enforced there too. `approve_member` and `decline_member` are Captain-only. `create_trip` and Captain hand-off need 18+.
- **Vibe and alternatives:** the existing 21+ switch and approval gates become vibe-aware. Spicy and drink content shows only when the vibe is Party, the player is 21+ and approved, and no-alcohol is off. Otherwise the existing alternative text is used. Chill hides drink cards from teens and no-alcohol players.
- **Search engines:** `public/robots.txt` set to Disallow everything, plus a robots meta tag in the root head.
- **Checks:**
  - Run every new rule on temporary trips that are rolled back afterwards.
  - Confirm Siam Vibes' 12 nights, Week 1, VRFQQM joining and its unlocked state are unchanged.
  - Load the lock screen signed out.
  - Confirm the build passes.
