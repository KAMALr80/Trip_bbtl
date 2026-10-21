CREATE OR REPLACE FUNCTION trip_private.enforce_seat_cap()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cap int; v_used int;
BEGIN
  IF TG_OP='UPDATE' AND (OLD.status IN ('approved','pending') OR NEW.status NOT IN ('approved','pending')) THEN RETURN NEW; END IF;
  PERFORM 1 FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
  v_cap := trip_private.seat_cap(NEW.trip_id);
  IF v_cap IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_used FROM public.trip_members WHERE trip_id=NEW.trip_id AND user_id<>NEW.user_id AND status IN ('approved','pending');
  IF v_used >= v_cap THEN RAISE EXCEPTION 'This flight is full'; END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS trip_members_seat_cap ON public.trip_members;
CREATE TRIGGER trip_members_seat_cap BEFORE INSERT OR UPDATE OF status ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.enforce_seat_cap();