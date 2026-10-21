CREATE OR REPLACE FUNCTION trip_private.guard_local_trip_membership() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_mode text; v_captain uuid;
BEGIN
 SELECT t.play_arrangement INTO v_mode FROM public.trips t WHERE t.id=NEW.trip_id;
 IF v_mode IN ('solo','offline') THEN
   SELECT m.user_id INTO v_captain FROM public.trip_members m WHERE m.trip_id=NEW.trip_id AND m.role='captain' LIMIT 1;
   IF v_captain IS NOT NULL AND NEW.user_id IS DISTINCT FROM v_captain THEN
     RAISE EXCEPTION 'This room is played on one phone; guests do not join with accounts';
   END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trip_private.guard_local_trip_membership() FROM PUBLIC,anon;
CREATE TRIGGER guard_local_trip_membership BEFORE INSERT OR UPDATE ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.guard_local_trip_membership();