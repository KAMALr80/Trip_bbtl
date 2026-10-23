CREATE TABLE public.season_settings (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, season text NOT NULL CHECK (season IN ('game','trip')), winners integer NOT NULL DEFAULT 1 CHECK (winners IN (1,2)), prize text NOT NULL DEFAULT '' CHECK (length(prize) <= 200), crowning_at timestamptz, crowning_label text NOT NULL DEFAULT '' CHECK (length(crowning_label) <= 160), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, season));
GRANT SELECT ON public.season_settings TO authenticated; GRANT ALL ON public.season_settings TO service_role;
ALTER TABLE public.season_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prizes are read through season_info" ON public.season_settings FOR SELECT TO authenticated USING (false);
CREATE TRIGGER set_season_settings_updated_at BEFORE UPDATE ON public.season_settings FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.season_champions (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, season text NOT NULL CHECK (season IN ('game','trip')), user_id uuid NOT NULL, score integer NOT NULL DEFAULT 0, stamps integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, season, user_id));
GRANT SELECT ON public.season_champions TO authenticated; GRANT ALL ON public.season_champions TO service_role;
ALTER TABLE public.season_champions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view champions" ON public.season_champions FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.trip_teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 40), color text NOT NULL CHECK (color IN ('orange','blue','green','yellow')), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.trip_teams TO authenticated; GRANT ALL ON public.trip_teams TO service_role;
ALTER TABLE public.trip_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view teams" ON public.trip_teams FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.trip_team_members (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, user_id uuid NOT NULL, team_id uuid NOT NULL REFERENCES public.trip_teams(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, user_id));
GRANT SELECT ON public.trip_team_members TO authenticated; GRANT ALL ON public.trip_team_members TO service_role;
ALTER TABLE public.trip_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view team members" ON public.trip_team_members FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.photo_reactions (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, photo_path text NOT NULL, user_id uuid NOT NULL DEFAULT auth.uid(), emoji text NOT NULL CHECK (emoji IN ('❤️','😂','🔥','😍','👏')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (photo_path, user_id, emoji));
GRANT SELECT, INSERT, DELETE ON public.photo_reactions TO authenticated; GRANT ALL ON public.photo_reactions TO service_role;
ALTER TABLE public.photo_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view reactions" ON public.photo_reactions FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Members add own reactions" ON public.photo_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()) AND split_part(photo_path,'/',1) = trip_id::text);
CREATE POLICY "Members remove own reactions" ON public.photo_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.photo_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, photo_path text NOT NULL, user_id uuid NOT NULL DEFAULT auth.uid(), reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 300), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (photo_path, user_id));
GRANT SELECT, INSERT ON public.photo_reports TO authenticated; GRANT ALL ON public.photo_reports TO service_role;
ALTER TABLE public.photo_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaders view reports" ON public.photo_reports FOR SELECT TO authenticated USING (trip_private.is_leader(trip_id));
CREATE POLICY "Members report photos" ON public.photo_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()) AND split_part(photo_path,'/',1) = trip_id::text);

CREATE TABLE public.photo_removed (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, photo_path text NOT NULL, removed_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, photo_path));
GRANT SELECT ON public.photo_removed TO authenticated; GRANT ALL ON public.photo_removed TO service_role;
ALTER TABLE public.photo_removed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view removed photos" ON public.photo_removed FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));

CREATE OR REPLACE FUNCTION trip_private.season_info(p_trip uuid) RETURNS TABLE(season text, winners integer, prize text, crowning_at timestamptz, crowning_label text, revealed boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
RETURN QUERY SELECT s.season, s.winners, CASE WHEN trip_private.is_leader(p_trip) OR (s.crowning_at IS NOT NULL AND s.crowning_at <= now()) THEN s.prize ELSE NULL END, s.crowning_at, s.crowning_label, (s.crowning_at IS NOT NULL AND s.crowning_at <= now()) FROM public.season_settings s WHERE s.trip_id = p_trip; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.set_season(p_trip uuid, p_season text, p_winners integer, p_prize text, p_crowning_at timestamptz, p_label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set prizes'; END IF;
IF EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season=p_season) THEN RAISE EXCEPTION 'This season is already crowned'; END IF;
INSERT INTO public.season_settings(trip_id, season, winners, prize, crowning_at, crowning_label) VALUES (p_trip, p_season, p_winners, trim(coalesce(p_prize,'')), p_crowning_at, trim(coalesce(p_label,'')))
ON CONFLICT (trip_id, season) DO UPDATE SET winners=EXCLUDED.winners, prize=EXCLUDED.prize, crowning_at=EXCLUDED.crowning_at, crowning_label=EXCLUDED.crowning_label; END $fn$;

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
    FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now()
    LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
    WHERE m.trip_id=p_trip GROUP BY m.user_id),
  r AS (SELECT user_id, coalesce(stamps,0)::int stamps, CASE WHEN mx>0 THEN round(coalesce(stamps,0)*100.0/mx)::int ELSE 0 END score FROM g)
  SELECT p_trip, 'game', r.user_id, r.score, r.stamps FROM r WHERE r.stamps > 0 AND (SELECT count(*) FROM r o WHERE (o.score,o.stamps) > (r.score,r.stamps)) < st.winners;
END IF; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.save_teams(p_trip uuid, p_teams jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE t jsonb; tid uuid; u text; BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set teams'; END IF;
IF jsonb_typeof(coalesce(p_teams,'[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_teams,'[]'::jsonb)) > 4 THEN RAISE EXCEPTION 'Up to 4 teams'; END IF;
DELETE FROM public.trip_teams WHERE trip_id=p_trip;
FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_teams,'[]'::jsonb)) LOOP
  INSERT INTO public.trip_teams(trip_id, name, color) VALUES (p_trip, left(trim(t->>'name'),40), t->>'color') RETURNING id INTO tid;
  FOR u IN SELECT jsonb_array_elements_text(coalesce(t->'members','[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=u::uuid) THEN
      INSERT INTO public.trip_team_members(trip_id, user_id, team_id) VALUES (p_trip, u::uuid, tid) ON CONFLICT (trip_id, user_id) DO UPDATE SET team_id=EXCLUDED.team_id; END IF;
  END LOOP; END LOOP; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.trip_photos(p_trip uuid) RETURNS TABLE(photo_path text, user_id uuid, source text, day_date date, created_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
RETURN QUERY SELECT x.photo_path, x.user_id, x.source, x.day_date, x.created_at FROM (
  SELECT b.photo_path, b.user_id, 'bingo'::text source, b.day_date, b.created_at FROM public.bingo_marks b WHERE b.trip_id=p_trip AND b.photo_path IS NOT NULL
  UNION ALL SELECT q.photo_path, q.user_id, 'quest', q.day_date, q.created_at FROM public.quest_posts q WHERE q.trip_id=p_trip
  UNION ALL SELECT p.photo_path, p.user_id, 'challenge', p.day_date, p.created_at FROM public.photo_posts p WHERE p.trip_id=p_trip
  UNION ALL SELECT a.photo_path, a.user_id, 'airport', a.day_date, a.created_at FROM public.airport_claims a WHERE a.trip_id=p_trip AND a.photo_path IS NOT NULL) x
WHERE NOT EXISTS (SELECT 1 FROM public.photo_removed r WHERE r.trip_id=p_trip AND r.photo_path=x.photo_path) ORDER BY x.created_at DESC; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.remove_photo(p_trip uuid, p_path text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can delete photos'; END IF;
IF split_part(p_path,'/',1) <> p_trip::text THEN RAISE EXCEPTION 'That photo isn''t from this trip'; END IF;
INSERT INTO public.photo_removed(trip_id, photo_path, removed_by) VALUES (p_trip, p_path, auth.uid()) ON CONFLICT DO NOTHING;
DELETE FROM public.photo_reactions WHERE photo_path=p_path; END $fn$;

REVOKE ALL ON FUNCTION trip_private.season_info(uuid), trip_private.set_season(uuid,text,integer,text,timestamptz,text), trip_private.finalize_season(uuid,text), trip_private.save_teams(uuid,jsonb), trip_private.trip_photos(uuid), trip_private.remove_photo(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.season_info(uuid), trip_private.set_season(uuid,text,integer,text,timestamptz,text), trip_private.finalize_season(uuid,text), trip_private.save_teams(uuid,jsonb), trip_private.trip_photos(uuid), trip_private.remove_photo(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.season_info(p_trip uuid) RETURNS TABLE(season text, winners integer, prize text, crowning_at timestamptz, crowning_label text, revealed boolean) LANGUAGE sql STABLE SET search_path=public AS $fn$ SELECT * FROM trip_private.season_info(p_trip) $fn$;
CREATE OR REPLACE FUNCTION public.set_season(p_trip uuid, p_season text, p_winners integer, p_prize text, p_crowning_at timestamptz, p_label text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.set_season(p_trip,p_season,p_winners,p_prize,p_crowning_at,p_label) $fn$;
CREATE OR REPLACE FUNCTION public.finalize_season(p_trip uuid, p_season text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.finalize_season(p_trip,p_season) $fn$;
CREATE OR REPLACE FUNCTION public.save_teams(p_trip uuid, p_teams jsonb) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.save_teams(p_trip,p_teams) $fn$;
CREATE OR REPLACE FUNCTION public.trip_photos(p_trip uuid) RETURNS TABLE(photo_path text, user_id uuid, source text, day_date date, created_at timestamptz) LANGUAGE sql STABLE SET search_path=public AS $fn$ SELECT * FROM trip_private.trip_photos(p_trip) $fn$;
CREATE OR REPLACE FUNCTION public.remove_photo(p_trip uuid, p_path text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.remove_photo(p_trip,p_path) $fn$;
REVOKE ALL ON FUNCTION public.season_info(uuid), public.set_season(uuid,text,integer,text,timestamptz,text), public.finalize_season(uuid,text), public.save_teams(uuid,jsonb), public.trip_photos(uuid), public.remove_photo(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_info(uuid), public.set_season(uuid,text,integer,text,timestamptz,text), public.finalize_season(uuid,text), public.save_teams(uuid,jsonb), public.trip_photos(uuid), public.remove_photo(uuid,text) TO authenticated;