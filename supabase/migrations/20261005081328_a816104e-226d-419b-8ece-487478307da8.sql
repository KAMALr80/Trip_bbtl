CREATE OR REPLACE FUNCTION trip_private.prevent_opt_in_quick_start() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.play_arrangement IS NOT NULL AND NEW.game_plan='quick_start' THEN
  RAISE EXCEPTION 'This room starts automatically from its dates; Quick Start is not available';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trip_private.prevent_opt_in_quick_start() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION trip_private.prevent_opt_in_quick_start() TO service_role;
CREATE TRIGGER trips_opt_in_no_quick_start BEFORE INSERT OR UPDATE OF game_plan,play_arrangement ON public.trips FOR EACH ROW EXECUTE FUNCTION trip_private.prevent_opt_in_quick_start();