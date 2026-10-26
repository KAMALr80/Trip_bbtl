ALTER TABLE public.trip_day_games ADD COLUMN released_at timestamptz;
UPDATE public.trip_day_games SET released_at = now() WHERE released_at IS NULL;
DROP POLICY "Members view day games" ON public.trip_day_games;
CREATE POLICY "Members view released day games" ON public.trip_day_games FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()) AND (released_at IS NOT NULL OR trip_private.is_leader(trip_id)));

ALTER TABLE public.game_nights ADD COLUMN skipped boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION trip_private.release_trip_day(p_trip uuid, p_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can release games'; END IF;
UPDATE public.trip_day_games SET released_at = coalesce(released_at, now()) WHERE trip_id=p_trip AND day_date=p_date;
IF NOT FOUND THEN RAISE EXCEPTION 'Today''s games are still being prepared — try again in a moment'; END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.set_night_skipped(p_trip uuid, p_week integer, p_skipped boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can skip a night'; END IF;
UPDATE public.game_nights SET skipped = coalesce(p_skipped,false) WHERE trip_id=p_trip AND week_number=p_week;
IF NOT FOUND THEN RAISE EXCEPTION 'Game night not found'; END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.finalize_season(p_trip uuid, p_season text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE st public.season_settings; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT * INTO st FROM public.season_settings WHERE trip_id=p_trip AND season=p_season;
IF NOT FOUND OR st.crowning_at IS NULL OR st.crowning_at > now() THEN RETURN; END IF;
IF EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RETURN; END IF;
IF p_season = 'trip' THEN
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  SELECT p_trip, 'trip', r.user_id, r.score, r.stamps FROM (SELECT t.user_id, t.stamps, CASE WHEN t.max_stamps > 0 THEN round(t.stamps*100.0/t.max_stamps)::int ELSE 0 END score FROM trip_private.trip_season(p_trip) t) r
  WHERE r.stamps > 0 AND (SELECT count(*) FROM trip_private.trip_season(p_trip) o WHERE (CASE WHEN o.max_stamps>0 THEN round(o.stamps*100.0/o.max_stamps)::int ELSE 0 END, o.stamps) > (r.score, r.stamps)) < st.winners;
ELSE
  INSERT INTO public.season_champions(trip_id, season, user_id, score, stamps)
  WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
  g AS (SELECT m.user_id,
    sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
    sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
    FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now() AND NOT n.skipped
    LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
    WHERE m.trip_id=p_trip GROUP BY m.user_id),
  qw AS (SELECT count(*)::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
  qa AS (SELECT a.user_id, count(*)::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id),
  r AS (SELECT m.user_id, (coalesce(g.stamps,0)+coalesce(qa.n,0))::int stamps, CASE WHEN coalesce(g.mx,0)+qw.total>0 THEN round((coalesce(g.stamps,0)+coalesce(qa.n,0))*100.0/(coalesce(g.mx,0)+qw.total))::int ELSE 0 END score FROM public.trip_members m CROSS JOIN qw LEFT JOIN g ON g.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id WHERE m.trip_id=p_trip)
  SELECT p_trip, 'game', r.user_id, r.score, r.stamps FROM r WHERE r.stamps > 0 AND (SELECT count(*) FROM r o WHERE (o.score,o.stamps) > (r.score,r.stamps)) < st.winners;
END IF; END $fn$;

REVOKE ALL ON FUNCTION trip_private.release_trip_day(uuid,date), trip_private.set_night_skipped(uuid,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.release_trip_day(uuid,date), trip_private.set_night_skipped(uuid,integer,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.release_trip_day(p_trip uuid, p_date date) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.release_trip_day(p_trip, p_date) $fn$;
CREATE OR REPLACE FUNCTION public.set_night_skipped(p_trip uuid, p_week integer, p_skipped boolean) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.set_night_skipped(p_trip, p_week, p_skipped) $fn$;
REVOKE ALL ON FUNCTION public.release_trip_day(uuid,date), public.set_night_skipped(uuid,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_trip_day(uuid,date), public.set_night_skipped(uuid,integer,boolean) TO authenticated;