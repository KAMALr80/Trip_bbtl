CREATE TABLE public.player_profiles (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, real_name text NOT NULL CHECK (length(real_name) BETWEEN 1 AND 100), game_name text NOT NULL CHECK (length(game_name) BETWEEN 1 AND 40), avatar_style text NOT NULL DEFAULT 'street', avatar_seed text NOT NULL DEFAULT '', avatar_path text, hometown text, occupation text, fun_fact text, trip_persona text, next_year_goal text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.player_profiles TO authenticated; GRANT ALL ON public.player_profiles TO service_role;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile read" ON public.player_profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own profile create" ON public.player_profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own profile edit" ON public.player_profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER set_player_profiles_updated_at BEFORE UPDATE ON public.player_profiles FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

INSERT INTO public.player_profiles(user_id, real_name, game_name, avatar_style, avatar_seed, avatar_path, hometown, occupation, fun_fact, trip_persona, next_year_goal)
SELECT DISTINCT ON (c.user_id) c.user_id, c.real_name, c.game_name, c.avatar_style, c.avatar_seed, c.avatar_path, c.hometown, c.occupation, c.fun_fact, c.trip_persona, c.next_year_goal
FROM public.trip_player_cards c JOIN auth.users u ON u.id = c.user_id ORDER BY c.user_id, c.updated_at DESC ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION trip_private.sync_profile_to_cards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
UPDATE public.trip_player_cards SET real_name=NEW.real_name, game_name=NEW.game_name, avatar_style=NEW.avatar_style, avatar_seed=NEW.avatar_seed, avatar_path=NEW.avatar_path, hometown=NEW.hometown, occupation=NEW.occupation, fun_fact=NEW.fun_fact, trip_persona=NEW.trip_persona, next_year_goal=NEW.next_year_goal WHERE user_id=NEW.user_id;
RETURN NEW; END $fn$;
CREATE TRIGGER sync_profile_to_cards AFTER INSERT OR UPDATE ON public.player_profiles FOR EACH ROW EXECUTE FUNCTION trip_private.sync_profile_to_cards();

CREATE OR REPLACE FUNCTION trip_private.fill_card_from_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE p public.player_profiles; BEGIN
SELECT * INTO p FROM public.player_profiles WHERE user_id=NEW.user_id;
IF FOUND THEN NEW.real_name:=p.real_name; NEW.game_name:=p.game_name; NEW.avatar_style:=p.avatar_style; NEW.avatar_seed:=p.avatar_seed; NEW.avatar_path:=p.avatar_path; NEW.hometown:=p.hometown; NEW.occupation:=p.occupation; NEW.fun_fact:=p.fun_fact; NEW.trip_persona:=p.trip_persona; NEW.next_year_goal:=p.next_year_goal; END IF;
RETURN NEW; END $fn$;
CREATE TRIGGER fill_card_from_profile BEFORE INSERT OR UPDATE ON public.trip_player_cards FOR EACH ROW EXECUTE FUNCTION trip_private.fill_card_from_profile();

CREATE OR REPLACE FUNCTION trip_private.shares_trip(p_other uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT p_other = auth.uid() OR EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON a.trip_id=b.trip_id WHERE a.user_id=auth.uid() AND b.user_id=p_other) $fn$;
CREATE POLICY "Account avatar upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='player-avatars' AND split_part(name,'/',1)='account' AND split_part(name,'/',2)=auth.uid()::text);
CREATE POLICY "Account avatar view" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='player-avatars' AND split_part(name,'/',1)='account' AND split_part(name,'/',2) ~ '^[0-9a-f-]{36}$' AND trip_private.shares_trip(split_part(name,'/',2)::uuid));
CREATE POLICY "Shared-trip avatar view" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='player-avatars' AND split_part(name,'/',2) ~ '^[0-9a-f-]{36}$' AND trip_private.shares_trip(split_part(name,'/',2)::uuid));

CREATE OR REPLACE FUNCTION trip_private.photo_quota_ok(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public, storage AS $fn$ SELECT (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='trip-photos' AND o.name LIKE split_part(p_name,'/',1)||'/'||split_part(p_name,'/',2)||'/'||left(split_part(p_name,'/',3),10)||'-%') < 15 $fn$;
DROP POLICY "Players upload own trip game photos" ON storage.objects;
CREATE POLICY "Players upload own trip game photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='trip-photos' AND split_part(name,'/',2)=auth.uid()::text AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id::text=split_part(name,'/',1) AND m.user_id=auth.uid()) AND trip_private.photo_quota_ok(name));

CREATE TABLE public.bug_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL, page text NOT NULL DEFAULT '' CHECK (length(page) <= 80), description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000), screenshot_path text CHECK (length(screenshot_path) <= 300), user_agent text CHECK (length(user_agent) <= 400), created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.bug_reports TO authenticated; GRANT ALL ON public.bug_reports TO service_role;
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "File own bug reports" ON public.bug_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND (trip_id IS NULL OR trip_private.is_trip_member(trip_id, auth.uid())) AND (screenshot_path IS NULL OR split_part(screenshot_path,'/',1) = auth.uid()::text));
CREATE POLICY "See own or led-trip bug reports" ON public.bug_reports FOR SELECT TO authenticated USING (user_id = auth.uid() OR (trip_id IS NOT NULL AND trip_private.is_leader(trip_id)));

CREATE OR REPLACE FUNCTION trip_private.trip_totals(p_trip uuid) RETURNS TABLE(user_id uuid, game_stamps integer, trip_stamps integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
g AS (SELECT m.user_id, coalesce(sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END),0)::int st
  FROM public.trip_members m CROSS JOIN v LEFT JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at<=now() LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id WHERE m.trip_id=p_trip GROUP BY m.user_id)
SELECT g.user_id, g.st, coalesce((SELECT t.stamps FROM trip_private.trip_season(p_trip) t WHERE t.user_id=g.user_id),0)::int FROM g $fn$;

CREATE OR REPLACE FUNCTION trip_private.my_passport() RETURNS TABLE(trip_id uuid, stamps integer, crowns integer, junkie boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
SELECT m.trip_id,
  coalesce((SELECT x.game_stamps + x.trip_stamps FROM trip_private.trip_totals(m.trip_id) x WHERE x.user_id=auth.uid()),0),
  (SELECT count(*)::int FROM public.season_champions c WHERE c.trip_id=m.trip_id AND c.user_id=auth.uid()),
  coalesce((SELECT (x.game_stamps+x.trip_stamps) > 0 AND (x.game_stamps+x.trip_stamps) > coalesce((SELECT max(y.game_stamps+y.trip_stamps) FROM trip_private.trip_totals(m.trip_id) y WHERE y.user_id<>auth.uid()),0) FROM trip_private.trip_totals(m.trip_id) x WHERE x.user_id=auth.uid()), false)
FROM public.trip_members m WHERE m.user_id=auth.uid() $fn$;

REVOKE ALL ON FUNCTION trip_private.sync_profile_to_cards(), trip_private.fill_card_from_profile(), trip_private.shares_trip(uuid), trip_private.photo_quota_ok(text), trip_private.trip_totals(uuid), trip_private.my_passport() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.shares_trip(uuid), trip_private.photo_quota_ok(text), trip_private.my_passport() TO authenticated;
CREATE OR REPLACE FUNCTION public.my_passport() RETURNS TABLE(trip_id uuid, stamps integer, crowns integer, junkie boolean) LANGUAGE sql STABLE SET search_path=public AS $fn$ SELECT * FROM trip_private.my_passport() $fn$;
REVOKE ALL ON FUNCTION public.my_passport() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.my_passport() TO authenticated;