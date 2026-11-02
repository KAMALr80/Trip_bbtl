# M6 security review (M6-07) and photo-privacy audit (M6-04)

**Date:** Nov 2, 2026 (code review on the repository; staging doesn't exist yet, so nothing here was
checked against a live project). Kept as automated checks where possible, so it can't silently regress.

## How it's checked from now on

| Check | Where |
|---|---|
| RLS on for every public table | `supabase/tests/database/30_security.test.sql` |
| Every `SECURITY DEFINER` function sets `search_path` | `30_security` |
| Signed-out visitors (`anon`) can't write any table, read only `app_settings` (launch switch, welcome copy) and `price_rules`, and run only `public_launch`, `welcome_copy`, `price_list` | `30_security` |
| Every Storage bucket private, images only, ≤ 5 MB | `30_security` |
| Game tables refuse direct client writes; non-members read nothing | `05_delete_and_rls`, and each feature's test |
| No server secret or server-only module in the browser bundle | `scripts/security/check-bundle.ts`, run in CI after the build |
| Age rules (age × action matrix) | `02_age_gates` (M6-03) |

## Findings and what was done

| # | Area | Finding | Status |
|---|---|---|---|
| S1 | Grants | Supabase's default grants left `anon` with table privileges on ~117 tables and EXECUTE on public functions (including write RPCs such as `create_trip`, `manage_trip_member`). RLS and the functions' own `auth.uid()` checks blocked misuse, so nothing was exposed, but RLS was the only wall. | **Fixed** (`20261104110000_m6_least_privilege.sql`): `anon` keeps only what the signed-out screens use; default privileges no longer grant `anon` anything new. |
| S2 | Definer functions | All `SECURITY DEFINER` functions in `public` and `trip_private` pin `search_path`; the new-engine ones also check identity and role and are granted to `authenticated` / `service_role` only. | OK, now tested. |
| S3 | Server functions | All 20 TanStack server functions that act for a player use `requireSupabaseAuth`; inputs that need validating use zod. The public guide page (`loadPublicGuide`) is unauthenticated by design and validates its token. Cron routes check the platform secret or a DB-held key. | OK. |
| S4 | Secrets | No server secret names, service-role JWTs or server-only modules in `.output/public`. | OK, now checked in CI. |
| S5 | Rate limits | Join codes and invites (`code_attempts`), AI (`ai_gate` daily caps + kill switch), photo uploads to the older photo wall (15 a day). New-engine proof uploads are limited by the open schedule item (one path per item and part) rather than a count. | OK for beta; revisit with the M6-08 load test. |
| S6 | Dependencies | `bun audit`: 59 advisories, mostly in build / dev tooling (wrangler, miniflare, undici, ws, minimatch, sharp). `bun audit fix` cleared 24 within existing ranges (vite 8.1.6, wrangler 4.59.1). | **Partly fixed.** Left: zod < 4.6.6 (needs the zod 3 → 4 upgrade; our inputs are small, so low risk) and transitive dev-tool packages. Ticket: upgrade zod and re-run `bun audit` before launch. |
| S7 | Pen test | Optional external test before public launch. | Owner decision. |
| P1 | Buckets | All 7 buckets are private; reads go through Storage policies (crew, owner, leaders, admins) and signed links. | OK. |
| P2 | Buckets | Buckets accepted any file type and size. | **Fixed** (`20261104120000_m6_bucket_limits.sql`): images only (JPEG, PNG, WebP), 5 MB max. |
| P3 | Signed links | Links last 1 hour (Crew Check 10 minutes, a single proof 5 minutes). They are minted per viewer after the policy check; a link that is shared outside still works until it expires. | Accepted for beta. Shorter links would need re-signing while a screen stays open. |
| P4 | Minors | New-engine proof photos in a trip with minors are visible to the uploader, the leaders and the approver only (`proof_photo_ok`, also used by the wrap-up board and the postcard). Older photo-wall photos (`trip-photos`, archived trips only) are visible to all members. Photo avatars are visible to anyone who shares a trip. | OK for the new engine. **For the legal review:** whether teen avatars should be leader-only too. |
| P5 | EXIF | Every upload path re-encodes through a canvas (`compressImage`), which drops EXIF including GPS: proofs, avatars, culture, inspiration, Window Seat guide and bug screenshots. Tested for proofs in `e2e/pwa/outbox.spec.ts`. | OK. |
| P6 | Retention | After the Day 7 lock every trip photo except the postcard's is deleted (M5-05). The 12-month backstop only covered `trip-photos`. | **Fixed**: the backstop now also clears `quest-proofs` for trips that never lock, and never touches a locked trip (its postcard photos are kept). |
| P7 | Account deletion | Deleting an account removed avatars, bug screenshots and older photo-wall photos, but not new-engine proof photos or Window Seat guide photos. | **Fixed** in `deleteMyAccount`. Postcard photos of a deleted player go with the account; the postcard shows a blank. Older culture-room photos (`culture-photos`, keyed by experience) are still left; they belong to archived rooms. Ticket. |
| P8 | Re-planning | Moving a trip's dates re-plans the schedule; items that no longer fit are deleted and their proofs (and points) cascade with them. Found by a flaky test. | **Ticket** (product decision): once a trip has started, either lock the dates or move proofs to the new item instead of deleting. Today the setup wizard only lets the Captain change dates before the trip, which limits the risk. |
| P9 | Moderation | Photos weren't checked for safety on upload. | M6-02 (flags hide a photo from others until reviewed). |

## Still to do outside the code

- Run `30_security` and the bundle check against staging once it exists (`supabase test db` in CI already runs the pgTAP files under real Supabase).
- Lawyer review of teen avatars (P4) and the Privacy Policy wording for photo deletion and AI checks (M6-09).
