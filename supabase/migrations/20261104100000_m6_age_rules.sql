-- M6-03 age rules, Q12 founder default (R-904): self sign-up is 18+; a player aged 13–17 gets an
-- account and joins a trip only through a Captain's teen invite link (the Captain confirms they are
-- the parent/guardian or have permission when making it). The plain join code no longer admits
-- teens on any trip (it did on a2c trips: finding T1). Unchanged: under 13 refused; one trip at a
-- time for a teen; teens wait for the Captain's approval; approving one makes the trip Family vibe
-- with has_minors; no teen Co-Captain; Captains are 21+; no alcohol content for anyone (content_fits)
-- and nothing over 13+ in a trip with minors.
-- rollback: restore guard_auth_signup_age, set_my_dob, set_teen_dob and join_trip from the baseline;
--   DROP FUNCTION trip_private.teen_invite_ok(text).

-- A teen invite that can still be used.
CREATE FUNCTION trip_private.teen_invite_ok(p_token text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.trip_invites i
                 WHERE i.token = upper(btrim(coalesce(p_token, ''))) AND i.teen AND i.guardian_confirmed_at IS NOT NULL
                   AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > now())
$$;
REVOKE ALL ON FUNCTION trip_private.teen_invite_ok(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.teen_invite_ok(text) TO service_role, supabase_auth_admin;

-- Email sign-up: 18+, or 13–17 with a teen invite in the sign-up data.
CREATE OR REPLACE FUNCTION trip_private.guard_auth_signup_age() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $_$
DECLARE v_dob date; v_text text; v_age int;
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
   IF v_age < 18 AND NOT trip_private.teen_invite_ok(NEW.raw_user_meta_data->>'teen_invite') THEN
     RAISE EXCEPTION 'TripJunkies accounts are for ages 18 and up. Under 18? Ask your trip''s Captain for a teen invite link.';
   END IF;
 ELSIF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.created_at >= timestamptz '2026-10-02 22:00:00+00' THEN
   RAISE EXCEPTION 'Please provide your birthday and accept the current Terms';
 END IF;
 RETURN NEW;
END $_$;

-- Birthday after a Google sign-up: adults only here; teens go through set_teen_dob with an invite.
CREATE OR REPLACE FUNCTION trip_private.set_my_dob(p_dob date, p_agree boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm your birthday and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date,p_dob))::int;
 IF a < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
 IF a < 18 THEN RAISE EXCEPTION 'TripJunkies accounts are for ages 18 and up. Under 18? Ask your trip''s Captain for a teen invite link.'; END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your birthday is already saved; contact support for corrections'; END IF;
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 IF (SELECT public_launch FROM public.app_settings LIMIT 1) THEN INSERT INTO public.beta_access(user_id,source) VALUES(auth.uid(),'launch') ON CONFLICT DO NOTHING; END IF;
 RETURN trip_private.age_range(a);
END $$;

CREATE OR REPLACE FUNCTION trip_private.set_teen_dob(p_dob date, p_agree boolean, p_invite text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a int; inv public.trip_invites%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date,p_dob))::int;
 IF a < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
 IF a >= 18 THEN RETURN trip_private.set_my_dob(p_dob, p_agree); END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your birthday is already saved; contact support for corrections'; END IF;
 IF NOT trip_private.teen_invite_ok(p_invite) THEN
   RAISE EXCEPTION 'TripJunkies accounts are for ages 18 and up. Under 18? Ask your trip''s Captain for a teen invite link.';
 END IF;
 SELECT * INTO inv FROM public.trip_invites WHERE token=upper(btrim(p_invite)) FOR UPDATE;
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 INSERT INTO trip_private.teen_accounts(user_id,invite_id,trip_id) VALUES(auth.uid(),inv.id,inv.trip_id) ON CONFLICT DO NOTHING;
 RETURN trip_private.age_range(a);
END $$;

-- Joining: a player under 18 needs a teen invite for every trip (no plain join code).
CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; v_count integer; v_approved integer; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; was_removed boolean := false; v_teen_invite boolean := false; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  PERFORM trip_private.code_rate_check();
  v_age := trip_private.age_of(auth.uid());
  IF v_age IS NULL THEN RAISE EXCEPTION 'Add your date of birth first'; END IF;
  IF length(v_code) = 10 THEN
    SELECT * INTO inv FROM public.trip_invites WHERE token=v_code FOR UPDATE;
    IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
    SELECT * INTO t FROM public.trips WHERE id=inv.trip_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
    IF inv.used_at IS NOT NULL OR inv.cancelled_at IS NOT NULL OR inv.expires_at <= now() THEN RAISE EXCEPTION 'This invite link has expired or was already used. Ask your Captain for a new one.'; END IF;
    via_invite := true;
    v_teen_invite := inv.teen AND inv.guardian_confirmed_at IS NOT NULL;
  ELSE
    SELECT * INTO t FROM public.trips WHERE join_code = v_code FOR UPDATE;
    IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
    IF NOT t.join_locked AND NOT t.join_code_enabled THEN RAISE EXCEPTION 'This trip''s join code is turned off. Ask your Captain for a personal invite link.'; END IF;
    was_removed := EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid());
  END IF;
  IF t.join_locked THEN RAISE EXCEPTION 'This trip isn''t taking new members right now'; END IF;
  IF v_age < 18 THEN
    IF NOT v_teen_invite THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for a teen invite link.'; END IF;
    IF t.vibe='party' THEN RAISE EXCEPTION 'This trip isn''t open to players under 18'; END IF;
    IF EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id=auth.uid()) THEN RAISE EXCEPTION 'Players under 18 can be in one trip at a time'; END IF;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE status='approved') INTO v_count, v_approved FROM public.trip_members WHERE trip_id = t.id;
  IF v_approved >= t.max_squad THEN RAISE EXCEPTION 'This squad is full'; END IF;
  IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
  IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
  v_status := CASE WHEN t.require_approval OR v_age < 21 OR was_removed THEN 'pending' ELSE 'approved' END;
  IF via_invite THEN
    UPDATE public.trip_invites SET used_by=auth.uid(), used_at=now() WHERE id=inv.id;
    DELETE FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid();
  END IF;
  INSERT INTO public.trip_members(trip_id,user_id,status,approved_at) VALUES(t.id,auth.uid(),v_status,CASE WHEN v_status='approved' THEN now() END);
  IF v_status = 'approved' THEN
    PERFORM trip_private.apply_join_baseline(t.id, auth.uid());
    INSERT INTO public.beta_access(user_id, source) VALUES (auth.uid(), 'invite') ON CONFLICT DO NOTHING;
  END IF;
  RETURN t.id;
END $$;
