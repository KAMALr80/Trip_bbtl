-- M3-05 sealed quests (reveal + speed bonus), M3-08 missions one at a time, M3-09 Surprise Drop
-- proofs and scoring, M3-10 trip quest share toggle.
--  * Sealed quests, Airport / Home Missions and trip quests stay sealed until the player taps Open
--    (revealed_at). A sealed quest opened within 3h of its drop earns +5 (sealed_speed, R-322).
--    Missions open in order: 2 only after 1 (R-331).
--  * Surprise Drops take a proof per Bingo square / Scavenger find, or one for Speed / Photo. When the
--    drop has closed and its proofs are settled, drop_points scores each player (10–33, Q4).
--  * A trip quest can be shared with the crew or kept a surprise (R-344).
-- rollback: SELECT cron.unschedule('settle-drops'); DROP FUNCTION public.open_item(uuid), public.submit_drop_proof(uuid, int, text, text),
--   public.share_trip_quest(uuid, boolean) and their trip_private bodies, trip_private.drop_points(uuid, uuid),
--   trip_private.bingo_lines(int[], int), trip_private.settle_drops(); ALTER TABLE public.trip_schedule DROP COLUMN shared,
--   DROP COLUMN settled_at; restore my_schedule / crew_check / proof_upload_ok from 20261030110000 / 20261030130000.

ALTER TABLE public.trip_schedule
  ADD COLUMN shared boolean NOT NULL DEFAULT false,     -- a trip quest the owner shared with the crew
  ADD COLUMN settled_at timestamptz;                    -- a Surprise Drop whose points are written
GRANT SELECT (shared, settled_at) ON public.trip_schedule TO authenticated;

-- Speed bonus and the 4-ish Surprise Drop bonus need no new points rules; sealed_speed exists.

-- ---------------------------------------------------------------------------------------------
-- Open (reveal) one of my sealed items. Returns true the first time.
CREATE FUNCTION trip_private.open_item(p_item uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.trip_schedule;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item FOR UPDATE;
  IF NOT FOUND OR s.user_id IS DISTINCT FROM auth.uid() OR NOT trip_private.is_trip_member(s.trip_id, auth.uid())
     OR s.kind NOT IN ('sealed_quest', 'airport_mission', 'home_mission', 'trip_quest') THEN
    RAISE EXCEPTION 'That isn''t one of your sealed cards';
  END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'Not yet: it drops %', to_char(s.opens_at, 'Dy HH24:MI TZ'); END IF;
  IF s.closes_at IS NOT NULL AND now() >= s.closes_at THEN RAISE EXCEPTION 'This one has closed'; END IF;
  IF s.revealed_at IS NOT NULL THEN RETURN false; END IF;
  IF s.kind IN ('airport_mission', 'home_mission') AND s.slot <> '1' AND NOT EXISTS (
       SELECT 1 FROM public.trip_schedule p WHERE p.trip_id = s.trip_id AND p.user_id = s.user_id AND p.kind = s.kind
         AND p.slot = (s.slot::int - 1)::text AND p.revealed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Open Mission % first', s.slot::int - 1;
  END IF;
  UPDATE public.trip_schedule SET revealed_at = now(), updated_at = now() WHERE id = p_item;
  IF s.kind = 'sealed_quest' AND now() < s.opens_at + interval '3 hours' THEN
    PERFORM trip_private.award_points(s.trip_id, auth.uid(), 'preflight', 'sealed_speed', s.id, 5, 'approved', now(), auth.uid());
  END IF;
  RETURN true;
END
$$;

-- Share my trip quest with the crew, or keep it a surprise for the crowning dinner (R-344).
CREATE FUNCTION trip_private.share_trip_quest(p_item uuid, p_shared boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.trip_schedule SET shared = p_shared, updated_at = now()
  WHERE id = p_item AND kind = 'trip_quest' AND user_id = auth.uid() AND revealed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open your trip quest first'; END IF;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- my_schedule: sealed kinds show their text only once revealed; shared trip quests show to the crew.
CREATE OR REPLACE FUNCTION trip_private.my_schedule(p_trip uuid, p_at timestamptz DEFAULT NULL)
RETURNS TABLE(id uuid, kind text, slot text, user_id uuid, day date, opens_at timestamptz, closes_at timestamptz,
              ref_id uuid, variant text, points int, is_open boolean, title text, body text, insight text,
              choices text[], items text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; v_at timestamptz := coalesce(p_at, now());
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF v_at > now() + interval '1 minute' AND NOT trip_private.is_leader(p_trip) THEN v_at := now(); END IF;
  SELECT * INTO t FROM public.trips WHERE trips.id = p_trip;
  RETURN QUERY
    WITH visible AS (
      SELECT s.*, s.opens_at <= v_at
               AND (s.kind NOT IN ('sealed_quest', 'airport_mission', 'home_mission', 'trip_quest') OR s.revealed_at IS NOT NULL) AS shown
      FROM public.trip_schedule s
      WHERE s.trip_id = p_trip
        AND (s.user_id IS NULL OR s.user_id = auth.uid() OR (s.kind = 'trip_quest' AND s.shared))
    )
    SELECT s.id, s.kind, s.slot, s.user_id, s.day, s.opens_at, s.closes_at, s.ref_id, s.variant, s.points,
           s.opens_at <= v_at,
           CASE WHEN s.shown THEN trip_private.tailor_text(c.title, t) END,
           CASE WHEN s.shown THEN s.tailored_text END,
           CASE WHEN s.shown THEN trip_private.tailor_text(c.insight, t) END,
           CASE WHEN s.shown THEN c.choices END,
           CASE WHEN s.shown THEN c.items END
    FROM visible s
    LEFT JOIN public.content_items c ON c.id = s.content_item_id
    ORDER BY s.opens_at, s.kind, s.slot;
END
$$;

-- A sealed card needs opening before a proof (no proving what you haven't seen).
CREATE OR REPLACE FUNCTION trip_private.submit_proof(p_item uuid, p_photo_path text, p_body text) RETURNS uuid
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
  IF s.kind IN ('sealed_quest', 'airport_mission', 'home_mission', 'trip_quest') AND s.revealed_at IS NULL THEN
    RAISE EXCEPTION 'Open it first';
  END IF;
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

-- ---------------------------------------------------------------------------------------------
-- Surprise Drops (M3-09). One proof per square / find (part), or part 0 for Speed and Photo.
-- Bingo, Scavenger and Photo photos wait for the AI check (M3-14) as well as the crew (Q3).
CREATE FUNCTION trip_private.submit_drop_proof(p_item uuid, p_part int, p_photo_path text, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.trip_schedule; t public.trips; c public.content_items; v_solo boolean; v_id uuid; v_status text;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  IF NOT FOUND OR s.kind <> 'surprise_drop' OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'That drop isn''t in your trip';
  END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'That drop hasn''t opened yet'; END IF;
  IF now() >= s.closes_at THEN RAISE EXCEPTION 'This drop has closed'; END IF;
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

-- Lines completed on a square Bingo grid (3×3 or 4×4) from the marked squares.
CREATE FUNCTION trip_private.bingo_lines(p_marked int[], p_size int) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH lines AS (
    SELECT array_agg(r * p_size + c) AS cells FROM generate_series(0, p_size - 1) r, generate_series(0, p_size - 1) c GROUP BY r
    UNION ALL SELECT array_agg(r * p_size + c) FROM generate_series(0, p_size - 1) r, generate_series(0, p_size - 1) c GROUP BY c
    UNION ALL SELECT array_agg(i * p_size + i) FROM generate_series(0, p_size - 1) i
    UNION ALL SELECT array_agg(i * p_size + (p_size - 1 - i)) FROM generate_series(0, p_size - 1) i
  )
  SELECT count(*)::int FROM lines WHERE cells <@ coalesce(p_marked, '{}')
$$;

-- A player's points for one drop (Q4): 10 for completing, plus a bonus from the game's own scoring,
-- 33 at most; 0 if not completed. Only approved proofs count.
--   Bingo: complete = one line; +4 per extra line, +8 for a blackout.
--   Scavenger: complete = half the finds; +3 per find beyond that, +5 for all of them.
--   Speed: complete = an approved finish; +15 / +10 / +5 for the first three finishers.
--   Photo: complete = an approved photo; +15 for the crew favourite (most 👍, ties all), +8 runner-up.
CREATE FUNCTION trip_private.drop_points(p_item uuid, p_user uuid) RETURNS int
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.trip_schedule; c public.content_items;
  v_marked int[]; v_n int; v_size int; v_lines int; v_bonus int := 0; v_place int; v_votes int; v_rank int;
BEGIN
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
        WHERE p.schedule_id = p_item AND p.crew_status IN ('approved', 'not_needed')) x
      WHERE x.user_id = p_user;
      v_bonus := CASE v_place WHEN 1 THEN 15 WHEN 2 THEN 10 WHEN 3 THEN 5 ELSE 0 END;
    WHEN 'photo' THEN
      SELECT x.r INTO v_rank FROM (
        SELECT p.user_id, dense_rank() OVER (ORDER BY (SELECT count(*) FROM public.proof_votes v WHERE v.proof_id = p.id) DESC) AS r,
               (SELECT count(*) FROM public.proof_votes v WHERE v.proof_id = p.id) AS votes
        FROM public.proofs p WHERE p.schedule_id = p_item AND p.crew_status IN ('approved', 'not_needed')) x
      WHERE x.user_id = p_user AND x.votes > 0;
      v_bonus := CASE v_rank WHEN 1 THEN 15 WHEN 2 THEN 8 ELSE 0 END;
    ELSE NULL;
  END CASE;
  RETURN least(33, 10 + greatest(v_bonus, 0));
END
$$;

-- Every 5 minutes: score drops that have closed once none of their proofs is still waiting (or a
-- day after closing, when the waiting ones expire anyway). Idempotent.
CREATE FUNCTION trip_private.settle_drops() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d record; p record; v_points int; n int := 0;
BEGIN
  FOR d IN
    SELECT s.* FROM public.trip_schedule s
    WHERE s.kind = 'surprise_drop' AND s.settled_at IS NULL AND s.closes_at <= now()
      AND NOT EXISTS (SELECT 1 FROM public.proofs x WHERE x.schedule_id = s.id AND x.crew_status = 'waiting' AND x.expires_at > now())
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
SELECT cron.schedule('settle-drops', '*/5 * * * *', 'SELECT trip_private.settle_drops();');

-- Photo Challenge: the crew's 👍 are the favourite vote, so a 👍 still counts after approval.
-- approve_proof already records every vote (proof_votes); crew_check keeps showing Photo drops
-- until the drop closes so everyone can vote.
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
    WHERE p.trip_id = p_trip AND p.user_id <> auth.uid()
      AND ((p.crew_status = 'waiting' AND p.expires_at > now())
           OR (s.kind = 'surprise_drop' AND s.variant = 'photo' AND s.closes_at > now()
               AND NOT EXISTS (SELECT 1 FROM public.proof_votes v WHERE v.proof_id = p.id AND v.voter_id = auth.uid())))
    ORDER BY p.created_at;
END
$$;

-- An approved proof can still take 👍 (Photo Challenge favourite); approve_proof already allows it
-- for a waiting proof, so let a vote land on an approved Photo drop proof too.
CREATE OR REPLACE FUNCTION trip_private.approve_proof(p_proof uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p public.proofs; t public.trips; s public.trip_schedule;
BEGIN
  SELECT * INTO p FROM public.proofs WHERE id = p_proof FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_trip_member(p.trip_id, auth.uid()) THEN RAISE EXCEPTION 'That proof isn''t in your trip'; END IF;
  IF p.user_id = auth.uid() THEN RAISE EXCEPTION 'You can''t approve your own proof'; END IF;
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

-- expire_proofs: drop proofs have no ledger row of their own (settle_drops scores them).
CREATE OR REPLACE FUNCTION trip_private.expire_proofs() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE p record; n int := 0;
BEGIN
  FOR p IN UPDATE public.proofs SET crew_status = 'expired'
           WHERE crew_status = 'waiting' AND expires_at <= now()
           RETURNING trip_id, user_id, source, schedule_id LOOP
    IF p.source <> 'surprise_drop' THEN
      PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'rejected');
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

-- set_proof_ai: same, a drop proof's approval doesn't touch the ledger directly.
CREATE OR REPLACE FUNCTION trip_private.set_proof_ai(p_proof uuid, p_verdict text, p_reason text, p_flags jsonb DEFAULT NULL)
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
    IF p.source <> 'surprise_drop' THEN
      PERFORM trip_private.set_points_status(p.trip_id, p.user_id, p.source, p.schedule_id, 'approved');
    END IF;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION trip_private.open_item(uuid), trip_private.share_trip_quest(uuid, boolean),
  trip_private.submit_drop_proof(uuid, int, text, text), trip_private.drop_points(uuid, uuid),
  trip_private.settle_drops() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.open_item(uuid), trip_private.share_trip_quest(uuid, boolean),
  trip_private.submit_drop_proof(uuid, int, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.drop_points(uuid, uuid), trip_private.settle_drops() TO service_role;

CREATE FUNCTION public.open_item(p_item uuid) RETURNS boolean
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.open_item(p_item) $$;
CREATE FUNCTION public.share_trip_quest(p_item uuid, p_shared boolean) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.share_trip_quest(p_item, p_shared) $$;
CREATE FUNCTION public.submit_drop_proof(p_item uuid, p_part int DEFAULT 0, p_photo_path text DEFAULT NULL, p_body text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.submit_drop_proof(p_item, p_part, p_photo_path, p_body) $$;
REVOKE ALL ON FUNCTION public.open_item(uuid), public.share_trip_quest(uuid, boolean), public.submit_drop_proof(uuid, int, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_item(uuid), public.share_trip_quest(uuid, boolean), public.submit_drop_proof(uuid, int, text, text)
  TO authenticated, service_role;
