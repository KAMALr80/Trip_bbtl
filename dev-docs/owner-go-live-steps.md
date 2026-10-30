# Owner steps to go live

Everything here needs your accounts, money, legal sign-off or a decision. The code work is in the
milestones (M3–M6). Do the steps in order; the ones marked **now** unblock the first staging deploy.

When a step gives you a key or password, don't paste it into a chat. Add it in the cloud
environment's settings (session title bar → environment menu → **Edit** → **Network secrets**, or
environment variables) under the name shown, then start a new session.

---

## 1. Staging environment (now)

### 1.1 Supabase (database, sign-in, photos)
1. Sign up at **supabase.com** with the company email, and create an organization ("TripJunkies").
2. **New project** → name `tripjunkies-staging`, a strong database password (save it in a password
   manager), the region closest to most players (e.g. US East), Free plan is fine for staging.
3. Wait until the project is ready, then note:
   - **Project ref**: the id in the project URL, `https://<ref>.supabase.co` → secret `SUPABASE_STAGING_REF`
   - **Database password** from step 2 → secret `SUPABASE_STAGING_DB_PASSWORD`
4. Account menu (top right) → **Access Tokens** → **Generate new token** ("claude deploy") →
   secret `SUPABASE_ACCESS_TOKEN`.

### 1.2 Cloudflare (hosting)
1. Sign up at **dash.cloudflare.com**.
2. **Workers & Pages** → note the **Account ID** on the right → secret `CLOUDFLARE_ACCOUNT_ID`.
3. Profile → **API Tokens** → **Create Token** → template **Edit Cloudflare Workers** → all accounts
   is fine → create → secret `CLOUDFLARE_API_TOKEN`.

### 1.3 AI provider (optional for the first deploy)
1. Create an API key with OpenAI (or another OpenAI-compatible provider) → secret `AI_API_KEY`.
2. Pick the model and add it as `AI_MODEL` (e.g. the provider's current GPT model id).
3. Set a monthly spend limit in the provider's billing page.

### 1.4 Network access for the cloud session
If deploys are refused, allow these hosts in the environment's network settings:
`api.supabase.com`, `*.supabase.co`, `api.cloudflare.com`.

**Then:** start a new session and say "deploy staging". Claude runs `scripts/deploy.sh staging`.

---

## 2. Sign-in and email (before inviting anyone)

### 2.1 Domain
1. Confirm you own `tripjunkies.app` (or pick the domain). Buy it if needed.
2. Move its DNS to Cloudflare: **Add a site** → follow the nameserver change at your registrar.
3. Tell Claude the domain; it adds the routes in `wrangler.jsonc` and sets `STAGING_APP_URL` /
   `PROD_APP_URL` (e.g. `https://staging.tripjunkies.app`, `https://tripjunkies.app`).

### 2.2 Google sign-in
1. **console.cloud.google.com** → new project "TripJunkies".
2. **APIs & Services → OAuth consent screen**: External, app name, support email, logo, privacy
   policy and terms URLs (`https://<domain>/legal/privacy`, `/legal/terms`). Publish it.
3. **Credentials → Create credentials → OAuth client ID** → Web application →
   Authorized redirect URI: `https://<staging ref>.supabase.co/auth/v1/callback`
   (add the production ref later).
4. Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

### 2.3 Email sender (sign-up codes, password resets)
1. Sign up with **Resend** (or Postmark / Amazon SES).
2. Add your domain and create the DNS records it shows (in Cloudflare DNS). Wait for "verified".
3. Create SMTP credentials. Secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_SENDER_EMAIL` (e.g. `hello@tripjunkies.app`).

### 2.4 Error reporting (optional)
**sentry.io** → new React project → copy the DSN → secret `VITE_SENTRY_DSN`.

---

## 3. Missing images
13 app images only exist on Lovable's servers. On your own computer (not the cloud session), in a
copy of the repo: run `scripts/rescue-lovable-assets.sh`, then commit the downloaded files (or send
them to the developer).

---

## 4. Founder decisions
Open `dev-docs/06-open-questions.md` and write `**Answer:** …` under each question still open.
Defaults are used if you don't. The ones needed next:
- **M3 (core game):** Q3 AI checks vs Crew Check, Q4 exact points, Q5 solo crown goal, Q7 tie-breaks,
  Q9 Daily Discovery content, Q10 no crowning night set, Q13 Window Seat stamps, Q22 question days,
  Q25 trip quest points, Q27 Surprise Drop timing.
- **M5 (memories):** Q11 photo deletion after Day 7, Q23 world map / badges in Phase 1, Q28 hide trip/photo.
- **M6 (launch):** Q12 teen rules, Q24 admin area.
- **Later:** Q18 payments.

Also: review and tag `supabase/seed/content_candidates.csv` (2,938 content lines for the game).

---

## 5. Production environment (when staging looks right)
1. Supabase: second project `tripjunkies` on the **Pro plan**, turn on **daily backups / PITR**.
   Secrets: `SUPABASE_PROD_REF`, `SUPABASE_PROD_DB_PASSWORD`.
2. Add the production callback URL to the Google OAuth client
   (`https://<prod ref>.supabase.co/auth/v1/callback`).
3. Say "deploy production".

---

## 6. App stores (M4, native app)
1. **Apple Developer Program** (developer.apple.com, $99/year), enrolled as an organization (needs a
   D-U-N-S number; this can take 1–2 weeks, so start early).
2. **Google Play Console** (play.google.com/console, $25 once), organization account, identity check.
3. **Sign in with Apple**: in the Apple developer account, create a Services ID and key; give them
   to the developer (needed because the app offers Google sign-in).
4. **Push notifications**: Firebase project (console.firebase.google.com) for Android, and an APNs
   key from the Apple account for iOS.
5. Store listing material: app name, short and long description, 6–8 screenshots per platform,
   app icon, privacy policy URL, support email, age rating answers.

---

## 7. Legal and launch (M6)
1. Lawyer review of Terms, Privacy Policy, teen/guardian consent, photo deletion and AI use
   (`/legal/*` pages; the developer updates the text).
2. Data-protection basics: decide data retention, name a privacy contact, sign Supabase's and the
   email provider's data processing agreements.
3. Beta round: 3–5 real crews play a full trip on staging; collect bugs in the in-app bug inbox.
4. Store submission (review takes days; Apple often asks questions about sign-in, age and photos).
5. Launch: switch `app_settings.public_launch` on (Founder dashboard), announce.

---

## 8. Later (Phase 2)
Payments (Stripe on the web, App Store / Play billing in the apps; needs Q18 and a policy review),
Event Groups (13–24), world map, Spanish, flight tracking.
