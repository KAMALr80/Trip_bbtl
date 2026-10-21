
CREATE TABLE public.beta_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  note text CHECK (note IS NULL OR length(note) <= 120)
);
CREATE UNIQUE INDEX beta_codes_one_per_user ON public.beta_codes(used_by) WHERE used_by IS NOT NULL;
GRANT SELECT ON public.beta_codes TO authenticated;
GRANT ALL ON public.beta_codes TO service_role;
ALTER TABLE public.beta_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Founder reads beta codes" ON public.beta_codes FOR SELECT TO authenticated USING (trip_private.is_app_admin());

CREATE TABLE public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (length(email) <= 254),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.waitlist TO authenticated;
GRANT ALL ON public.waitlist TO service_role;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Founder reads waitlist" ON public.waitlist FOR SELECT TO authenticated USING (trip_private.is_app_admin());

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS join_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS max_squad integer NOT NULL DEFAULT 20 CHECK (max_squad BETWEEN 2 AND 40);

-- Beta access also counts approved trip members.
CREATE OR REPLACE FUNCTION trip_private.has_beta_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND ((SELECT public_launch FROM public.app_settings LIMIT 1)
    OR EXISTS (SELECT 1 FROM public.beta_access WHERE user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.trip_members WHERE user_id=auth.uid() AND status='approved')
    OR trip_private.is_app_admin()) $$;

CREATE OR REPLACE FUNCTION trip_private.new_beta_code() RETURNS text LANGUAGE plpgsql VOLATILE SET search_path TO 'public' AS $$
DECLARE b bytea := decode(replace(gen_random_uuid()::text,'-',''),'hex'); a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text := ''; i int;
BEGIN FOR i IN 0..7 LOOP c := c || substr(a, get_byte(b,i) % 31 + 1, 1); END LOOP; RETURN c; END $$;

CREATE OR REPLACE FUNCTION trip_private.create_beta_codes(p_count int, p_note text) RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int := 0; v text; tries int := 0; BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 20 THEN RAISE EXCEPTION 'Make 1 to 20 codes at a time'; END IF;
  WHILE n < p_count AND tries < 200 LOOP
    tries := tries + 1; v := trip_private.new_beta_code();
    BEGIN INSERT INTO public.beta_codes(code, created_by, note) VALUES (v, auth.uid(), nullif(left(trim(coalesce(p_note,'')),120),'')); n := n + 1; RETURN NEXT v;
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION trip_private.list_beta_codes() RETURNS TABLE(code text, note text, status text, used_by_name text, created_at timestamptz, expires_at timestamptz, used_at timestamptz, revoked_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 RETURN QUERY SELECT b.code, b.note,
   CASE WHEN b.used_at IS NOT NULL THEN 'used' WHEN b.revoked_at IS NOT NULL THEN 'revoked' WHEN b.expires_at <= now() THEN 'expired' ELSE 'unused' END,
   CASE WHEN b.used_by IS NULL THEN NULL ELSE coalesce(nullif(pp.game_name,''), nullif(p.display_name,''), 'Player') END,
   b.created_at, b.expires_at, b.used_at, b.revoked_at
 FROM public.beta_codes b LEFT JOIN public.player_profiles pp ON pp.user_id=b.used_by LEFT JOIN public.profiles p ON p.id=b.used_by
 ORDER BY b.created_at DESC LIMIT 500; END $$;

CREATE OR REPLACE FUNCTION trip_private.revoke_beta_code(p_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 UPDATE public.beta_codes SET revoked_at=now() WHERE code=upper(trim(p_code)) AND used_at IS NULL AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'That code can''t be revoked (already used, revoked or not found)'; END IF; END $$;

-- Returns 'ok', 'has_access' or 'invalid' (misses are logged for the rate limit and never raise, so the log survives).
CREATE OR REPLACE FUNCTION trip_private.redeem_beta_code(p_code text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.beta_codes%ROWTYPE; v text := upper(regexp_replace(coalesce(p_code,''),'[^A-Za-z0-9]','','g')); BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF EXISTS (SELECT 1 FROM public.beta_access WHERE user_id=auth.uid()) OR trip_private.has_beta_access() THEN RETURN 'has_access'; END IF;
  IF EXISTS (SELECT 1 FROM public.beta_codes WHERE used_by=auth.uid()) THEN RAISE EXCEPTION 'You''ve already used a beta code'; END IF;
  PERFORM trip_private.code_rate_check();
  SELECT * INTO b FROM public.beta_codes WHERE code=v FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN 'invalid'; END IF;
  IF b.used_at IS NOT NULL THEN RAISE EXCEPTION 'That code was already used'; END IF;
  IF b.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'That code was turned off — ask Ty for a new one'; END IF;
  IF b.expires_at <= now() THEN RAISE EXCEPTION 'That code expired — ask Ty for a new one'; END IF;
  UPDATE public.beta_codes SET used_by=auth.uid(), used_at=now() WHERE id=b.id;
  INSERT INTO public.beta_access(user_id, source) VALUES (auth.uid(), 'beta_code') ON CONFLICT DO NOTHING;
  RETURN 'ok'; END $$;

CREATE OR REPLACE FUNCTION trip_private.join_waitlist(p_email text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e text := lower(trim(coalesce(p_email,''))); BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(e) > 254 THEN RAISE EXCEPTION 'Please enter a valid email'; END IF;
  IF (SELECT count(*) FROM public.waitlist WHERE user_id=auth.uid()) >= 3 THEN RETURN; END IF;
  INSERT INTO public.waitlist(email, user_id) VALUES (e, auth.uid()) ON CONFLICT (email) DO NOTHING; END $$;

CREATE OR REPLACE FUNCTION trip_private.list_waitlist() RETURNS TABLE(email text, created_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 RETURN QUERY SELECT w.email, w.created_at FROM public.waitlist w ORDER BY w.created_at; END $$;

-- Captain-only join controls, logged.
CREATE OR REPLACE FUNCTION trip_private.set_join_controls(p_trip uuid, p_locked boolean, p_max integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o public.trips%ROWTYPE; BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
  IF p_max IS NOT NULL AND (p_max < 2 OR p_max > 40) THEN RAISE EXCEPTION 'Max squad size must be 2 to 40'; END IF;
  SELECT * INTO o FROM public.trips WHERE id=p_trip FOR UPDATE;
  UPDATE public.trips SET join_locked=coalesce(p_locked,join_locked), max_squad=coalesce(p_max,max_squad) WHERE id=p_trip;
  IF p_locked IS NOT NULL AND p_locked <> o.join_locked THEN
    INSERT INTO public.trip_role_changes(trip_id, role, reason, actor) VALUES (p_trip, 'join_settings', CASE WHEN p_locked THEN 'Joining locked' ELSE 'Joining unlocked' END, auth.uid()); END IF;
  IF p_max IS NOT NULL AND p_max <> o.max_squad THEN
    INSERT INTO public.trip_role_changes(trip_id, role, reason, actor) VALUES (p_trip, 'join_settings', 'Max squad size '||o.max_squad||' → '||p_max, auth.uid()); END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.reset_trip_code(p_trip uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_code text; attempt int; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can reset the join code'; END IF;
 FOR attempt IN 1..15 LOOP
  BEGIN
   new_code := public.new_trip_code();
   UPDATE public.trips SET join_code=new_code WHERE id=p_trip AND join_code<>new_code;
   IF FOUND THEN
     INSERT INTO public.trip_role_changes(trip_id, role, reason, actor) VALUES (p_trip, 'join_settings', 'Join code reset', auth.uid());
     RETURN new_code; END IF;
  EXCEPTION WHEN unique_violation THEN IF attempt=15 THEN RAISE; END IF;
  END;
 END LOOP;
 RAISE EXCEPTION 'Could not reset the code';
END $$;

CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; v_count integer; v_approved integer; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; was_removed boolean := false; BEGIN
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
  ELSE
    SELECT * INTO t FROM public.trips WHERE join_code = v_code FOR UPDATE;
    IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
    IF NOT t.join_locked AND NOT t.join_code_enabled THEN RAISE EXCEPTION 'This trip''s join code is turned off. Ask your Captain for a personal invite link.'; END IF;
    was_removed := EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid());
  END IF;
  IF t.join_locked THEN RAISE EXCEPTION 'This trip isn''t taking new members right now'; END IF;
  IF v_age < 18 AND NOT (via_invite AND inv.teen AND inv.guardian_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for a teen invite link.'; END IF;
  IF v_age < 18 AND (t.vibe='party') THEN RAISE EXCEPTION 'This trip isn''t open to players under 18'; END IF;
  IF t.level='preview' AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION 'PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.'; END IF;
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
END $function$;

-- Waiting members: no captain identity in invite previews; no names/scores in trip_peek.
CREATE OR REPLACE FUNCTION trip_private.trip_invite_preview(p_code text)
 RETURNS TABLE(name text, destination text, motto text, start_date date, end_date date, member_count bigint, captain_name text, captain_style text, captain_seed text, captain_avatar_url text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 PERFORM trip_private.code_rate_check();
 RETURN QUERY SELECT x.name, x.destination, CASE WHEN x.waiting THEN NULL ELSE x.motto END, x.start_date, x.end_date, x.member_count,
   CASE WHEN x.waiting THEN 'Your Captain' ELSE x.captain_name END, CASE WHEN x.waiting THEN 'street' ELSE x.captain_style END,
   CASE WHEN x.waiting THEN 'captain' ELSE x.captain_seed END, CASE WHEN x.waiting THEN NULL ELSE x.captain_avatar_url END
 FROM (SELECT t.name, t.destination, t.motto, t.start_date, t.end_date,
    (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = t.id AND m.status='approved') member_count,
    COALESCE(p.game_name, c.game_name, cp.display_name, 'Your Captain') captain_name, COALESCE(p.avatar_style, c.avatar_style, 'street') captain_style,
    COALESCE(p.avatar_seed, c.avatar_seed, cap.user_id::text) captain_seed, cp.avatar_url captain_avatar_url,
    EXISTS (SELECT 1 FROM public.trip_members w WHERE w.trip_id=t.id AND w.user_id=auth.uid() AND w.status='pending') waiting
  FROM public.trips t JOIN public.trip_members cap ON cap.trip_id = t.id AND cap.role = 'captain'
  LEFT JOIN public.profiles cp ON cp.id = cap.user_id LEFT JOIN public.player_profiles p ON p.user_id = cap.user_id
  LEFT JOIN public.trip_player_cards c ON c.trip_id = t.id AND c.user_id = cap.user_id
  WHERE t.ended_at IS NULL AND ((t.join_code = upper(trim(p_code)) AND t.join_code_enabled)
    OR EXISTS (SELECT 1 FROM public.trip_invites i WHERE i.trip_id=t.id AND i.token=upper(trim(p_code)) AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > now()))
  LIMIT 1) x;
 IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); END IF;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.trip_peek(p_trip uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE t public.trips; v_kind text; BEGIN
 IF auth.uid() IS NULL THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='pending') THEN v_kind := 'waiting';
 ELSIF EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id=p_trip AND user_id=auth.uid()) AND NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid()) THEN v_kind := 'former';
 ELSE RETURN NULL; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.id IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('kind', v_kind, 'trip_id', t.id, 'name', t.name, 'destination', t.destination, 'start_date', t.start_date, 'end_date', t.end_date,
  'ended', (t.ended_at IS NOT NULL OR t.end_date < current_date),
  'squad', (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip AND status='approved'),
  'nights_played', CASE WHEN v_kind='waiting' THEN 0 ELSE (SELECT count(*) FROM public.game_nights gn WHERE gn.trip_id=p_trip AND NOT gn.skipped AND gn.starts_at <= now()) END,
  'top', CASE WHEN v_kind='waiting' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score) ORDER BY x.score DESC) FROM (
     SELECT CASE WHEN coalesce(trip_private.age_of(b.user_id),0) >= 18 THEN coalesce(nullif(pc.game_name,''),'Player') ELSE 'Traveler' END name, b.score
     FROM trip_private.game_board(p_trip) b JOIN public.trip_members m ON m.trip_id=p_trip AND m.user_id=b.user_id AND m.status='approved'
     LEFT JOIN public.trip_player_cards pc ON pc.trip_id=p_trip AND pc.user_id=b.user_id
     WHERE t.season_scoring ORDER BY b.score DESC LIMIT 3) x), '[]'::jsonb) END);
END $function$;

-- Leader-visible pending count (member-scoped).
CREATE OR REPLACE FUNCTION trip_private.pending_count(p_trip uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_leader(p_trip) THEN RETURN 0; END IF;
 RETURN (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip AND status='pending'); END $$;

REVOKE ALL ON FUNCTION trip_private.new_beta_code(), trip_private.create_beta_codes(int,text), trip_private.list_beta_codes(), trip_private.revoke_beta_code(text), trip_private.redeem_beta_code(text), trip_private.join_waitlist(text), trip_private.list_waitlist(), trip_private.set_join_controls(uuid,boolean,integer), trip_private.pending_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.create_beta_codes(int,text), trip_private.list_beta_codes(), trip_private.revoke_beta_code(text), trip_private.redeem_beta_code(text), trip_private.join_waitlist(text), trip_private.list_waitlist(), trip_private.set_join_controls(uuid,boolean,integer), trip_private.pending_count(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_beta_codes(p_count int, p_note text) RETURNS SETOF text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.create_beta_codes(p_count, p_note) $$;
CREATE OR REPLACE FUNCTION public.list_beta_codes() RETURNS TABLE(code text, note text, status text, used_by_name text, created_at timestamptz, expires_at timestamptz, used_at timestamptz, revoked_at timestamptz) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.list_beta_codes() $$;
CREATE OR REPLACE FUNCTION public.revoke_beta_code(p_code text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.revoke_beta_code(p_code) $$;
CREATE OR REPLACE FUNCTION public.redeem_beta_code(p_code text) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.redeem_beta_code(p_code) $$;
CREATE OR REPLACE FUNCTION public.join_waitlist(p_email text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.join_waitlist(p_email) $$;
CREATE OR REPLACE FUNCTION public.list_waitlist() RETURNS TABLE(email text, created_at timestamptz) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.list_waitlist() $$;
CREATE OR REPLACE FUNCTION public.set_join_controls(p_trip uuid, p_locked boolean, p_max integer) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_join_controls(p_trip, p_locked, p_max) $$;
CREATE OR REPLACE FUNCTION public.pending_count(p_trip uuid) RETURNS integer LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.pending_count(p_trip) $$;
REVOKE ALL ON FUNCTION public.create_beta_codes(int,text), public.list_beta_codes(), public.revoke_beta_code(text), public.redeem_beta_code(text), public.join_waitlist(text), public.list_waitlist(), public.set_join_controls(uuid,boolean,integer), public.pending_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_beta_codes(int,text), public.list_beta_codes(), public.revoke_beta_code(text), public.redeem_beta_code(text), public.join_waitlist(text), public.list_waitlist(), public.set_join_controls(uuid,boolean,integer), public.pending_count(uuid) TO authenticated, service_role;
