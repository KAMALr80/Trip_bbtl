# Admin and founder guide

Founder tools appear under **Me** for accounts listed in `app_admins`. Every founder action is checked on the server with `trip_private.is_app_admin()`. Hiding the links from players (QA-12, QA-13) is only for tidiness: a player who opens a founder link sees their own Me page, and the server refuses the data anyway.

## Becoming an admin

There is no screen for this. Add the user's id to `public.app_admins` from the Supabase SQL editor of that environment. Remove the row to take it away.

## Where things are

| Tool | Path | What it does |
|---|---|---|
| Founder dashboard | Me (bottom) | Entry point to everything below |
| Test Lab | `/me?view=lab` | Sandbox trips with bots, time travel, role preview; sandbox-only (`lab_guard`) |
| Reports | `/me?view=reports` | Usage and AI cost (cost needs `AI_PRICE_IN` / `AI_PRICE_OUT` for accuracy) |
| Feedback | `/me?view=feedback` | End-of-trip feedback (`trip_feedback`, admins only) |
| Photo review | `/me?section=moderation` | AI-flagged and reported photos. Approve or remove; nothing is deleted automatically. |
| Users & trips | `/me?section=admin-directory` | Find users and trips; disable an account (logged in `admin_actions`, then an Auth ban) |
| Beta codes | `/me?section=beta-codes` | Make and track private-beta codes |
| AI guard | `/me?section=ai-guard` | Daily AI use against the global cap; pause AI |
| Content | `/me?section=content-admin` | Edit the content library |
| Welcome wording, Founding Members, Icon options | Their sections | Presentation and badges |

## Support procedures

- **Deleting an account for someone.** Ask them to use Me → Settings → Delete, which checks their password. If you delete the user from the Supabase dashboard instead:
  - the same database scrub runs (one transaction), but their photo files stay in Storage, because file removal happens in the app's delete flow;
  - if they were a Captain, their trip has no leader. Hand the Captaincy to someone first.
- **"I was declined."** The player sees a notice naming the trip until they dismiss it or ask to join again. They can ask again with the same code.
- **Legal records.** `account_consents`, `moderation_log`, `admin_actions`, `photo_moderation` and `teen_accounts` are kept when an account is deleted. Don't edit them by hand.
- **Role history.** Every role change is in `trip_role_changes`.

## What needs a founder decision

The list is kept in [`FINAL_PROJECT_COMPLETION_AUDIT.md`](FINAL_PROJECT_COMPLETION_AUDIT.md), section 4.
