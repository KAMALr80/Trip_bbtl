# Known limitations

What the app does not do yet, or does only partly. Each item says why and what would change it.

## Not verified outside local stacks

None of these has been tested yet; they need a staging environment and devices:
- hosted Supabase (auth URLs, storage policies, cron, email templates)
- Cloudflare Workers runtime under real traffic
- real AI model verdicts
- Google sign-in
- sign-up email delivery
- web push on iPhone and Android
- email reminder backup
- load

See [`PRODUCTION_DEPLOYMENT_GUIDE.md`](PRODUCTION_DEPLOYMENT_GUIDE.md), section 3.

## Product behavior

- **Live standings.** Live boards list current members only. A player who leaves or deletes their account keeps their crowns, which read "Former player", but drops off the live board. Points stay in the ledger.
- **Postcards.** Wrap-up answers already on a locked postcard stay there without a name after the writer deletes their account. Their photos are removed.
- **Notifications.** There is no push for a declined join request. The player sees an in-app notice on the private-beta screen and on Home.
- **Search.** There is no destination search; the Home button opens Explore (QA-14).
- **Trip costs.** The pot and payment functions are dormant.
- **Map.** Behind `VITE_FEATURE_MAP`, off.
- **First paint.** System fonts show for a moment until the web fonts load (they no longer block the app).

## Waiting on the founder, legal or assets

- **QA-06:** age wording on the sign-up form and in the Terms.
- **QA-07:** the "Unlock / $5.99" flow, shown though nothing is locked.
- **QA-10:** 13 images still hosted on Lovable (founder photos, state flags), so they 404.
- **QA-20 (part):** a per-trip AI cap; only the global cap of 150 a day exists.
- **Retention:** what happens to operational tables when an account is deleted.
- **Privacy Policy:** the text doesn't yet describe the retention rules now in the code (shared points and crowns kept as "Former player", legal records kept).
- **CSP:** the full policy is report-only until staging shows no violations.

## Engineering

- **ESLint:** 100 warnings remain, tracked in `eslint-suppressions.json`.
- **Dependency advisories:** 35 dev-only, no production exposure found (B-01).
- **Captain deleted from the dashboard:** the trip is left without a leader. The app's own delete flow prevents this.
- **Storage cleanup:** it can't be in the database transaction. It runs first and stops on failure, so retrying is safe.
- **Mocked E2E:** each cold page is about 516 dev-server requests, so it is slow on a busy machine. The known blocking cause (fonts) is fixed.
