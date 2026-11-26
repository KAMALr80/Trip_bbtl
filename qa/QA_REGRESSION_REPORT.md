# QA regression report

Branch `fix/qa-audit`, 2026-11-26, Windows 11 + Docker. Every suite the CI runs was run after the last fix. Logs are in [evidence/logs](evidence/logs).

| Suite | Command | Result | Log |
|---|---|---|---|
| Types | `bun run typecheck` | Clean | `typecheck-retest.log` |
| Lint (CI step) | `npx eslint . --quiet` | Exit 0 | `eslint-retest.log` |
| Unit | `bun run test` (Vitest) | **346 / 346** (46 files) | `vitest-retest.log` |
| Database | `scripts/db/test.sh` in `postgres:16-bookworm` | **50 / 50 files** | `db-tests-retest.log` |
| Snapshot + inventory | `replay-migrations.sh` + `inventory.py` (Postgres 16) | Regenerated; no further drift | — |
| Build | `bun run build` | OK | `build-retest.log` |
| Bundle secrets | `bun scripts/security/check-bundle.ts` | No server secrets | `bundle-secrets-retest.log` |
| Mocked E2E | `npx playwright test` | **127 / 127** | `e2e-mocked-retest.log` |
| PWA E2E (service worker, offline, outbox) | `npx playwright test -c playwright.pwa.config.ts` | **18 / 18** | `e2e-pwa-retest.log` |
| Generated types | `scripts/db/gen-types.sh` | **Not run**: needs the Supabase CLI against the replayed DB. CI runs it | — |
| Real-stack E2E | `playwright.live.config.ts` | **Not run**: needs `supabase start` | — |
| Live staging, two accounts | Manual | **BLOCKED**: no passwords configured; staging runs older code | [QA_MULTIPLAYER_RETEST.md](QA_MULTIPLAYER_RETEST.md) |

## Compared with the audit run (`d8c9a2e`)

| | Audit | Now |
|---|---|---|
| Unit tests | 343 | 346 (+3 for QA-B01) |
| DB files | 47 / 48 | 50 / 50 (+2 new: 49, 50) |
| Mocked E2E | 125 | 127 (+2: sign-in contacts, guest games) |
| PWA E2E | 18 | 18 |

No test was deleted or loosened. The one test change to an existing file (47) moved the call to the function players actually reach; no grant was widened.

## Flaky test seen earlier

`e2e/pwa/outbox.spec.ts` "an answer given offline waits, survives a restart…" failed once during batch 5 and passed on every rerun (2/2 repeat, then 18/18). It passed here too. Worth watching in CI; it depends on the service worker taking control in time.
