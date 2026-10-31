-- M3-06 proofs + Crew Check and M3-14 the AI check hook (dev-docs/03 §8, R-411 – R-414, Q3).
-- A photo (or a line of text) proves a quest, mission or Showcase. The points go into the ledger as
-- pending; the first 👍 from another player approves them, and after 24h without one they're
-- rejected. Solo trips self-honor. An AI "pass" approves on its own; "unsure" and "fail" only flag.
-- rollback: SELECT cron.unschedule('expire-proofs'); DROP FUNCTION public.submit_proof(uuid, text, text),
--   public.approve_proof(uuid), public.crew_check(uuid), trip_private.submit_proof(uuid, text, text),
--   trip_private.approve_proof(uuid), trip_private.crew_check(uuid), trip_private.expire_proofs(),
--   public.record_proof_check(uuid, text, text, jsonb), trip_private.set_proof_ai(uuid, text, text, jsonb), trip_private.proof_kind(text), trip_private.proof_photo_ok(uuid, uuid);
--   DROP TABLE public.proof_votes, public.proofs; restore proof_read_ok / proof_upload_ok from the baseline.

CREATE TABLE public.proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  schedule_id uuid NOT NULL REFERENCES public.trip_schedule(id) ON DELETE CASCADE,
  part int NOT NULL DEFAULT 0 CHECK (part BETWEEN 0 AND 15),   -- a Bingo square / Scavenger find (M3-09)
  source text NOT NULL REFERENCES public.points_rules(source),
  photo_path text CHECK (photo_path IS NULL OR length(photo_path) <= 300),
  body text CHECK (length(body) <= 500),
  ai_status text NOT NULL DEFAULT 'not_needed' CHECK (ai_status IN ('not_needed', 'pending', 'pass', 'unsure', 'fail', 'error')),
  ai_reason text CHECK (length(ai_reason) <= 300),
  ai_flags jsonb,
  crew_status text NOT NULL DEFAULT 'waiting' CHECK (crew_status IN ('not_needed', 'waiting', 'approved', 'expired')),
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, user_id, part),
  CHECK (photo_path IS NOT NULL OR body IS NOT NULL)
);
CREATE INDEX proofs_waiting_idx ON public.proofs (trip_id, expires_at) WHERE crew_status = 'waiting';
ALTER TABLE public.proofs ENABLE ROW LEVEL SECURITY;
-- Players read their own proofs; the crew's come through crew_check.
CREATE POLICY "players read their own proofs" ON public.proofs FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.proofs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.proofs TO authenticated;
GRANT ALL ON public.proofs TO service_role;
CREATE TRIGGER proofs_archive_guard BEFORE INSERT OR UPDATE ON public.proofs
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

CREATE TABLE public.proof_votes (
  proof_id uuid NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proof_id, voter_id)
);
ALTER TABLE public.proof_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.proof_votes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.proof_votes TO service_role;

-- Which schedule kinds take a proof, the ledger source they earn, and its season ('phase' = the
-- season the trip is in when the proof is sent).
CREATE FUNCTION trip_private.proof_kind(p_kind text) RETURNS TABLE(source text, season text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT k.source, k.season FROM (VALUES
    ('sealed_quest', 'sealed_quest', 'preflight'),
    ('showcase', 'showcase', 'preflight'),
    ('airport_mission', 'airport_mission', 'trip_season'),
    ('home_mission', 'home_mission', 'trip_season'),
    ('trip_quest', 'trip_quest', 'trip_season'),
    ('ws_quest', 'ws_quest', 'phase')
  ) k(kind, source, season) WHERE k.kind = p_kind
$$;

-- Teen privacy (R-904): in a trip with minors a proof photo is seen by its owner, the leaders and
-- whoever approved it; otherwise by the whole crew.
CREATE FUNCTION trip_private.proof_photo_ok(p_proof uuid, p_viewer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proofs p JOIN public.trips t ON t.id = p.trip_id
    WHERE p.id = p_proof AND trip_private.is_trip_member(p.trip_id, p_viewer)
      AND (p.user_id = p_viewer OR p.approved_by = p_viewer OR NOT t.has_minors
           OR EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id = p.trip_id AND m.user_id = p_viewer
                      AND m.role IN ('captain', 'co_captain'))))
$$;
REVOKE ALL ON FUNCTION trip_private.proof_photo_ok(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.proof_photo_ok(uuid, uuid) TO authenticated, service_role;

-- Storage: proofs live at quest-proofs/<trip>/<user>/<schedule item>/<file>. Upload while the item
-- is yours (or the crew's) and open; read per proof_photo_ok. The older sealed-quest paths still work.
CREATE OR REPLACE FUNCTION trip_private.proof_upload_ok(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $_$
 SELECT p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' AND (EXISTS (
  SELECT 1 FROM public.sealed_quests q
  WHERE q.id::text=split_part(p_name,'/',3) AND q.trip_id::text=split_part(p_name,'/',1) AND q.user_id::text=split_part(p_name,'/',2)
   AND q.user_id=auth.uid() AND q.kind='sealed' AND q.opened_at IS NOT NULL AND q.submitted_at IS NULL
   AND now() < least(q.opened_at+interval '24 hours', trip_private.quest_cutoff(q.trip_id))
   AND trip_private.is_trip_member(q.trip_id, auth.uid()))
 OR EXISTS (SELECT 1 FROM public.trip_season_games g
  WHERE g.id::text=split_part(p_name,'/',3) AND g.trip_id::text=split_part(p_name,'/',1) AND split_part(p_name,'/',2)=auth.uid()::text
   AND trip_private.is_trip_member(g.trip_id, auth.uid()) AND g.day_date=trip_private.trip_today(g.trip_id))
 OR EXISTS (SELECT 1 FROM public.trip_schedule s
  WHERE s.id::text=split_part(p_name,'/',3) AND s.trip_id::text=split_part(p_name,'/',1) AND split_part(p_name,'/',2)=auth.uid()::text
   AND (s.user_id IS NULL OR s.user_id=auth.uid()) AND (EXISTS (SELECT 1 FROM trip_private.proof_kind(s.kind)) OR s.kind='surprise_drop')
   AND now() >= s.opens_at AND (s.closes_at IS NULL OR now() < s.closes_at)
   AND trip_private.is_trip_member(s.trip_id, auth.uid()))) $_$;

CREATE OR REPLACE FUNCTION trip_private.proof_read_ok(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $_$
 SELECT p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' AND (EXISTS (
 SELECT 1 FROM public.sealed_quests q WHERE q.id::text=split_part(p_name,'/',3) AND q.trip_id::text=split_part(p_name,'/',1) AND q.user_id::text=split_part(p_name,'/',2)
 AND trip_private.is_trip_member(q.trip_id,auth.uid()) AND (q.user_id=auth.uid() OR trip_private.is_leader(q.trip_id) OR (NOT trip_private.a2c_minor_trip(q.trip_id) AND q.proof_shared AND q.proof_path=p_name)))
 OR EXISTS (SELECT 1 FROM public.trip_season_games g WHERE g.id::text=split_part(p_name,'/',3) AND g.trip_id::text=split_part(p_name,'/',1)
 AND trip_private.is_trip_member(g.trip_id,auth.uid()) AND (split_part(p_name,'/',2)=auth.uid()::text OR trip_private.is_leader(g.trip_id)))
 OR EXISTS (SELECT 1 FROM public.proofs p WHERE p.photo_path=p_name AND trip_private.proof_photo_ok(p.id, auth.uid()))) $_$;

-- ---------------------------------------------------------------------------------------------
-- Send a proof for one of my open items. Returns the proof id. Re-sending replaces a proof that is
-- still waiting (a better photo); an approved one stays.
CREATE FUNCTION trip_private.submit_proof(p_item uuid, p_photo_path text, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.trip_schedule;
  t public.trips;
  k record;
  v_season text;
  v_solo boolean;
  v_id uuid;
  v_status text;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  IF NOT FOUND OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) OR (s.user_id IS NOT NULL AND s.user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'That isn''t one of your quests';
  END IF;
  SELECT * INTO k FROM trip_private.proof_kind(s.kind);
  IF NOT FOUND THEN RAISE EXCEPTION 'That card doesn''t take a proof'; END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'That quest hasn''t opened yet'; END IF;
  IF s.closes_at IS NOT NULL AND now() >= s.closes_at THEN RAISE EXCEPTION 'The time for this one has run out'; END IF;
  p_body := nullif(btrim(p_body), '');
  IF p_photo_path IS NULL AND p_body IS NULL THEN RAISE EXCEPTION 'Add a photo or a few words'; END IF;
  IF p_body IS NOT NULL AND NOT trip_private.content_text_safe(p_body) THEN RAISE EXCEPTION 'Please reword that'; END IF;
  IF p_photo_path IS NOT NULL AND (split_part(p_photo_path, '/', 1) <> s.trip_id::text OR split_part(p_photo_path, '/', 2) <> auth.uid()::text
     OR split_part(p_photo_path, '/', 3) <> s.id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'quest-proofs' AND o.name = p_photo_path)) THEN
    RAISE EXCEPTION 'Upload your photo first';
  END IF;

  SELECT * INTO t FROM public.trips WHERE id = s.trip_id;
  v_season := k.season;
  IF v_season = 'phase' THEN
    SELECT CASE phase WHEN 'preflight' THEN 'preflight' ELSE 'trip_season' END INTO v_season
    FROM trip_private.trip_phase(s.trip_id, now());
  END IF;
  -- Solo self-honors (R-414); so does a crew of one.
  v_solo := t.play_mode = 'solo'
    OR (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = s.trip_id AND m.status = 'approved') < 2;

  SELECT id, crew_status INTO v_id, v_status FROM public.proofs WHERE schedule_id = p_item AND user_id = auth.uid() AND part = 0;
  IF v_status IN ('approved', 'not_needed') THEN RETURN v_id; END IF;
  IF v_status = 'expired' THEN RAISE EXCEPTION 'The crew didn''t check this one in time'; END IF;
  INSERT INTO public.proofs (trip_id, user_id, schedule_id, source, photo_path, body, crew_status, approved_at, expires_at)
  VALUES (s.trip_id, auth.uid(), p_item, k.source, p_photo_path, p_body,
          CASE WHEN v_solo THEN 'not_needed' ELSE 'waiting' END, CASE WHEN v_solo THEN now() END, now() + interval '24 hours')
  ON CONFLICT (schedule_id, user_id, part) DO UPDATE
    SET photo_path = excluded.photo_path, body = excluded.body, ai_status = 'not_needed', ai_reason = NULL, ai_flags = NULL
  RETURNING id INTO v_id;

  IF s.points IS NOT NULL THEN
    PERFORM trip_private.award_points(s.trip_id, auth.uid(), v_season, k.source, s.id, s.points,
                                      CASE WHEN v_solo THEN 'approved' ELSE 'pending' END, now(), auth.uid());
  END IF;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION trip_private.submit_proof(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.submit_proof(uuid, text, text) TO authenticated, service_role;

-- Approve a proof (one 👍 from another approved player, R-411). A trip with minors: leaders only,
-- since only they see the photo. Returns true if this vote approved it.
CREATE FUNCTION trip_private.approve_proof(p_proof uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proofs; t public.trips;
BEGIN
  SELECT * INTO p FROM public.proofs WHERE id = p_proof FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_trip_member(p.trip_id, auth.uid()) THEN RAISE EXCEPTION 'That proof isn''t in your trip'; END IF;
  IF p.user_id = auth.uid() THEN RAISE EXCEPTION 'You can''t approve your own proof'; END IF;
  SELECT * INTO t FROM public.trips WHERE id = p.trip_id;
  IF t.has_minors AND p.photo_path IS NOT NULL AND NOT trip_private.is_leader(p.trip_id) THEN
    RAISE EXCEPTION 'In this trip the Captain or Co-Captain checks photos';
  END IF;
  IF p.crew_status = 'expired' OR (p.crew_status = 'waiting' AND now() >= p.expires_at) THEN
    RAISE EXCEPTION 'This one ran out of time';
  END IF;
  INSERT INTO public.proof_votes (proof_id, voter_id) VALUES (p_proof, auth.uid()) ON CONFLICT DO NOTHING;
  IF p.crew_status <> 'waiting' THEN RETURN false; END IF;
  UPDATE public.proofs SET crew_status = 'approved', approved_by = auth.uid(), approved_at = now() WHERE id = p_proof;
  PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'approved');
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION trip_private.approve_proof(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.approve_proof(uuid) TO authenticated, service_role;

-- The Crew Check card (R-412): other players' proofs still waiting, oldest first. Photos only for
-- those allowed to see them.
CREATE FUNCTION trip_private.crew_check(p_trip uuid)
RETURNS TABLE(id uuid, user_id uuid, schedule_id uuid, kind text, title text, photo_path text, body text,
              ai_status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN QUERY
    SELECT p.id, p.user_id, p.schedule_id, s.kind,
           trip_private.tailor_text(c.title, t),
           CASE WHEN trip_private.proof_photo_ok(p.id, auth.uid()) THEN p.photo_path END,
           p.body, p.ai_status, p.expires_at, p.created_at
    FROM public.proofs p
    JOIN public.trip_schedule s ON s.id = p.schedule_id
    JOIN public.trips t ON t.id = p.trip_id
    LEFT JOIN public.content_items c ON c.id = s.content_item_id
    WHERE p.trip_id = p_trip AND p.user_id <> auth.uid() AND p.crew_status = 'waiting' AND p.expires_at > now()
    ORDER BY p.created_at;
END
$$;
REVOKE ALL ON FUNCTION trip_private.crew_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.crew_check(uuid) TO authenticated, service_role;

-- 24h without a 👍 → not approved (R-411). pg_cron, every 5 minutes. Returns how many expired.
CREATE FUNCTION trip_private.expire_proofs() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p record; n int := 0;
BEGIN
  FOR p IN UPDATE public.proofs SET crew_status = 'expired'
           WHERE crew_status = 'waiting' AND expires_at <= now()
           RETURNING trip_id, user_id, source, schedule_id LOOP
    PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'rejected');
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;
REVOKE ALL ON FUNCTION trip_private.expire_proofs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.expire_proofs() TO service_role;
SELECT cron.schedule('expire-proofs', '*/5 * * * *', 'SELECT trip_private.expire_proofs();');

-- The AI check's verdict (M3-14; the server calls this with the service role). pass → approved;
-- unsure / fail stay in Crew Check, with fail flagged for the crew, never auto-rejected (Q3).
CREATE FUNCTION trip_private.set_proof_ai(p_proof uuid, p_verdict text, p_reason text, p_flags jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proofs;
BEGIN
  IF p_verdict NOT IN ('pass', 'unsure', 'fail', 'error') THEN RAISE EXCEPTION 'Unknown verdict %', p_verdict; END IF;
  UPDATE public.proofs SET ai_status = p_verdict, ai_reason = left(p_reason, 300), ai_flags = p_flags
  WHERE id = p_proof RETURNING * INTO p;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_verdict = 'pass' AND p.crew_status = 'waiting' THEN
    UPDATE public.proofs SET crew_status = 'approved', approved_at = now() WHERE id = p_proof;
    PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'approved');
  END IF;
END
$$;
REVOKE ALL ON FUNCTION trip_private.set_proof_ai(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.set_proof_ai(uuid, text, text, jsonb) TO service_role;

-- Public wrappers.
CREATE FUNCTION public.submit_proof(p_item uuid, p_photo_path text DEFAULT NULL, p_body text DEFAULT NULL) RETURNS uuid
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.submit_proof(p_item, p_photo_path, p_body) $$;
CREATE FUNCTION public.approve_proof(p_proof uuid) RETURNS boolean
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.approve_proof(p_proof) $$;
CREATE FUNCTION public.crew_check(p_trip uuid)
RETURNS TABLE(id uuid, user_id uuid, schedule_id uuid, kind text, title text, photo_path text, body text,
              ai_status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.crew_check(p_trip) $$;
REVOKE ALL ON FUNCTION public.submit_proof(uuid, text, text), public.approve_proof(uuid), public.crew_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_proof(uuid, text, text), public.approve_proof(uuid), public.crew_check(uuid)
  TO authenticated, service_role;

-- For the server's AI check (service role only).
CREATE FUNCTION public.record_proof_check(p_proof uuid, p_verdict text, p_reason text, p_flags jsonb DEFAULT NULL)
RETURNS void LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_proof_ai(p_proof, p_verdict, p_reason, p_flags) $$;
REVOKE ALL ON FUNCTION public.record_proof_check(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_proof_check(uuid, text, text, jsonb) TO service_role;
