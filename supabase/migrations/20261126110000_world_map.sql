-- World map (deck slide 15, R-721; the founder review asked for it now). Pins come from passport
-- stamps: every finished, non-sandbox trip of a public adult player (R-714), plus the viewer's own
-- trips. A trip a player hid on their profile stays off the map (Q28). Each row carries only what a
-- public profile already shows: trip name, room, place, season, crowns and the players' game names
-- and seed avatars. Photos and answers stay with the crew: "member" tells the app whether the
-- viewer may open the trip's postcard (trip_postcards RLS still decides).
--
-- Rollback: DROP FUNCTION public.world_map(); DROP FUNCTION trip_private.world_map();

CREATE FUNCTION trip_private.world_map() RETURNS TABLE(trip_id uuid, trip_name text, room text, kind text, country text, state text, culture text, season_label text, crowns text[], member boolean, players jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- Every finished trip of a public adult player (R-714, R-721), plus the viewer's own; a trip
  -- hidden on a profile stays off the map (Q28). One row per trip; players are only the ones shown.
  WITH seen AS (
    SELECT s.trip_id, s.user_id, s.kind, s.country, s.state, s.culture, s.stamped_on, s.season_label,
           s.room, s.crowns
    FROM public.passport_stamps s
    JOIN public.trips t ON t.id = s.trip_id AND NOT t.is_sandbox
    LEFT JOIN public.profile_prefs pr ON pr.user_id = s.user_id
    WHERE auth.uid() IS NOT NULL
      AND (s.user_id = auth.uid()
           OR (coalesce(pr.is_public, false)
               AND coalesce(trip_private.age_of(s.user_id), 0) >= 18
               AND NOT (s.trip_id = ANY (coalesce(pr.hidden_trips, '{}')))))
  )
  SELECT v.trip_id, t.name, coalesce(min(v.room), 'trip'), min(v.kind), min(v.country), min(v.state),
         min(v.culture), coalesce(min(v.season_label), trip_private.season_label(min(v.stamped_on))),
         coalesce((SELECT array_agg(DISTINCT c ORDER BY c)
                   FROM seen v2 CROSS JOIN LATERAL unnest(v2.crowns) c WHERE v2.trip_id = v.trip_id), '{}'),
         trip_private.is_trip_member(v.trip_id, auth.uid()),
         jsonb_agg(jsonb_build_object('user_id', v.user_id, 'game_name', pp.game_name,
                                      'avatar_style', pp.avatar_style, 'avatar_seed', pp.avatar_seed)
                   ORDER BY pp.game_name)
  FROM seen v
  JOIN public.trips t ON t.id = v.trip_id
  LEFT JOIN public.player_profiles pp ON pp.user_id = v.user_id
  GROUP BY v.trip_id, t.name
  ORDER BY min(v.stamped_on) DESC, t.name
  LIMIT 1000
$$;
REVOKE ALL ON FUNCTION trip_private.world_map() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.world_map() TO authenticated, service_role;

CREATE FUNCTION public.world_map() RETURNS TABLE(trip_id uuid, trip_name text, room text, kind text, country text, state text, culture text, season_label text, crowns text[], member boolean, players jsonb)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ SELECT * FROM trip_private.world_map() $$;
REVOKE ALL ON FUNCTION public.world_map() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.world_map() TO authenticated, service_role;
