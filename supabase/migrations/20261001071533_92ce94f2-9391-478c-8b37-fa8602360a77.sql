DROP FUNCTION public.trip_invite_preview(text);
DROP FUNCTION trip_private.trip_invite_preview(text);
CREATE OR REPLACE FUNCTION trip_private.trip_invite_preview(p_code text)
RETURNS TABLE(name text, destination text, motto text, start_date date, end_date date, member_count bigint, captain_name text, captain_style text, captain_seed text, captain_avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.name, t.destination, t.motto, t.start_date, t.end_date,
    (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = t.id),
    COALESCE(p.game_name, c.game_name, captain_profile.display_name, 'Your Captain'),
    COALESCE(p.avatar_style, c.avatar_style, 'street'),
    COALESCE(p.avatar_seed, c.avatar_seed, captain.user_id::text),
    captain_profile.avatar_url
  FROM public.trips t
  JOIN public.trip_members captain ON captain.trip_id = t.id AND captain.role = 'captain'
  LEFT JOIN public.profiles captain_profile ON captain_profile.id = captain.user_id
  LEFT JOIN public.player_profiles p ON p.user_id = captain.user_id
  LEFT JOIN public.trip_player_cards c ON c.trip_id = t.id AND c.user_id = captain.user_id
  WHERE auth.uid() IS NOT NULL AND t.join_code = upper(trim(p_code)) AND t.ended_at IS NULL
  LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.trip_invite_preview(p_code text)
RETURNS TABLE(name text, destination text, motto text, start_date date, end_date date, member_count bigint, captain_name text, captain_style text, captain_seed text, captain_avatar_url text)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.trip_invite_preview(p_code) $$;
REVOKE ALL ON FUNCTION trip_private.trip_invite_preview(text), public.trip_invite_preview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.trip_invite_preview(text), public.trip_invite_preview(text) TO authenticated;