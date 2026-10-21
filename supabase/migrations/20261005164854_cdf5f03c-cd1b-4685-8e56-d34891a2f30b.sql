CREATE OR REPLACE FUNCTION trip_private.player_card_read(p_trip uuid, p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_trip public.trips%ROWTYPE;
  v_card public.trip_player_cards%ROWTYPE;
  v_role text;
  v_age int;
  v_teen boolean;
  v_points int := 0;
  v_place int := 0;
  v_total int := 0;
  v_stamps int := 0;
  v_crowns int := 0;
  v_rank jsonb := NULL;
  v_culture_badge text := NULL;
  v_founding boolean := false;
  v_season text;
BEGIN
  IF auth.uid() IS NULL
     OR NOT trip_private.is_trip_member(p_trip, auth.uid())
     OR NOT trip_private.is_trip_member(p_trip, p_user) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_trip FROM public.trips WHERE id = p_trip;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_card
  FROM public.trip_player_cards
  WHERE trip_id = p_trip AND user_id = p_user;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT role INTO v_role
  FROM public.trip_members
  WHERE trip_id = p_trip AND user_id = p_user AND status = 'approved';

  v_age := trip_private.age_of(p_user);
  v_teen := coalesce(v_age < 18, false);
  v_season := CASE
    WHEN v_trip.kind <> 'trip' THEN 'home'
    WHEN current_date >= v_trip.start_date THEN 'trip'
    ELSE 'preflight'
  END;

  IF v_trip.season_rule = 'a2c' THEN
    WITH board AS (
      SELECT sp.user_id, sp.total::int AS points
      FROM trip_private.season_points(p_trip, v_season) sp
    ), ranked AS (
      SELECT b.user_id, b.points,
             row_number() OVER (ORDER BY b.points DESC, b.user_id)::int AS place,
             count(*) OVER ()::int AS total_people
      FROM board b
    )
    SELECT points, place, total_people
      INTO v_points, v_place, v_total
    FROM ranked WHERE user_id = p_user;
  ELSIF current_date >= v_trip.start_date THEN
    WITH board AS (
      SELECT ts.user_id, ts.score::int AS points
      FROM trip_private.trip_season_score(p_trip) ts
    ), ranked AS (
      SELECT b.user_id, b.points,
             row_number() OVER (ORDER BY b.points DESC, b.user_id)::int AS place,
             count(*) OVER ()::int AS total_people
      FROM board b
    )
    SELECT points, place, total_people
      INTO v_points, v_place, v_total
    FROM ranked WHERE user_id = p_user;
  ELSE
    WITH board AS (
      SELECT gb.user_id, gb.score::int AS points
      FROM trip_private.game_board(p_trip) gb
    ), ranked AS (
      SELECT b.user_id, b.points,
             row_number() OVER (ORDER BY b.points DESC, b.user_id)::int AS place,
             count(*) OVER ()::int AS total_people
      FROM board b
    )
    SELECT points, place, total_people
      INTO v_points, v_place, v_total
    FROM ranked WHERE user_id = p_user;
  END IF;

  IF v_total = 0 THEN
    SELECT count(*)::int INTO v_total
    FROM public.trip_members
    WHERE trip_id = p_trip AND status = 'approved';
    v_place := CASE WHEN v_total > 0 THEN 1 ELSE 0 END;
  END IF;

  IF v_teen THEN
    RETURN jsonb_build_object(
      'game_name', v_card.game_name,
      'avatar_style', v_card.avatar_style,
      'avatar_seed', v_card.avatar_seed,
      'points', coalesce(v_points, 0)
    );
  END IF;

  PERFORM trip_private.sync_passport(p_user);
  SELECT count(*)::int INTO v_stamps
  FROM public.passport_stamps
  WHERE user_id = p_user;

  SELECT count(*)::int INTO v_crowns
  FROM public.season_champions
  WHERE user_id = p_user;

  SELECT to_jsonb(r) INTO v_rank
  FROM trip_private.junkie_rank(p_user) r
  LIMIT 1;

  v_culture_badge := trip_private.culture_creator_badge(p_user);
  v_founding := trip_private.founding_member(p_user);

  RETURN jsonb_build_object(
    'game_name', v_card.game_name,
    'avatar_style', v_card.avatar_style,
    'avatar_seed', v_card.avatar_seed,
    'points', coalesce(v_points, 0),
    'place', coalesce(v_place, 0),
    'total_people', coalesce(v_total, 0),
    'role', v_role,
    'passport', jsonb_build_object(
      'stamps', v_stamps,
      'crowns', v_crowns,
      'rank', v_rank,
      'badges', jsonb_strip_nulls(jsonb_build_object(
        'founding_member', CASE WHEN v_founding THEN true ELSE NULL END,
        'culture_creator', v_culture_badge
      )),
      'trip_postcards', jsonb_build_object('available', false, 'items', '[]'::jsonb)
    ),
    'facts', jsonb_strip_nulls(jsonb_build_object(
      'hometown', v_card.hometown,
      'occupation', v_card.occupation,
      'fun_fact', v_card.fun_fact,
      'most_excited', v_card.most_excited,
      'trip_persona', v_card.trip_persona,
      'next_year_goal', v_card.next_year_goal
    ))
  );
END
$function$;

REVOKE ALL ON FUNCTION trip_private.player_card_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.player_card_read(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.player_card_read(p_trip uuid, p_user uuid)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT trip_private.player_card_read(p_trip, p_user)
$function$;

REVOKE ALL ON FUNCTION public.player_card_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_card_read(uuid, uuid) TO authenticated, service_role;