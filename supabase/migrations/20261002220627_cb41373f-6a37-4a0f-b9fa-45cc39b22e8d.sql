CREATE OR REPLACE FUNCTION trip_private.guard_auth_signup_age() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE v_dob date; v_text text;
BEGIN
 IF NEW.id IS NULL OR NEW.created_at IS NULL THEN RETURN NEW; END IF;
 IF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.raw_user_meta_data->>'legal_version' = '2026-10-02' THEN
   v_text := NEW.raw_user_meta_data->>'birthday';
   IF v_text IS NULL OR v_text !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'A birthday is required to sign up'; END IF;
   BEGIN v_dob := v_text::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Check your birthday'; END;
   IF v_dob > current_date OR v_dob < date '1900-01-01' OR extract(year FROM age(current_date,v_dob)) < 18 THEN RAISE EXCEPTION 'You must be 18 or older to create an account'; END IF;
 ELSIF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.created_at >= timestamptz '2026-10-02 22:00:00+00' THEN
   RAISE EXCEPTION 'Please provide your birthday and accept the current Terms';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trip_private.guard_auth_signup_age() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_auth_signup_age ON auth.users;
CREATE TRIGGER guard_auth_signup_age BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION trip_private.guard_auth_signup_age();