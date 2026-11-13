# Production deployment guide

Nothing in this guide has been run against a hosted project yet. It is the order to follow once the owner has made the accounts. Deploying, pushing migrations to a hosted project and changing hosted settings each need the owner's explicit go-ahead.

Account setup, click by click: [`dev-docs/owner-go-live-steps.md`](../dev-docs/owner-go-live-steps.md). Variables: [`ENVIRONMENT_VARIABLES.md`](ENVIRONMENT_VARIABLES.md).

## 1. Before the first staging deploy

- [ ] Owner steps 1.1–1.5 done: Supabase staging project, Vercel account, optional AI key, VAPID keys.
- [ ] `main` contains the release and CI is green: Web, Database and Supabase local stack.
- [ ] Locally, all of these pass (see [`TESTING_GUIDE.md`](TESTING_GUIDE.md)):
  - `bun run typecheck`, `bun run lint`, `npx vitest run`
  - pgTAP on a fresh local stack
  - the mocked E2E suite twice, and the PWA suite
  - `bun run build`, then `bun scripts/security/check-bundle.ts`
- [ ] `scripts/deploy.sh staging check` lists every needed setting as present.

## 2. Deploy staging

1. **`scripts/deploy.sh staging db`** pushes every file in `supabase/migrations/` (`supabase db push`).
   - Migrations are forward-only. Never edit one that has been applied anywhere.
   - The new ones since the last deploy are listed in [`DATABASE_AND_MIGRATIONS.md`](DATABASE_AND_MIGRATIONS.md).
2. **`scripts/deploy.sh staging auth`** sets the site URL and redirect URLs, plus Google and SMTP when their settings are present.
3. **`scripts/deploy.sh staging web`**:
   - builds with the staging URL and key, with the service worker on, and checks the bundle
   - makes the Vercel project `tripjunkies-staging` on the first run, and sets its server secrets
   - deploys it (`vercel deploy --prebuilt --prod`)
   - points the photo-purge and reminder cron jobs at it
4. Smoke check. `GET https://<staging>/api/public/version` should answer with the commit. Then work through the staging readiness checklist in owner-go-live-steps section 8.

## 3. Verify on staging (cannot be done locally)

| Check | How |
|---|---|
| Sign-up email arrives; the 6-digit code works; consent and birthday are asked once (N-4) | A new email account |
| Google sign-in | A Google account; redirect URL on the allow-list |
| RLS and grants match local | Run `supabase/tests/database/30_security.test.sql` and `43_least_privilege.test.sql` against staging (read-only checks) |
| Storage policies | Upload a proof, open it from another member, try from a non-member |
| Push reminders | One iPhone (installed to Home Screen) and one Android phone; the M4-10 checklist |
| Email backup | Only if `EMAIL_API_KEY` is set |
| Real AI proof check | One real photo per quest kind; check verdicts and that errors give "unsure" |
| Account deletion | Delete a test account; check its files are gone in Storage |
| Cron | Photo purge and notifications run; check `photo_purge_log` and the notification queue |
| CSP | Watch report-only violations for a few days, then enforce it (B-28) |

## 4. Production

1. Supabase production project on the Pro plan with daily backups / PITR (owner step 5).
2. Run the same three steps with `production`.
3. Before inviting anyone, restore a backup into a scratch project once, to prove backups restore.

## 5. Rollback

- **Web.** Vercel dashboard → the project → Deployments → the previous one → **Instant Rollback** (or `npx vercel rollback`). The static files and the server function are one deployment, so this rolls back both. The next `scripts/deploy.sh` run deploys forward again.
- **Service worker.** Deploying with `VITE_SERVICE_WORKER=false` ships a self-removing `sw.js` (the kill switch) if a bad worker is cached on phones.
- **Database.** Migrations are not reversed automatically. Write a new forward migration that undoes the change. For data loss, restore from PITR into a new project and copy back what is needed. Never run `supabase db reset` against a hosted project.
- **Secrets.** Rotate `CRON_SECRET` using `CRON_SECRET_PREVIOUS`. Rotating the service role key needs a Vercel environment variable update and a redeploy (`scripts/deploy.sh <env> web`) in the same window.

## 6. Monitoring

- **Browser errors:** Sentry when `VITE_SENTRY_DSN` is set; otherwise only the console.
- **Server logs:** Vercel dashboard → the project → Logs (or `npx vercel logs <deployment-url>`).
- **Database:**
  - Supabase logs and advisors (performance and security) after each migration push.
  - Rate limiting is per-feature in the database (AI quotas, code attempts); there is no global API rate limit beyond Supabase's own.
