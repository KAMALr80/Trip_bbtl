-- M1-10: remove FULL/PREVIEW trip levels and per-trip feature switches.
-- Every trip now gets the same features. Unfinished features are hidden with environment-level
-- flags in the app (src/lib/flags.ts), not per trip.
--
-- feature_on / require_feature / in_slice are still called from older function bodies (most of them
-- retired in M1-08, the rest rewritten in M2/M3), so they stay as constants until those callers
-- are gone. They no longer read the trip.
-- trip_private.preview_settings and preview_log are left in place for M1-08 to archive.
-- rollback: re-apply the definitions in supabase/baseline/current_schema.sql from before this
-- migration, then ALTER TABLE public.trips ADD COLUMN level text NOT NULL DEFAULT 'full'.

CREATE OR REPLACE FUNCTION trip_private.feature_on(p_trip uuid, p_feature text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT true $$;
COMMENT ON FUNCTION trip_private.feature_on(uuid, text) IS
  'M1-10: always true. Kept only for older callers; do not use in new code.';

CREATE OR REPLACE FUNCTION trip_private.require_feature(p_trip uuid, p_feature text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$ BEGIN RETURN; END $$;
COMMENT ON FUNCTION trip_private.require_feature(uuid, text) IS
  'M1-10: no-op. Kept only for older callers; do not use in new code.';

CREATE OR REPLACE FUNCTION trip_private.in_slice(p_trip uuid, p_key text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$ SELECT true $$;
COMMENT ON FUNCTION trip_private.in_slice(uuid, text) IS
  'M1-10: always true (the weekly preview slice is gone). Kept only for older callers.';

-- Included AI credits: the preview branch is gone; the unlocked-trip table is unchanged.
CREATE OR REPLACE FUNCTION trip_private.credits_included(p_trip uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN t.unlocked_at IS NULL THEN 0 ELSE (
    WITH d AS (SELECT (t.end_date - t.start_date + 1) AS n)
    SELECT CASE WHEN n <= 5 THEN 20 WHEN n <= 10 THEN 35 WHEN n <= 15 THEN 50 ELSE 70 END FROM d) END
  FROM public.trips t WHERE t.id = p_trip
$$;

CREATE OR REPLACE FUNCTION trip_private.culture_quest_previews()
RETURNS TABLE(id uuid, trip_id uuid, creator_id uuid, partner_id uuid, category text, title text, photo_path text,
              quest_length text, country text, region text, city text, is_public boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.trip_id, c.creator_id, c.partner_id, c.category, c.title, c.photo_path, c.quest_length,
         c.country, c.region, c.city, trip_private.inspiration_public(c.id)
  FROM public.cultural_inspirations c
  WHERE auth.uid() IS NOT NULL AND c.hidden_at IS NULL AND c.reveal_on <= CURRENT_DATE
    AND c.captain_approved_at IS NOT NULL
    AND (trip_private.is_trip_member(c.trip_id, auth.uid()) OR trip_private.inspiration_public(c.id))
$$;

CREATE OR REPLACE FUNCTION trip_private.quest_access(p_card uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.cultural_inspirations c
            WHERE c.id = p_card AND c.hidden_at IS NULL AND c.reveal_on <= CURRENT_DATE
              AND trip_private.is_trip_member(c.trip_id, p_user))
    OR trip_private.inspiration_public(p_card))
$$;

CREATE OR REPLACE FUNCTION trip_private.reveal_inspiration_votes(p_card uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cultural_inspirations SET votes_revealed_at = now()
  WHERE id = p_card AND creator_id = auth.uid() AND mode = 'challenge' AND hidden_at IS NULL
    AND reveal_on <= CURRENT_DATE AND votes_revealed_at IS NULL
    AND trip_private.is_trip_member(trip_id, auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the approved creator can reveal votes on a displayed challenge'; END IF;
END $$;

-- use_ai_quota: same as before without the preview daily cap.
CREATE OR REPLACE FUNCTION trip_private.use_ai_quota(p_kind text, p_trip uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; used int; uid uuid; BEGIN PERFORM trip_private.ai_gate(p_kind, p_trip, auth.uid());
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM trip_private.teen_block('AI');
 IF p_kind = 'arcade_mix' THEN RETURN trip_private.mix_ai_quota(p_trip); END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'AI ideas are for beta members only.'; END IF;
 IF p_trip IS NOT NULL AND NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first.'; END IF;
 lim := CASE p_kind WHEN 'names' THEN 10 WHEN 'itinerary' THEN 20 ELSE 0 END;
 IF lim = 0 OR (p_kind <> 'names' AND p_trip IS NULL) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF p_kind = 'names' THEN SELECT count(*) INTO used FROM public.ai_usage WHERE kind='names' AND user_id=auth.uid() AND created_at >= date_trunc('day', now());
 ELSE SELECT count(*) INTO used FROM public.ai_usage WHERE kind=p_kind AND trip_id=p_trip AND created_at >= date_trunc('day', now()); END IF;
 IF used >= lim THEN
   IF p_kind = 'itinerary' THEN RETURN trip_private.spend_credits(p_trip, 'itinerary_extra'); END IF;
   RAISE EXCEPTION 'That''s today''s limit for AI ideas — try again tomorrow.';
 END IF;
 INSERT INTO public.ai_usage(user_id, trip_id, kind) VALUES (auth.uid(), p_trip, p_kind) RETURNING id INTO uid;
 RETURN uid;
END $$;

-- join_trip: same as before without the preview one-room limit.
CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF NOT v_teen_invite AND t.season_rule IS DISTINCT FROM 'a2c' THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for a teen invite link.'; END IF;
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

-- Row policies: drop the restrictive "preview feature gate" SELECT policies, then take feature_on
-- out of the rest (Travel From Home / Window Seat cards and quest items).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'preview feature gate'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', 'preview feature gate', t);
  END LOOP;
END $$;

-- Every other policy loses its feature_on(...) conjunct; the rest of each expression is kept as is.
DO $$
DECLARE r record; q text; w text; pat constant text := 'trip_private\.feature_on\([^()]*\)';
BEGIN
  FOR r IN SELECT tablename, policyname, qual, with_check FROM pg_policies
           WHERE schemaname = 'public' AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'feature_on'
  LOOP
    q := regexp_replace(regexp_replace(r.qual, pat || ' AND ', '', 'g'), ' AND ' || pat, '', 'g');
    w := regexp_replace(regexp_replace(r.with_check, pat || ' AND ', '', 'g'), ' AND ' || pat, '', 'g');
    EXECUTE format('ALTER POLICY %I ON public.%I%s%s', r.policyname, r.tablename,
                   CASE WHEN q IS NOT NULL THEN ' USING (' || q || ')' ELSE '' END,
                   CASE WHEN w IS NOT NULL THEN ' WITH CHECK (' || w || ')' ELSE '' END);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
             AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'feature_on|in_slice') THEN
    RAISE EXCEPTION 'A row policy still calls feature_on or in_slice';
  END IF;
END $$;

-- Founder trip list (replaces founder_preview's trip list). Also what an admin reads before the
-- archive cutover (M1-01) to pick the trips to keep.
CREATE OR REPLACE FUNCTION trip_private.founder_trips()
RETURNS TABLE(id uuid, name text, kind text, captain text, start_date date, created_at timestamptz,
              rules_version smallint, is_sandbox boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  RETURN QUERY
    SELECT t.id, t.name, t.kind,
           (SELECT coalesce(p.display_name, 'Captain') FROM public.trip_members m
            LEFT JOIN public.profiles p ON p.id = m.user_id
            WHERE m.trip_id = t.id AND m.role = 'captain' LIMIT 1),
           t.start_date, t.created_at, t.rules_version, coalesce(t.is_sandbox, false)
    FROM public.trips t ORDER BY t.created_at DESC;
END $$;
CREATE OR REPLACE FUNCTION public.founder_trips()
RETURNS TABLE(id uuid, name text, kind text, captain text, start_date date, created_at timestamptz,
              rules_version smallint, is_sandbox boolean)
LANGUAGE sql SET search_path = public AS $$ SELECT * FROM trip_private.founder_trips() $$;
REVOKE ALL ON FUNCTION trip_private.founder_trips(), public.founder_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.founder_trips(), public.founder_trips() TO authenticated;

-- Gone: the trip feature map, preview settings screens, the trip level switch and its trigger.
DROP FUNCTION IF EXISTS public.trip_features(uuid);
DROP FUNCTION IF EXISTS trip_private.trip_features(uuid);
DROP FUNCTION IF EXISTS public.trip_slice_pct(uuid);
DROP FUNCTION IF EXISTS public.founder_preview();
DROP FUNCTION IF EXISTS trip_private.founder_preview();
DROP FUNCTION IF EXISTS public.founder_set_preview(jsonb, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS trip_private.founder_set_preview(jsonb, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.founder_set_trip_level(uuid, text);
DROP FUNCTION IF EXISTS trip_private.founder_set_trip_level(uuid, text);
DROP FUNCTION IF EXISTS trip_private.preview_room_ok();
DROP TRIGGER IF EXISTS trips_level_default ON public.trips;
DROP FUNCTION IF EXISTS trip_private.trip_level_trg();
ALTER TABLE public.trips DROP COLUMN IF EXISTS level;
