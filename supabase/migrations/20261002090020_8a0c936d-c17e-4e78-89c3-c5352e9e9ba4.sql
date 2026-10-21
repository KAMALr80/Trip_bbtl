ALTER TABLE public.trips DROP CONSTRAINT trips_join_code_check;
ALTER TABLE public.trips ADD CONSTRAINT trips_join_code_check CHECK (join_code ~ '^[A-Z]{6}([A-Z]{2})?$');