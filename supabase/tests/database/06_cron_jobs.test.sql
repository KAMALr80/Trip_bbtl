-- M0-10: scheduled jobs are authenticated and point at the environment's own app, not Lovable.
BEGIN;
\ir ../_helpers.psql
SELECT plan(7);

SELECT is((SELECT string_agg(jobname, ',' ORDER BY jobname) FROM cron.job),
          'expire-proofs,live-and-crowns,prune-notifications,purge-expired-trip-photos,send-notifications,settle-drops',
          'the scheduled jobs (the old crown-due-seasons retired with M3-16; reminders added in M4-08)');
SELECT ok((SELECT command LIKE '%Authorization%' AND command LIKE '%cron_keys%' AND command LIKE '%''notify''%'
           FROM cron.job WHERE jobname = 'send-notifications'),
          'the reminder sender is called with its own DB-held cron key');
SELECT ok((SELECT length(key) >= 32 FROM trip_private.cron_keys WHERE name = 'notify'),
          'the sender key exists and is long enough for check_cron_key');
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
