# 09 — Engineering Conventions

## 1. Branching & releases
- `main` is always deployable to **staging**. Production deploys from **release tags** (`v1.2.0`).
- Short-lived feature branches: `m3/crew-check-queue`, `fix/bali-timezone`.
- Squash-merge PRs. Name PRs `M3-07: Crew Check queue + card (R-411, R-412)`.
- **No direct commits to `main`.** No Lovable commits after the M0 cut-over.

## 2. Database & migrations
- **Never edit an applied migration.** Always add a new one.
- **Name migrations by intent:** `20261102_points_ledger.sql`, not `<timestamp>_<uuid>.sql`.
- **One concern per migration.** Include `-- rollback:` notes in comments for anything risky.
- **Rule functions stay in `trip_private`.** Expose them through thin `public` wrappers, granted to `authenticated` only. Revoke from `PUBLIC` and `anon`. Keep the existing pattern (see `supabase/AGENTS.md`).
- **Every function that writes game state:**
  1. checks identity (`auth.uid()`) and role (`is_trip_member`, `is_leader`, `is_captain`, `is_app_admin`)
  2. checks the phase via `trip_phase()`
  3. validates against the room config
  4. writes to the ledger or log
  5. is **idempotent** (unique keys)
- **RLS on every table.** Default: no client `INSERT/UPDATE/DELETE` on game tables.
- **pgTAP test required** for any new or changed rule function.
- **Keep generated types fresh:** `supabase gen types …` runs in CI and fails the build if it differs from the committed types.
- **Time:** store `timestamptz`, compute in SQL with explicit zones, never assume the server zone. Dates without time (`start_date`) are **trip-local dates**.

## 3. Frontend
- **TypeScript strict.** **No new `as any` / `as unknown as`.** Remove existing ones in files you touch.
- **Components never import the Supabase client.** Use `src/data/*` hooks (TanStack Query) only.
- **Feature folders** (03 §4). A feature exports a small public API (`index.ts`); no deep imports across features.
- **Prettier with `printWidth: 100`.** Run `prettier --write .` once in M1 to unfold the generated very long lines (one dedicated PR, nothing else in it).
- **Strings in i18n catalogs** (`src/i18n/en.json`) from M1 on. No hard-coded user-facing copy in new code.
- **The client never decides rules.** It may *predict* (e.g. show a countdown), but the server decides. Comment such places with `// display-only; server: trip_private.xxx`.
- **Accessibility:** 44px minimum tap targets, labels on icon buttons, AA contrast, `prefers-reduced-motion` respected.
- **Images:** WebP/AVIF, sized for 2× at the display size. Founder art lives in the repo or your CDN (not Lovable's).

## 4. Pull request checklist
- [ ] Linked task ID (`M#-##`) and rule IDs (`R-###`)
- [ ] Tests added/updated (pgTAP for SQL, Vitest/Playwright for UI)
- [ ] Migration is additive or has a retire plan; RLS + grants reviewed
- [ ] No new type casts; lint + typecheck clean
- [ ] Screenshots at 390px for UI changes (light/dark if relevant)
- [ ] Copy in the i18n catalog; analytics events have no PII
- [ ] If a default from [06](06-open-questions.md) was used, it's noted in the PR description

## 5. Definition of Done (per task)
1. Meets the acceptance criteria in the milestone file.
2. Server enforces the rule; the client only displays.
3. Automated tests cover the happy path and at least the main edge cases listed in the task.
4. Works at 360/390/430 widths and as the installed web app (once M4 exists).
5. Deployed to staging and checked by QA with real test accounts (signed in!).
6. Docs updated: this pack, if a rule or decision changed.

## 6. Documentation
- `docs/decisions/NNN-title.md`: short architecture decision records (context → decision → consequences). Seed it from the old `AGENTS.md` files.
- This pack (`/docs/handover/`) is a living document. Update [02](02-game-rules-spec.md) **before** changing a rule.
