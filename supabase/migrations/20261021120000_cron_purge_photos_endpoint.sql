-- M0-10: point the photo-purge cron job at each environment's own app and authenticate it.
-- Before: the job posted to the Lovable-hosted URL with no Authorization header, so
-- /api/public/purge-photos answered 401. Now the URL comes from trip_private.cron_endpoints (set per
-- environment after deploy) and the bearer key from trip_private.cron_keys, which the route already
-- accepts (check_cron_key). With no endpoint row the job does nothing.
-- rollback: SELECT cron.unschedule('purge-expired-trip-photos'); DROP TABLE trip_private.cron_endpoints;

CREATE TABLE IF NOT EXISTS trip_private.cron_endpoints (
  name text PRIMARY KEY,
  url text NOT NULL CHECK (url ~ '^https?://'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON trip_private.cron_endpoints FROM PUBLIC, anon, authenticated;

-- Set once per environment, e.g.:
--   INSERT INTO trip_private.cron_endpoints (name, url)
--   VALUES ('purge_photos', 'https://tripjunkies.app/api/public/purge-photos')
--   ON CONFLICT (name) DO UPDATE SET url = excluded.url, updated_at = now();

SELECT cron.schedule('purge-expired-trip-photos', '17 4 * * *', $job$
  SELECT net.http_post(
    url := e.url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || k.key
    ),
    body := '{}'::jsonb
  )
  FROM trip_private.cron_endpoints e
  JOIN trip_private.cron_keys k ON k.name = e.name
  WHERE e.name = 'purge_photos';
$job$);
