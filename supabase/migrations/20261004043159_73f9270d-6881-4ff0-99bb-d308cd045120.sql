CREATE OR REPLACE FUNCTION trip_private.legal_dob_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_created timestamptz; BEGIN IF auth.uid() IS NOT NULL THEN IF EXISTS (SELECT 1 FROM public.sandbox_bots b WHERE b.user_id = NEW.user_id) THEN RETURN NEW; END IF; IF NEW.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your birthday'; END IF; IF NOT trip_private.legal_current(NEW.user_id) THEN RAISE EXCEPTION 'Please agree to the current Terms before continuing'; END IF; SELECT created_at INTO v_created FROM auth.users WHERE id=NEW.user_id; IF v_created >= timestamptz '2026-10-02 19:18:00+00' AND extract(year FROM age(current_date, NEW.dob)) < 18 AND coalesce(current_setting('trip.teen_invite_ok',true),'') <> 'on' THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for an invite link.'; END IF; END IF; RETURN NEW; END $function$;