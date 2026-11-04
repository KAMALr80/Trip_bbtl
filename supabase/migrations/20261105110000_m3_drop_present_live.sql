-- R-343 (M3-09): a Surprise Drop can be proven by presenting it live at the next Game Night Live
-- instead of with photos. Founder defaults (Nov 3, 2026):
--  * All four games. While the drop is open a player taps "I'll present it live": one claim row in
--    proofs (part 0, live = true) instead of photos. A player does one or the other for a drop.
--  * The crew can't 👍 a live claim from Crew Check. A 👍 on the player at a Game Night Live
--    (live_present) approves it and writes a flat 10 pts: the drop counts as completed, without the
--    bonuses, which need per-square photos, a finish order or photo votes. Live claims take no part
--    in the Speed / Photo placings.
--  * A claim nobody 👍'd by the time the Trip Season crown is decided expires: 0 pts (as R-411).
--  * Solo players send photos (no Game Night Live for them, R-365).
-- rollback: DROP FUNCTION public.claim_drop_live(uuid), trip_private.claim_drop_live(uuid); restore
--   submit_drop_proof / drop_points / settle_drops / crew_check / approve_proof / expire_proofs from
--   20261030150000 and live_present from 20261030140000; ALTER TABLE public.proofs DROP COLUMN live.

ALTER TABLE public.proofs ADD COLUMN live boolean NOT NULL DEFAULT false;   -- a drop presented at Game Night Live

-- ---------------------------------------------------------------------------------------------
-- Claim: I'll present this drop live. Returns the claim (the same one if tapped again).
CREATE FUNCTION trip_private.claim_drop_live(p_item uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.trip_schedule; t public.trips; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  IF NOT FOUND OR s.kind <> 'surprise_drop' OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'That drop isn''t in your trip';
  END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'That drop hasn''t opened yet'; END IF;
  IF now() >= s.closes_at THEN RAISE EXCEPTION 'This drop has closed'; END IF;
  SELECT * INTO t FROM public.trips WHERE id = s.trip_id;
  IF t.play_mode = 'solo'
     OR (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = s.trip_id AND m.status = 'approved') < 2 THEN
    RAISE EXCEPTION 'Playing solo, send a photo instead';
  END IF;
  SELECT id INTO v_id FROM public.proofs WHERE schedule_id = p_item AND user_id = auth.uid() AND live;
  IF FOUND THEN RETURN v_id; END IF;
  IF EXISTS (SELECT 1 FROM public.proofs WHERE schedule_id = p_item AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You''ve already sent photos for this drop';
  END IF;
  INSERT INTO public.proofs (trip_id, user_id, schedule_id, part, source, body, live, crew_status, expires_at)
  VALUES (s.trip_id, auth.uid(), p_item, 0, 'surprise_drop', 'Presenting it live at Game Night', true, 'waiting', 'infinity')
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- No photos for a drop I'm presenting live (the rest as in 20261030150000).
CREATE OR REPLACE FUNCTION trip_private.submit_drop_proof(p_item uuid, p_part int, p_photo_path text, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.trip_schedule; t public.trips; c public.content_items; v_solo boolean; v_id uuid; v_status text;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  IF NOT FOUND OR s.kind <> 'surprise_drop' OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'That drop isn''t in your trip';
  END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'That drop hasn''t opened yet'; END IF;
  IF now() >= s.closes_at THEN RAISE EXCEPTION 'This drop has closed'; END IF;
  IF EXISTS (SELECT 1 FROM public.proofs WHERE schedule_id = p_item AND user_id = auth.uid() AND live) THEN
    RAISE EXCEPTION 'You''re presenting this one live';
  END IF;
  SELECT * INTO c FROM public.content_items WHERE id = s.content_item_id;
  IF s.variant IN ('bingo', 'scavenger') THEN
    IF p_part IS NULL OR p_part < 0 OR p_part >= cardinality(c.items) THEN RAISE EXCEPTION 'Pick a square'; END IF;
  ELSE
    p_part := 0;
  END IF;
  p_body := nullif(btrim(p_body), '');
  IF p_photo_path IS NULL AND (p_body IS NULL OR s.variant <> 'speed') THEN RAISE EXCEPTION 'Add a photo'; END IF;
  IF p_body IS NOT NULL AND NOT trip_private.content_text_safe(p_body) THEN RAISE EXCEPTION 'Please reword that'; END IF;
  IF p_photo_path IS NOT NULL AND (split_part(p_photo_path, '/', 1) <> s.trip_id::text OR split_part(p_photo_path, '/', 2) <> auth.uid()::text
     OR split_part(p_photo_path, '/', 3) <> s.id::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'quest-proofs' AND o.name = p_photo_path)) THEN
    RAISE EXCEPTION 'Upload your photo first';
  END IF;
  SELECT * INTO t FROM public.trips WHERE id = s.trip_id;
  v_solo := t.play_mode = 'solo'
    OR (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = s.trip_id AND m.status = 'approved') < 2;
  SELECT id, crew_status INTO v_id, v_status FROM public.proofs WHERE schedule_id = p_item AND user_id = auth.uid() AND part = p_part;
  IF v_status IN ('approved', 'not_needed', 'expired') THEN RETURN v_id; END IF;
  INSERT INTO public.proofs (trip_id, user_id, schedule_id, part, source, photo_path, body, ai_status, crew_status, approved_at, expires_at)
  VALUES (s.trip_id, auth.uid(), p_item, p_part, 'surprise_drop', p_photo_path, p_body,
          CASE WHEN p_photo_path IS NOT NULL AND s.variant IN ('bingo', 'scavenger', 'photo') THEN 'pending' ELSE 'not_needed' END,
          CASE WHEN v_solo THEN 'not_needed' ELSE 'waiting' END, CASE WHEN v_solo THEN now() END, now() + interval '24 hours')
  ON CONFLICT (schedule_id, user_id, part) DO UPDATE SET photo_path = excluded.photo_path, body = excluded.body,
    ai_status = excluded.ai_status, ai_reason = NULL, ai_flags = NULL, created_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- A drop presented live scores a flat 10 once 👍'd; live claims take no part in the placings.
CREATE OR REPLACE FUNCTION trip_private.drop_points(p_item uuid, p_user uuid) RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.trip_schedule; c public.content_items;
  v_marked int[]; v_n int; v_size int; v_lines int; v_bonus int := 0; v_place int; v_votes int; v_rank int;
  v_live text;
BEGIN
  SELECT crew_status INTO v_live FROM public.proofs WHERE schedule_id = p_item AND user_id = p_user AND live;
  IF FOUND THEN RETURN CASE WHEN v_live = 'approved' THEN 10 ELSE 0 END; END IF;
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  SELECT * INTO c FROM public.content_items WHERE id = s.content_item_id;
  SELECT array_agg(part ORDER BY part) INTO v_marked FROM public.proofs
  WHERE schedule_id = p_item AND user_id = p_user AND crew_status IN ('approved', 'not_needed');
  v_n := coalesce(cardinality(v_marked), 0);
  IF v_n = 0 THEN RETURN 0; END IF;
  CASE s.variant
    WHEN 'bingo' THEN
      v_size := round(sqrt(cardinality(c.items)))::int;
      v_lines := trip_private.bingo_lines(v_marked, v_size);
      IF v_lines = 0 THEN RETURN 0; END IF;
      v_bonus := 4 * (v_lines - 1) + CASE WHEN v_n = cardinality(c.items) THEN 8 ELSE 0 END;
    WHEN 'scavenger' THEN
      IF v_n * 2 < cardinality(c.items) THEN RETURN 0; END IF;
      v_bonus := 3 * (v_n - ceil(cardinality(c.items) / 2.0)::int) + CASE WHEN v_n = cardinality(c.items) THEN 5 ELSE 0 END;
    WHEN 'speed' THEN
      SELECT x.place INTO v_place FROM (
        SELECT p.user_id, rank() OVER (ORDER BY p.created_at) AS place FROM public.proofs p
        WHERE p.schedule_id = p_item AND p.crew_status IN ('approved', 'not_needed') AND NOT p.live) x
      WHERE x.user_id = p_user;
      v_bonus := CASE v_place WHEN 1 THEN 15 WHEN 2 THEN 10 WHEN 3 THEN 5 ELSE 0 END;
    WHEN 'photo' THEN
      SELECT x.r INTO v_rank FROM (
        SELECT p.user_id, dense_rank() OVER (ORDER BY (SELECT count(*) FROM public.proof_votes v WHERE v.proof_id = p.id) DESC) AS r,
               (SELECT count(*) FROM public.proof_votes v WHERE v.proof_id = p.id) AS votes
        FROM public.proofs p WHERE p.schedule_id = p_item AND p.crew_status IN ('approved', 'not_needed') AND NOT p.live) x
      WHERE x.user_id = p_user AND x.votes > 0;
      v_bonus := CASE v_rank WHEN 1 THEN 15 WHEN 2 THEN 8 ELSE 0 END;
    ELSE NULL;
  END CASE;
  RETURN least(33, 10 + greatest(v_bonus, 0));
END
$$;

-- A live claim waits for the next Game Night, not for the crew, so it doesn't hold the drop's
-- scoring back; a 👍 later writes its points directly (live_present).
CREATE OR REPLACE FUNCTION trip_private.settle_drops() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d record; p record; v_points int; n int := 0;
BEGIN
  FOR d IN
    SELECT s.* FROM public.trip_schedule s
    WHERE s.kind = 'surprise_drop' AND s.settled_at IS NULL AND s.closes_at <= now()
      AND NOT EXISTS (SELECT 1 FROM public.proofs x WHERE x.schedule_id = s.id AND x.crew_status = 'waiting' AND x.expires_at > now()
                        AND NOT x.live)
  LOOP
    FOR p IN SELECT DISTINCT user_id FROM public.proofs WHERE schedule_id = d.id LOOP
      v_points := trip_private.drop_points(d.id, p.user_id);
      IF v_points > 0 AND trip_private.is_trip_member(d.trip_id, p.user_id) THEN
        PERFORM trip_private.award_points(d.trip_id, p.user_id, 'trip_season', 'surprise_drop', d.id, v_points,
                                          'approved', d.closes_at, NULL);
      END IF;
    END LOOP;
    UPDATE public.trip_schedule SET settled_at = now() WHERE id = d.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

-- Crew Check leaves live claims out: they're approved at Game Night Live.
CREATE OR REPLACE FUNCTION trip_private.crew_check(p_trip uuid)
RETURNS TABLE(id uuid, user_id uuid, schedule_id uuid, kind text, title text, photo_path text, body text,
              ai_status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN QUERY
    SELECT p.id, p.user_id, p.schedule_id, s.kind,
           trip_private.tailor_text(c.title, t)
             || CASE WHEN s.kind = 'surprise_drop' AND cardinality(c.items) > p.part AND s.variant IN ('bingo', 'scavenger')
                     THEN ' · ' || c.items[p.part + 1] ELSE '' END,
           CASE WHEN trip_private.proof_photo_ok(p.id, auth.uid()) THEN p.photo_path END,
           p.body, p.ai_status, p.expires_at, p.created_at
    FROM public.proofs p
    JOIN public.trip_schedule s ON s.id = p.schedule_id
    JOIN public.trips t ON t.id = p.trip_id
    LEFT JOIN public.content_items c ON c.id = s.content_item_id
    WHERE p.trip_id = p_trip AND p.user_id <> auth.uid() AND NOT p.live
      AND ((p.crew_status = 'waiting' AND p.expires_at > now())
           OR (s.kind = 'surprise_drop' AND s.variant = 'photo' AND s.closes_at > now()
               AND NOT EXISTS (SELECT 1 FROM public.proof_votes v WHERE v.proof_id = p.id AND v.voter_id = auth.uid())))
    ORDER BY p.created_at;
END
$$;

CREATE OR REPLACE FUNCTION trip_private.approve_proof(p_proof uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proofs; t public.trips; s public.trip_schedule;
BEGIN
  SELECT * INTO p FROM public.proofs WHERE id = p_proof FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_trip_member(p.trip_id, auth.uid()) THEN RAISE EXCEPTION 'That proof isn''t in your trip'; END IF;
  IF p.user_id = auth.uid() THEN RAISE EXCEPTION 'You can''t approve your own proof'; END IF;
  IF p.live THEN RAISE EXCEPTION 'This one is presented live at Game Night'; END IF;
  SELECT * INTO t FROM public.trips WHERE id = p.trip_id;
  SELECT * INTO s FROM public.trip_schedule WHERE id = p.schedule_id;
  IF t.has_minors AND p.photo_path IS NOT NULL AND NOT trip_private.is_leader(p.trip_id) THEN
    RAISE EXCEPTION 'In this trip the Captain or Co-Captain checks photos';
  END IF;
  IF p.crew_status = 'expired' OR (p.crew_status = 'waiting' AND now() >= p.expires_at) THEN
    RAISE EXCEPTION 'This one ran out of time';
  END IF;
  IF s.kind = 'surprise_drop' AND s.settled_at IS NOT NULL THEN RAISE EXCEPTION 'This drop has been scored'; END IF;
  INSERT INTO public.proof_votes (proof_id, voter_id) VALUES (p_proof, auth.uid()) ON CONFLICT DO NOTHING;
  IF p.crew_status <> 'waiting' THEN RETURN false; END IF;
  UPDATE public.proofs SET crew_status = 'approved', approved_by = auth.uid(), approved_at = now() WHERE id = p_proof;
  IF p.source <> 'surprise_drop' THEN
    PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'approved');
  END IF;
  RETURN true;
END
$$;

-- Live claims never reach expires_at; they expire once the Trip Season crown is decided.
CREATE OR REPLACE FUNCTION trip_private.expire_proofs() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p record; n int := 0; v_live int;
BEGIN
  FOR p IN UPDATE public.proofs SET crew_status = 'expired'
           WHERE crew_status = 'waiting' AND expires_at <= now()
           RETURNING trip_id, user_id, source, schedule_id LOOP
    IF p.source <> 'surprise_drop' THEN
      PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'rejected');
    END IF;
    n := n + 1;
  END LOOP;
  UPDATE public.proofs x SET crew_status = 'expired'
  WHERE x.live AND x.crew_status = 'waiting'
    AND EXISTS (SELECT 1 FROM public.trip_crownings c WHERE c.trip_id = x.trip_id AND c.season = 'trip_season');
  GET DIAGNOSTICS v_live = ROW_COUNT;
  RETURN n + v_live;
END
$$;

-- 👍 a crewmate after they present (R-402), as in 20261030140000, plus R-343: any 👍 approves the
-- drops they claimed to present live and writes 10 pts for each.
CREATE OR REPLACE FUNCTION trip_private.live_present(p_session uuid, p_presenter uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE l public.live_sessions; s public.trip_schedule; v_first boolean; d record;
BEGIN
  SELECT * INTO l FROM public.live_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_trip_member(l.trip_id, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF l.status <> 'open' THEN RAISE EXCEPTION 'This Game Night has closed'; END IF;
  IF p_presenter = auth.uid() THEN RAISE EXCEPTION 'You can''t tap your own avatar'; END IF;
  IF NOT trip_private.is_trip_member(l.trip_id, p_presenter) THEN RAISE EXCEPTION 'They aren''t in this trip'; END IF;
  v_first := NOT EXISTS (SELECT 1 FROM public.live_presents WHERE session_id = p_session AND presenter_id = p_presenter);
  INSERT INTO public.live_presents (session_id, presenter_id, voter_id) VALUES (p_session, p_presenter, auth.uid())
  ON CONFLICT DO NOTHING;

  FOR d IN UPDATE public.proofs SET crew_status = 'approved', approved_by = auth.uid(), approved_at = now()
           WHERE trip_id = l.trip_id AND user_id = p_presenter AND live AND crew_status = 'waiting'
           RETURNING schedule_id LOOP
    PERFORM trip_private.award_points(l.trip_id, p_presenter, 'trip_season', 'surprise_drop', d.schedule_id, 10,
                                      'approved', now(), auth.uid());
  END LOOP;
  IF NOT v_first THEN RETURN false; END IF;

  PERFORM trip_private.award_points(l.trip_id, p_presenter, l.season, 'game_night_present', l.id, 20, 'approved', now(), auth.uid());
  SELECT * INTO s FROM public.trip_schedule
  WHERE trip_id = l.trip_id AND user_id = p_presenter AND opens_at <= now()
    AND ((NOT l.is_crowning AND kind = 'sealed_quest' AND ref_id = l.call_night_id) OR (l.is_crowning AND kind = 'trip_quest'))
  LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.proofs (trip_id, user_id, schedule_id, source, body, crew_status, approved_by, approved_at, expires_at)
    VALUES (l.trip_id, p_presenter, s.id, CASE s.kind WHEN 'trip_quest' THEN 'trip_quest' ELSE 'sealed_quest' END,
            'Presented live', 'approved', auth.uid(), now(), now())
    ON CONFLICT (schedule_id, user_id, part) DO UPDATE
      SET crew_status = 'approved', approved_by = excluded.approved_by, approved_at = now()
      WHERE public.proofs.crew_status = 'waiting';
    IF s.points IS NOT NULL THEN
      IF trip_private.award_points(l.trip_id, p_presenter, CASE s.kind WHEN 'trip_quest' THEN 'trip_season' ELSE 'preflight' END,
                                   CASE s.kind WHEN 'trip_quest' THEN 'trip_quest' ELSE 'sealed_quest' END, s.id, s.points,
                                   'approved', now(), auth.uid()) IS NOT NULL THEN
        PERFORM trip_private.set_points_status(l.trip_id, p_presenter, CASE s.kind WHEN 'trip_quest' THEN 'trip_quest' ELSE 'sealed_quest' END,
                                               s.id, 'approved');
      END IF;
    END IF;
  END IF;
  RETURN true;
END
$$;

-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION trip_private.claim_drop_live(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.claim_drop_live(uuid) TO authenticated, service_role;
CREATE FUNCTION public.claim_drop_live(p_item uuid) RETURNS uuid
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.claim_drop_live(p_item) $$;
REVOKE ALL ON FUNCTION public.claim_drop_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_drop_live(uuid) TO authenticated, service_role;
