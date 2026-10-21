-- lovable-cron-fallback-reviewed: crowning is time-based at 23:59 trip-local; no row change triggers it, so a 15-minute sweep is the required max delay
-- 1. Pre-Flight closes 23:59 trip-local the night before departure, for every trip room
CREATE OR REPLACE FUNCTION trip_private.effective_crowning(p_trip uuid, p_season text)
 RETURNS timestamp with time zone LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT CASE
   WHEN p_season='game' AND t.kind='trip' THEN ((t.start_date - 1 + time '23:59') AT TIME ZONE coalesce(t.trip_timezone, t.home_timezone))
   WHEN s.crowning_mode='takeoff' THEN coalesce(s.crowning_at,(SELECT n.starts_at+interval '3 hours' FROM public.game_nights n WHERE n.trip_id=p_trip AND NOT n.skipped AND (n.starts_at AT TIME ZONE t.home_timezone)::date<t.start_date ORDER BY n.starts_at DESC LIMIT 1))
   WHEN s.crowning_mode='departure' THEN (t.start_date+time '08:00') AT TIME ZONE t.home_timezone
   ELSE s.crowning_at END
 FROM public.season_settings s JOIN public.trips t ON t.id=s.trip_id WHERE s.trip_id=p_trip AND s.season=p_season $function$;

-- 2. Countdown matches the crown close
CREATE OR REPLACE FUNCTION trip_private.season_timing(p_trip uuid)
 RETURNS TABLE(mode text, preflight_start date, cutoff timestamp with time zone, reveal_at timestamp with time zone, drop_count integer, finale_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; local_today date; days_total integer;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.season_rule<>'a2c' THEN RAISE EXCEPTION 'This room uses its original season'; END IF;
 local_today:=trip_private.trip_today(p_trip);
 days_total:=t.start_date-coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date);
 IF t.kind='trip' THEN
   mode:=CASE WHEN t.start_date<=local_today THEN 'trip_season' WHEN t.game_plan='quick_start' THEN 'quick_start' ELSE 'preflight' END;
   preflight_start:=greatest(coalesce(t.game_start,local_today),t.start_date-10);
   cutoff:=trip_private.quest_cutoff(p_trip);
   reveal_at:=((t.start_date - 1 + time '23:59') AT TIME ZONE coalesce(t.trip_timezone, t.home_timezone));
   drop_count:=CASE WHEN t.start_date<=(t.created_at AT TIME ZONE t.home_timezone)::date THEN 0 WHEN t.game_plan='quick_start' THEN 1 WHEN days_total<7 THEN 2 ELSE 3 END;
   finale_at:=reveal_at;
 ELSE
   mode:='at_home';preflight_start:=t.game_start;finale_at:=t.finale_at;cutoff:=t.finale_at;reveal_at:=t.finale_at;
   drop_count:=CASE WHEN t.end_date-t.start_date<6 THEN 2 ELSE 3 END;
 END IF;
 RETURN NEXT;
END $function$;

-- 3a. Pre-Flight crown no longer includes Airport Missions (takeoff) points
CREATE OR REPLACE FUNCTION trip_private.mission_bonus(p_trip uuid)
 RETURNS TABLE(user_id uuid, points integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT q.user_id, q.points::int FROM trip_private.season_quest_bonus(p_trip,'preflight') q $function$;

-- 3b. Trip Season board counts takeoff claims (capped 12)
CREATE OR REPLACE FUNCTION trip_private.season_points(p_trip uuid, p_season text)
 RETURNS TABLE(user_id uuid, games integer, quests integer, showcase integer, legacy integer, other integer, total integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_kind text;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 IF p_season NOT IN ('preflight','trip','home') THEN RAISE EXCEPTION 'Unknown season'; END IF;
 SELECT t.kind INTO v_kind FROM public.trips t WHERE t.id=p_trip;
 RETURN QUERY
 WITH m AS (SELECT tm.user_id, tm.start_stamps FROM public.trip_members tm WHERE tm.trip_id=p_trip AND tm.status='approved'),
 sq AS (SELECT q.user_id, coalesce(sum(trip_private.sealed_award(q)) FILTER (WHERE q.kind='sealed'),0)::int qp, coalesce(sum(trip_private.sealed_award(q)) FILTER (WHERE q.kind='showcase'),0)::int sp FROM public.sealed_quests q WHERE q.trip_id=p_trip GROUP BY q.user_id),
 gn AS (SELECT s.user_id, sum(CASE WHEN s.here THEN 10 ELSE 0 END + CASE WHEN s.won THEN 15 WHEN s.here THEN 5 ELSE 0 END + CASE WHEN s.here AND n.host_id=s.user_id THEN 5 ELSE 0 END)::int pts
   FROM public.game_scores s JOIN public.game_nights n ON n.trip_id=s.trip_id AND n.week_number=s.week_number AND NOT n.skipped AND n.starts_at <= now()
   WHERE s.trip_id=p_trip GROUP BY s.user_id),
 qa AS (SELECT a.user_id, (2*count(*) + 4*count(*) FILTER (WHERE q.winner_id=a.user_id))::int pts FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id),
 pen AS (SELECT hp.user_id, 5*sum(hp.stamps)::int pts FROM public.host_penalties hp WHERE hp.trip_id=p_trip GROUP BY hp.user_id),
 lg AS (SELECT x.user_id, sum(x.p)::int pts FROM (
   SELECT mc.user_id, mc.points p FROM public.mission_claims mc WHERE mc.trip_id=p_trip AND mc.phase='checkin' AND mc.status='released'
   UNION ALL SELECT sq2.user_id, sq2.awarded_points FROM public.season_quests sq2 WHERE sq2.trip_id=p_trip AND sq2.quest_kind='preflight' AND sq2.status='approved') x GROUP BY x.user_id),
 ts AS (SELECT r.user_id, r.stamps::int pts FROM trip_private.trip_season(p_trip) r WHERE p_season='trip'),
 sb AS (SELECT f.user_id, (5*count(*))::int pts FROM trip_private.trip_speed_finishes f WHERE f.trip_id=p_trip AND p_season='trip' AND trip_private.speed_bonus_ok(f.revealed_at,f.finished_at) GROUP BY f.user_id),
 sg AS (SELECT r.user_id, r.pts FROM trip_private.season_game_points(p_trip) r WHERE p_season='trip' AND trip_private.season_games_ok(p_trip)),
 tk AS (SELECT c.user_id, least(12, sum(c.points))::int pts FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.phase='takeoff' AND c.status='released' AND p_season='trip' GROUP BY c.user_id),
 hs AS (SELECT r.user_id, r.points::int pts FROM trip_private.home_day_scores(p_trip) r WHERE p_season='home'),
 parts AS (
 SELECT m.user_id,
  CASE WHEN p_season='preflight' THEN coalesce(gn.pts,0)+coalesce(qa.pts,0)+5*coalesce(m.start_stamps,0)-coalesce(pen.pts,0) ELSE 0 END g,
  CASE WHEN p_season IN ('preflight','home') THEN coalesce(sq.qp,0) ELSE 0 END q,
  CASE WHEN (p_season='trip' AND v_kind='trip') OR (p_season='home' AND v_kind<>'trip') THEN coalesce(sq.sp,0) ELSE 0 END s,
  CASE WHEN p_season='preflight' THEN coalesce(lg.pts,0) ELSE 0 END l,
  coalesce(ts.pts,0)+coalesce(hs.pts,0)+coalesce(sb.pts,0)+coalesce(sg.pts,0)+coalesce(tk.pts,0) o
 FROM m LEFT JOIN sq ON sq.user_id=m.user_id LEFT JOIN gn ON gn.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id
  LEFT JOIN pen ON pen.user_id=m.user_id LEFT JOIN lg ON lg.user_id=m.user_id LEFT JOIN ts ON ts.user_id=m.user_id LEFT JOIN hs ON hs.user_id=m.user_id LEFT JOIN sb ON sb.user_id=m.user_id LEFT JOIN sg ON sg.user_id=m.user_id LEFT JOIN tk ON tk.user_id=m.user_id)
 SELECT p.user_id, p.g::int, p.q::int, p.s::int, p.l::int, p.o::int, greatest(p.g+p.q+p.s+p.l+p.o,0)::int FROM parts p;
END $function$;

-- 3c. Trip Season crown includes the same capped takeoff bonus
CREATE OR REPLACE FUNCTION trip_private.trip_season_score(p_trip uuid)
 RETURNS TABLE(user_id uuid, stamps integer, today_stamps integer, max_stamps integer, score integer, carry_on integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT s.user_id,s.stamps,s.today_stamps,s.max_stamps,
  least(100,greatest(0,(CASE WHEN s.max_stamps>0 THEN round(s.stamps*100.0/s.max_stamps)::int ELSE 0 END)+coalesce(b.points,0)+coalesce(tk.pts,0)))::int,
  coalesce(b.points,0)
 FROM trip_private.trip_season(p_trip) s
 LEFT JOIN trip_private.season_quest_bonus(p_trip,'carry_on') b ON b.user_id=s.user_id
 LEFT JOIN (SELECT c.user_id, least(12,sum(c.points))::int pts FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.phase='takeoff' AND c.status='released' GROUP BY c.user_id) tk ON tk.user_id=s.user_id $function$;

-- 4. Departure confirm = optional delay adjustment, trip-local date
CREATE OR REPLACE FUNCTION trip_private.confirm_departure(p_trip uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can confirm departure'; END IF;
 UPDATE public.trips SET departure_confirmed_at=now() WHERE id=p_trip AND play_arrangement IS NOT NULL AND is_sandbox=false AND departure_confirmed_at IS NULL AND start_date <= trip_private.trip_today(p_trip);
 IF NOT FOUND THEN RAISE EXCEPTION 'Departure can only be confirmed on or after your first trip day'; END IF;
END $function$;

-- 5. Server-side crowning: membership checks in the scoring chain allow the internal crowning flag
DO $do$
DECLARE f text; d text;
BEGIN
 FOREACH f IN ARRAY ARRAY['trip_private.season_quest_bonus(uuid,text)','trip_private.trip_season(uuid)'] LOOP
   d := pg_get_functiondef(f::regprocedure);
   d := regexp_replace(d, 'IF NOT trip_private\.is_trip_member\(p_trip, ?auth\.uid\(\)\) THEN',
        'IF coalesce(current_setting(''trip_private.crowning'', true), '''') <> ''on'' AND NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN');
   IF d !~ 'trip_private\.crowning' THEN RAISE EXCEPTION 'membership check not found in %', f; END IF;
   EXECUTE d;
 END LOOP;
END $do$;

CREATE OR REPLACE FUNCTION trip_private.crown_season(p_trip uuid, p_season text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE st public.season_settings; v_at timestamptz;
BEGIN
 IF NOT coalesce((SELECT season_scoring FROM public.trips WHERE id=p_trip),true) THEN RETURN; END IF;
 SELECT * INTO st FROM public.season_settings WHERE trip_id=p_trip AND season=p_season; IF NOT FOUND THEN RETURN; END IF;
 v_at:=trip_private.effective_crowning(p_trip,p_season); IF v_at IS NULL OR v_at>now() THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('crown'||p_trip::text||p_season));
 IF EXISTS(SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RETURN; END IF;
 PERFORM set_config('trip_private.crowning','on',true);
 IF p_season='trip' THEN
   INSERT INTO public.season_champions(trip_id,season,user_id,score,stamps)
   WITH r AS (SELECT user_id,stamps,score FROM trip_private.trip_season_score(p_trip))
   SELECT p_trip,'trip',r.user_id,r.score,r.stamps FROM r WHERE r.stamps>0 AND (SELECT count(*) FROM r o WHERE (o.score,o.stamps)>(r.score,r.stamps))<st.winners;
 ELSE
   INSERT INTO public.season_champions(trip_id,season,user_id,score,stamps,tie_ids)
   WITH r AS (SELECT * FROM trip_private.game_board(p_trip) WHERE stamps>0),
   k AS (SELECT r.*,(SELECT count(*) FROM r o WHERE (o.score,o.attended)>(r.score,r.attended)) ahead,(SELECT array_agg(o.user_id ORDER BY o.user_id) FROM r o WHERE o.score=r.score AND o.attended=r.attended) grp,row_number() OVER (ORDER BY r.score DESC,r.attended DESC,random()) rn FROM r)
   SELECT p_trip,'game',k.user_id,k.score,k.stamps,CASE WHEN cardinality(k.grp)>1 AND k.ahead+cardinality(k.grp)>st.winners THEN k.grp END FROM k WHERE k.rn<=st.winners;
 END IF;
 PERFORM set_config('trip_private.crowning','',true);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.finalize_season(p_trip uuid, p_season text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 PERFORM trip_private.crown_season(p_trip, p_season);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.crown_due()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; n integer := 0;
BEGIN
 FOR r IN SELECT s.trip_id, s.season FROM public.season_settings s
   WHERE NOT EXISTS (SELECT 1 FROM public.season_champions c WHERE c.trip_id=s.trip_id AND c.season=s.season)
     AND trip_private.effective_crowning(s.trip_id, s.season) <= now()
 LOOP
   BEGIN
     PERFORM trip_private.crown_season(r.trip_id, r.season); n := n + 1;
   EXCEPTION WHEN others THEN RAISE WARNING 'crown_due % %: %', r.trip_id, r.season, SQLERRM;
   END;
 END LOOP;
 RETURN n;
END $function$;

REVOKE ALL ON FUNCTION trip_private.crown_season(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION trip_private.crown_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.crown_season(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION trip_private.crown_due() TO service_role;

SELECT cron.schedule('crown-due-seasons', '*/15 * * * *', $$SELECT trip_private.crown_due();$$);