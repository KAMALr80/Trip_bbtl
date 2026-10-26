ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS photos_purged_at timestamptz;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
SELECT cron.schedule('purge-expired-trip-photos', '17 4 * * *', $$
  SELECT net.http_post(
    url := 'https://project--ff8fd31b-2c16-4b96-b5ff-87031aed303d.lovable.app/api/public/purge-photos',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);