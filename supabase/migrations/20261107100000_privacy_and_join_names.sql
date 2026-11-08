-- N-1: a deleted account takes its birthday with it. player_private and player_birthdays had no link
-- to auth.users, so deleting an account left the date of birth behind. The foreign keys make the
-- removal atomic with the account, whichever path deletes it.
-- Rows already orphaned belong to accounts that no longer exist; they have to go for the keys to apply.
--
-- N-2: a player names themselves before asking to join, so the Captain can tell who is waiting. The
-- name lives in trip_private (not exposed by the API). pending_members shows it to leaders only, and
-- trip_roster to the approved crew. It goes when the membership goes: declined, left, removed, trip
-- deleted or account deleted.
--
-- Forward-only. To undo: drop the two foreign keys and trip_private.join_names, and restore
-- join_trip(text), pending_members and trip_roster from the previous migration's definitions.

DELETE FROM public.player_private p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);
DELETE FROM public.player_birthdays p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);

ALTER TABLE public.player_private
  ADD CONSTRAINT player_private_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
ALTER TABLE public.player_birthdays
  ADD CONSTRAINT player_birthdays_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;

CREATE TABLE trip_private.join_names (
  trip_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id),
  FOREIGN KEY (trip_id, user_id) REFERENCES public.trip_members (trip_id, user_id) ON DELETE CASCADE
);
CREATE INDEX join_names_user_id_idx ON trip_private.join_names (user_id);
ALTER TABLE trip_private.join_names ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE trip_private.join_names FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE trip_private.join_names TO service_role;

DROP FUNCTION public.join_trip(text);
DROP FUNCTION trip_private.join_trip(text);

CREATE FUNCTION trip_private.join_trip(p_code text, p_display_name text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; v_count integer; v_approved integer; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; was_removed boolean := false; v_teen_invite boolean := false;
  v_name text := nullif(btrim(regexp_replace(regexp_replace(coalesce(p_display_name,''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), ''); BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF v_name IS NOT NULL AND char_length(v_name) NOT BETWEEN 2 AND 30 THEN RAISE EXCEPTION 'Your name needs 2 to 30 characters'; END IF;
  IF v_name IS NOT NULL AND NOT trip_private.content_text_safe(v_name) THEN RAISE EXCEPTION 'Please choose a different name'; END IF;
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
  IF v_name IS NOT NULL THEN
    INSERT INTO trip_private.join_names(trip_id,user_id,display_name) VALUES (t.id,auth.uid(),v_name);
  END IF;
  IF v_status = 'approved' THEN
    PERFORM trip_private.apply_join_baseline(t.id, auth.uid());
    INSERT INTO public.beta_access(user_id, source) VALUES (auth.uid(), 'invite') ON CONFLICT DO NOTHING;
  END IF;
  RETURN t.id;
END $function$;
REVOKE ALL ON FUNCTION trip_private.join_trip(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.join_trip(text, text) TO authenticated, service_role;

CREATE FUNCTION public.join_trip(p_code text, p_display_name text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ SELECT trip_private.join_trip(p_code, p_display_name) $function$;
REVOKE ALL ON FUNCTION public.join_trip(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_trip(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.pending_members(p_trip uuid)
 RETURNS TABLE(user_id uuid, name text, avatar_style text, avatar_seed text, age_range text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 RETURN QUERY SELECT m.user_id, coalesce(c.game_name, j.display_name, p.game_name, 'New traveler'), coalesce(c.avatar_style, p.avatar_style, 'street'), coalesce(c.avatar_seed, p.avatar_seed, m.user_id::text), trip_private.age_range(trip_private.age_of(m.user_id)), m.joined_at
  FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id LEFT JOIN public.player_profiles p ON p.user_id=m.user_id LEFT JOIN trip_private.join_names j ON j.trip_id=m.trip_id AND j.user_id=m.user_id
  WHERE m.trip_id=p_trip AND m.status='pending' ORDER BY m.joined_at; END $function$;

CREATE OR REPLACE FUNCTION trip_private.trip_roster(p_trip uuid)
 RETURNS TABLE(user_id uuid, role text, display_name text, avatar_url text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not a member'; END IF;
 RETURN QUERY SELECT m.user_id,m.role,coalesce(c.game_name,j.display_name,'New traveler'),c.avatar_path,m.joined_at FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id LEFT JOIN trip_private.join_names j ON j.trip_id=m.trip_id AND j.user_id=m.user_id WHERE m.trip_id=p_trip AND m.status='approved' ORDER BY CASE m.role WHEN 'captain' THEN 0 WHEN 'co_captain' THEN 1 ELSE 2 END,m.joined_at;
END $function$;
