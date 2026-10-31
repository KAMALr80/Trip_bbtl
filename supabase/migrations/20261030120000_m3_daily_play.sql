-- M3-04: Daily Discovery (Home) and Daily Card (Play). One answer per player per item, scored
-- into the ledger: 1 for answering, +1 if right (Q4); fact days score nothing (R-311 – R-313, R-341).
-- rollback: DROP FUNCTION public.answer_daily(uuid, int), trip_private.answer_daily(uuid, int);
--   DROP TABLE public.daily_answers;

CREATE TABLE public.daily_answers (
  schedule_id uuid NOT NULL REFERENCES public.trip_schedule(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  choice int,                 -- index into the item's choices; NULL for a card without choices ("Done")
  correct boolean,            -- NULL when the item has no right answer
  points int NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, user_id)
);
CREATE INDEX daily_answers_trip_user_idx ON public.daily_answers (trip_id, user_id);
ALTER TABLE public.daily_answers ENABLE ROW LEVEL SECURITY;
-- Answers are your own until the day ends (AGENTS.md: hide answers from other players).
CREATE POLICY "players read their own answers" ON public.daily_answers FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.daily_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.daily_answers TO authenticated;
GRANT ALL ON public.daily_answers TO service_role;
CREATE TRIGGER daily_answers_archive_guard BEFORE INSERT OR UPDATE ON public.daily_answers
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- Answer today's Discovery or Card. Returns the points, whether it was right and the right answer
-- (shown after answering). A second answer is refused; the ledger can't double-count either way.
CREATE FUNCTION trip_private.answer_daily(p_item uuid, p_choice int)
RETURNS TABLE(points int, correct boolean, answer int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  s public.trip_schedule;
  c public.content_items;
  v_phase text;
  v_season text;
  v_correct boolean;
  v_points int := 0;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  IF NOT FOUND OR s.kind NOT IN ('daily_discovery', 'daily_card') OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'That card isn''t in your trip';
  END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'That card hasn''t opened yet'; END IF;
  IF s.closes_at IS NOT NULL AND now() >= s.closes_at THEN RAISE EXCEPTION 'That card has closed for the day'; END IF;
  IF EXISTS (SELECT 1 FROM public.daily_answers WHERE schedule_id = p_item AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You''ve already played this one';
  END IF;
  SELECT * INTO c FROM public.content_items WHERE id = s.content_item_id;
  IF cardinality(c.choices) > 0 AND (p_choice IS NULL OR p_choice < 0 OR p_choice >= cardinality(c.choices)) THEN
    RAISE EXCEPTION 'Pick one of the answers';
  END IF;
  v_correct := CASE WHEN c.answer IS NOT NULL THEN p_choice = c.answer END;

  IF s.points IS NOT NULL THEN
    SELECT phase INTO v_phase FROM trip_private.trip_phase(s.trip_id, now());
    v_season := CASE v_phase WHEN 'preflight' THEN 'preflight' WHEN 'trip_season' THEN 'trip_season' END;
    IF v_season IS NOT NULL AND (s.kind = 'daily_discovery' OR v_season = 'preflight') THEN
      v_points := 1 + CASE WHEN v_correct THEN 1 ELSE 0 END;
      IF trip_private.award_points(s.trip_id, auth.uid(), v_season, s.kind, s.id, v_points, 'approved', now(), auth.uid()) IS NULL THEN
        v_points := 0;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.daily_answers (schedule_id, trip_id, user_id, choice, correct, points)
  VALUES (p_item, s.trip_id, auth.uid(), p_choice, v_correct, v_points);
  RETURN QUERY SELECT v_points, v_correct, c.answer;
END
$$;
REVOKE ALL ON FUNCTION trip_private.answer_daily(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.answer_daily(uuid, int) TO authenticated, service_role;

CREATE FUNCTION public.answer_daily(p_item uuid, p_choice int DEFAULT NULL)
RETURNS TABLE(points int, correct boolean, answer int)
LANGUAGE sql SET search_path = '' AS $$ SELECT * FROM trip_private.answer_daily(p_item, p_choice) $$;
REVOKE ALL ON FUNCTION public.answer_daily(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_daily(uuid, int) TO authenticated, service_role;
