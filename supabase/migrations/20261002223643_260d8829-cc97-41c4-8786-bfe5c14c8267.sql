CREATE OR REPLACE FUNCTION trip_private.legal_current(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ SELECT EXISTS(SELECT 1 FROM public.account_consents WHERE user_id=p_user AND legal_version='2026-10-03' AND accepted_at IS NOT NULL) $function$;
CREATE OR REPLACE FUNCTION trip_private.legal_dob_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_created timestamptz; BEGIN IF auth.uid() IS NOT NULL THEN IF NEW.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your birthday'; END IF; IF NOT trip_private.legal_current(NEW.user_id) THEN RAISE EXCEPTION 'Please agree to the current Terms before continuing'; END IF; SELECT created_at INTO v_created FROM auth.users WHERE id=NEW.user_id; IF v_created >= timestamptz '2026-10-02 19:18:00+00' AND extract(year FROM age(current_date, NEW.dob)) < 18 AND coalesce(current_setting('trip.teen_invite_ok',true),'') <> 'on' THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for an invite link.'; END IF; END IF; RETURN NEW; END $function$;
CREATE OR REPLACE FUNCTION trip_private.set_teen_dob(p_dob date, p_agree boolean, p_invite text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a int; inv public.trip_invites%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date,p_dob))::int;
 IF a < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
 IF a >= 18 THEN RETURN trip_private.set_my_dob(p_dob, p_agree); END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your birthday is already saved; contact support for corrections'; END IF;
 SELECT * INTO inv FROM public.trip_invites WHERE token=upper(trim(coalesce(p_invite,''))) FOR UPDATE;
 IF NOT FOUND OR NOT inv.teen OR inv.guardian_confirmed_at IS NULL OR inv.used_at IS NOT NULL OR inv.cancelled_at IS NOT NULL OR inv.expires_at <= now() THEN
   RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for an invite link.'; END IF;
 PERFORM set_config('trip.teen_invite_ok','on',true);
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 PERFORM set_config('trip.teen_invite_ok','',true);
 INSERT INTO trip_private.teen_accounts(user_id,invite_id,trip_id) VALUES(auth.uid(),inv.id,inv.trip_id) ON CONFLICT DO NOTHING;
 RETURN trip_private.age_range(a);
END $function$;