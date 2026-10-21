-- 1. Founder sandbox bypass
CREATE OR REPLACE FUNCTION trip_private.lab_bypass(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT trip_private.is_app_admin() AND EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND is_sandbox) $$;
REVOKE ALL ON FUNCTION trip_private.lab_bypass(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.lab_bypass(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.night_open(p_trip uuid, p_week integer) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT trip_private.lab_bypass(p_trip) OR EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=p_week AND NOT n.skipped
   AND clock_timestamp() <= n.starts_at + interval '3 hours 30 minutes'
   AND (clock_timestamp() >= n.starts_at - interval '15 minutes'
        OR EXISTS (SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number=p_week AND f.first_player IS NOT NULL))) $function$;

CREATE OR REPLACE FUNCTION trip_private.play_day(p_trip uuid, p_date date) RETURNS trip_day_games LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE g public.trip_day_games; bypass boolean := trip_private.lab_bypass(p_trip); BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF NOT bypass AND p_date IS DISTINCT FROM trip_private.trip_today(p_trip) THEN RAISE EXCEPTION 'That day''s games are closed'; END IF;
SELECT * INTO g FROM public.trip_day_games WHERE trip_id=p_trip AND day_date=p_date;
IF NOT FOUND OR (g.released_at IS NULL AND NOT bypass) THEN RAISE EXCEPTION 'Today''s games aren''t ready yet'; END IF; RETURN g; END $function$;

CREATE OR REPLACE FUNCTION trip_private.crown_now(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_week integer := trip_private.takeoff_week(p_trip); BEGIN
IF v_week IS NULL OR NOT (trip_private.can_run_turns(p_trip, v_week) OR trip_private.lab_bypass(p_trip)) THEN RAISE EXCEPTION 'Only the host or a trip leader can crown the champion'; END IF;
IF NOT trip_private.lab_bypass(p_trip) AND (SELECT starts_at FROM public.game_nights WHERE trip_id=p_trip AND week_number=v_week) > now() + interval '30 minutes' THEN RAISE EXCEPTION 'The crowning happens on Takeoff Night'; END IF;
UPDATE public.season_settings SET crowning_at=now() WHERE trip_id=p_trip AND season='game' AND crowning_mode='takeoff' AND crowning_at IS NULL;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.at_home_plan(p_trip uuid)
 RETURNS TABLE(id uuid, day_date date, kind text, released boolean, title text, body text, want text, extra_title text, extra_body text, starts_at timestamp with time zone, game_name text, game_how text, winner_id uuid, revealed boolean, answers integer, answered boolean, voted boolean, today date)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; v_today date; adult_ok boolean; BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT * INTO t FROM public.trips WHERE trips.id=p_trip;
  BEGIN v_today := (now() AT TIME ZONE coalesce((SELECT nullif(p.time_zone,'') FROM public.profiles p WHERE p.id=auth.uid()), t.home_timezone))::date;
  EXCEPTION WHEN others THEN v_today := (now() AT TIME ZONE t.home_timezone)::date; END;
  IF trip_private.lab_bypass(p_trip) THEN v_today := greatest(v_today, coalesce((SELECT max(a.day_date) FROM public.at_home_activities a WHERE a.trip_id=p_trip), v_today)); END IF;
  adult_ok := t.vibe='party' AND coalesce(public.adult_badge(p_trip, auth.uid()), false);
  RETURN QUERY SELECT a.id, a.day_date, a.kind, a.day_date <= v_today,
    CASE WHEN a.day_date <= v_today THEN i.title END,
    CASE WHEN a.day_date <= v_today THEN CASE WHEN i.adult AND NOT adult_ok THEN i.alt ELSE i.body END END,
    CASE WHEN a.day_date - 2 <= v_today THEN i.want END,
    CASE WHEN a.day_date <= v_today AND NOT (x.adult AND NOT adult_ok) THEN x.title END,
    CASE WHEN a.day_date <= v_today AND NOT (x.adult AND NOT adult_ok) THEN x.body END,
    a.starts_at, g.name, CASE WHEN a.day_date <= v_today THEN g.how_to_play END, a.winner_id, a.revealed_at IS NOT NULL,
    (SELECT count(*)::int FROM public.at_home_answers s WHERE s.activity_id=a.id),
    EXISTS (SELECT 1 FROM public.at_home_answers s WHERE s.activity_id=a.id AND s.user_id=auth.uid()),
    EXISTS (SELECT 1 FROM public.at_home_votes v WHERE v.activity_id=a.id AND v.voter_id=auth.uid()),
    v_today
  FROM public.at_home_activities a LEFT JOIN public.at_home_pack_items i ON i.id=a.item_id LEFT JOIN public.at_home_pack_items x ON x.id=a.extra_item_id LEFT JOIN public.game_catalog g ON g.number=a.game_number
  WHERE a.trip_id=p_trip ORDER BY a.day_date, coalesce(a.starts_at, a.day_date::timestamptz), a.kind;
END $function$;

-- 1b. View the app as…
CREATE TABLE IF NOT EXISTS trip_private.lab_views (user_id uuid PRIMARY KEY, trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, view text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON trip_private.lab_views FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION trip_private.age_of(p_user uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM trip_private.lab_views v WHERE v.user_id=p_user AND v.view='teen') THEN 15
    ELSE (SELECT extract(year FROM age(current_date, dob))::int FROM public.player_private WHERE user_id = p_user) END $function$;

CREATE OR REPLACE FUNCTION trip_private.lab_view(p_trip uuid, p_view text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE me uuid := auth.uid(); bot uuid; t public.trips; code text;
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  DELETE FROM trip_private.lab_views WHERE user_id=me;
  SELECT m.user_id INTO bot FROM public.trip_members m JOIN public.sandbox_bots b ON b.user_id=m.user_id WHERE m.trip_id=p_trip ORDER BY m.joined_at, m.user_id LIMIT 1;
  IF p_view = 'exit' OR p_view = 'captain' THEN
    UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id<>me AND role IN ('captain','co_captain');
    INSERT INTO public.trip_members(trip_id,user_id,role,status) VALUES (p_trip,me,'captain','approved')
      ON CONFLICT (trip_id,user_id) DO UPDATE SET role='captain', status='approved';
    RETURN p_view;
  END IF;
  IF bot IS NULL THEN RAISE EXCEPTION 'This sandbox needs at least one bot'; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role IN ('captain','co_captain');
  UPDATE public.trip_members SET role='captain', status='approved' WHERE trip_id=p_trip AND user_id=bot;
  IF p_view = 'co_captain' THEN
    UPDATE public.trip_members SET role='co_captain', status='approved' WHERE trip_id=p_trip AND user_id=me;
  ELSIF p_view = 'player' THEN
    UPDATE public.trip_members SET role='player', status='approved' WHERE trip_id=p_trip AND user_id=me;
  ELSIF p_view = 'teen' THEN
    UPDATE public.trip_members SET role='player', status='approved' WHERE trip_id=p_trip AND user_id=me;
    INSERT INTO trip_private.lab_views(user_id,trip_id,view) VALUES (me,p_trip,'teen');
  ELSIF p_view = 'waiting' THEN
    UPDATE public.trip_members SET role='player', status='pending' WHERE trip_id=p_trip AND user_id=me;
  ELSIF p_view = 'invitee' THEN
    DELETE FROM public.trip_team_members WHERE trip_id=p_trip AND user_id=me;
    DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=me;
    INSERT INTO trip_private.lab_views(user_id,trip_id,view) VALUES (me,p_trip,'invitee');
    RETURN t.join_code;
  ELSE RAISE EXCEPTION 'Unknown view'; END IF;
  IF p_view <> 'teen' THEN INSERT INTO trip_private.lab_views(user_id,trip_id,view) VALUES (me,p_trip,p_view); END IF;
  RETURN p_view;
END $function$;
REVOKE ALL ON FUNCTION trip_private.lab_view(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.lab_view(uuid,text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.lab_view(p_trip uuid, p_view text) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.lab_view(p_trip,p_view) $$;
REVOKE ALL ON FUNCTION public.lab_view(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lab_view(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.my_lab_view() RETURNS TABLE(trip_id uuid, view text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT v.trip_id, v.view FROM trip_private.lab_views v WHERE v.user_id=auth.uid() AND trip_private.is_app_admin() $$;
REVOKE ALL ON FUNCTION trip_private.my_lab_view() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.my_lab_view() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.my_lab_view() RETURNS TABLE(trip_id uuid, view text) LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.my_lab_view() $$;
REVOKE ALL ON FUNCTION public.my_lab_view() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_lab_view() TO authenticated;

-- 2. Shuffle teams
CREATE OR REPLACE FUNCTION trip_private.shuffle_teams(p_trip uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE teams uuid[]; caps int[]; filled int[]; u uuid; i int; n int; best int; moved int := 0;
BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can shuffle teams'; END IF;
  IF EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped AND starts_at <= now()) AND NOT trip_private.lab_bypass(p_trip) THEN RAISE EXCEPTION 'Teams can only be shuffled before the first game night'; END IF;
  PERFORM 1 FROM public.trip_teams WHERE trip_id=p_trip FOR UPDATE;
  SELECT array_agg(id ORDER BY created_at, id) INTO teams FROM public.trip_teams WHERE trip_id=p_trip;
  n := coalesce(array_length(teams,1),0);
  IF n < 2 THEN RAISE EXCEPTION 'Add at least 2 teams first'; END IF;
  SELECT array_agg(trip_private.team_capacity(x) ORDER BY o) INTO caps FROM unnest(teams) WITH ORDINALITY z(x,o);
  IF (SELECT sum(c) FROM unnest(caps) c) < (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip AND status='approved') THEN RAISE EXCEPTION 'Not enough team spots for everyone — raise a team limit first'; END IF;
  filled := array_fill(0, ARRAY[n]);
  DELETE FROM public.trip_team_members WHERE trip_id=p_trip;
  FOR u IN SELECT user_id FROM public.trip_members WHERE trip_id=p_trip AND status='approved' ORDER BY random() LOOP
    best := NULL;
    FOR i IN 1..n LOOP
      IF filled[i] < caps[i] AND (best IS NULL OR filled[i] < filled[best]) THEN best := i; END IF;
    END LOOP;
    INSERT INTO public.trip_team_members(trip_id,user_id,team_id) VALUES (p_trip,u,teams[best]);
    filled[best] := filled[best] + 1; moved := moved + 1;
  END LOOP;
  RETURN moved;
END $function$;
REVOKE ALL ON FUNCTION trip_private.shuffle_teams(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.shuffle_teams(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.shuffle_teams(p_trip uuid) RETURNS integer LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.shuffle_teams(p_trip) $$;
REVOKE ALL ON FUNCTION public.shuffle_teams(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shuffle_teams(uuid) TO authenticated;

-- 7. Host timer
ALTER TABLE public.trip_play_state ADD COLUMN IF NOT EXISTS timer_ends_at timestamptz, ADD COLUMN IF NOT EXISTS timer_secs integer, ADD COLUMN IF NOT EXISTS timer_label text;
CREATE OR REPLACE FUNCTION trip_private.set_activity_timer(p_trip uuid, p_secs integer, p_label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
  IF NOT (trip_private.is_leader(p_trip) OR trip_private.lab_bypass(p_trip) OR EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND host_id=auth.uid() AND NOT skipped AND starts_at BETWEEN now()-interval '4 hours' AND now()+interval '2 hours')) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can run the timer'; END IF;
  IF p_secs IS NOT NULL AND (p_secs < 5 OR p_secs > 3600) THEN RAISE EXCEPTION 'Pick 5 seconds to 60 minutes'; END IF;
  INSERT INTO public.trip_play_state(trip_id, timer_ends_at, timer_secs, timer_label) VALUES (p_trip, CASE WHEN p_secs IS NULL THEN NULL ELSE now() + make_interval(secs => p_secs) END, p_secs, left(nullif(trim(p_label),''),60))
  ON CONFLICT (trip_id) DO UPDATE SET timer_ends_at=excluded.timer_ends_at, timer_secs=excluded.timer_secs, timer_label=excluded.timer_label, updated_at=now();
END $function$;
REVOKE ALL ON FUNCTION trip_private.set_activity_timer(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_activity_timer(uuid,integer,text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.set_activity_timer(p_trip uuid, p_secs integer, p_label text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_activity_timer(p_trip,p_secs,p_label) $$;
REVOKE ALL ON FUNCTION public.set_activity_timer(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_activity_timer(uuid,integer,text) TO authenticated;

-- 6. Sing-off discs (title + artist only)
CREATE TABLE public.song_discs (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  artist text NOT NULL CHECK (length(artist) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
GRANT SELECT ON public.song_discs TO authenticated;
GRANT ALL ON public.song_discs TO service_role;
ALTER TABLE public.song_discs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved members read discs" ON public.song_discs FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id, auth.uid()));

CREATE OR REPLACE FUNCTION trip_private.set_song_disc(p_trip uuid, p_title text, p_artist text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF p_title IS NULL OR length(trim(p_title))=0 THEN DELETE FROM public.song_discs WHERE trip_id=p_trip AND user_id=auth.uid(); RETURN; END IF;
  IF length(trim(p_title)) > 80 OR length(trim(coalesce(p_artist,''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Add a song title and artist'; END IF;
  INSERT INTO public.song_discs(trip_id,user_id,title,artist) VALUES (p_trip,auth.uid(),trim(p_title),trim(p_artist))
  ON CONFLICT (trip_id,user_id) DO UPDATE SET title=excluded.title, artist=excluded.artist, created_at=now();
END $function$;
CREATE OR REPLACE FUNCTION trip_private.clear_song_discs(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
  IF NOT (trip_private.is_leader(p_trip) OR trip_private.lab_bypass(p_trip)) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can clear the discs'; END IF;
  DELETE FROM public.song_discs WHERE trip_id=p_trip;
END $function$;
REVOKE ALL ON FUNCTION trip_private.set_song_disc(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.clear_song_discs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_song_disc(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.clear_song_discs(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.set_song_disc(p_trip uuid, p_title text, p_artist text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_song_disc(p_trip,p_title,p_artist) $$;
CREATE OR REPLACE FUNCTION public.clear_song_discs(p_trip uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.clear_song_discs(p_trip) $$;
REVOKE ALL ON FUNCTION public.set_song_disc(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_song_discs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_song_disc(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_song_discs(uuid) TO authenticated;