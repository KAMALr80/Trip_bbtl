ALTER TABLE public.profiles ALTER COLUMN home_layout SET DEFAULT 'trips_first';

UPDATE public.profiles
SET home_layout = 'trips_first'
WHERE home_layout = 'classic';

COMMENT ON COLUMN public.profiles.home_layout IS 'Per-account Home layout preference; Trips first is the default and Classic remains available.';