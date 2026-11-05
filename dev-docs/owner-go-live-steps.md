# Owner steps to go live

Everything here needs your accounts, money, legal sign-off or a decision. The code work is in the
milestones (M5–M6). Do the steps in order; the ones marked **now** unblock the first staging deploy.

When a step gives you a key or password, don't paste it into a chat. Add it in the cloud
environment's settings (session title bar → environment menu → **Edit** → **Network secrets**, or
environment variables) under the name shown, then start a new session.

---

## Your to-do list (updated Nov 2, 2026)

Tick these off in order. Everything else in the milestones is code work. Details are in the
numbered sections below.

**Now: unblocks staging and the M4 phone checks**
- [x] Review and merge [PR #6](https://github.com/jay-brainbean/trip/pull/6) (no native apps; M4
      install, offline, reminders). Merged as `960f35f`; the offline browser tests
      (`playwright.pwa.config.ts`) pass locally and in CI (Nov 5, 2026).
- [ ] Turn on branch protection for `main` and make CI required (GitHub → Settings → Branches).
      Partly done (Nov 5, 2026): a ruleset stops `main` being deleted or force-pushed. Still to do:
      require the three CI jobs (Web, Database, Supabase local stack) before a merge. Click-by-click
      steps: B-02 in [`docs/audit/BUG_REGISTER.md`](../docs/audit/BUG_REGISTER.md).
- [ ] Create the staging accounts: Supabase (1.1), Cloudflare (1.2); AI key optional (1.3).
- [ ] Make the web push keys: `bun scripts/pwa/vapid-keys.ts`, then add `VAPID_PUBLIC_KEY` and
      `VAPID_PRIVATE_KEY` as secrets (6.1). Do it once; never change them.
- [ ] Say "deploy staging" in a new session.
- [ ] Get one iPhone and one Android phone and run the M4-10 checklist
      (`milestones/M4-web-offline-notifications.md`, end of the file). Report anything that fails.

**Before inviting anyone**
- [ ] Domain on Cloudflare (2.1), Google sign-in (2.2), email sender for sign-in codes (2.3).
- [ ] Optional: Sentry for errors (2.4), Resend key for reminder emails (6.2).
- [ ] Rescue the 13 images from Lovable on your own computer (3).
- [ ] Install material: a 1024×1024 master app icon and 3–5 phone screenshots (6.3).

**Decisions (write `**Answer:** …` in `06-open-questions.md`; the defaults apply if you don't)**
- [x] For M5: Q11, Q13, Q23, Q28 take the defaults (Nov 2, 2026).
- [ ] Privacy Policy wording for deleting trip photos after Baggage Claim Day 7 (Q11, M5-05): the
      app already does it; the policy text in `/legal/privacy` should say so before launch.
- [x] For M6: Q12 (teen rules) and Q24 (admin area) take the defaults (Nov 2, 2026). Still open:
      Q17 (sign-in methods; default email code + Google). Later: Q18 (payments).
- [ ] Legal text (M6-09): the Terms and Privacy Policy still describe 13+ self sign-up. The app now
      allows 18+ self sign-up and teens only through a Captain's teen invite; the text should also
      cover deleting photos after Day 7, AI photo checks and moderation. Lawyer review, then the
      developer bumps the legal version so everyone re-accepts.
- [ ] Decide on an external pen test before public launch (M6-07, optional).
- [ ] Review and tag the content library: `supabase/seed/content_candidates.csv` (2,938 lines). Most
      kinds are below the launch target of 30 items per mode.

**When staging looks right**
- [ ] Production Supabase on the Pro plan with backups, then "deploy production" (5).
- [ ] Legal review, data-protection basics, a beta with 3–5 real crews, then launch (7).

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

### 1.5 Web push keys
Make them before the first deploy so reminders work on staging: see 6.1.

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
- **M3 (core game):** answered Oct 30 (defaults).
- **M4 (web app):** Q17 sign-in methods (default: email code + Google; Apple optional now). Q16 is
  answered: no native apps.
- **M5 (memories):** answered Nov 2 (defaults: Q11, Q13, Q23, Q28).
- **M6 (launch):** answered Nov 2 (defaults: Q12, Q24).
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

## 6. Notifications and install (M4, web app)
There are no App Store or Google Play apps (Q16, Oct 31, 2026), so no Apple Developer or Play Console
accounts are needed.
1. **Web push keys**: run `bun scripts/pwa/vapid-keys.ts` once per environment and add the two lines
   as secrets `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`. No outside account needed. Don't change them
   later: every phone would have to turn reminders on again.
2. **Email reminders (optional backup)**: a Resend account (resend.com) on the same domain as 2.3;
   add `EMAIL_API_KEY` and `EMAIL_FROM` (e.g. `TripJunkies <reminders@tripjunkies.app>`).
3. **Install material**: a 1024×1024 master app icon (BRAND.md notes it's missing) and 3–5 phone
   screenshots for the browser's install sheet.
4. **Test phones**: one iPhone and one Android phone the team can install the app on (M4-10).

---

## 7. Legal and launch (M6)
1. Lawyer review of Terms, Privacy Policy, teen/guardian consent, photo deletion and AI use
   (`/legal/*` pages; the developer updates the text).
2. Data-protection basics: decide data retention, name a privacy contact, sign Supabase's and the
   email provider's data processing agreements.
3. Beta round: 3–5 real crews play a full trip on staging; collect bugs in the in-app bug inbox.
4. Launch: switch `app_settings.public_launch` on (Founder dashboard), announce.

---

## 8. Staging readiness checklist (check after "deploy staging")

These are checks, not new steps: sections 1–6 say how to do each one. Never copy production users or
their photos into staging; use test accounts only.

- [ ] **Supabase project** `tripjunkies-staging` exists (1.1). The Free plan has no backups, so
      treat staging data as disposable. Production gets Pro with daily backups / PITR (5).
- [ ] **Database:** `deploy staging db` pushed every file in `supabase/migrations/`. The project's
      migration list matches the repo. The cron jobs exist (for example `expire-proofs`, every
      5 minutes), and the photo-purge job points at the Worker (`trip_private.cron_endpoints`).
- [ ] **Security on staging:** run `30_security` and the bundle check against staging (beta report).
- [ ] **Worker:** `tripjunkies-staging` is deployed, and `/api/public/version` answers on its
      `workers.dev` URL. Server secrets were set by `deploy.sh` (`wrangler secret bulk`).
      Workers logs are on (`observability` in `wrangler.jsonc`).
- [ ] **Domain and DNS** (2.1): `staging.tripjunkies.app` route in `wrangler.jsonc`, and
      `STAGING_APP_URL` set.
- [ ] **Auth URLs:** the site URL is `STAGING_APP_URL`, and the redirect allow-list includes
      `STAGING_APP_URL/**` (`deploy.sh` auth step). Re-run the auth step after the domain changes.
- [ ] **Email** (2.3): the sender is verified, with SPF, DKIM and DMARC records in Cloudflare DNS.
      Sign-up sends a 6-digit **code**: `deploy staging auth` now installs the repo's template
      (`supabase/templates/confirmation.html`, B-17); check that the email has it. Password
      reset arrives and returns to the app. Supabase's email rate limit is raised for the beta.
- [ ] **Google** (2.2): the consent screen is published; the redirect URI is
      `https://<staging ref>.supabase.co/auth/v1/callback`; Google sign-in works on a phone.
- [ ] **Push** (6.1): `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are set once, and a test push
      arrives (M4-10 step 3).
- [ ] **Errors** (2.4): `VITE_SENTRY_DSN` is set and a test error shows in Sentry. The Worker
      has no Sentry yet (M0-12); use the Workers logs.
- [ ] **AI** (1.3, optional): `AI_API_KEY`, `AI_MODEL` and a monthly spend limit. Fix B-16
      (low-detail images) before turning AI checks on.
- [ ] **Monitoring:** someone checks the Workers logs and the Supabase logs daily during the beta,
      and an uptime check watches `/api/public/version`.
- [ ] **Recovery:** staging can be rebuilt from the migrations. For production, do one test
      restore from a backup before launch.

---

## 9. Later (Phase 2)
Payments (Stripe on the web; needs Q18),
Event Groups (13–24), world map, Spanish, flight tracking.
