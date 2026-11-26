# QA security audit

Scope: PDF page 3 (back end) and prompt section 3 "Page 3" plus Journey H. Method: schema-snapshot analysis, source review, and the pgTAP suite on a throwaway Postgres 16. **No requests were sent to staging or production**, and no secrets appear in this report.

## Result summary

| Area | Result | Evidence |
|---|---|---|
| RLS enabled on every `public` table | **Verified: 161 / 161** | Scan of `supabase/baseline/current_schema.sql` (`CREATE TABLE public.*` compared with `ENABLE ROW LEVEL SECURITY`) |
| Direct writes denied; privileged changes only through identity-checked functions | **Verified by DB tests** | `05_delete_and_rls` (24), `36_authorization` (25), `30_security` (7), `43_least_privilege` (8), all pass |
| Another user's trip / data (Journey H) | **Verified by DB tests** | `01_membership` (32), `36_authorization` attack matrix, `40_privacy_and_join_names` (33) |
| Sealed quest content withheld server-side | **Verified by DB tests** | `04_sealed_quests` (27) |
| Secret award votes / trivia answers hidden until reveal | **Verified by DB tests** | `22_live_and_crowns` (27), `23_reveal_and_drops` (20) |
| Admin functions server-gated | **Verified by DB tests** | `33_admin`: a player gets "Admins only"; `set_price_rule` checks `is_app_admin` |
| Age gates server-side | **Verified by DB tests** | `02_age_gates` (24) |
| Archived trips read-only | **Verified by DB tests** | `08_archive_mode` (23) |
| Account deletion scrub / retention | **Verified by DB tests** | `41_account_deletion_retention` (49) |
| Disabled account cut off | **Verified by DB tests** | `44_qa_moderation_and_disabled` (14) |
| XSS sinks | **No user-data sink found** | Only 2 `dangerouslySetInnerHTML`, both static (`routes/__root.tsx:228` theme script; `components/ui/chart.tsx:73` chart CSS from config). React escapes everything else |
| SQL injection | **Low risk by design** | All DB access goes through PostgREST / typed RPC parameters; functions use parameters, not string-built SQL |
| Server secrets in client bundle | See [QA_API_TEST_REPORT.md](QA_API_TEST_REPORT.md) | `scripts/security/check-bundle.ts` on this session's build |
| Sign-out clears session and cache | Code-verified | B-19 (query cache cleared), B-21 (push stops) |
| Live probes against staging (anon key, cross-user IDs, expired JWT) | **BLOCKED** | No staging credentials; probes on production must not be run |

## SECURITY DEFINER functions in `public`

AGENTS.md says privileged logic lives in `trip_private` behind invoker wrappers. Twelve `public` functions are `SECURITY DEFINER`. Each was read:

| Function | Executable by | Guard |
|---|---|---|
| `ai_gate_server`, `ai_reserve_server`, `check_cron_key`, `guard_player_profile` | `service_role` only | Not browser-callable |
| `set_price_rule` | authenticated | `trip_private.is_app_admin()` or raise |
| `seat_status` | authenticated | Returns rows only for approved members (`auth.uid()`) |
| `unlock_extra_seats` | authenticated | `is_captain`, beta flag (see **QA-B02**: no effect) |
| `guide_publish`, `guide_review` | authenticated | `is_leader` + Window Seat room |
| `guide_propose`, `write_journal`, `create_culture_play_mode` | authenticated | Identity / membership checks in the body |

**Finding (LOW, convention):** these break the "private function + invoker wrapper" rule but are guarded. No exploit found. Recommendation: move them into `trip_private` over time so the rule holds everywhere.

**Note:** `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO authenticated` (`current_schema.sql:37378`) means every *new* `public` function is callable by signed-in users unless its migration revokes it. `43_least_privilege` covers tables, not functions. Recommendation: add a pgTAP check that lists `public` SECURITY DEFINER functions granted to `authenticated` against an allowlist.

## Open items (need staging)

1. Confirm the hosted project matches the migrations (dashboard edits aren't in the snapshot; see `replay-migrations.sh` header).
2. Run the anon-key and cross-user probes from Journey H against **staging** with two disposable accounts.
3. Expired-JWT behaviour and refresh-token revocation after sign-out.
4. The 9 console errors from the PDF (2×401, 4×404, 3×400): match them in the Vercel and Supabase logs. 404s are likely the 13 images still on Lovable (QA-10).
5. CSP is still report-only (`KNOWN_LIMITATIONS.md`).
