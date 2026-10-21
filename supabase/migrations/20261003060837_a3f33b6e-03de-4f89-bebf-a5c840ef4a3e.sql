CREATE OR REPLACE FUNCTION trip_private.game_rooms() RETURNS TABLE(trip_id uuid, nickname text, country text, region text, city text, nights_played integer, ended boolean, crowns jsonb, leaders jsonb, is_member boolean, requested boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id, t.room_nickname, t.room_country, t.room_region, t.room_city,
    (SELECT count(*)::int FROM game_nights gn WHERE gn.trip_id=t.id AND NOT gn.skipped AND gn.starts_at <= now()),
    (t.ended_at IS NOT NULL OR t.end_date < current_date),
    coalesce((SELECT jsonb_agg(sc.season) FROM season_champions sc WHERE sc.trip_id=t.id), '[]'::jsonb),
    CASE WHEN t.leaderboard_public THEN coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score, 'stamp', x.stamp) ORDER BY x.score DESC) FROM (
       SELECT CASE WHEN coalesce(pp.public_leaderboard,true) THEN coalesce(nullif(pc.game_name,''),'Player') ELSE 'Traveler' END AS name, b.score,
       CASE WHEN coalesce(pp.public_leaderboard,true) THEN
         (SELECT jsonb_build_object('country',s.country,'state',s.state,'city',s.city,'date',s.stamped_on,'trip',s.trip_name,'squad',s.squad_count,'count',(SELECT count(*) FROM passport_stamps sx WHERE sx.user_id=s.user_id AND sx.trip_id=t.id)) FROM passport_stamps s WHERE s.user_id=b.user_id AND s.trip_id=t.id ORDER BY s.stamped_on DESC LIMIT 1)
       ELSE NULL END AS stamp
       FROM trip_private.game_board(t.id) b
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