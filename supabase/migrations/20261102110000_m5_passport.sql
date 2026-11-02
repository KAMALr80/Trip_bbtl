-- M5-07 passport stamps v2, M5-08 levels, M5-09 badges (R-701 – R-704, R-711 – R-713, R-366, Q13).
--  * A new-engine trip stamps every approved member's passport when it locks on Baggage Claim day 7
--    (trip_private.stamp_trip, called by the Day 7 lock in the next migration). The stamp type comes
--    from the player's "From" (player_profiles.home_country) vs the trip's country: a passport stamp
--    abroad ('international'), a state stamp at home ('road_trip', any home country, R-702). At-home
--    culture rooms give a postcard ('postcard', R-366). Game Night gives nothing (R-008).
--  * Stamps carry the room, the crowns won, a solo marker (truly solo only, Q13), the season + year,
--    and open the trip's postcard (trip_postcards, same trip id).
--  * Level and badges are recomputed in the same transaction that adds a stamp (R-704): nothing runs
--    in the background. Badge tiers never go down (high-water mark in user_badges).
--  * Older trips (rules_version = 1) keep the Lovable-era sync_passport; it no longer touches
--    new-engine stamps.
-- rollback: DROP FUNCTION public.my_stamps(), public.my_passport_progress(), public.mark_badges_seen() and
--   their trip_private bodies, trip_private.stamp_trip(uuid), trip_private.refresh_passport(uuid),
--   trip_private.level_for(int), trip_private.badge_tier(text, int), trip_private.season_label(date),
--   trip_private.norm_country(text); DROP TABLE public.user_badges, public.passport_progress;
--   ALTER TABLE public.passport_stamps DROP COLUMN room, solo, crowns, culture, season_label; restore its
--   kind check and sync_passport from the baseline.

-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.passport_stamps DROP CONSTRAINT passport_stamps_kind_check;
ALTER TABLE public.passport_stamps
  ADD CONSTRAINT passport_stamps_kind_check CHECK (kind IN ('international', 'road_trip', 'postcard')),
  ADD COLUMN room text,
  ADD COLUMN solo boolean NOT NULL DEFAULT false,
  ADD COLUMN crowns text[] NOT NULL DEFAULT '{}' CHECK (crowns <@ ARRAY['preflight', 'trip_season']),
  ADD COLUMN culture text CHECK (length(culture) <= 80),
  ADD COLUMN season_label text CHECK (length(season_label) <= 20);
COMMENT ON COLUMN public.passport_stamps.kind IS
  'international = passport stamp (abroad), road_trip = state stamp (home country), postcard = at-home culture room (R-366)';

-- Level by distinct countries (R-703), stored when a stamp is added (R-704).
CREATE TABLE public.passport_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  countries int NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'none',
  stars int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passport_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own level" ON public.passport_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.passport_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.passport_progress TO authenticated;
GRANT ALL ON public.passport_progress TO service_role;

-- Badges (R-711 – R-713): tier 1 Carry-On, 2 Checked Bag, 3 First Class. Never goes down.
CREATE TABLE public.user_badges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge text NOT NULL CHECK (badge IN ('us_explorer', 'culture_collector', 'storyteller')),
  tier int NOT NULL CHECK (tier BETWEEN 1 AND 3),
  progress int NOT NULL DEFAULT 0,
  earned_at timestamptz NOT NULL DEFAULT now(),   -- when this tier was reached
  seen_at timestamptz,                            -- NULL: show the tier-up celebration
  PRIMARY KEY (user_id, badge)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own badges" ON public.user_badges FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.user_badges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_badges TO authenticated;
GRANT ALL ON public.user_badges TO service_role;

-- ---------------------------------------------------------------------------------------------
-- Helpers.

CREATE FUNCTION trip_private.norm_country(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN lower(btrim(p)) IN ('usa', 'us', 'u.s.', 'u.s.a.', 'united states', 'united states of america')
              THEN 'United States' ELSE nullif(btrim(p), '') END
$$;

-- R-703: Tourist 1 · Explorer 3 · Voyager 5 · Globetrotter 7 · Passport Junkie 10 · ★15 · ★★20 · ★★★30.
CREATE FUNCTION trip_private.level_for(p_countries int)
RETURNS TABLE(level text, stars int, level_at int, next_at int)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT l.level, l.stars, l.at,
         (SELECT min(n.at) FROM (VALUES (1), (3), (5), (7), (10), (15), (20), (30)) n(at) WHERE n.at > coalesce(p_countries, 0))
  FROM (VALUES ('none', 0, 0), ('tourist', 0, 1), ('explorer', 0, 3), ('voyager', 0, 5), ('globetrotter', 0, 7),
               ('passport_junkie', 0, 10), ('passport_junkie', 1, 15), ('passport_junkie', 2, 20),
               ('passport_junkie', 3, 30)) l(level, stars, at)
  WHERE l.at <= greatest(coalesce(p_countries, 0), 0)
  ORDER BY l.at DESC LIMIT 1
$$;

-- R-712, R-713: U.S. Explorer 1/5/15 states · Culture Collector 1/5/10 cultures · Storyteller 1/3/10 guides.
CREATE FUNCTION trip_private.badge_tier(p_badge text, p_count int) RETURNS int
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT count(*)::int FROM unnest(CASE p_badge
    WHEN 'us_explorer' THEN ARRAY[1, 5, 15]
    WHEN 'culture_collector' THEN ARRAY[1, 5, 10]
    WHEN 'storyteller' THEN ARRAY[1, 3, 10] END) AS at
  WHERE at <= coalesce(p_count, 0)
$$;

-- "Fall 2026" from the last trip day (northern seasons; the deck shows season + year).
CREATE FUNCTION trip_private.season_label(p_day date) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN extract(month FROM p_day) IN (12, 1, 2) THEN 'Winter'
              WHEN extract(month FROM p_day) BETWEEN 3 AND 5 THEN 'Spring'
              WHEN extract(month FROM p_day) BETWEEN 6 AND 8 THEN 'Summer' ELSE 'Fall' END
         || ' ' || (extract(year FROM p_day)::int + CASE WHEN extract(month FROM p_day) = 12 THEN 1 ELSE 0 END)
$$;

-- Level and badges for one player, from their stamps (R-704). Called by stamp_trip; safe to re-run.
CREATE FUNCTION trip_private.refresh_passport(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_countries int; lv record; b record;
BEGIN
  SELECT count(DISTINCT lower(s.country))::int INTO v_countries
  FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
  WHERE s.user_id = p_user AND s.kind IN ('international', 'road_trip') AND NOT t.is_sandbox;
  SELECT * INTO lv FROM trip_private.level_for(v_countries);
  INSERT INTO public.passport_progress (user_id, countries, level, stars)
  VALUES (p_user, v_countries, lv.level, lv.stars)
  ON CONFLICT (user_id) DO UPDATE SET countries = excluded.countries, level = excluded.level, stars = excluded.stars,
                                      updated_at = now();

  FOR b IN
    SELECT 'us_explorer' AS badge, count(DISTINCT lower(s.state))::int AS n
    FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
    WHERE s.user_id = p_user AND s.kind IN ('international', 'road_trip') AND s.country = 'United States'
      AND nullif(btrim(s.state), '') IS NOT NULL AND NOT t.is_sandbox
    UNION ALL
    SELECT 'culture_collector', count(DISTINCT lower(s.culture))::int
    FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
    WHERE s.user_id = p_user AND s.kind = 'postcard' AND nullif(btrim(s.culture), '') IS NOT NULL AND NOT t.is_sandbox
    UNION ALL
    -- Every contributor to a finished Window Seat guide counts it (Q13).
    SELECT 'storyteller', count(DISTINCT t.id)::int
    FROM public.trips t
    WHERE t.room = 'window_seat' AND t.locked_at IS NOT NULL AND NOT t.is_sandbox
      AND EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.trip_id = t.id AND j.user_id = p_user)
  LOOP
    IF trip_private.badge_tier(b.badge, b.n) > 0 THEN
      INSERT INTO public.user_badges (user_id, badge, tier, progress)
      VALUES (p_user, b.badge, trip_private.badge_tier(b.badge, b.n), b.n)
      ON CONFLICT (user_id, badge) DO UPDATE
        SET progress = greatest(public.user_badges.progress, excluded.progress),
            earned_at = CASE WHEN excluded.tier > public.user_badges.tier THEN now() ELSE public.user_badges.earned_at END,
            seen_at = CASE WHEN excluded.tier > public.user_badges.tier THEN NULL ELSE public.user_badges.seen_at END,
            tier = greatest(public.user_badges.tier, excluded.tier);
    END IF;
  END LOOP;
END
$$;

-- Stamp every approved member's passport for a finished new-engine trip (M5-07). Idempotent: one
-- stamp per member per trip; re-running refreshes it. Returns how many stamps it wrote.
CREATE FUNCTION trip_private.stamp_trip(p_trip uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t public.trips;
  m record;
  v_place text;
  v_country text;
  v_home text;
  v_kind text;
  n int := 0;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip;
  IF NOT FOUND OR t.rules_version <> 2 OR t.room = 'game_night' THEN RETURN 0; END IF;
  IF NOT (trip_private.room_rules(t.room)->>'pointsEnabled')::boolean THEN RETURN 0; END IF;
  v_place := nullif(btrim(split_part(t.destination, ',', array_length(string_to_array(t.destination, ','), 1))), '');
  v_country := trip_private.norm_country(coalesce(nullif(btrim(t.passport_country), ''), v_place));
  FOR m IN
    SELECT tm.user_id, pp.home_country,
           coalesce((SELECT array_agg(c.season ORDER BY c.season) FROM public.trip_crowns c
                     WHERE c.trip_id = p_trip AND c.user_id = tm.user_id), '{}') AS crowns
    FROM public.trip_members tm LEFT JOIN public.player_profiles pp ON pp.user_id = tm.user_id
    WHERE tm.trip_id = p_trip AND tm.status = 'approved'
  LOOP
    v_home := trip_private.norm_country(m.home_country);
    v_kind := CASE WHEN t.room IN ('explore_culture', 'show_culture') THEN 'postcard'
                   WHEN v_home IS NOT NULL AND lower(v_home) = lower(v_country) THEN 'road_trip'
                   ELSE 'international' END;
    INSERT INTO public.passport_stamps (user_id, trip_id, kind, country, state, city, stamped_on, room, solo, crowns,
                                       culture, season_label)
    VALUES (m.user_id, p_trip, v_kind, coalesce(v_country, t.destination),
            CASE WHEN v_kind <> 'postcard' THEN nullif(btrim(t.passport_state), '') END,
            coalesce(nullif(btrim(t.passport_city), ''), nullif(btrim(split_part(t.destination, ',', 1)), '')),
            t.end_date, t.room, t.play_mode = 'solo', m.crowns,
            CASE WHEN v_kind = 'postcard' THEN coalesce(t.cultures[1], v_country) END,
            trip_private.season_label(t.end_date))
    ON CONFLICT (user_id, trip_id) DO UPDATE
      SET kind = excluded.kind, country = excluded.country, state = excluded.state, city = excluded.city,
          stamped_on = excluded.stamped_on, room = excluded.room, solo = excluded.solo, crowns = excluded.crowns,
          culture = excluded.culture, season_label = excluded.season_label;
    PERFORM trip_private.refresh_passport(m.user_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

-- The older on-read sync now only handles archived (rules_version = 1) trips.
CREATE OR REPLACE FUNCTION trip_private.sync_passport(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t record; home text; country text; state_name text; city_name text; k text; last_part text;
BEGIN
 IF p_user IS NULL OR (p_user <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON b.trip_id=a.trip_id AND b.status='approved' WHERE a.user_id=auth.uid() AND a.status='approved' AND b.user_id=p_user)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 DELETE FROM public.passport_stamps s USING public.trips st WHERE st.id=s.trip_id AND st.rules_version=1 AND s.user_id=p_user AND NOT EXISTS (SELECT 1 FROM public.trip_members m JOIN public.trips xt ON xt.id=m.trip_id WHERE m.user_id=p_user AND m.status='approved' AND m.trip_id=s.trip_id AND xt.kind='trip' AND NOT xt.is_sandbox AND (xt.ended_at IS NOT NULL OR (now() AT TIME ZONE xt.home_timezone)::date > xt.end_date+2));
 SELECT nullif(btrim(home_country),'') INTO home FROM public.player_profiles WHERE user_id=p_user;
 IF home IS NULL THEN DELETE FROM public.passport_stamps s USING public.trips st WHERE st.id=s.trip_id AND st.rules_version=1 AND s.user_id=p_user; RETURN; END IF;
 FOR t IN SELECT tr.* FROM public.trips tr JOIN public.trip_members m ON m.trip_id=tr.id WHERE m.user_id=p_user AND m.status='approved' AND tr.rules_version=1 AND tr.kind='trip' AND NOT tr.is_sandbox AND (tr.ended_at IS NOT NULL OR (now() AT TIME ZONE tr.home_timezone)::date > tr.end_date+2) LOOP
   last_part := nullif(btrim(split_part(t.destination, ',', array_length(string_to_array(t.destination,','),1))), '');
   country := coalesce(nullif(btrim(t.passport_country),''),last_part);
   IF country IS NULL THEN CONTINUE; END IF;
   IF lower(country) IN ('usa','us','u.s.','united states of america','united states') THEN country:='United States'; END IF;
   IF t.passport_country IS NULL AND lower(country) = ANY(ARRAY['alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi','missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico','new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island','south carolina','south dakota','tennessee','texas','utah','vermont','virginia','washington','west virginia','wisconsin','wyoming','dc','district of columbia','al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy']) THEN country:='United States'; END IF;
   IF lower(home) IN ('usa','us','u.s.','united states of america','united states') THEN home:='United States'; END IF;
   IF lower(country)=lower(home) THEN
     IF country <> 'United States' THEN DELETE FROM public.passport_stamps WHERE user_id=p_user AND trip_id=t.id; CONTINUE; END IF;
     k:='road_trip'; state_name:=coalesce(nullif(btrim(t.passport_state),''),CASE WHEN last_part <> 'United States' AND last_part <> 'USA' AND last_part <> 'US' THEN last_part END); city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
     IF state_name IS NULL THEN DELETE FROM public.passport_stamps WHERE user_id=p_user AND trip_id=t.id; CONTINUE; END IF;
   ELSE
     k:='international'; state_name:=NULL; city_name:=coalesce(nullif(btrim(t.passport_city),''),nullif(btrim(split_part(t.destination,',',1)),''));
   END IF;
   INSERT INTO public.passport_stamps(user_id,trip_id,kind,country,state,city,stamped_on) VALUES(p_user,t.id,k,country,state_name,city_name,t.end_date)
   ON CONFLICT (user_id,trip_id) DO UPDATE SET kind=excluded.kind,country=excluded.country,state=excluded.state,city=excluded.city,stamped_on=excluded.stamped_on;
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Reads for the player.

-- My stamps, newest first, with what the Passport page shows (R-701).
CREATE FUNCTION trip_private.my_stamps()
RETURNS TABLE(trip_id uuid, kind text, country text, state text, city text, culture text, stamped_on date,
              season_label text, room text, solo boolean, crowns text[], trip_name text, has_postcard boolean,
              squad_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.trip_id, s.kind, s.country, s.state, s.city, s.culture, s.stamped_on,
         coalesce(s.season_label, trip_private.season_label(s.stamped_on)), coalesce(s.room, 'trip'), s.solo, s.crowns,
         t.name, EXISTS (SELECT 1 FROM public.trip_postcards p WHERE p.trip_id = s.trip_id),
         (SELECT count(*)::int FROM public.trip_members m WHERE m.trip_id = s.trip_id AND m.status = 'approved')
  FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
  WHERE s.user_id = auth.uid()
  ORDER BY s.stamped_on DESC, t.name
$$;

-- Level (R-703) and badges (R-711 – R-713) with progress to the next step.
CREATE FUNCTION trip_private.my_passport_progress() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'countries', coalesce(p.countries, 0),
    'level', coalesce(p.level, 'none'),
    'stars', coalesce(p.stars, 0),
    'next_at', (SELECT l.next_at FROM trip_private.level_for(coalesce(p.countries, 0)) l),
    'badges', coalesce((SELECT jsonb_agg(jsonb_build_object('badge', b.badge, 'tier', b.tier, 'progress', b.progress,
                                                           'earned_at', b.earned_at, 'new', b.seen_at IS NULL)
                                         ORDER BY b.badge)
                        FROM public.user_badges b WHERE b.user_id = auth.uid()), '[]'::jsonb))
  FROM (SELECT auth.uid() AS uid) me
  LEFT JOIN public.passport_progress p ON p.user_id = me.uid
$$;

-- The tier-up celebration was shown (M5-09 acceptance).
CREATE FUNCTION trip_private.mark_badges_seen() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.user_badges SET seen_at = now() WHERE user_id = auth.uid() AND seen_at IS NULL
$$;

-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION trip_private.norm_country(text), trip_private.level_for(int), trip_private.badge_tier(text, int),
  trip_private.season_label(date), trip_private.refresh_passport(uuid), trip_private.stamp_trip(uuid),
  trip_private.my_stamps(), trip_private.my_passport_progress(), trip_private.mark_badges_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.norm_country(text), trip_private.level_for(int), trip_private.badge_tier(text, int),
  trip_private.season_label(date), trip_private.my_stamps(), trip_private.my_passport_progress(),
  trip_private.mark_badges_seen() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.refresh_passport(uuid), trip_private.stamp_trip(uuid) TO service_role;

CREATE FUNCTION public.my_stamps()
RETURNS TABLE(trip_id uuid, kind text, country text, state text, city text, culture text, stamped_on date,
              season_label text, room text, solo boolean, crowns text[], trip_name text, has_postcard boolean,
              squad_count int)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.my_stamps() $$;
CREATE FUNCTION public.my_passport_progress() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT trip_private.my_passport_progress() $$;
CREATE FUNCTION public.mark_badges_seen() RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.mark_badges_seen() $$;
REVOKE ALL ON FUNCTION public.my_stamps(), public.my_passport_progress(), public.mark_badges_seen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_stamps(), public.my_passport_progress(), public.mark_badges_seen()
  TO authenticated, service_role;
