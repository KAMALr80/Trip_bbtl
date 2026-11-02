-- M6-02 image moderation (R-905, flags only) and the server side of M6-01 AI proof checks.
--  * photo_moderation: one row per proof photo that was flagged by the AI safety check or reported
--    by a player. An AI flag hides the photo from everyone but its uploader and the app admins until
--    it is reviewed; a report only puts it in the queue. Nothing is ever deleted automatically.
--  * Reviewers (app admins) approve (visible again), remove (stays hidden for good and earns no
--    points) or warn (a note to the uploader's record); every action is in moderation_log.
--  * set_proof_ai: a photo with safety flags is never auto-approved by an AI "pass".
--  * proof_challenge: the text the AI checks a photo against (the Bingo square / Scavenger find /
--    photo prompt), for the server only.
-- rollback: DROP the functions below and TABLE public.moderation_log, public.photo_moderation; restore
--   proof_photo_ok and set_proof_ai from 20261030130000, postcard_rank / guide_items from 20261102100000.

CREATE TABLE public.photo_moderation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proof_id uuid NOT NULL UNIQUE REFERENCES public.proofs(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL,
  ai_flags text[] NOT NULL DEFAULT '{}',
  reports int NOT NULL DEFAULT 0,
  report_reasons text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'flagged' CHECK (status IN ('flagged', 'reported', 'approved', 'removed')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX photo_moderation_open_idx ON public.photo_moderation (created_at) WHERE status IN ('flagged', 'reported');
ALTER TABLE public.photo_moderation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_moderation FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.photo_moderation TO service_role;
CREATE TRIGGER photo_moderation_archive_guard BEFORE INSERT OR UPDATE ON public.photo_moderation
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- Who reported what (one report per player per photo), so reports can't be stuffed.
CREATE TABLE public.photo_moderation_reports (
  moderation_id uuid NOT NULL REFERENCES public.photo_moderation(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moderation_id, reporter_id)
);
ALTER TABLE public.photo_moderation_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_moderation_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.photo_moderation_reports TO service_role;

CREATE TABLE public.moderation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  moderation_id uuid REFERENCES public.photo_moderation(id) ON DELETE SET NULL,
  actor uuid,                           -- NULL: the AI check
  action text NOT NULL CHECK (action IN ('ai_flag', 'report', 'approve', 'remove', 'warn')),
  note text CHECK (length(note) <= 500),
  subject_user uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.moderation_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.moderation_log TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Hidden from others: flagged by the AI and not yet approved, or removed by a reviewer.
CREATE FUNCTION trip_private.photo_hidden(p_proof uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.photo_moderation m WHERE m.proof_id = p_proof AND m.status IN ('flagged', 'removed'))
$$;

-- Who may see a proof photo: its uploader; app admins (moderators); otherwise the crew, unless the
-- photo is hidden, and in a trip with minors only the leaders and the approver (R-904).
CREATE OR REPLACE FUNCTION trip_private.proof_photo_ok(p_proof uuid, p_viewer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proofs p JOIN public.trips t ON t.id = p.trip_id
    WHERE p.id = p_proof AND (
      (p_viewer = auth.uid() AND trip_private.is_app_admin())
      OR (trip_private.is_trip_member(p.trip_id, p_viewer)
          AND (p.user_id = p_viewer
               OR (NOT trip_private.photo_hidden(p.id)
                   AND (p.approved_by = p_viewer OR NOT t.has_minors
                        OR EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id = p.trip_id AND m.user_id = p_viewer
                                   AND m.role IN ('captain', 'co_captain'))))))))
$$;

-- The AI safety check flagged a photo (service role). Returns true when it is now hidden.
CREATE FUNCTION trip_private.record_photo_safety(p_proof uuid, p_flags text[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proofs; v_id uuid; v_flags text[] := ARRAY(SELECT DISTINCT left(f, 40) FROM unnest(coalesce(p_flags, '{}')) f WHERE f <> '');
BEGIN
  IF cardinality(v_flags) = 0 THEN RETURN false; END IF;
  SELECT * INTO p FROM public.proofs WHERE id = p_proof;
  IF NOT FOUND OR p.photo_path IS NULL THEN RETURN false; END IF;
  INSERT INTO public.photo_moderation (proof_id, trip_id, uploader_id, ai_flags, status)
  VALUES (p.id, p.trip_id, p.user_id, v_flags, 'flagged')
  ON CONFLICT (proof_id) DO UPDATE
    SET ai_flags = ARRAY(SELECT DISTINCT unnest(public.photo_moderation.ai_flags || excluded.ai_flags)),
        -- a reviewer's decision stands; a new flag re-opens only a reported or unreviewed photo
        status = CASE WHEN public.photo_moderation.status IN ('approved', 'removed') THEN public.photo_moderation.status ELSE 'flagged' END,
        updated_at = now()
  RETURNING id INTO v_id;
  INSERT INTO public.moderation_log (moderation_id, action, note, subject_user)
  VALUES (v_id, 'ai_flag', array_to_string(v_flags, ', '), p.user_id);
  RETURN trip_private.photo_hidden(p.id);
END
$$;

-- AI verdicts (Q3): pass approves, unsure / fail only flag for the crew. Safety flags hide the photo
-- for review and stop a "pass" from approving it.
CREATE OR REPLACE FUNCTION trip_private.set_proof_ai(p_proof uuid, p_verdict text, p_reason text, p_flags jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proofs; v_safety text[];
BEGIN
  IF p_verdict NOT IN ('pass', 'unsure', 'fail', 'error') THEN RAISE EXCEPTION 'Unknown verdict %', p_verdict; END IF;
  v_safety := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_flags->'safety', '[]'::jsonb)));
  IF cardinality(v_safety) > 0 AND p_verdict = 'pass' THEN p_verdict := 'unsure'; END IF;
  UPDATE public.proofs SET ai_status = p_verdict, ai_reason = left(p_reason, 300), ai_flags = p_flags
  WHERE id = p_proof RETURNING * INTO p;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM trip_private.record_photo_safety(p_proof, v_safety);
  IF p_verdict = 'pass' AND p.crew_status = 'waiting' THEN
    UPDATE public.proofs SET crew_status = 'approved', approved_at = now() WHERE id = p_proof;
    PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'approved');
  END IF;
END
$$;

-- What the AI checks a photo against, and whether it needs a verdict at all (Bingo, Scavenger and
-- Photo Challenge drops only; every other photo gets the safety check only).
CREATE FUNCTION trip_private.proof_challenge(p_proof uuid) RETURNS TABLE(challenge text, needs_verdict boolean, trip_id uuid, user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(CASE WHEN s.variant IN ('bingo', 'scavenger') AND cardinality(c.items) > p.part THEN c.items[p.part + 1] END,
                  s.tailored_text, c.title, ''),
         p.ai_status = 'pending', p.trip_id, p.user_id
  FROM public.proofs p
  JOIN public.trip_schedule s ON s.id = p.schedule_id
  LEFT JOIN public.content_items c ON c.id = s.content_item_id
  WHERE p.id = p_proof
$$;

-- A player reports a crew photo (keeps R-905's "Report"). It goes to the queue; it doesn't hide the
-- photo on its own. One report per player per photo.
CREATE FUNCTION trip_private.report_proof_photo(p_proof uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proofs; v_id uuid; v_reason text := left(trip_private.trim_answer(p_reason), 200);
BEGIN
  SELECT * INTO p FROM public.proofs WHERE id = p_proof;
  IF NOT FOUND OR p.photo_path IS NULL OR NOT trip_private.proof_photo_ok(p_proof, auth.uid()) OR p.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You can report a crew photo you can see';
  END IF;
  INSERT INTO public.photo_moderation (proof_id, trip_id, uploader_id, status)
  VALUES (p.id, p.trip_id, p.user_id, 'reported')
  ON CONFLICT (proof_id) DO NOTHING;
  SELECT id INTO v_id FROM public.photo_moderation WHERE proof_id = p_proof;
  INSERT INTO public.photo_moderation_reports (moderation_id, reporter_id) VALUES (v_id, auth.uid()) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.photo_moderation
  SET reports = reports + 1,
      report_reasons = CASE WHEN v_reason <> '' THEN (report_reasons || v_reason)[1:20] ELSE report_reasons END,
      status = CASE WHEN status = 'approved' THEN 'reported' ELSE status END,
      updated_at = now()
  WHERE id = v_id;
  INSERT INTO public.moderation_log (moderation_id, actor, action, note, subject_user)
  VALUES (v_id, auth.uid(), 'report', nullif(v_reason, ''), p.user_id);
END
$$;

-- The review queue (app admins): open items first, with context.
CREATE FUNCTION trip_private.moderation_queue(p_include_closed boolean DEFAULT false)
RETURNS TABLE(id uuid, proof_id uuid, trip_id uuid, trip_name text, uploader_id uuid, uploader_name text,
              photo_path text, challenge text, body text, ai_flags text[], reports int, report_reasons text[],
              status text, created_at timestamptz, has_minors boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
    SELECT m.id, m.proof_id, m.trip_id, t.name, m.uploader_id, coalesce(pp.game_name, 'Traveler'),
           p.photo_path, (SELECT ch.challenge FROM trip_private.proof_challenge(p.id) ch), p.body,
           m.ai_flags, m.reports, m.report_reasons, m.status, m.created_at, t.has_minors
    FROM public.photo_moderation m
    JOIN public.proofs p ON p.id = m.proof_id
    JOIN public.trips t ON t.id = m.trip_id
    LEFT JOIN public.player_profiles pp ON pp.user_id = m.uploader_id
    WHERE p_include_closed OR m.status IN ('flagged', 'reported')
    ORDER BY (m.status = 'flagged') DESC, m.created_at
    LIMIT 200;
END
$$;

-- A reviewer's decision. remove also takes the photo's points away (no points for removed content).
CREATE FUNCTION trip_private.moderate_photo(p_id uuid, p_action text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m public.photo_moderation; p public.proofs;
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
    PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'rejected');
    DELETE FROM public.postcard_picks WHERE proof_id = m.proof_id;
  END IF;
  INSERT INTO public.moderation_log (moderation_id, actor, action, note, subject_user)
  VALUES (p_id, auth.uid(), p_action, left(p_note, 500), m.uploader_id);
END
$$;

-- Picks and the guide skip hidden photos.
CREATE OR REPLACE FUNCTION trip_private.postcard_rank(p_trip uuid)
RETURNS TABLE(proof_id uuid, user_id uuid, photo_path text, hearts int, favored boolean, created_at timestamptz, pos int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT x.*, (row_number() OVER (ORDER BY x.hearts DESC, x.favored DESC, x.created_at, x.proof_id))::int
  FROM (
    SELECT p.id AS proof_id, p.user_id, p.photo_path,
           (SELECT count(*)::int FROM public.postcard_hearts h WHERE h.proof_id = p.id) AS hearts,
           coalesce(p.id = ANY (c.favored), false) AS favored, p.created_at
    FROM public.postcard_picks k
    JOIN public.proofs p ON p.id = k.proof_id
    LEFT JOIN public.postcard_choices c ON c.trip_id = p_trip
    WHERE k.trip_id = p_trip AND p.photo_path IS NOT NULL AND p.photo_removed_at IS NULL AND p.crew_status <> 'expired'
      AND NOT trip_private.photo_hidden(p.id)
  ) x
$$;

CREATE OR REPLACE FUNCTION trip_private.guide_items(p_trip uuid, p_public boolean)
RETURNS TABLE(day date, kind text, user_id uuid, author text, prompt text, body text, photo_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH t AS (SELECT * FROM public.trips WHERE id = p_trip),
  names AS (
    SELECT m.user_id, coalesce(c.game_name, pp.game_name, 'Traveler') AS name,
           coalesce(g.show_name, false) AS show_name, coalesce(g.share_photos, false) AS share_photos
    FROM public.trip_members m
    LEFT JOIN public.trip_player_cards c ON c.trip_id = m.trip_id AND c.user_id = m.user_id
    LEFT JOIN public.player_profiles pp ON pp.user_id = m.user_id
    LEFT JOIN public.guide_prefs g ON g.trip_id = m.trip_id AND g.user_id = m.user_id
    WHERE m.trip_id = p_trip AND m.status = 'approved'
  )
  SELECT j.day, 'journal', CASE WHEN p_public THEN NULL ELSE j.user_id END,
         CASE WHEN NOT p_public OR n.show_name THEN n.name END, j.prompt, j.body, NULL::text
  FROM public.journal_entries j JOIN names n ON n.user_id = j.user_id
  WHERE j.trip_id = p_trip
  UNION ALL
  SELECT s.day, 'photo', CASE WHEN p_public THEN NULL ELSE p.user_id END,
         CASE WHEN NOT p_public OR n.show_name THEN n.name END, NULL, p.body, p.photo_path
  FROM public.proofs p
  JOIN public.trip_schedule s ON s.id = p.schedule_id
  JOIN names n ON n.user_id = p.user_id
  CROSS JOIN t
  WHERE p.trip_id = p_trip AND p.photo_path IS NOT NULL AND p.photo_removed_at IS NULL AND NOT trip_private.photo_hidden(p.id)
    AND p.crew_status IN ('approved', 'not_needed')
    AND s.kind IN ('ws_quest', 'home_mission', 'airport_mission', 'surprise_drop', 'trip_quest')
    AND (NOT p_public OR (n.share_photos AND NOT t.has_minors))
  ORDER BY 1, 2 DESC
$$;

-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION trip_private.photo_hidden(uuid), trip_private.record_photo_safety(uuid, text[]),
  trip_private.proof_challenge(uuid), trip_private.report_proof_photo(uuid, text),
  trip_private.moderation_queue(boolean), trip_private.moderate_photo(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.photo_hidden(uuid), trip_private.report_proof_photo(uuid, text),
  trip_private.moderation_queue(boolean), trip_private.moderate_photo(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.record_photo_safety(uuid, text[]), trip_private.proof_challenge(uuid) TO service_role;

CREATE FUNCTION public.report_proof_photo(p_proof uuid, p_reason text DEFAULT NULL) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.report_proof_photo(p_proof, p_reason) $$;
CREATE FUNCTION public.moderation_queue(p_include_closed boolean DEFAULT false)
RETURNS TABLE(id uuid, proof_id uuid, trip_id uuid, trip_name text, uploader_id uuid, uploader_name text,
              photo_path text, challenge text, body text, ai_flags text[], reports int, report_reasons text[],
              status text, created_at timestamptz, has_minors boolean)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.moderation_queue(p_include_closed) $$;
CREATE FUNCTION public.moderate_photo(p_id uuid, p_action text, p_note text DEFAULT NULL) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.moderate_photo(p_id, p_action, p_note) $$;
-- Server only (the AI check route).
CREATE FUNCTION public.record_photo_safety(p_proof uuid, p_flags text[]) RETURNS boolean
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.record_photo_safety(p_proof, p_flags) $$;
CREATE FUNCTION public.proof_challenge(p_proof uuid) RETURNS TABLE(challenge text, needs_verdict boolean, trip_id uuid, user_id uuid)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.proof_challenge(p_proof) $$;
REVOKE ALL ON FUNCTION public.report_proof_photo(uuid, text), public.moderation_queue(boolean),
  public.moderate_photo(uuid, text, text), public.record_photo_safety(uuid, text[]), public.proof_challenge(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_proof_photo(uuid, text), public.moderation_queue(boolean),
  public.moderate_photo(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_photo_safety(uuid, text[]), public.proof_challenge(uuid) TO service_role;
