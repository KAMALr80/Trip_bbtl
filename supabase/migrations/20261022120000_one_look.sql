-- M1-03: one visual look. The app no longer reads or writes app_settings.look.
-- rollback: re-apply current_look / founder_set_look from supabase/baseline/current_schema.sql
-- before this migration and ALTER TABLE public.app_settings ADD COLUMN look jsonb NOT NULL
-- DEFAULT '{"pages": {}, "global": "cinematic"}'.
DROP FUNCTION IF EXISTS public.current_look();
DROP FUNCTION IF EXISTS trip_private.current_look();
DROP FUNCTION IF EXISTS public.founder_set_look(jsonb);
DROP FUNCTION IF EXISTS trip_private.founder_set_look(jsonb);
ALTER TABLE public.app_settings DROP COLUMN IF EXISTS look;
