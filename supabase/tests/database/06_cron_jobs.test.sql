-- M0-10: scheduled jobs are authenticated and point at the environment's own app, not Lovable.
BEGIN;
\ir ../_helpers.psql
SELECT plan(5);

SELECT is((SELECT string_agg(jobname, ',' ORDER BY jobname) FROM cron.job),
          'expire-proofs,live-and-crowns,purge-expired-trip-photos,settle-drops',
          'the scheduled jobs (the old crown-due-seasons retired with M3-16)');
SELECT ok((SELECT command NOT ILIKE '%lovable%' FROM cron.job WHERE jobname = 'purge-expired-trip-photos'),
          'the photo purge no longer calls a Lovable-hosted URL');
SELECT ok((SELECT command LIKE '%Authorization%' AND command LIKE '%cron_keys%' FROM cron.job WHERE jobname = 'purge-expired-trip-photos'),
          'the photo purge sends the DB-held cron key as a bearer token');
SELECT ok((SELECT length(key) >= 32 FROM trip_private.cron_keys WHERE name = 'purge_photos'),
          'the purge key exists and is long enough for check_cron_key');

SELECT tests.authenticate_as(tests.create_user('p1', 30));
SELECT throws_ok($$SELECT * FROM trip_private.cron_endpoints$$, '42501', NULL, 'players cannot read cron endpoints');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
