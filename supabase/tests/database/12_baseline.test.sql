-- M1-09: what the baseline migration provides on a fresh project beyond the schema.
BEGIN;
\ir ../_helpers.psql
SELECT plan(4);
SELECT is((SELECT count(*)::int FROM storage.buckets
           WHERE id IN ('trip-photos', 'quest-proofs', 'player-avatars', 'culture-photos',
                        'inspiration-photos', 'window-guide', 'bug-screenshots')), 7,
          'the seven storage buckets exist');
SELECT is((SELECT count(*)::int FROM storage.buckets WHERE public), 0, 'no bucket is public');
SELECT ok((SELECT key ~ '^[0-9a-f]{64}$' FROM trip_private.cron_keys WHERE name = 'purge_photos'),
          'the photo-purge cron key is generated for this database');
SELECT is((SELECT count(*)::int FROM public.game_cards), 1930, 'seeded game cards are present');
SELECT * FROM finish();
ROLLBACK;
