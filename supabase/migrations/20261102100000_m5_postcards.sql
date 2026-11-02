-- M5-01 Postcard Picks, M5-02 wrap-up week, M5-03 Day 7 lock, M5-05 photo purge list, M5-06 Captain
-- tie-break / swap (R-601 – R-609, R-354, R-104, Q11 default).
--  * Postcard Picks: during the trip each player nominates their own photos (proof photos) for the
--    postcard: 2 each, 5 in a Window Seat crew, up to 10 when playing truly solo. Swap any time until
--    Trip Season ends (the end of the last trip day, trip time).
--  * Wrap-up week = Baggage Claim days 1–7: heart the crew's picks (one heart per photo, not your own;
--    counts stay hidden from players) and answer 3 questions: "Moment you'll never forget" + 2 drawn
--    per trip from the pool. About 60 characters; the emoji question takes exactly 3 emojis
--    (trip_private.is_three_emojis; src/features/postcard/wrapup.ts is the same rule and both run
--    supabase/tests/fixtures/wrapup.json). Words are stored as typed: no AI rewriting (R-604).
--  * Day 7 lock (pg_cron every 15 min, trip_private.postcards_due): top photos by hearts (6 group, 10
--    solo / Window Seat crew), ties → the Captain's pick, else earliest upload; answers grouped by
--    question with no names; crowns; everyone's "most excited for". Writes trip_postcards, stamps every
--    member's passport (M5-07), sets trips.locked_at. Idempotent.
--  * Photo purge (Q11 default): after the lock, every other photo of the trip in Storage goes
--    (proofs, drop photos, older photo wall); postcard photos stay. The Worker route
--    /api/public/purge-photos deletes the objects listed by photos_to_purge and reports back.
--  * Reminders: wrap-up days 1, 5 (download your photos) and 7, and "your postcard is ready".
-- rollback: SELECT cron.unschedule('lock-postcards'); DROP the functions below; DROP TABLE public.photo_purge_log,
--   public.postcard_choices, public.trip_postcards, public.wrapup_answers, public.postcard_hearts,
--   public.postcard_picks; ALTER TABLE public.proofs DROP COLUMN photo_removed_at; ALTER FUNCTION
--   trip_private.desired_notifications_core(uuid) RENAME TO desired_notifications (after dropping the wrapper);
--   restore room_rules, notification_types and guide_items from their earlier migrations.

-- ---------------------------------------------------------------------------------------------
-- Room rules: a Window Seat crew keeps 10 photos (R-354). Same values as src/features/trip/rooms.ts.
CREATE OR REPLACE FUNCTION trip_private.room_rules(p_room text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_room
    WHEN 'trip' THEN '{"atHome":false,"contentTags":["trip"],"crowningLabel":"Crowning night","dailyQuest":false,"id":"trip","journal":false,"mainDays":{"max":14,"min":1},"maxCallNights":4,"maxCrew":12,"maxFocuses":0,"modes":["solo","crew","offline"],"photosKept":{"group":6,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":2,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"airport_missions","tripSeasonStart":"arrival_button"}'::jsonb
    WHEN 'window_seat' THEN '{"atHome":false,"contentTags":["trip","solo"],"crowningLabel":"Crowning night","dailyQuest":true,"id":"window_seat","journal":true,"mainDays":{"max":14,"min":1},"maxCallNights":4,"maxCrew":4,"maxFocuses":0,"modes":["solo","crew"],"photosKept":{"group":10,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":5,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"airport_missions","tripSeasonStart":"arrival_button"}'::jsonb
    WHEN 'explore_culture' THEN '{"atHome":true,"contentTags":["at_home"],"crowningLabel":"Finale night","dailyQuest":false,"id":"explore_culture","journal":false,"mainDays":{"max":7,"min":1},"maxCallNights":4,"maxCrew":12,"maxFocuses":2,"modes":["solo","crew","offline"],"photosKept":{"group":6,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":2,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"home_missions","tripSeasonStart":"first_experience_day"}'::jsonb
    WHEN 'show_culture' THEN '{"atHome":true,"contentTags":["at_home"],"crowningLabel":"Finale night","dailyQuest":false,"id":"show_culture","journal":false,"mainDays":{"max":7,"min":1},"maxCallNights":4,"maxCrew":12,"maxFocuses":0,"modes":["solo","crew","offline"],"photosKept":{"group":6,"solo":10},"pointsEnabled":true,"postcardPicksPerPlayer":2,"preFlightDays":{"max":10,"min":0,"skippable":true},"takeoff":"home_missions","tripSeasonStart":"first_experience_day"}'::jsonb
    WHEN 'game_night' THEN '{"atHome":true,"contentTags":["at_home","trip"],"crowningLabel":"Game night","dailyQuest":false,"id":"game_night","journal":false,"mainDays":{"max":1,"min":1},"maxCallNights":0,"maxCrew":12,"maxFocuses":0,"modes":["crew","offline"],"photosKept":{"group":0,"solo":0},"pointsEnabled":false,"postcardPicksPerPlayer":0,"preFlightDays":{"max":0,"min":0,"skippable":false},"takeoff":"none","tripSeasonStart":"first_experience_day"}'::jsonb
  END
$$;

-- ---------------------------------------------------------------------------------------------
-- Tables.

-- Purged photos keep their proof row (points, guide text) but lose the picture.
ALTER TABLE public.proofs ADD COLUMN photo_removed_at timestamptz;

CREATE TABLE public.postcard_picks (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  proof_id uuid NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  picked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id, proof_id),
  UNIQUE (proof_id)
);
ALTER TABLE public.postcard_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own picks" ON public.postcard_picks FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.postcard_picks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.postcard_picks TO authenticated;
GRANT ALL ON public.postcard_picks TO service_role;
CREATE TRIGGER postcard_picks_archive_guard BEFORE INSERT OR UPDATE ON public.postcard_picks
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

CREATE TABLE public.postcard_hearts (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  proof_id uuid NOT NULL REFERENCES public.proofs(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proof_id, voter_id)
);
CREATE INDEX postcard_hearts_trip_idx ON public.postcard_hearts (trip_id);
ALTER TABLE public.postcard_hearts ENABLE ROW LEVEL SECURITY;
-- Players see only their own hearts; counts stay hidden until the postcard locks.
CREATE POLICY "players read their own hearts" ON public.postcard_hearts FOR SELECT TO authenticated USING (voter_id = auth.uid());
REVOKE ALL ON public.postcard_hearts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.postcard_hearts TO authenticated;
GRANT ALL ON public.postcard_hearts TO service_role;
CREATE TRIGGER postcard_hearts_archive_guard BEFORE INSERT OR UPDATE ON public.postcard_hearts
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

CREATE TABLE public.wrapup_answers (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question_key text NOT NULL CHECK (question_key IN ('never_forget', 'emojis', 'best_bite', 'song', 'learned',
                                                     'funniest', 'again')),
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 60),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id, question_key)
);
ALTER TABLE public.wrapup_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own answers" ON public.wrapup_answers FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.wrapup_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wrapup_answers TO authenticated;
GRANT ALL ON public.wrapup_answers TO service_role;
CREATE TRIGGER wrapup_answers_archive_guard BEFORE INSERT OR UPDATE ON public.wrapup_answers
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- The Captain's tie-breaks (photos favoured at the cut line) and the one swap (R-606).
CREATE TABLE public.postcard_choices (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  favored uuid[] NOT NULL DEFAULT '{}',
  swap_out uuid,
  swap_in uuid,
  swapped_by uuid,
  swapped_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.postcard_choices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.postcard_choices FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.postcard_choices TO service_role;
CREATE TRIGGER postcard_choices_archive_guard BEFORE INSERT OR UPDATE ON public.postcard_choices
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- The locked postcard (R-605, R-608). photos: [{proof_id, path, user_id, hearts}] in collage order;
-- answers: [{key, question, answers: [text]}] with no names; crowns: [{season, user_id, name, points,
-- solo}]; excited: [text]. image_path is for a server-rendered image (not used yet; the app draws it).
CREATE TABLE public.trip_postcards (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now(),
  photos jsonb NOT NULL DEFAULT '[]',
  answers jsonb NOT NULL DEFAULT '[]',
  crowns jsonb NOT NULL DEFAULT '[]',
  excited jsonb NOT NULL DEFAULT '[]',
  image_path text CHECK (length(image_path) <= 300)
);
ALTER TABLE public.trip_postcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read the postcard" ON public.trip_postcards FOR SELECT TO authenticated
  USING (trip_private.is_trip_member(trip_id, auth.uid()));
REVOKE ALL ON public.trip_postcards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trip_postcards TO authenticated;
GRANT ALL ON public.trip_postcards TO service_role;
CREATE TRIGGER trip_postcards_archive_guard BEFORE INSERT OR UPDATE ON public.trip_postcards
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- Every purge run, for support (M5-05 acceptance: "the job is logged").
CREATE TABLE public.photo_purge_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  removed int NOT NULL,
  kept int NOT NULL,
  remaining int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.photo_purge_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.photo_purge_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.photo_purge_log TO service_role;
CREATE TRIGGER photo_purge_log_archive_guard BEFORE INSERT OR UPDATE ON public.photo_purge_log
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- ---------------------------------------------------------------------------------------------
-- Rules.

-- Picks per player and photos kept. Truly solo (Just me, or one phone for friends off the app, or a
-- crew of one) picks its own 10 (R-354).
CREATE FUNCTION trip_private.postcard_limits(p_trip uuid) RETURNS TABLE(picks int, kept int, solo boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN x.solo THEN (x.r->'photosKept'->>'solo')::int ELSE (x.r->>'postcardPicksPerPlayer')::int END,
         CASE WHEN x.solo THEN (x.r->'photosKept'->>'solo')::int ELSE (x.r->'photosKept'->>'group')::int END,
         x.solo
  FROM (SELECT trip_private.room_rules(t.room) AS r,
               (t.play_mode <> 'crew' OR (SELECT count(*) FROM public.trip_members m
                                          WHERE m.trip_id = t.id AND m.status = 'approved') <= 1) AS solo
        FROM public.trips t WHERE t.id = p_trip) x
$$;

-- The 3 wrap-up questions of a trip (R-602, R-603): the fixed one, then 2 from the pool, the same 2
-- for everyone in the trip so the postcard can group answers by question.
CREATE FUNCTION trip_private.wrapup_questions(p_trip uuid)
RETURNS TABLE(idx int, key text, question text, emoji boolean)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT 0, 'never_forget', 'Moment you''ll never forget', false
  UNION ALL
  SELECT * FROM (
    SELECT (row_number() OVER (ORDER BY trip_private.schedule_hash(p_trip::text || q.key)))::int, q.key, q.question, q.key = 'emojis'
    FROM (VALUES ('emojis', 'Your trip in 3 emojis'), ('best_bite', 'Best bite'), ('song', 'Song of the trip'),
                 ('learned', 'Something new you learned'), ('funniest', 'Funniest moment in 5 words'),
                 ('again', 'One thing you''d do again tomorrow')) q(key, question)
    ORDER BY 1 LIMIT 2) pool
  ORDER BY 1
$$;

-- Exactly 3 emojis (R-604), counted as whole emoji: flags, keycaps, skin tones and ZWJ families
-- each count once. Spaces between them are fine. Same rule as src/features/postcard/wrapup.ts.
CREATE FUNCTION trip_private.is_three_emojis(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(p, '') ~ (
    '^\s*' || c || '\s*' || c || '\s*' || c || '\s*$')
  FROM (SELECT b || m || '(?:‍' || b || m || ')*' AS c
        FROM (SELECT
          '(?:[\U0001F1E6-\U0001F1FF][\U0001F1E6-\U0001F1FF]|[0-9#*]️?⃣|[©®‼⁉™ℹ↔-↙↩↪⌚⌛⌨⏏⏩-⏳⏸-⏺Ⓜ▪▫▶◀◻-◾☀-➿⤴⤵⬅-⬇⬛⬜⭐⭕〰〽㊗㊙\U0001F000-\U0001F1E5\U0001F200-\U0001FAFF])'
            AS b,
          '(?:️|[\U0001F3FB-\U0001F3FF]|[\U000E0020-\U000E007F])*' AS m) parts) re
$$;

-- Trim like the app does (any whitespace at either end).
CREATE FUNCTION trip_private.trim_answer(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g') $$;

-- Nominate (p_pick) or un-nominate one of my photos. Returns how many I have picked.
CREATE FUNCTION trip_private.pick_postcard(p_trip uuid, p_proof uuid, p_pick boolean) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_phase text; v_limit int; v_n int; p public.proofs;
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT phase INTO v_phase FROM trip_private.trip_phase(p_trip, now());
  IF v_phase IS NULL OR v_phase NOT IN ('preflight', 'takeoff', 'trip_season') THEN
    RAISE EXCEPTION 'Postcard Picks closed at the end of the last trip day';
  END IF;
  SELECT l.picks INTO v_limit FROM trip_private.postcard_limits(p_trip) l;
  IF coalesce(v_limit, 0) = 0 THEN RAISE EXCEPTION 'This room has no postcard'; END IF;
  -- Serialise this player's picks so two quick taps can't both slip under the limit.
  PERFORM pg_advisory_xact_lock(trip_private.schedule_hash('postcard:' || p_trip || ':' || auth.uid()));
  IF NOT coalesce(p_pick, true) THEN
    DELETE FROM public.postcard_picks WHERE trip_id = p_trip AND user_id = auth.uid() AND proof_id = p_proof;
  ELSE
    SELECT * INTO p FROM public.proofs WHERE id = p_proof;
    IF NOT FOUND OR p.trip_id <> p_trip OR p.user_id <> auth.uid() OR p.photo_path IS NULL
       OR p.photo_removed_at IS NOT NULL OR p.crew_status = 'expired' THEN
      RAISE EXCEPTION 'Pick one of your own trip photos';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.postcard_picks WHERE proof_id = p_proof) THEN
      SELECT count(*) INTO v_n FROM public.postcard_picks WHERE trip_id = p_trip AND user_id = auth.uid();
      IF v_n >= v_limit THEN RAISE EXCEPTION 'You can pick % photos. Unpick one first', v_limit; END IF;
      INSERT INTO public.postcard_picks (trip_id, user_id, proof_id) VALUES (p_trip, auth.uid(), p_proof);
    END IF;
  END IF;
  SELECT count(*) INTO v_n FROM public.postcard_picks WHERE trip_id = p_trip AND user_id = auth.uid();
  RETURN v_n;
END
$$;

-- Wrap-up week is open: Baggage Claim and not locked yet.
CREATE FUNCTION trip_private.require_wrapup(p_trip uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_phase text;
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip AND locked_at IS NOT NULL) THEN
    RAISE EXCEPTION 'The postcard is locked';
  END IF;
  SELECT phase INTO v_phase FROM trip_private.trip_phase(p_trip, now());
  IF v_phase IS DISTINCT FROM 'baggage_claim' THEN RAISE EXCEPTION 'Wrap-up week starts the day after the trip'; END IF;
END
$$;

-- Heart (or un-heart) a crew pick (R-602). Not your own (M5-02 default).
CREATE FUNCTION trip_private.heart_photo(p_trip uuid, p_proof uuid, p_on boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k public.postcard_picks;
BEGIN
  PERFORM trip_private.require_wrapup(p_trip);
  SELECT * INTO k FROM public.postcard_picks WHERE proof_id = p_proof AND trip_id = p_trip;
  IF NOT FOUND OR NOT trip_private.proof_photo_ok(p_proof, auth.uid()) THEN RAISE EXCEPTION 'That photo isn''t a Postcard Pick'; END IF;
  IF k.user_id = auth.uid() THEN RAISE EXCEPTION 'Heart the crew''s photos, not your own'; END IF;
  IF coalesce(p_on, true) THEN
    INSERT INTO public.postcard_hearts (trip_id, proof_id, voter_id) VALUES (p_trip, p_proof, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.postcard_hearts WHERE proof_id = p_proof AND voter_id = auth.uid();
  END IF;
  RETURN coalesce(p_on, true);
END
$$;

-- Answer (or clear, with an empty answer) one of the 3 questions (R-602 – R-604).
CREATE FUNCTION trip_private.answer_wrapup(p_trip uuid, p_key text, p_answer text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE q record; v text := trip_private.trim_answer(p_answer);
BEGIN
  PERFORM trip_private.require_wrapup(p_trip);
  SELECT * INTO q FROM trip_private.wrapup_questions(p_trip) w WHERE w.key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'That isn''t one of this trip''s questions'; END IF;
  IF v = '' THEN
    DELETE FROM public.wrapup_answers WHERE trip_id = p_trip AND user_id = auth.uid() AND question_key = p_key;
    RETURN;
  END IF;
  IF char_length(v) > 60 THEN RAISE EXCEPTION 'Keep it short: 60 characters at most'; END IF;
  IF q.emoji AND NOT trip_private.is_three_emojis(v) THEN RAISE EXCEPTION 'Use exactly 3 emojis'; END IF;
  IF NOT q.emoji AND NOT trip_private.content_text_safe(v) THEN RAISE EXCEPTION 'Please reword that'; END IF;
  INSERT INTO public.wrapup_answers (trip_id, user_id, question_key, answer) VALUES (p_trip, auth.uid(), p_key, v)
  ON CONFLICT (trip_id, user_id, question_key) DO UPDATE SET answer = excluded.answer, updated_at = now();
END
$$;

-- Picks ranked for the postcard: hearts, then the Captain's tie-break, then earliest upload (R-606).
CREATE FUNCTION trip_private.postcard_rank(p_trip uuid)
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
  ) x
$$;

-- The photos that go on the postcard, in collage order: the top N, with the Captain's one swap
-- applied (the swapped-in photo takes the place of the one it replaced).
CREATE FUNCTION trip_private.postcard_selection(p_trip uuid)
RETURNS TABLE(proof_id uuid, user_id uuid, photo_path text, hearts int, ord numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH lim AS (SELECT kept FROM trip_private.postcard_limits(p_trip)),
  c AS (SELECT * FROM public.postcard_choices WHERE trip_id = p_trip),
  r AS (SELECT * FROM trip_private.postcard_rank(p_trip)),
  forced AS (SELECT r.* FROM r WHERE r.proof_id = (SELECT swap_in FROM c)),
  base AS (
    SELECT r.* FROM r
    WHERE r.proof_id IS DISTINCT FROM (SELECT swap_out FROM c) AND r.proof_id IS DISTINCT FROM (SELECT swap_in FROM c)
    ORDER BY r.pos
    LIMIT greatest(0, (SELECT kept FROM lim) - (SELECT count(*) FROM forced))
  )
  SELECT b.proof_id, b.user_id, b.photo_path, b.hearts, b.pos::numeric FROM base b
  UNION ALL
  SELECT f.proof_id, f.user_id, f.photo_path, f.hearts,
         coalesce((SELECT r.pos FROM r WHERE r.proof_id = (SELECT swap_out FROM c)), 0)::numeric - 0.5
  FROM forced f WHERE (SELECT kept FROM lim) > 0
  ORDER BY 5
$$;

-- What wrap-up week shows: the crew's picks (photos I may see), mine flagged, my hearts.
CREATE FUNCTION trip_private.wrapup_board(p_trip uuid)
RETURNS TABLE(proof_id uuid, user_id uuid, photo_path text, mine boolean, hearted boolean, picked_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN QUERY
    SELECT k.proof_id, k.user_id, p.photo_path, k.user_id = auth.uid(),
           EXISTS (SELECT 1 FROM public.postcard_hearts h WHERE h.proof_id = k.proof_id AND h.voter_id = auth.uid()),
           k.picked_at
    FROM public.postcard_picks k JOIN public.proofs p ON p.id = k.proof_id
    WHERE k.trip_id = p_trip AND p.photo_path IS NOT NULL AND p.photo_removed_at IS NULL AND p.crew_status <> 'expired'
      AND trip_private.proof_photo_ok(p.id, auth.uid())
    ORDER BY trip_private.schedule_hash(k.proof_id::text || auth.uid()::text);   -- a shuffled order per player
END
$$;

-- The Captain's Baggage Claim tile (M5-06): the ranking with heart counts, the cut line, ties at it,
-- and whether the one swap is used.
CREATE FUNCTION trip_private.postcard_ranking(p_trip uuid)
RETURNS TABLE(proof_id uuid, user_id uuid, photo_path text, hearts int, pos int, kept boolean, tied boolean,
              favored boolean, swapped_in boolean, swapped_out boolean, swap_used boolean, kept_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_kept int; v_cut int;
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'The Captain or Co-Captain sees the ranking'; END IF;
  SELECT l.kept INTO v_kept FROM trip_private.postcard_limits(p_trip) l;
  SELECT r.hearts INTO v_cut FROM trip_private.postcard_rank(p_trip) r WHERE r.pos = v_kept;
  RETURN QUERY
    WITH r AS (SELECT * FROM trip_private.postcard_rank(p_trip)),
    sel AS (SELECT s.proof_id FROM trip_private.postcard_selection(p_trip) s),
    c AS (SELECT * FROM public.postcard_choices WHERE trip_id = p_trip)
    SELECT r.proof_id, r.user_id,
           CASE WHEN trip_private.proof_photo_ok(r.proof_id, auth.uid()) THEN r.photo_path END,
           r.hearts, r.pos, r.proof_id IN (SELECT sel.proof_id FROM sel),
           -- tied at the cut: same hearts as the last kept photo, with some of them kept and some not
           (v_cut IS NOT NULL AND r.hearts = v_cut
             AND (SELECT count(*) FROM r x WHERE x.hearts = v_cut) > (SELECT count(*) FROM r x WHERE x.hearts = v_cut AND x.pos <= v_kept)),
           r.favored, r.proof_id = (SELECT swap_in FROM c), r.proof_id = (SELECT swap_out FROM c),
           coalesce((SELECT swap_in IS NOT NULL FROM c), false), v_kept
    FROM r ORDER BY r.pos;
END
$$;

-- Break a tie at the cut line in favour of one photo (p_on), or undo it.
CREATE FUNCTION trip_private.break_postcard_tie(p_trip uuid, p_proof uuid, p_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM trip_private.require_wrapup(p_trip);
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain breaks ties'; END IF;
  IF coalesce(p_on, true) AND NOT EXISTS (SELECT 1 FROM trip_private.postcard_ranking(p_trip) r WHERE r.proof_id = p_proof AND r.tied) THEN
    RAISE EXCEPTION 'That photo isn''t tied at the cut';
  END IF;
  INSERT INTO public.postcard_choices (trip_id, favored)
  VALUES (p_trip, CASE WHEN coalesce(p_on, true) THEN ARRAY[p_proof] ELSE '{}' END)
  ON CONFLICT (trip_id) DO UPDATE
    SET favored = CASE WHEN coalesce(p_on, true) THEN array_append(array_remove(public.postcard_choices.favored, p_proof), p_proof)
                       ELSE array_remove(public.postcard_choices.favored, p_proof) END,
        updated_at = now();
END
$$;

-- Swap one photo (once per trip): take p_out off the postcard and put p_in, another pick, on it.
CREATE FUNCTION trip_private.swap_postcard_photo(p_trip uuid, p_out uuid, p_in uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM trip_private.require_wrapup(p_trip);
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain swaps a photo'; END IF;
  PERFORM 1 FROM public.trips WHERE id = p_trip FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.postcard_choices WHERE trip_id = p_trip AND swap_in IS NOT NULL) THEN
    RAISE EXCEPTION 'The one swap is already used';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trip_private.postcard_selection(p_trip) s WHERE s.proof_id = p_out) THEN
    RAISE EXCEPTION 'Swap out a photo that is on the postcard';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trip_private.postcard_rank(p_trip) r WHERE r.proof_id = p_in)
     OR EXISTS (SELECT 1 FROM trip_private.postcard_selection(p_trip) s WHERE s.proof_id = p_in) THEN
    RAISE EXCEPTION 'Swap in a pick that isn''t on the postcard';
  END IF;
  INSERT INTO public.postcard_choices (trip_id, swap_out, swap_in, swapped_by, swapped_at)
  VALUES (p_trip, p_out, p_in, auth.uid(), now())
  ON CONFLICT (trip_id) DO UPDATE SET swap_out = p_out, swap_in = p_in, swapped_by = auth.uid(), swapped_at = now(),
                                      updated_at = now();
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Day 7 lock (M5-03). p_force skips the time check (Test Lab and tests). Returns true when it locked.
CREATE FUNCTION trip_private.lock_trip(p_trip uuid, p_force boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; v_end timestamptz; v_photos jsonb; v_answers jsonb; v_crowns jsonb; v_excited jsonb; m record;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip FOR UPDATE;
  IF NOT FOUND OR t.locked_at IS NOT NULL OR t.rules_version <> 2 OR t.room = 'game_night'
     OR t.setup_completed_at IS NULL THEN
    RETURN false;
  END IF;
  SELECT w.ends_at INTO v_end FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'baggage_claim';
  IF NOT coalesce(p_force, false) AND (v_end IS NULL OR now() < v_end) THEN RETURN false; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('proof_id', s.proof_id, 'path', s.photo_path, 'user_id', s.user_id,
                                               'hearts', s.hearts) ORDER BY s.ord), '[]')
  INTO v_photos FROM trip_private.postcard_selection(p_trip) s;

  -- Answers grouped by question, in a shuffled order and with no names (R-605).
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', q.key, 'question', q.question, 'answers', q.answers) ORDER BY q.idx), '[]')
  INTO v_answers
  FROM (SELECT w.idx, w.key, w.question,
               coalesce((SELECT jsonb_agg(a.answer ORDER BY trip_private.schedule_hash(a.user_id::text || p_trip::text || w.key))
                         FROM public.wrapup_answers a WHERE a.trip_id = p_trip AND a.question_key = w.key), '[]') AS answers
        FROM trip_private.wrapup_questions(p_trip) w) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('season', c.season, 'user_id', c.user_id,
                                               'name', coalesce(pc.game_name, pp.game_name, 'Traveler'),
                                               'points', c.points, 'solo', c.solo_goal IS NOT NULL)
                            ORDER BY c.season, c.user_id), '[]')
  INTO v_crowns
  FROM public.trip_crowns c
  LEFT JOIN public.trip_player_cards pc ON pc.trip_id = c.trip_id AND pc.user_id = c.user_id
  LEFT JOIN public.player_profiles pp ON pp.user_id = c.user_id
  WHERE c.trip_id = p_trip;

  SELECT coalesce(jsonb_agg(btrim(pc.most_excited) ORDER BY trip_private.schedule_hash(pc.user_id::text || p_trip::text)), '[]')
  INTO v_excited
  FROM public.trip_player_cards pc
  JOIN public.trip_members tm ON tm.trip_id = pc.trip_id AND tm.user_id = pc.user_id AND tm.status = 'approved'
  WHERE pc.trip_id = p_trip AND nullif(btrim(pc.most_excited), '') IS NOT NULL;

  INSERT INTO public.trip_postcards (trip_id, photos, answers, crowns, excited)
  VALUES (p_trip, v_photos, v_answers, v_crowns, v_excited)
  ON CONFLICT (trip_id) DO NOTHING;

  UPDATE public.trips SET locked_at = now() WHERE id = p_trip;
  PERFORM trip_private.stamp_trip(p_trip);

  FOR m IN SELECT user_id FROM public.trip_members WHERE trip_id = p_trip AND status = 'approved' LOOP
    PERFORM trip_private.enqueue_notification(m.user_id, p_trip, 'wrapup', 'Your Trip Postcard is ready',
      'It''s in your passport now. Open it to download or share.', '/t/' || p_trip || '/trip', now(), NULL,
      'postcard_ready:' || p_trip || ':' || m.user_id);
  END LOOP;
  RETURN true;
END
$$;

-- pg_cron, every 15 minutes: lock every trip whose Baggage Claim has ended. Returns how many locked.
CREATE FUNCTION trip_private.postcards_due() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t record; n int := 0;
BEGIN
  FOR t IN SELECT id FROM public.trips
           WHERE locked_at IS NULL AND rules_version = 2 AND room <> 'game_night' AND setup_completed_at IS NOT NULL
             AND end_date <= current_date - 6
  LOOP
    BEGIN
      IF trip_private.lock_trip(t.id) THEN n := n + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'lock_trip % failed: %', t.id, SQLERRM;   -- one bad trip doesn't stop the rest
    END;
  END LOOP;
  RETURN n;
END
$$;
SELECT cron.schedule('lock-postcards', '7,22,37,52 * * * *', 'SELECT trip_private.postcards_due();');

-- ---------------------------------------------------------------------------------------------
-- Photo purge (M5-05, Q11). The Worker route lists, deletes in Storage, then reports back.

-- Objects to delete: every photo of a locked trip in the trip buckets except the postcard's.
CREATE FUNCTION trip_private.photos_to_purge(p_limit int DEFAULT 20)
RETURNS TABLE(trip_id uuid, bucket text, path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH t AS (
    SELECT tr.id FROM public.trips tr
    WHERE tr.locked_at IS NOT NULL AND tr.photos_purged_at IS NULL AND tr.rules_version = 2
    ORDER BY tr.locked_at LIMIT greatest(1, coalesce(p_limit, 20))
  ),
  kept AS (
    SELECT pc.trip_id, ph->>'path' AS path
    FROM public.trip_postcards pc CROSS JOIN LATERAL jsonb_array_elements(pc.photos) ph
    WHERE pc.trip_id IN (SELECT id FROM t)
  )
  SELECT t.id, o.bucket_id, o.name
  FROM t JOIN storage.objects o ON o.bucket_id IN ('quest-proofs', 'trip-photos') AND split_part(o.name, '/', 1) = t.id::text
  WHERE NOT EXISTS (SELECT 1 FROM kept k WHERE k.trip_id = t.id AND k.path = o.name)
  UNION ALL
  -- Locked trips with nothing left to delete still need finishing.
  SELECT t.id, NULL, NULL FROM t
  WHERE NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id IN ('quest-proofs', 'trip-photos')
                      AND split_part(o.name, '/', 1) = t.id::text
                      AND NOT EXISTS (SELECT 1 FROM kept k WHERE k.trip_id = t.id AND k.path = o.name))
$$;

-- After the route deleted the objects: mark the proofs' photos gone, log, and close the trip's purge
-- once nothing is left. Returns what is still left (the route tries again next run).
CREATE FUNCTION trip_private.finish_photo_purge(p_trip uuid, p_removed int) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_kept text[]; v_left int;
BEGIN
  SELECT coalesce(array_agg(ph->>'path'), '{}') INTO v_kept
  FROM public.trip_postcards pc CROSS JOIN LATERAL jsonb_array_elements(pc.photos) ph WHERE pc.trip_id = p_trip;
  UPDATE public.proofs SET photo_removed_at = now()
  WHERE trip_id = p_trip AND photo_path IS NOT NULL AND photo_removed_at IS NULL AND NOT (photo_path = ANY (v_kept));
  SELECT count(*) INTO v_left FROM storage.objects o
  WHERE o.bucket_id IN ('quest-proofs', 'trip-photos') AND split_part(o.name, '/', 1) = p_trip::text
    AND NOT (o.name = ANY (v_kept));
  INSERT INTO public.photo_purge_log (trip_id, removed, kept, remaining)
  VALUES (p_trip, coalesce(p_removed, 0), cardinality(v_kept), v_left);
  IF v_left = 0 THEN UPDATE public.trips SET photos_purged_at = now() WHERE id = p_trip AND photos_purged_at IS NULL; END IF;
  RETURN v_left;
END
$$;

-- Purged photos leave the guide too (the journal text stays).
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
  WHERE p.trip_id = p_trip AND p.photo_path IS NOT NULL AND p.photo_removed_at IS NULL
    AND p.crew_status IN ('approved', 'not_needed')
    AND s.kind IN ('ws_quest', 'home_mission', 'airport_mission', 'surprise_drop', 'trip_quest')
    AND (NOT p_public OR (n.share_photos AND NOT t.has_minors))
  ORDER BY 1, 2 DESC
$$;

-- ---------------------------------------------------------------------------------------------
-- Wrap-up reminders (Q11: Day 1/5/7, with "download your photos"; R-811 'wrapup').
CREATE OR REPLACE FUNCTION trip_private.notification_types()
RETURNS TABLE(type text, label text, sort int) LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  VALUES ('daily', 'Daily Discovery each morning', 1),
         ('sealed_drop', 'A sealed quest drops', 2),
         ('sealed_prep', 'A sealed quest is due tomorrow', 3),
         ('night_soon', 'Call night in an hour', 4),
         ('night_live', 'Game Night is live', 5),
         ('preflight_closing', 'Pre-Flight closes tonight', 6),
         ('missions_open', 'Airport Missions are open', 7),
         ('drop_open', 'A Surprise Drop is open', 8),
         ('drop_ending', 'A Surprise Drop ends soon', 9),
         ('crowning_24h', 'Crowning night tomorrow', 10),
         ('crew_check', 'A crew proof needs your 👍', 11),
         ('proof_expired', 'Your proof ran out of time', 12),
         ('wrapup', 'Wrap-up week and your Trip Postcard', 13),
         ('test', 'Test notification', 99)
$$;

ALTER FUNCTION trip_private.desired_notifications(uuid) RENAME TO desired_notifications_core;
CREATE FUNCTION trip_private.desired_notifications(p_trip uuid)
RETURNS TABLE(user_id uuid, type text, title text, body text, deep_link text, at timestamptz,
              deadline timestamptz, earliest timestamptz, dedupe text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM trip_private.desired_notifications_core(p_trip)
  UNION ALL
  SELECT w.user_id, 'wrapup', w.title, w.body, '/t/' || p_trip || '/play', w.at, w.deadline, NULL::timestamptz,
         'wrapup:' || p_trip || ':' || w.d || ':' || w.user_id
  FROM (
    SELECT tm.user_id, d.d, d.title, d.body, s.closes_at AS deadline,
           ((s.day + (d.d - 1)) + time '10:00') AT TIME ZONE coalesce(nullif(p.time_zone, ''), t.home_timezone) AS at
    FROM public.trips t
    JOIN public.trip_schedule s ON s.trip_id = t.id AND s.kind = 'phase' AND s.slot = 'baggage_claim'
    JOIN public.trip_members tm ON tm.trip_id = t.id AND tm.status = 'approved'
    LEFT JOIN public.profiles p ON p.id = tm.user_id
    CROSS JOIN (VALUES
      (1, 'Wrap-up week is open', 'Heart the crew''s Postcard Picks and answer 3 quick questions.'),
      (5, 'Download your trip photos', 'After Day 7 only the postcard photos are kept. Save the rest now.'),
      (7, 'Last day of wrap-up', 'Your Trip Postcard locks tonight.')) d(d, title, body)
    WHERE t.id = p_trip AND t.rules_version = 2 AND t.room <> 'game_night' AND t.locked_at IS NULL
      AND t.setup_completed_at IS NOT NULL
  ) w
  WHERE w.at > now() AND (w.deadline IS NULL OR w.at < w.deadline)
$$;
REVOKE ALL ON FUNCTION trip_private.desired_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.desired_notifications(uuid) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Grants and public wrappers.
REVOKE ALL ON FUNCTION trip_private.postcard_limits(uuid), trip_private.wrapup_questions(uuid),
  trip_private.is_three_emojis(text), trip_private.trim_answer(text), trip_private.pick_postcard(uuid, uuid, boolean),
  trip_private.require_wrapup(uuid), trip_private.heart_photo(uuid, uuid, boolean),
  trip_private.answer_wrapup(uuid, text, text), trip_private.postcard_rank(uuid), trip_private.postcard_selection(uuid),
  trip_private.wrapup_board(uuid), trip_private.postcard_ranking(uuid), trip_private.break_postcard_tie(uuid, uuid, boolean),
  trip_private.swap_postcard_photo(uuid, uuid, uuid), trip_private.lock_trip(uuid, boolean), trip_private.postcards_due(),
  trip_private.photos_to_purge(int), trip_private.finish_photo_purge(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.postcard_limits(uuid), trip_private.wrapup_questions(uuid),
  trip_private.is_three_emojis(text), trip_private.trim_answer(text), trip_private.pick_postcard(uuid, uuid, boolean),
  trip_private.require_wrapup(uuid), trip_private.heart_photo(uuid, uuid, boolean),
  trip_private.answer_wrapup(uuid, text, text), trip_private.wrapup_board(uuid), trip_private.postcard_ranking(uuid),
  trip_private.break_postcard_tie(uuid, uuid, boolean), trip_private.swap_postcard_photo(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.postcard_rank(uuid), trip_private.postcard_selection(uuid),
  trip_private.lock_trip(uuid, boolean), trip_private.postcards_due(), trip_private.photos_to_purge(int),
  trip_private.finish_photo_purge(uuid, int) TO service_role;

-- Limits and the trip's questions for the app.
CREATE FUNCTION trip_private.postcard_info(p_trip uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE l record; v_close timestamptz;
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT * INTO l FROM trip_private.postcard_limits(p_trip);
  SELECT w.ends_at INTO v_close FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'trip_season';
  RETURN jsonb_build_object(
    'picks', l.picks, 'kept', l.kept, 'solo', l.solo, 'picks_close_at', v_close,
    'locks_at', (SELECT w.ends_at FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'baggage_claim'),
    'questions', (SELECT jsonb_agg(jsonb_build_object('key', q.key, 'question', q.question, 'emoji', q.emoji) ORDER BY q.idx)
                  FROM trip_private.wrapup_questions(p_trip) q));
END
$$;
REVOKE ALL ON FUNCTION trip_private.postcard_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.postcard_info(uuid) TO authenticated, service_role;

CREATE FUNCTION public.postcard_info(p_trip uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT trip_private.postcard_info(p_trip) $$;
CREATE FUNCTION public.pick_postcard(p_trip uuid, p_proof uuid, p_pick boolean DEFAULT true) RETURNS int
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.pick_postcard(p_trip, p_proof, p_pick) $$;
CREATE FUNCTION public.heart_photo(p_trip uuid, p_proof uuid, p_on boolean DEFAULT true) RETURNS boolean
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.heart_photo(p_trip, p_proof, p_on) $$;
CREATE FUNCTION public.answer_wrapup(p_trip uuid, p_key text, p_answer text) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.answer_wrapup(p_trip, p_key, p_answer) $$;
CREATE FUNCTION public.wrapup_board(p_trip uuid)
RETURNS TABLE(proof_id uuid, user_id uuid, photo_path text, mine boolean, hearted boolean, picked_at timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.wrapup_board(p_trip) $$;
CREATE FUNCTION public.postcard_ranking(p_trip uuid)
RETURNS TABLE(proof_id uuid, user_id uuid, photo_path text, hearts int, pos int, kept boolean, tied boolean,
              favored boolean, swapped_in boolean, swapped_out boolean, swap_used boolean, kept_count int)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.postcard_ranking(p_trip) $$;
CREATE FUNCTION public.break_postcard_tie(p_trip uuid, p_proof uuid, p_on boolean DEFAULT true) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.break_postcard_tie(p_trip, p_proof, p_on) $$;
CREATE FUNCTION public.swap_postcard_photo(p_trip uuid, p_out uuid, p_in uuid) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.swap_postcard_photo(p_trip, p_out, p_in) $$;
-- Service role only: the purge route.
CREATE FUNCTION public.photos_to_purge(p_limit int DEFAULT 20) RETURNS TABLE(trip_id uuid, bucket text, path text)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.photos_to_purge(p_limit) $$;
CREATE FUNCTION public.finish_photo_purge(p_trip uuid, p_removed int) RETURNS int
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.finish_photo_purge(p_trip, p_removed) $$;

REVOKE ALL ON FUNCTION public.postcard_info(uuid), public.pick_postcard(uuid, uuid, boolean),
  public.heart_photo(uuid, uuid, boolean), public.answer_wrapup(uuid, text, text), public.wrapup_board(uuid),
  public.postcard_ranking(uuid), public.break_postcard_tie(uuid, uuid, boolean), public.swap_postcard_photo(uuid, uuid, uuid),
  public.photos_to_purge(int), public.finish_photo_purge(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.postcard_info(uuid), public.pick_postcard(uuid, uuid, boolean),
  public.heart_photo(uuid, uuid, boolean), public.answer_wrapup(uuid, text, text), public.wrapup_board(uuid),
  public.postcard_ranking(uuid), public.break_postcard_tie(uuid, uuid, boolean), public.swap_postcard_photo(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.photos_to_purge(int), public.finish_photo_purge(uuid, int) TO service_role;
