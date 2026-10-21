CREATE OR REPLACE FUNCTION trip_private.guard_auth_signup_age()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE v_dob date; v_text text; v_age int; v_tok text;
BEGIN
 IF NEW.id IS NULL OR NEW.created_at IS NULL THEN RETURN NEW; END IF;
 IF coalesce(NEW.raw_app_meta_data->>'sandbox_bot','') = 'true' THEN RETURN NEW; END IF;
 IF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.raw_user_meta_data->>'legal_version' IN ('2026-10-02','2026-10-03') THEN
   v_text := NEW.raw_user_meta_data->>'birthday';
   IF v_text IS NULL OR v_text !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'A birthday is required to sign up'; END IF;
   BEGIN v_dob := v_text::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Check your birthday'; END;
   IF v_dob > current_date OR v_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your birthday'; END IF;
   v_age := extract(year FROM age(current_date,v_dob))::int;
   IF v_age < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
   IF v_age < 18 THEN
     v_tok := upper(trim(coalesce(NEW.raw_user_meta_data->>'teen_invite','')));
     IF NOT EXISTS (SELECT 1 FROM public.trip_invites i WHERE i.token=v_tok AND i.teen AND i.guardian_confirmed_at IS NOT NULL AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > now()) THEN
       RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for an invite link.'; END IF;
   END IF;
 ELSIF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.created_at >= timestamptz '2026-10-02 22:00:00+00' THEN
   RAISE EXCEPTION 'Please provide your birthday and accept the current Terms';
 END IF;
 RETURN NEW;
END $function$;