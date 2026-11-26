# QA security retest

Method: pgTAP on a throwaway Postgres 16 (Docker), source review, bundle scan. **No requests were sent to staging or production.** No secrets appear in this report or in the logs.

## Results

| Area | Audit result | Retest | Evidence |
|---|---|---|---|
| RLS on every public table | 161/161 | Unchanged (no table added) | Schema snapshot |
| Direct writes denied; identity-checked functions | Covered | Pass | `05_delete_and_rls`, `36_authorization`, `30_security`, `43_least_privilege` |
| Cross-user data (Journey H) | Covered | Pass | `01_membership`, `36_authorization`, `40_privacy_and_join_names` |
| Sealed content, secret votes, trivia answers | Covered | Pass | `04_sealed_quests`, `22_live_and_crowns`, `23_reveal_and_drops` |
| Admin server gate | Covered | Pass | `33_admin` |
| Age gates | Covered | Pass | `02_age_gates` |
| Public SECURITY DEFINER functions | 12 read by hand; no test | **New test** pins the 7 open to signed-in users; anonymous can run none | `50_definer_allowlist` |
| Grants not widened to fix tests | — | QA-B07 fixed in the test; `public.junkie_rank` stays `service_role` only | `47_passport_junkie_badge` |
| Paid add-on with no effect | — | `unlock_extra_seats` refuses; no order rows (QA-B02) | `49_extra_seats_retired` |
| Server secrets in the client bundle | Pass | Pass | [evidence/logs/bundle-secrets-retest.log](evidence/logs/bundle-secrets-retest.log) |
| XSS sinks | 2 static | Unchanged | Source review |

## Corrections to the audit

- `write_journal` is **not** a public SECURITY DEFINER function. The live list is: `create_culture_play_mode`, `guide_propose`, `guide_publish`, `guide_review`, `seat_status`, `set_price_rule`, `unlock_extra_seats`.

## Still open (need staging)

1. Anon-key and cross-user probes against staging with two disposable accounts.
2. Expired-JWT handling and refresh-token revocation after sign-out.
3. Match the PDF's 9 console errors in the Vercel and Supabase logs.
4. CSP is still report-only (`docs/KNOWN_LIMITATIONS.md`).
5. Hosted database matches the migrations (no dashboard edits).
