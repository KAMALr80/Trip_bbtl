ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS leaderboard_public boolean NOT NULL DEFAULT false;
ALTER TABLE public.player_profiles ADD COLUMN IF NOT EXISTS public_leaderboard boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.set_leaderboard_public(p_trip uuid, p_public boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
  IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Captain only'; END IF;
  UPDATE public.trips SET leaderboard_public=coalesce(p_public,false) WHERE id=p_trip;
END $$;
REVOKE ALL ON FUNCTION public.set_leaderboard_public(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_leaderboard_public(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_public_leaderboard(p_public boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE allowed boolean; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 allowed := coalesce(p_public,false) AND coalesce(trip_private.age_of(auth.uid()),0) >= 18;
 UPDATE public.player_profiles SET public_leaderboard=allowed WHERE user_id=auth.uid();
 RETURN allowed;
END $$;
REVOKE ALL ON FUNCTION public.set_public_leaderboard(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_public_leaderboard(boolean) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.game_rooms() RETURNS TABLE(trip_id uuid, nickname text, country text, region text, city text, nights_played integer, ended boolean, crowns jsonb, leaders jsonb, is_member boolean, requested boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id, t.room_nickname, t.room_country, t.room_region, t.room_city,
    (SELECT count(*)::int FROM game_nights gn WHERE gn.trip_id=t.id AND NOT gn.skipped AND gn.starts_at <= now()),
    (t.ended_at IS NOT NULL OR t.end_date < current_date),
    coalesce((SELECT jsonb_agg(sc.season) FROM season_champions sc WHERE sc.trip_id=t.id), '[]'::jsonb),
    CASE WHEN t.leaderboard_public THEN coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score) ORDER BY x.score DESC) FROM (
       SELECT CASE WHEN coalesce(pp.public_leaderboard,true) THEN coalesce(nullif(pc.game_name,''),'Player') ELSE 'Traveler' END AS name, b.score FROM trip_private.game_board(t.id) b
       JOIN trip_members m ON m.trip_id=t.id AND m.user_id=b.user_id AND m.status='approved'
       LEFT JOIN trip_player_cards pc ON pc.trip_id=t.id AND pc.user_id=b.user_id
       LEFT JOIN player_profiles pp ON pp.user_id=b.user_id
       WHERE coalesce(trip_private.age_of(b.user_id),0) >= 18
       ORDER BY b.score DESC LIMIT CASE WHEN (t.ended_at IS NOT NULL OR t.end_date < current_date) THEN 3 ELSE 5 END) x), '[]'::jsonb) ELSE '[]'::jsonb END,
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id=t.id AND m.user_id=auth.uid() AND m.status='approved'),
    EXISTS (SELECT 1 FROM room_requests r WHERE r.trip_id=t.id AND r.user_id=auth.uid() AND r.status='pending' AND r.expires_at > now())
  FROM trips t WHERE t.room_listed AND NOT t.is_sandbox AND t.room_nickname IS NOT NULL AND t.room_country IS NOT NULL
  ORDER BY t.created_at;
END $function$;