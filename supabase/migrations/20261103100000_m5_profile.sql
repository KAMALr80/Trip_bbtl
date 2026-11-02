-- M5-10 Passport Junkie profile and M5-11 Me tab (R-701, R-702, R-714, R-715, R-722, R-801, Q28).
--  * profile_prefs: public / private, About me, up to 3 top stamps, trips hidden from the public view.
--    Private by default; players under 18 are always private.
--  * player_profile(user, trip) is the only way to read someone's profile. Private (and not crew):
--    avatar, game name and level only (R-714). Crew (shares an approved trip), the player themself, or
--    a public adult profile: everything. Hidden trips are left out for viewers who aren't crew (Q28:
--    hiding is for the public view; the crew still sees the trip). With a trip both are in, it adds
--    that trip's role and "most excited for" (page 1).
--  * set_profile also saves "From" (player_profiles.home_country), which decides passport vs state
--    stamps (R-702); the app fills it from the device region the first time.
--  * Hiding a single photo (R-801) waits for a place where outsiders can see photos (the world map,
--    LATER); today postcards are crew-only, so there is nothing public to hide it from.
-- rollback: DROP FUNCTION public.player_profile(uuid, uuid), public.set_profile(boolean, text, text),
--   public.set_top_stamps(uuid[]), public.set_trip_hidden(uuid, boolean) and their trip_private bodies;
--   DROP TABLE public.profile_prefs.

CREATE TABLE public.profile_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public boolean NOT NULL DEFAULT false,
  about_me text CHECK (char_length(about_me) <= 160),
  top_stamps uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(top_stamps) <= 3),
  hidden_trips uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(hidden_trips) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own profile settings" ON public.profile_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.profile_prefs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profile_prefs TO authenticated;
GRANT ALL ON public.profile_prefs TO service_role;

-- Under-18s can't be public (R-714 with R-904).
CREATE FUNCTION trip_private.profile_prefs_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.is_public AND coalesce(trip_private.age_of(NEW.user_id), 0) < 18 THEN NEW.is_public := false; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;
CREATE TRIGGER profile_prefs_guard BEFORE INSERT OR UPDATE ON public.profile_prefs
  FOR EACH ROW EXECUTE FUNCTION trip_private.profile_prefs_guard();

-- ---------------------------------------------------------------------------------------------
-- Writes (own profile only).

CREATE FUNCTION trip_private.set_profile(p_public boolean, p_about text, p_from text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_about text := nullif(trip_private.trim_answer(p_about), ''); v_from text := nullif(trip_private.trim_answer(p_from), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF coalesce(p_public, false) AND coalesce(trip_private.age_of(auth.uid()), 0) < 18 THEN
    RAISE EXCEPTION 'Profiles of players under 18 stay private';
  END IF;
  IF char_length(v_about) > 160 THEN RAISE EXCEPTION 'Keep About me to 160 characters'; END IF;
  IF v_about IS NOT NULL AND NOT trip_private.content_text_safe(v_about) THEN RAISE EXCEPTION 'Please reword that'; END IF;
  IF char_length(v_from) > 60 THEN RAISE EXCEPTION 'Pick a country'; END IF;
  INSERT INTO public.profile_prefs (user_id, is_public, about_me)
  VALUES (auth.uid(), coalesce(p_public, false), v_about)
  ON CONFLICT (user_id) DO UPDATE SET is_public = excluded.is_public, about_me = excluded.about_me;
  IF p_from IS NOT NULL THEN
    UPDATE public.player_profiles SET home_country = v_from WHERE user_id = auth.uid();
  END IF;
END
$$;

-- Up to 3 of my stamps shown first (R-801 "pick top stamps").
CREATE FUNCTION trip_private.set_top_stamps(p_trips uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v uuid[] := ARRAY(SELECT DISTINCT unnest(coalesce(p_trips, '{}')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF cardinality(v) > 3 THEN RAISE EXCEPTION 'Pick up to 3 top stamps'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v) t
             WHERE NOT EXISTS (SELECT 1 FROM public.passport_stamps s WHERE s.user_id = auth.uid() AND s.trip_id = t)) THEN
    RAISE EXCEPTION 'Pick from your own stamps';
  END IF;
  INSERT INTO public.profile_prefs (user_id, top_stamps) VALUES (auth.uid(), v)
  ON CONFLICT (user_id) DO UPDATE SET top_stamps = excluded.top_stamps;
END
$$;

-- Hide (or show again) one of my trips on my public profile (Q28).
CREATE FUNCTION trip_private.set_trip_hidden(p_trip uuid, p_hidden boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.passport_stamps s WHERE s.user_id = auth.uid() AND s.trip_id = p_trip)
     AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id = auth.uid() AND m.trip_id = p_trip) THEN
    RAISE EXCEPTION 'That isn''t one of your trips';
  END IF;
  INSERT INTO public.profile_prefs (user_id, hidden_trips)
  VALUES (auth.uid(), CASE WHEN coalesce(p_hidden, true) THEN ARRAY[p_trip] ELSE '{}' END)
  ON CONFLICT (user_id) DO UPDATE
    SET hidden_trips = CASE WHEN coalesce(p_hidden, true)
                            THEN array_append(array_remove(public.profile_prefs.hidden_trips, p_trip), p_trip)
                            ELSE array_remove(public.profile_prefs.hidden_trips, p_trip) END;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- The one read (R-714, R-722). Server-enforced: a private profile returns three fields to outsiders.
CREATE FUNCTION trip_private.player_profile(p_user uuid, p_trip uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  me uuid := auth.uid();
  pp public.player_profiles;
  pr public.profile_prefs;
  prog public.passport_progress;
  v_self boolean;
  v_crew boolean;
  v_public boolean;
  v_base jsonb;
  v_this jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT * INTO pp FROM public.player_profiles WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO pr FROM public.profile_prefs WHERE user_id = p_user;
  SELECT * INTO prog FROM public.passport_progress WHERE user_id = p_user;
  v_self := me = p_user;
  v_crew := v_self OR EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON a.trip_id = b.trip_id
                              WHERE a.user_id = me AND b.user_id = p_user AND a.status = 'approved' AND b.status = 'approved');
  v_public := coalesce(pr.is_public, false) AND coalesce(trip_private.age_of(p_user), 0) >= 18;
  v_base := jsonb_build_object(
    'user_id', p_user, 'game_name', pp.game_name,
    'avatar_style', pp.avatar_style, 'avatar_seed', pp.avatar_seed,
    -- A photo avatar is only signed for the crew (storage policy); others get the seed avatar.
    'avatar_path', CASE WHEN v_crew THEN pp.avatar_path END,
    'level', coalesce(prog.level, 'none'), 'stars', coalesce(prog.stars, 0), 'countries', coalesce(prog.countries, 0),
    'is_public', v_public, 'self', v_self, 'crew', v_crew);
  IF NOT (v_crew OR v_public) THEN
    RETURN v_base || jsonb_build_object('private', true);
  END IF;

  IF p_trip IS NOT NULL THEN
    SELECT jsonb_build_object('trip_id', t.id, 'trip_name', t.name, 'role', b.role,
                              'persona', coalesce(c.trip_persona, pp.trip_persona), 'most_excited', c.most_excited)
    INTO v_this
    FROM public.trips t
    JOIN public.trip_members b ON b.trip_id = t.id AND b.user_id = p_user AND b.status = 'approved'
    JOIN public.trip_members a ON a.trip_id = t.id AND a.user_id = me AND a.status = 'approved'
    LEFT JOIN public.trip_player_cards c ON c.trip_id = t.id AND c.user_id = p_user
    WHERE t.id = p_trip;
  END IF;

  RETURN v_base || jsonb_build_object(
    'private', false,
    'about_me', pr.about_me,
    'from', pp.home_country,
    'this_trip', v_this,
    'badges', coalesce((SELECT jsonb_agg(jsonb_build_object('badge', b.badge, 'tier', b.tier) ORDER BY b.badge)
                        FROM public.user_badges b WHERE b.user_id = p_user), '[]'),
    'stamps', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'trip_id', s.trip_id, 'kind', s.kind, 'country', s.country, 'state', s.state, 'city', s.city,
               'culture', s.culture, 'stamped_on', s.stamped_on,
               'season_label', coalesce(s.season_label, trip_private.season_label(s.stamped_on)),
               'room', coalesce(s.room, 'trip'), 'solo', s.solo, 'crowns', s.crowns, 'trip_name', t.name,
               'top', s.trip_id = ANY (coalesce(pr.top_stamps, '{}')),
               'hidden', s.trip_id = ANY (coalesce(pr.hidden_trips, '{}')),
               -- the postcard opens for members of that trip only (trip_postcards RLS)
               'has_postcard', EXISTS (SELECT 1 FROM public.trip_postcards pc WHERE pc.trip_id = s.trip_id)
                               AND trip_private.is_trip_member(s.trip_id, me))
             ORDER BY (s.trip_id = ANY (coalesce(pr.top_stamps, '{}'))) DESC, s.stamped_on DESC)
      FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
      WHERE s.user_id = p_user AND NOT t.is_sandbox
        AND (v_crew OR NOT (s.trip_id = ANY (coalesce(pr.hidden_trips, '{}'))))), '[]'));
END
$$;

-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION trip_private.profile_prefs_guard(), trip_private.set_profile(boolean, text, text),
  trip_private.set_top_stamps(uuid[]), trip_private.set_trip_hidden(uuid, boolean),
  trip_private.player_profile(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.set_profile(boolean, text, text), trip_private.set_top_stamps(uuid[]),
  trip_private.set_trip_hidden(uuid, boolean), trip_private.player_profile(uuid, uuid) TO authenticated, service_role;

CREATE FUNCTION public.player_profile(p_user uuid, p_trip uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT trip_private.player_profile(p_user, p_trip) $$;
CREATE FUNCTION public.set_profile(p_public boolean, p_about text, p_from text DEFAULT NULL) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_profile(p_public, p_about, p_from) $$;
CREATE FUNCTION public.set_top_stamps(p_trips uuid[]) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_top_stamps(p_trips) $$;
CREATE FUNCTION public.set_trip_hidden(p_trip uuid, p_hidden boolean DEFAULT true) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_trip_hidden(p_trip, p_hidden) $$;
REVOKE ALL ON FUNCTION public.player_profile(uuid, uuid), public.set_profile(boolean, text, text),
  public.set_top_stamps(uuid[]), public.set_trip_hidden(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_profile(uuid, uuid), public.set_profile(boolean, text, text),
  public.set_top_stamps(uuid[]), public.set_trip_hidden(uuid, boolean) TO authenticated, service_role;
