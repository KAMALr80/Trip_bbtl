-- Staging QA, Nov 12 2026 (STG-09, STG-10).
--
-- STG-09: removing a reported photo failed for every proof the crew had already approved.
-- moderate_photo moved the proof's points to 'rejected', but set_points_status only allows
-- approved -> void (pending -> rejected is the Crew Check path), so it raised
-- "Points can't go from approved to rejected" and the whole removal rolled back: the photo stayed
-- visible and the points stayed. Removal now voids approved points and rejects pending ones.
--
-- STG-10: disabling an account (setUserDisabled: user_blocks + Auth ban) stopped new sign-ins and
-- token refreshes, but an access token that was already issued kept working for up to an hour.
-- The three membership helpers every trip read and write goes through now treat a disabled
-- account as no member at all, so that token reaches no trip data from the moment of the disable.
--
-- Rollback: re-run the previous bodies (20261104130000_m6_moderation.sql for moderate_photo,
-- 00000000000000_baseline.sql for the three helpers).

-- Unchanged except for the points step.
CREATE OR REPLACE FUNCTION trip_private.moderate_photo(p_id uuid, p_action text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.photo_moderation; p public.proofs; v_points text;
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_action NOT IN ('approve', 'remove', 'warn') THEN RAISE EXCEPTION 'Pick approve, remove or warn'; END IF;
  SELECT * INTO m FROM public.photo_moderation WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not in the queue'; END IF;
  IF p_action IN ('approve', 'remove') THEN
    UPDATE public.photo_moderation
    SET status = CASE p_action WHEN 'approve' THEN 'approved' ELSE 'removed' END,
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    WHERE id = p_id;
  END IF;
  IF p_action = 'remove' THEN
    SELECT * INTO p FROM public.proofs WHERE id = m.proof_id;
    -- No points for removed content: approved points are voided, pending ones rejected.
    SELECT l.status INTO v_points FROM public.points_ledger l
    WHERE l.trip_id = p.trip_id AND l.user_id = p.user_id AND l.source = p.source
      AND l.source_ref IS NOT DISTINCT FROM p.schedule_id;
    IF v_points = 'approved' THEN
      PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'void');
    ELSIF v_points = 'pending' THEN
      PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'rejected');
    END IF;
    DELETE FROM public.postcard_picks WHERE proof_id = m.proof_id;
  END IF;
  INSERT INTO public.moderation_log (moderation_id, actor, action, note, subject_user)
  VALUES (p_id, auth.uid(), p_action, left(p_note, 500), m.uploader_id);
END
$$;

-- Unchanged except for the user_blocks check.
CREATE OR REPLACE FUNCTION trip_private.is_trip_member(p_trip uuid, p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = p_trip AND user_id = p_user AND status = 'approved')
          AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = p_user AND b.disabled) $$;

CREATE OR REPLACE FUNCTION trip_private.is_leader(p_trip uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role IN ('captain','co_captain'))
          AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = auth.uid() AND b.disabled) $$;

CREATE OR REPLACE FUNCTION trip_private.is_captain(p_trip uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain')
     AND NOT EXISTS (SELECT 1 FROM public.user_blocks b WHERE b.user_id = auth.uid() AND b.disabled) $$;
