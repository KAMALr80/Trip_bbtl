CREATE TABLE public.experience_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
  culture_exp_id uuid UNIQUE REFERENCES public.culture_experiences(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('trip','at_home','culture_home','culture_travel')),
  country text, region text, city text,
  month_year text, length_days int, vibe text, squad_size int,
  games_played int NOT NULL DEFAULT 0, checkin_done int NOT NULL DEFAULT 0, takeoff_done int NOT NULL DEFAULT 0,
  task_titles text[] NOT NULL DEFAULT '{}', game_nights int NOT NULL DEFAULT 0, stamps_earned int NOT NULL DEFAULT 0,
  culture_public boolean NOT NULL DEFAULT false,
  unlisted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((trip_id IS NULL) <> (culture_exp_id IS NULL))
);
GRANT SELECT ON public.experience_previews TO authenticated;
GRANT ALL ON public.experience_previews TO service_role;
ALTER TABLE public.experience_previews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in read shared previews" ON public.experience_previews FOR SELECT TO authenticated USING (unlisted_at IS NULL OR trip_private.is_app_admin());

CREATE TABLE public.preview_hidden (
  user_id uuid NOT NULL, preview_id uuid NOT NULL REFERENCES public.experience_previews(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, preview_id)
);
GRANT SELECT ON public.preview_hidden TO authenticated;
GRANT ALL ON public.preview_hidden TO service_role;
ALTER TABLE public.preview_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own hidden previews" ON public.preview_hidden FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.junkie_ranks (
  user_id uuid PRIMARY KEY, best_points int NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.junkie_ranks TO authenticated;
GRANT ALL ON public.junkie_ranks TO service_role;
ALTER TABLE public.junkie_ranks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own rank row" ON public.junkie_ranks FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Share / unshare a preview (Captain for trips and At Home, creator for Cultural Inspiration). Data comes from server tables only.
CREATE FUNCTION trip_private.share_preview(p_trip uuid, p_exp uuid, p_on boolean)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; e public.culture_experiences; v_country text; v_region text; v_city text; last_part text;
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
      last_part := nullif(btrim(split_part(t.destination, ',', array_length(string_to_array(t.destination,','),1))), '');
      v_country := coalesce(nullif(btrim(t.passport_country),''), last_part);
      v_city := coalesce(nullif(btrim(t.passport_city),''), CASE WHEN position(',' IN t.destination) > 0 THEN nullif(btrim(split_part(t.destination,',',1)),'') END);
      v_region := nullif(btrim(t.passport_state),'');
      IF lower(coalesce(v_country,'')) = ANY(ARRAY['usa','us','u.s.','united states','united states of america']) THEN v_country := 'US'; END IF;
      IF v_region IS NULL AND upper(coalesce(v_country,'')) ~ '^[A-Z]{2}$' AND v_country NOT IN ('US') AND last_part IS NOT NULL AND length(last_part)=2 THEN v_region := NULL; END IF;
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

CREATE FUNCTION trip_private.preview_action(p_preview uuid, p_action text, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.experience_previews WHERE id=p_preview) THEN RAISE EXCEPTION 'Preview not found'; END IF;
  IF p_action='hide' THEN
    INSERT INTO public.preview_hidden(user_id,preview_id) VALUES (auth.uid(),p_preview) ON CONFLICT DO NOTHING;
  ELSIF p_action='unhide' THEN
    DELETE FROM public.preview_hidden WHERE user_id=auth.uid() AND preview_id=p_preview;
  ELSIF p_action='report' THEN
    IF (SELECT count(*) FROM public.bug_reports WHERE user_id=auth.uid() AND kind='preview_report' AND created_at > now() - interval '1 day') >= 10 THEN RAISE EXCEPTION 'Too many reports today'; END IF;
    INSERT INTO public.bug_reports(user_id,page,description,kind) VALUES (auth.uid(),'preview:'||p_preview::text,left(coalesce(nullif(btrim(p_reason),''),'Reported preview'),2000),'preview_report');
    INSERT INTO public.preview_hidden(user_id,preview_id) VALUES (auth.uid(),p_preview) ON CONFLICT DO NOTHING;
  ELSIF p_action IN ('unlist','relist') THEN
    IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
    UPDATE public.experience_previews SET unlisted_at = CASE WHEN p_action='unlist' THEN now() END, updated_at=now() WHERE id=p_preview;
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
END $function$;

-- Junkie Rank: one activity rank, separate from game scores. Highest tier is kept.
CREATE FUNCTION trip_private.junkie_rank(p_user uuid)
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
  SELECT count(*) INTO v_intl FROM public.passport_stamps s JOIN public.trips t ON t.id=s.trip_id AND t.kind='trip' AND NOT t.is_sandbox WHERE s.user_id=p_user AND s.kind='international';
  RETURN QUERY SELECT
    CASE WHEN v_best>=3000 THEN 'World Class 👑' WHEN v_best>=1500 THEN 'Jet Setter' WHEN v_best>=750 THEN 'First Class' WHEN v_best>=250 THEN 'Frequent Flyer' ELSE 'Carry-On' END,
    v_pts,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 'World Class 👑' WHEN v_best>=750 THEN 'Jet Setter' WHEN v_best>=250 THEN 'First Class' ELSE 'Frequent Flyer' END,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 3000 WHEN v_best>=750 THEN 1500 WHEN v_best>=250 THEN 750 ELSE 250 END,
    CASE WHEN v_best>=3000 THEN 3000 WHEN v_best>=1500 THEN 1500 WHEN v_best>=750 THEN 750 WHEN v_best>=250 THEN 250 ELSE 0 END,
    v_intl >= 5;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.traveler_level(p_user uuid)
 RETURNS TABLE(level text, real_trips integer, international_trips integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
 RETURN QUERY SELECT r.tier, (SELECT count(*)::int FROM public.passport_stamps s WHERE s.user_id=p_user), (SELECT count(*)::int FROM public.passport_stamps s WHERE s.user_id=p_user AND s.kind='international') FROM trip_private.junkie_rank(p_user) r;
END $function$;

CREATE FUNCTION public.share_preview(p_trip uuid DEFAULT NULL, p_exp uuid DEFAULT NULL, p_on boolean DEFAULT false) RETURNS boolean LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.share_preview(p_trip,p_exp,p_on) $$;
CREATE FUNCTION public.preview_action(p_preview uuid, p_action text, p_reason text DEFAULT NULL) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.preview_action(p_preview,p_action,p_reason) $$;
CREATE FUNCTION public.junkie_rank(p_user uuid) RETURNS TABLE(tier text, points integer, next_tier text, next_at integer, tier_at integer, passport_junkie boolean) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.junkie_rank(p_user) $$;
DO $$ DECLARE f text; BEGIN
 FOREACH f IN ARRAY ARRAY['trip_private.share_preview(uuid,uuid,boolean)','trip_private.preview_action(uuid,text,text)','trip_private.junkie_rank(uuid)','public.share_preview(uuid,uuid,boolean)','public.preview_action(uuid,text,text)','public.junkie_rank(uuid)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
 END LOOP; END $$;