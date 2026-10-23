# Archived migrations

The 304 migrations from the Lovable build (Oct 1–22, 2026). Since M1-09 they are history only:
`supabase/migrations/00000000000000_baseline.sql` holds the schema, privileges, seeded rows and
platform objects they produce, and every environment starts from it (there was no production
database to carry over).

- Don't edit or add files here. New changes go in `supabase/migrations/` after the baseline.
- `scripts/db/inventory.py` still reads these files to show where each function was last defined.
- To rebuild the baseline from this history: `MIGRATIONS_DIR=supabase/migrations_archive
  REPLAY_HOOK='scripts/db/make-baseline.sh' scripts/db/replay-migrations.sh "$(mktemp -d)"`. Ids
  that the history generates at random (some seeded rows, the cron key) come out different each
  time; nothing depends on their values.
