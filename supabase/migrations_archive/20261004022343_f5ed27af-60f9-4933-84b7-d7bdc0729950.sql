-- 1. Shared experience days: full place / tagged squad only for creator, squad and founder.
DROP POLICY IF EXISTS "viewable days" ON public.culture_exp_days;
CREATE POLICY "private days" ON public.culture_exp_days FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.culture_experiences e WHERE e.id=experience_id AND (e.creator_id=auth.uid() OR trip_private.is_app_admin() OR (e.trip_id IS NOT NULL AND trip_private.is_trip_member(e.trip_id, auth.uid())))));
CREATE OR REPLACE FUNCTION public.culture_days(p_exp uuid) RETURNS SETOF public.culture_exp_days LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.culture_experiences; r public.culture_exp_days; priv boolean;
BEGIN
  IF NOT trip_private.can_view_culture(p_exp) THEN RETURN; END IF;
  SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp;
  priv := e.creator_id=auth.uid() OR trip_private.is_app_admin() OR (e.trip_id IS NOT NULL AND trip_private.is_trip_member(e.trip_id, auth.uid()));
  FOR r IN SELECT * FROM public.culture_exp_days WHERE experience_id=p_exp ORDER BY day_number LOOP
    IF NOT priv THEN r.place := CASE WHEN r.place IS NULL THEN NULL ELSE coalesce(e.city, e.region) END; r.with_users := '{}'; r.confirmed_by := CASE WHEN r.confirmed_by=e.creator_id THEN r.confirmed_by END; END IF;
    RETURN NEXT r;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.culture_days(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.culture_days(uuid) TO authenticated, service_role;

-- 6. Mission pool text is never directly readable; reveal goes through mission_action.
DROP POLICY IF EXISTS "Members read missions" ON public.security_missions;
REVOKE SELECT ON public.security_missions FROM authenticated;

-- 4. Top-ups only via the server after the credit spend.
REVOKE EXECUTE ON FUNCTION public.add_trip_missions(uuid,text[]), trip_private.add_trip_missions(uuid,text[]), public.add_checkin_tasks(uuid,jsonb), trip_private.add_checkin_tasks(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_trip_missions(uuid,text[]), trip_private.add_trip_missions(uuid,text[]), public.add_checkin_tasks(uuid,jsonb), trip_private.add_checkin_tasks(uuid,jsonb) TO service_role;

-- 8. Preview links to trips/experiences are hidden from viewers.
REVOKE SELECT ON public.experience_previews FROM authenticated;
GRANT SELECT (id, kind, country, region, city, month_year, length_days, vibe, squad_size, games_played, checkin_done, takeoff_done, task_titles, game_nights, stamps_earned, culture_public, unlisted_at, created_at, updated_at) ON public.experience_previews TO authenticated;
CREATE OR REPLACE FUNCTION public.my_preview_shared(p_trip uuid DEFAULT NULL, p_exp uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN p_trip IS NOT NULL THEN trip_private.is_captain(p_trip) AND EXISTS (SELECT 1 FROM public.experience_previews WHERE trip_id=p_trip)
    ELSE EXISTS (SELECT 1 FROM public.experience_previews p JOIN public.culture_experiences e ON e.id=p.culture_exp_id WHERE p.culture_exp_id=p_exp AND e.creator_id=auth.uid()) END $$;
CREATE OR REPLACE FUNCTION public.preview_culture_link(p_preview uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.culture_exp_id FROM public.experience_previews p WHERE p.id=p_preview AND p.culture_public AND p.unlisted_at IS NULL AND trip_private.can_view_culture(p.culture_exp_id) $$;
REVOKE ALL ON FUNCTION public.my_preview_shared(uuid,uuid), public.preview_culture_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_preview_shared(uuid,uuid), public.preview_culture_link(uuid) TO authenticated, service_role;

-- 5. Home crown for Junkie Rank (stays out of competitive seasons).
ALTER TABLE public.season_champions DROP CONSTRAINT season_champions_season_check;
ALTER TABLE public.season_champions ADD CONSTRAINT season_champions_season_check CHECK (season IN ('game','trip','home'));

CREATE OR REPLACE FUNCTION trip_private.home_day_action(p_session uuid, p_action text, p_choice integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.home_day_sessions; v_next uuid; BEGIN
 SELECT * INTO s FROM public.home_day_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR NOT trip_private.is_trip_member(s.trip_id,auth.uid()) THEN RAISE EXCEPTION 'Join this experience first'; END IF;
 IF now()<s.starts_at THEN RAISE EXCEPTION 'This Game Day has not started'; END IF;
 IF p_action='complete' AND s.step IN ('card','present') THEN
   INSERT INTO public.home_day_results(session_id,user_id,completed_at) VALUES(s.id,auth.uid(),now()) ON CONFLICT(session_id,user_id) DO UPDATE SET completed_at=coalesce(home_day_results.completed_at,EXCLUDED.completed_at);
 ELSIF p_action='presented' THEN
   IF NOT trip_private.is_leader(s.trip_id) OR s.step<>'present' OR s.presenter_id IS NULL THEN RAISE EXCEPTION 'The host marks each presentation'; END IF;
   INSERT INTO public.home_day_results(session_id,user_id,presented_at) VALUES(s.id,s.presenter_id,now()) ON CONFLICT(session_id,user_id) DO UPDATE SET presented_at=coalesce(home_day_results.presented_at,EXCLUDED.presented_at);
   SELECT m.user_id INTO v_next FROM public.trip_members m WHERE m.trip_id=s.trip_id AND m.status='approved' AND m.user_id<>s.presenter_id AND NOT EXISTS(SELECT 1 FROM public.home_day_results r WHERE r.session_id=s.id AND r.user_id=m.user_id AND r.presented_at IS NOT NULL) ORDER BY m.approved_at,m.joined_at LIMIT 1;
   UPDATE public.home_day_sessions SET presenter_id=v_next,step=CASE WHEN v_next IS NULL THEN 'vote' ELSE 'present' END WHERE id=s.id;
 ELSIF p_action='next' THEN
   IF NOT trip_private.is_leader(s.trip_id) OR s.step<>'card' THEN RAISE EXCEPTION 'Only the host opens presentations'; END IF;
   SELECT m.user_id INTO v_next FROM public.trip_members m WHERE m.trip_id=s.trip_id AND m.status='approved' ORDER BY m.approved_at,m.joined_at LIMIT 1;
   UPDATE public.home_day_sessions SET presenter_id=v_next,step=CASE WHEN v_next IS NULL THEN 'vote' ELSE 'present' END WHERE id=s.id;
 ELSIF p_action='vote' THEN
   IF s.step<>'vote' OR p_choice NOT IN (0,1) THEN RAISE EXCEPTION 'Voting is not open'; END IF;
   INSERT INTO public.home_day_results(session_id,user_id,voted_at,choice) VALUES(s.id,auth.uid(),now(),p_choice) ON CONFLICT(session_id,user_id) DO UPDATE SET voted_at=EXCLUDED.voted_at,choice=EXCLUDED.choice;
 ELSIF p_action='reveal' THEN
   IF NOT trip_private.is_leader(s.trip_id) OR s.step<>'vote' THEN RAISE EXCEPTION 'Only the host reveals votes'; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.home_day_results WHERE session_id=s.id AND voted_at IS NOT NULL) THEN RAISE EXCEPTION 'Wait for at least one vote'; END IF;
   UPDATE public.home_day_sessions SET step='done',revealed_at=now() WHERE id=s.id;
   IF NOT EXISTS (SELECT 1 FROM public.home_day_sessions WHERE trip_id=s.trip_id AND step<>'done') THEN
     INSERT INTO public.season_champions(trip_id,season,user_id,score,stamps)
       SELECT s.trip_id,'home',x.user_id,x.points,0 FROM trip_private.home_day_scores(s.trip_id) x
       WHERE x.points > 0 AND x.points = (SELECT max(y.points) FROM trip_private.home_day_scores(s.trip_id) y)
       ON CONFLICT DO NOTHING;
   END IF;
 ELSE RAISE EXCEPTION 'This step is not open'; END IF;
END $function$;

-- 7. Check-in deadline in trip time
CREATE OR REPLACE FUNCTION trip_private.mission_action(p_trip uuid, p_action text, p_slot integer, p_claim uuid, p_layover boolean, p_phase text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_kind text; v_t public.trips; v_m public.security_missions; v_c public.mission_claims; v_id uuid; v_phase text := coalesce(p_phase,'takeoff'); v_open boolean;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=v_uid AND status='approved') THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF v_phase NOT IN ('takeoff','checkin') THEN RAISE EXCEPTION 'Unknown mission type'; END IF;
  SELECT * INTO v_t FROM public.trips WHERE id=p_trip;
  v_open := CASE WHEN v_t.kind IN ('at_home','cultural_inspiration') THEN trip_private.trip_today(p_trip) <= v_t.end_date ELSE trip_private.trip_today(p_trip) <= v_t.start_date - 1 END;
  IF p_action = 'reveal' THEN
    IF v_phase='checkin' THEN
      IF NOT v_open THEN RAISE EXCEPTION 'Early Check-In has closed'; END IF;
      IF p_slot IS NULL OR p_slot < 1 OR p_slot > 3 THEN RAISE EXCEPTION 'Pick a task slot'; END IF;
    ELSE
      IF p_slot IS NULL OR p_slot < 1 OR p_slot > 5 THEN RAISE EXCEPTION 'Pick a mission slot'; END IF;
      IF p_slot > 3 AND NOT coalesce(p_layover,false) THEN RAISE EXCEPTION 'Missions 4 and 5 are for layovers'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND phase=v_phase AND slot=p_slot) THEN RAISE EXCEPTION 'Already revealed'; END IF;
    IF p_slot > 1 AND NOT EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND phase=v_phase AND slot=p_slot-1 AND status<>'revealed') THEN RAISE EXCEPTION 'Finish the one before this first'; END IF;
    v_kind := CASE WHEN v_phase='checkin' THEN 'checkin' WHEN v_t.kind IN ('at_home','cultural_inspiration') THEN 'home' ELSE 'trip' END;
    SELECT * INTO v_m FROM public.security_missions m
      WHERE m.kind=v_kind AND (m.trip_id IS NULL OR m.trip_id=p_trip)
        AND NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.user_id=v_uid AND c.mission_id=m.id)
        AND (v_phase<>'checkin' OR NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.phase='checkin' AND c.mission_id=m.id AND c.user_id<>v_uid)
             OR NOT EXISTS (SELECT 1 FROM public.security_missions m2 WHERE m2.kind='checkin' AND (m2.trip_id IS NULL OR m2.trip_id=p_trip) AND NOT EXISTS (SELECT 1 FROM public.mission_claims c2 WHERE c2.trip_id=p_trip AND c2.phase='checkin' AND c2.mission_id=m2.id)))
      ORDER BY md5(m.id::text || v_uid::text || p_trip::text) LIMIT 1;
    IF v_m.id IS NULL THEN RAISE EXCEPTION 'No more tasks — ask your Captain for more'; END IF;
    INSERT INTO public.mission_claims(trip_id,user_id,slot,mission_id,category,mission_text,points,phase,title,backstory,keywords)
      VALUES (p_trip,v_uid,p_slot,v_m.id,v_m.category,
        replace(v_m.text,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        CASE WHEN v_phase='checkin' THEN CASE WHEN p_slot=1 THEN 4 ELSE 3 END WHEN p_slot<=3 THEN 2 ELSE 3 END, v_phase,
        replace(v_m.title,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        replace(v_m.backstory,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        (SELECT array_agg(replace(k,'{destination}',coalesce(nullif(v_t.destination,''),'your destination'))) FROM unnest(v_m.keywords) k))
      RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO v_c FROM public.mission_claims WHERE id=p_claim AND trip_id=p_trip FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF p_action IN ('complete','skip') THEN
    IF v_c.user_id <> v_uid THEN RAISE EXCEPTION 'Not your mission'; END IF;
    IF v_c.status <> 'revealed' THEN RAISE EXCEPTION 'Already answered'; END IF;
    IF v_c.phase='checkin' AND p_action='complete' AND NOT v_open THEN RAISE EXCEPTION 'Early Check-In has closed'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='complete' THEN 'pending' ELSE 'skipped' END, updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  ELSIF p_action IN ('verify','decline') THEN
    IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can verify'; END IF;
    IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;
    IF v_c.user_id = v_uid THEN RAISE EXCEPTION 'Add a Co-Captain to verify your own missions'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='verify' THEN 'released' ELSE 'declined' END, verified_by=v_uid, decided_at=now(), updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $function$;

-- 2/8. share_preview
CREATE OR REPLACE FUNCTION trip_private.share_preview(p_trip uuid, p_exp uuid, p_on boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; e public.culture_experiences; v_country text; v_region text; v_city text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_trip IS NOT NULL THEN
    SELECT * INTO t FROM public.trips WHERE id=p_trip;
    IF t.id IS NULL OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can share a preview'; END IF;
    IF NOT coalesce(p_on,false) THEN DELETE FROM public.experience_previews WHERE trip_id=p_trip; RETURN false; END IF;
    IF t.is_sandbox THEN RAISE EXCEPTION 'Test Lab trips can''t share previews'; END IF;
    IF t.kind NOT IN ('trip','at_home') THEN RAISE EXCEPTION 'This experience can''t share a preview'; END IF;
    IF t.ended_at IS NULL AND current_date <= t.end_date THEN RAISE EXCEPTION 'Previews can be shared after the trip ends'; END IF;
    IF t.kind='at_home' THEN
      v_country := CASE t.at_home_pack WHEN 'thailand' THEN 'TH' WHEN 'mexico' THEN 'MX' WHEN 'japan' THEN 'JP' ELSE NULL END;
    ELSE
      v_country := nullif(btrim(t.passport_country),'');
      v_city := nullif(btrim(t.passport_city),'');
      v_region := nullif(btrim(t.passport_state),'');
      IF lower(coalesce(v_country,'')) = ANY(ARRAY['usa','us','u.s.','united states','united states of america']) THEN v_country := 'US'; END IF;
      IF length(coalesce(v_country,''))=2 AND upper(v_country) IN ('NV','CA','NY','FL','TX','HI','AZ','CO','GA','IL','WA') THEN v_region := upper(v_country); v_country := 'US'; END IF;
    END IF;
    INSERT INTO public.experience_previews(trip_id,kind,country,region,city,month_year,length_days,vibe,squad_size,games_played,checkin_done,takeoff_done,task_titles,game_nights,stamps_earned)
    SELECT t.id, t.kind, v_country, v_region, left(v_city,60), to_char(t.start_date,'YYYY-MM'), (t.end_date - t.start_date + 1), t.vibe,
      (SELECT count(*) FROM public.trip_members WHERE trip_id=t.id AND status='approved'),
      (SELECT count(DISTINCT game_number) FROM public.game_nights WHERE trip_id=t.id AND NOT skipped AND starts_at <= now() AND game_number IS NOT NULL),
      (SELECT count(*) FROM public.mission_claims WHERE trip_id=t.id AND phase='checkin' AND status='released'),
      (SELECT count(*) FROM public.mission_claims WHERE trip_id=t.id AND phase='takeoff' AND status='released'),
      coalesce((SELECT array_agg(x.title) FROM (SELECT DISTINCT title FROM public.mission_claims WHERE trip_id=t.id AND phase='checkin' AND status='released' AND title IS NOT NULL LIMIT 6) x), '{}'),
      CASE WHEN t.kind='at_home' THEN (SELECT count(*) FROM public.home_day_sessions WHERE trip_id=t.id AND starts_at <= now()) ELSE (SELECT count(*) FROM public.game_nights WHERE trip_id=t.id AND NOT skipped AND starts_at <= now()) END,
      coalesce((SELECT sum(g.stamps) FROM trip_private.game_stamps(t.id) g), 0)
    ON CONFLICT (trip_id) DO UPDATE SET country=excluded.country, region=excluded.region, city=excluded.city, month_year=excluded.month_year, length_days=excluded.length_days, vibe=excluded.vibe, squad_size=excluded.squad_size, games_played=excluded.games_played, checkin_done=excluded.checkin_done, takeoff_done=excluded.takeoff_done, task_titles=excluded.task_titles, game_nights=excluded.game_nights, stamps_earned=excluded.stamps_earned, updated_at=now();
    RETURN true;
  END IF;
  SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp;
  IF e.id IS NULL OR e.creator_id <> auth.uid() THEN RAISE EXCEPTION 'Only the creator can share a preview'; END IF;
  IF NOT coalesce(p_on,false) THEN DELETE FROM public.experience_previews WHERE culture_exp_id=p_exp; RETURN false; END IF;
  IF coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION 'Sharing previews is for members 18+'; END IF;
  IF e.finished_at IS NULL THEN RAISE EXCEPTION 'Finish the experience first'; END IF;
  IF e.unlisted_at IS NOT NULL THEN RAISE EXCEPTION 'This experience was unlisted'; END IF;
  IF e.trip_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trips WHERE id=e.trip_id AND is_sandbox) THEN RAISE EXCEPTION 'Test Lab experiences can''t share previews'; END IF;
  INSERT INTO public.experience_previews(culture_exp_id,kind,country,region,city,month_year,length_days,squad_size,task_titles,culture_public)
  SELECT e.id, CASE WHEN e.track='travel' THEN 'culture_travel' ELSE 'culture_home' END, e.country, e.region, e.city, to_char(e.start_date,'YYYY-MM'), e.days, 1,
    coalesce((SELECT array_agg(x.title) FROM (SELECT title FROM public.culture_exp_days WHERE experience_id=e.id ORDER BY day_number LIMIT 6) x), '{}'),
    e.visibility='public'
  ON CONFLICT (culture_exp_id) DO UPDATE SET country=excluded.country, region=excluded.region, city=excluded.city, month_year=excluded.month_year, length_days=excluded.length_days, task_titles=excluded.task_titles, culture_public=excluded.culture_public, updated_at=now();
  RETURN true;
END $function$;

-- 3. Passport Junkie
CREATE OR REPLACE FUNCTION trip_private.junkie_rank(p_user uuid)
 RETURNS TABLE(tier text, points integer, next_tier text, next_at integer, tier_at integer, passport_junkie boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    + (SELECT count(*) FROM public.mission_claims c JOIN public.trips s ON s.id=c.trip_id AND NOT s.is_sandbox WHERE c.user_id=p_user AND c.status='released')*5
  INTO v_pts;
  INSERT INTO public.junkie_ranks(user_id,best_points) VALUES (p_user, v_pts)
    ON CONFLICT (user_id) DO UPDATE SET best_points=greatest(public.junkie_ranks.best_points, excluded.best_points), updated_at=now()
    RETURNING best_points INTO v_best;
  PERFORM trip_private.sync_passport(p_user);
  SELECT count(*) INTO v_intl FROM public.passport_stamps s JOIN public.trips t ON t.id=s.trip_id AND t.kind='trip' AND NOT t.is_sandbox AND t.unlocked_at IS NOT NULL AND (t.ended_at IS NOT NULL OR current_date > t.end_date) AND (SELECT count(*) FROM public.trip_members x WHERE x.trip_id=t.id AND x.status='approved') >= 3 WHERE s.user_id=p_user AND s.kind='international';
  RETURN QUERY SELECT
    CASE WHEN v_best>=3000 THEN 'World Class 👑' WHEN v_best>=1500 THEN 'Jet Setter' WHEN v_best>=750 THEN 'First Class' WHEN v_best>=250 THEN 'Frequent Flyer' ELSE 'Carry-On' END,
    v_pts,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 'World Class 👑' WHEN v_best>=750 THEN 'Jet Setter' WHEN v_best>=250 THEN 'First Class' ELSE 'Frequent Flyer' END,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 3000 WHEN v_best>=750 THEN 1500 WHEN v_best>=250 THEN 750 ELSE 250 END,
    CASE WHEN v_best>=3000 THEN 3000 WHEN v_best>=1500 THEN 1500 WHEN v_best>=750 THEN 750 WHEN v_best>=250 THEN 250 ELSE 0 END,
    v_intl >= 5;
END $function$;