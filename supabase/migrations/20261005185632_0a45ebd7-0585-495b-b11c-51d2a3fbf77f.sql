CREATE TABLE public.trip_season_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  game text NOT NULL CHECK (game IN ('bingo','scavenger','speed')),
  city text NOT NULL DEFAULT '',
  tasks jsonb NOT NULL DEFAULT '[]'::jsonb,
  speed_minutes int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, day_date)
);
GRANT SELECT ON public.trip_season_games TO authenticated;
GRANT ALL ON public.trip_season_games TO service_role;
ALTER TABLE public.trip_season_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Squad reads arrived season games" ON public.trip_season_games FOR SELECT TO authenticated
 USING (trip_private.is_trip_member(trip_id, auth.uid()) AND (trip_private.is_leader(trip_id) OR day_date <= trip_private.trip_today(trip_id)));

CREATE TABLE public.trip_season_reveals (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  user_id uuid NOT NULL,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, day_date, user_id)
);
GRANT SELECT ON public.trip_season_reveals TO authenticated;
GRANT ALL ON public.trip_season_reveals TO service_role;
ALTER TABLE public.trip_season_reveals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own season reveals" ON public.trip_season_reveals FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.trip_season_finds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.trip_season_games(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  user_id uuid NOT NULL,
  slot int NOT NULL CHECK (slot BETWEEN 0 AND 8),
  proof_path text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  declined_at timestamptz,
  UNIQUE (trip_id, day_date, user_id, slot)
);
GRANT SELECT ON public.trip_season_finds TO authenticated;
GRANT ALL ON public.trip_season_finds TO service_role;
ALTER TABLE public.trip_season_finds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or leader season finds" ON public.trip_season_finds FOR SELECT TO authenticated
 USING (trip_private.is_trip_member(trip_id, auth.uid()) AND (user_id = auth.uid() OR trip_private.is_leader(trip_id)));

-- Which rooms play: real scoring group/solo trips only (no offline friends, no non-scoring rooms).
CREATE OR REPLACE FUNCTION trip_private.season_games_ok(p_trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.trips t WHERE t.id=p_trip AND t.kind='trip' AND coalesce(t.season_scoring,true) AND coalesce(t.play_arrangement,'group')<>'offline' AND NOT coalesce(t.is_sandbox,false) IS NULL) $$;

-- Points (proposed): Bingo 2/tile, +5 first line of 3, +10 blackout; Scavenger 4/find; Speed 10 for proof. Speed bonus (+5) stays in trip_speed_finishes.
CREATE OR REPLACE FUNCTION trip_private.season_game_points(p_trip uuid) RETURNS TABLE(user_id uuid, pts int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 WITH f AS (SELECT f.user_id, f.day_date, g.game, array_agg(f.slot) slots, count(*)::int n
   FROM public.trip_season_finds f JOIN public.trip_season_games g ON g.id=f.game_id
   WHERE f.trip_id=p_trip AND f.declined_at IS NULL GROUP BY f.user_id, f.day_date, g.game),
 d AS (SELECT f.user_id, CASE f.game
   WHEN 'bingo' THEN 2*f.n
     + CASE WHEN EXISTS (SELECT 1 FROM (VALUES (ARRAY[0,1,2]),(ARRAY[3,4,5]),(ARRAY[6,7,8]),(ARRAY[0,3,6]),(ARRAY[1,4,7]),(ARRAY[2,5,8]),(ARRAY[0,4,8]),(ARRAY[2,4,6])) l(s) WHERE l.s <@ f.slots) THEN 5 ELSE 0 END
     + CASE WHEN f.n >= 9 THEN 10 ELSE 0 END
   WHEN 'scavenger' THEN 4*least(f.n,5)
   ELSE 10 END p FROM f)
 SELECT d.user_id, sum(d.p)::int FROM d GROUP BY d.user_id $$;

CREATE OR REPLACE FUNCTION trip_private.season_game_reveal(p_trip uuid, p_date date) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_at timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 IF NOT trip_private.season_games_ok(p_trip) THEN RAISE EXCEPTION 'Trip Season games are not part of this room'; END IF;
 IF p_date <> trip_private.trip_today(p_trip) THEN RAISE EXCEPTION 'This game opens on its day'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_season_games WHERE trip_id=p_trip AND day_date=p_date) THEN RAISE EXCEPTION 'No game for today yet'; END IF;
 INSERT INTO public.trip_season_reveals(trip_id,day_date,user_id) VALUES (p_trip,p_date,auth.uid()) ON CONFLICT DO NOTHING;
 SELECT revealed_at INTO v_at FROM public.trip_season_reveals WHERE trip_id=p_trip AND day_date=p_date AND user_id=auth.uid();
 RETURN v_at;
END $$;

CREATE OR REPLACE FUNCTION trip_private.season_game_submit(p_trip uuid, p_date date, p_slot int, p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g public.trip_season_games; v_me uuid := auth.uid(); v_rev timestamptz; v_n int; v_total int;
BEGIN
 IF v_me IS NULL OR NOT trip_private.is_trip_member(p_trip, v_me) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 IF NOT trip_private.season_games_ok(p_trip) THEN RAISE EXCEPTION 'Trip Season games are not part of this room'; END IF;
 IF p_date <> trip_private.trip_today(p_trip) THEN RAISE EXCEPTION 'This game closed at the end of its day'; END IF;
 SELECT * INTO g FROM public.trip_season_games WHERE trip_id=p_trip AND day_date=p_date;
 IF NOT FOUND THEN RAISE EXCEPTION 'No game for today yet'; END IF;
 v_total := jsonb_array_length(g.tasks);
 IF p_slot < 0 OR p_slot >= v_total THEN RAISE EXCEPTION 'Unknown task'; END IF;
 IF p_path IS NULL OR split_part(p_path,'/',1)<>p_trip::text OR split_part(p_path,'/',2)<>v_me::text OR split_part(p_path,'/',3)<>g.id::text
   OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='quest-proofs' AND o.name=p_path) THEN RAISE EXCEPTION 'Upload your photo first'; END IF;
 SELECT revealed_at INTO v_rev FROM public.trip_season_reveals WHERE trip_id=p_trip AND day_date=p_date AND user_id=v_me;
 IF g.game IN ('scavenger','speed') AND v_rev IS NULL THEN RAISE EXCEPTION 'Reveal the task first'; END IF;
 INSERT INTO public.trip_season_finds(trip_id,game_id,day_date,user_id,slot,proof_path) VALUES (p_trip,g.id,p_date,v_me,p_slot,p_path)
  ON CONFLICT (trip_id,day_date,user_id,slot) DO NOTHING;
 IF NOT FOUND THEN RAISE EXCEPTION 'Already stamped'; END IF;
 SELECT count(*) INTO v_n FROM public.trip_season_finds WHERE trip_id=p_trip AND day_date=p_date AND user_id=v_me AND declined_at IS NULL;
 -- Reuse the existing speed-finish record: scavenger is judged by speed_bonus_ok (3h); speed only records when its own clock is beaten.
 IF g.game='scavenger' AND v_n >= v_total THEN
   INSERT INTO trip_private.trip_speed_finishes(trip_id,day_date,user_id,source,revealed_at,finished_at) VALUES (p_trip,p_date,v_me,'trip_season_finds',v_rev,now()) ON CONFLICT DO NOTHING;
 ELSIF g.game='speed' AND now() <= v_rev + make_interval(mins => coalesce(g.speed_minutes,60)) THEN
   INSERT INTO trip_private.trip_speed_finishes(trip_id,day_date,user_id,source,revealed_at,finished_at) VALUES (p_trip,p_date,v_me,'trip_season_finds',v_rev,now()) ON CONFLICT DO NOTHING;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.season_game_decline(p_find uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f public.trip_season_finds;
BEGIN
 SELECT * INTO f FROM public.trip_season_finds WHERE id=p_find FOR UPDATE;
 IF NOT FOUND OR NOT trip_private.is_leader(f.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can review proof'; END IF;
 IF f.user_id = auth.uid() THEN RAISE EXCEPTION 'You can''t review your own proof'; END IF;
 UPDATE public.trip_season_finds SET declined_at=now() WHERE id=f.id AND declined_at IS NULL;
 DELETE FROM trip_private.trip_speed_finishes WHERE trip_id=f.trip_id AND day_date=f.day_date AND user_id=f.user_id AND source='trip_season_finds';
END $$;

-- Proof storage: also accept Trip Season game paths trip/user/game_id/file.
CREATE OR REPLACE FUNCTION trip_private.proof_upload_ok(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
 SELECT p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' AND (EXISTS (
  SELECT 1 FROM public.sealed_quests q
  WHERE q.id::text=split_part(p_name,'/',3) AND q.trip_id::text=split_part(p_name,'/',1) AND q.user_id::text=split_part(p_name,'/',2)
   AND q.user_id=auth.uid() AND q.kind='sealed' AND q.opened_at IS NOT NULL AND q.submitted_at IS NULL
   AND now() < least(q.opened_at+interval '24 hours', trip_private.quest_cutoff(q.trip_id))
   AND trip_private.is_trip_member(q.trip_id, auth.uid()))
 OR EXISTS (SELECT 1 FROM public.trip_season_games g
  WHERE g.id::text=split_part(p_name,'/',3) AND g.trip_id::text=split_part(p_name,'/',1) AND split_part(p_name,'/',2)=auth.uid()::text
   AND trip_private.is_trip_member(g.trip_id, auth.uid()) AND g.day_date=trip_private.trip_today(g.trip_id))) $function$;

CREATE OR REPLACE FUNCTION trip_private.proof_read_ok(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
 SELECT p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' AND (EXISTS (
 SELECT 1 FROM public.sealed_quests q WHERE q.id::text=split_part(p_name,'/',3) AND q.trip_id::text=split_part(p_name,'/',1) AND q.user_id::text=split_part(p_name,'/',2)
 AND trip_private.is_trip_member(q.trip_id,auth.uid()) AND (q.user_id=auth.uid() OR trip_private.is_leader(q.trip_id) OR (NOT trip_private.a2c_minor_trip(q.trip_id) AND q.proof_shared AND q.proof_path=p_name)))
 OR EXISTS (SELECT 1 FROM public.trip_season_games g WHERE g.id::text=split_part(p_name,'/',3) AND g.trip_id::text=split_part(p_name,'/',1)
 AND trip_private.is_trip_member(g.trip_id,auth.uid()) AND (split_part(p_name,'/',2)=auth.uid()::text OR trip_private.is_leader(g.trip_id)))) $function$;

-- Existing proof feed now also lists Trip Season game proofs (never the reviewer's own).
CREATE OR REPLACE FUNCTION trip_private.sealed_proof_feed(p_trip uuid)
 RETURNS TABLE(id uuid, user_id uuid, kind text, drop_no integer, value integer, title text, proof_mode text, proof_path text, submitted_at timestamp with time zone, speed boolean, state text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_cut timestamptz;
BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can review quests'; END IF;
 v_cut := trip_private.quest_cutoff(p_trip);
 RETURN QUERY SELECT * FROM (
  SELECT q.id,q.user_id,q.kind,q.drop_no,q.value,q.title,q.proof_mode,q.proof_path,q.submitted_at,
   (q.submitted_at IS NOT NULL AND q.submitted_at <= q.opened_at+interval '3 hours'), trip_private.sealed_state(q, v_cut)
  FROM public.sealed_quests q
  WHERE q.trip_id=p_trip AND q.user_id<>auth.uid() AND q.declined_at IS NULL AND trip_private.is_trip_member(p_trip,q.user_id)
   AND ((q.kind='sealed' AND q.submitted_at IS NOT NULL) OR (q.kind='showcase' AND q.approved_at IS NULL))
  UNION ALL
  SELECT f.id,f.user_id,'season_'||g.game,0,CASE g.game WHEN 'bingo' THEN 2 WHEN 'scavenger' THEN 4 ELSE 10 END,
   coalesce(g.tasks->>f.slot,'Trip Season task'),'upload',f.proof_path,f.submitted_at,false,'counted'
  FROM public.trip_season_finds f JOIN public.trip_season_games g ON g.id=f.game_id
  WHERE f.trip_id=p_trip AND f.user_id<>auth.uid() AND f.declined_at IS NULL AND trip_private.is_trip_member(p_trip,f.user_id)
 ) x ORDER BY x.submitted_at NULLS LAST, x.user_id;
END $function$;

-- Season scoring: add Trip Season game points to the existing trip season "other" bucket.
CREATE OR REPLACE FUNCTION trip_private.season_points(p_trip uuid, p_season text)
 RETURNS TABLE(user_id uuid, games integer, quests integer, showcase integer, legacy integer, other integer, total integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_kind text;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 IF p_season NOT IN ('preflight','trip','home') THEN RAISE EXCEPTION 'Unknown season'; END IF;
 SELECT t.kind INTO v_kind FROM public.trips t WHERE t.id=p_trip;
 RETURN QUERY
 WITH m AS (SELECT tm.user_id, tm.start_stamps FROM public.trip_members tm WHERE tm.trip_id=p_trip AND tm.status='approved'),
 sq AS (SELECT q.user_id, coalesce(sum(trip_private.sealed_award(q)) FILTER (WHERE q.kind='sealed'),0)::int qp, coalesce(sum(trip_private.sealed_award(q)) FILTER (WHERE q.kind='showcase'),0)::int sp FROM public.sealed_quests q WHERE q.trip_id=p_trip GROUP BY q.user_id),
 gn AS (SELECT s.user_id, sum(CASE WHEN s.here THEN 10 ELSE 0 END + CASE WHEN s.won THEN 15 WHEN s.here THEN 5 ELSE 0 END + CASE WHEN s.here AND n.host_id=s.user_id THEN 5 ELSE 0 END)::int pts
   FROM public.game_scores s JOIN public.game_nights n ON n.trip_id=s.trip_id AND n.week_number=s.week_number AND NOT n.skipped AND n.starts_at <= now()
   WHERE s.trip_id=p_trip GROUP BY s.user_id),
 qa AS (SELECT a.user_id, (2*count(*) + 4*count(*) FILTER (WHERE q.winner_id=a.user_id))::int pts FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id),
 pen AS (SELECT hp.user_id, 5*sum(hp.stamps)::int pts FROM public.host_penalties hp WHERE hp.trip_id=p_trip GROUP BY hp.user_id),
 lg AS (SELECT x.user_id, sum(x.p)::int pts FROM (
   SELECT mc.user_id, mc.points p FROM public.mission_claims mc WHERE mc.trip_id=p_trip AND mc.phase='checkin' AND mc.status='released'
   UNION ALL SELECT sq2.user_id, sq2.awarded_points FROM public.season_quests sq2 WHERE sq2.trip_id=p_trip AND sq2.quest_kind='preflight' AND sq2.status='approved') x GROUP BY x.user_id),
 ts AS (SELECT r.user_id, r.stamps::int pts FROM trip_private.trip_season(p_trip) r WHERE p_season='trip'),
 sb AS (SELECT f.user_id, (5*count(*))::int pts FROM trip_private.trip_speed_finishes f WHERE f.trip_id=p_trip AND p_season='trip' AND trip_private.speed_bonus_ok(f.revealed_at,f.finished_at) GROUP BY f.user_id),
 sg AS (SELECT r.user_id, r.pts FROM trip_private.season_game_points(p_trip) r WHERE p_season='trip' AND trip_private.season_games_ok(p_trip)),
 hs AS (SELECT r.user_id, r.points::int pts FROM trip_private.home_day_scores(p_trip) r WHERE p_season='home'),
 parts AS (
 SELECT m.user_id,
  CASE WHEN p_season='preflight' THEN coalesce(gn.pts,0)+coalesce(qa.pts,0)+5*coalesce(m.start_stamps,0)-coalesce(pen.pts,0) ELSE 0 END g,
  CASE WHEN p_season IN ('preflight','home') THEN coalesce(sq.qp,0) ELSE 0 END q,
  CASE WHEN (p_season='trip' AND v_kind='trip') OR (p_season='home' AND v_kind<>'trip') THEN coalesce(sq.sp,0) ELSE 0 END s,
  CASE WHEN p_season='preflight' THEN coalesce(lg.pts,0) ELSE 0 END l,
  coalesce(ts.pts,0)+coalesce(hs.pts,0)+coalesce(sb.pts,0)+coalesce(sg.pts,0) o
 FROM m LEFT JOIN sq ON sq.user_id=m.user_id LEFT JOIN gn ON gn.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id
  LEFT JOIN pen ON pen.user_id=m.user_id LEFT JOIN lg ON lg.user_id=m.user_id LEFT JOIN ts ON ts.user_id=m.user_id LEFT JOIN hs ON hs.user_id=m.user_id LEFT JOIN sb ON sb.user_id=m.user_id LEFT JOIN sg ON sg.user_id=m.user_id)
 SELECT p.user_id, p.g::int, p.q::int, p.s::int, p.l::int, p.o::int, greatest(p.g+p.q+p.s+p.l+p.o,0)::int FROM parts p;
END $function$;

CREATE OR REPLACE FUNCTION public.season_game_reveal(p_trip uuid, p_date date) RETURNS timestamptz
LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.season_game_reveal(p_trip,p_date) $$;
CREATE OR REPLACE FUNCTION public.season_game_submit(p_trip uuid, p_date date, p_slot int, p_path text) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.season_game_submit(p_trip,p_date,p_slot,p_path) $$;
CREATE OR REPLACE FUNCTION public.season_game_decline(p_find uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $$ SELECT trip_private.season_game_decline(p_find) $$;

REVOKE ALL ON FUNCTION trip_private.season_games_ok(uuid), trip_private.season_game_points(uuid), trip_private.season_game_reveal(uuid,date), trip_private.season_game_submit(uuid,date,int,text), trip_private.season_game_decline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.season_games_ok(uuid), trip_private.season_game_points(uuid), trip_private.season_game_reveal(uuid,date), trip_private.season_game_submit(uuid,date,int,text), trip_private.season_game_decline(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.season_game_reveal(uuid,date), public.season_game_submit(uuid,date,int,text), public.season_game_decline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.season_game_reveal(uuid,date), public.season_game_submit(uuid,date,int,text), public.season_game_decline(uuid) TO authenticated, service_role;