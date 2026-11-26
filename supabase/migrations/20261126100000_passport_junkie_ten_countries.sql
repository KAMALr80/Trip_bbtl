-- Founder review: the Passport Junkie badge in junkie_rank still meant "5 international real-trip
-- stamps", while the deck (R-703) and the app's passport level say a Passport Junkie has stamped
-- 10 countries. junkie_rank now reads the same server-computed count as the level
-- (passport_progress, written when a stamp is added, R-704), so the two can never disagree.
-- Nothing else in junkie_rank changes.
--
-- Rollback: re-run junkie_rank from the baseline.

CREATE OR REPLACE FUNCTION trip_private.junkie_rank(p_user uuid) RETURNS TABLE(tier text, points integer, next_tier text, next_at integer, tier_at integer, passport_junkie boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_pts int; v_best int; v_intl int;
BEGIN
  IF p_user IS NULL OR (p_user <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON b.trip_id=a.trip_id AND b.status='approved' WHERE a.user_id=auth.uid() AND a.status='approved' AND b.user_id=p_user)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  WITH real AS (
    SELECT t.id, m.role FROM public.trips t JOIN public.trip_members m ON m.trip_id=t.id AND m.user_id=p_user AND m.status='approved'
    WHERE t.kind='trip' AND NOT t.is_sandbox AND (t.ended_at IS NOT NULL OR current_date > t.end_date)
      AND (SELECT count(*) FROM public.trip_members x WHERE x.trip_id=t.id AND x.status='approved') >= 3),
  home_all AS (
    SELECT t.id, row_number() OVER (PARTITION BY date_trunc('month', t.end_date) ORDER BY t.end_date, t.id) rn
    FROM public.trips t JOIN public.trip_members m ON m.trip_id=t.id AND m.user_id=p_user AND m.status='approved'
    WHERE t.kind='at_home' AND NOT t.is_sandbox AND (t.ended_at IS NOT NULL OR current_date > t.end_date)),
  home AS (SELECT id FROM home_all WHERE rn <= 4)
  SELECT
    (SELECT count(*) FROM real)*100 + (SELECT count(*) FROM real WHERE role='captain')*25
    + (SELECT count(*) FROM public.season_champions c WHERE c.user_id=p_user AND c.trip_id IN (SELECT id FROM real))*50
    + (SELECT count(*) FROM home)*40
    + (SELECT count(*) FROM public.season_champions c WHERE c.user_id=p_user AND c.trip_id IN (SELECT id FROM home))*20
    + (SELECT count(*) FROM public.culture_experiences e WHERE e.creator_id=p_user AND e.finished_at IS NOT NULL AND (e.trip_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.trips s WHERE s.id=e.trip_id AND s.is_sandbox)))*40
    + coalesce((SELECT sum(CASE trip_private.solo_fare((x.sc->>'points')::int,(x.sc->>'available')::int) WHEN 'First Class' THEN 30 WHEN 'Business' THEN 20 WHEN 'Economy' THEN 10 ELSE 0 END)
        FROM (SELECT trip_private.solo_score(e.id) sc FROM public.culture_experiences e WHERE e.creator_id=p_user AND e.play_mode='solo' AND e.finished_at IS NOT NULL) x),0)
    + (SELECT count(*) FROM public.mission_claims c JOIN public.trips s ON s.id=c.trip_id AND NOT s.is_sandbox WHERE c.user_id=p_user AND c.status='released')*5
  INTO v_pts;
  INSERT INTO public.junkie_ranks(user_id,best_points) VALUES (p_user, v_pts)
    ON CONFLICT (user_id) DO UPDATE SET best_points=greatest(public.junkie_ranks.best_points, excluded.best_points), updated_at=now()
    RETURNING best_points INTO v_best;
  PERFORM trip_private.sync_passport(p_user);
  -- Passport Junkie = 10 countries (R-703), the same count the passport level uses (passport_progress).
  SELECT coalesce((SELECT pp.countries FROM public.passport_progress pp WHERE pp.user_id = p_user), 0) INTO v_intl;
  RETURN QUERY SELECT
    CASE WHEN v_best>=3000 THEN 'World Class 👑' WHEN v_best>=1500 THEN 'Jet Setter' WHEN v_best>=750 THEN 'First Class' WHEN v_best>=250 THEN 'Frequent Flyer' ELSE 'Carry-On' END,
    v_pts,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 'World Class 👑' WHEN v_best>=750 THEN 'Jet Setter' WHEN v_best>=250 THEN 'First Class' ELSE 'Frequent Flyer' END,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 3000 WHEN v_best>=750 THEN 1500 WHEN v_best>=250 THEN 750 ELSE 250 END,
    CASE WHEN v_best>=3000 THEN 3000 WHEN v_best>=1500 THEN 1500 WHEN v_best>=750 THEN 750 WHEN v_best>=250 THEN 250 ELSE 0 END,
    v_intl >= 10;
END $$;
