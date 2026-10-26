CREATE TABLE public.sealed_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sealed','showcase')),
  drop_no int NOT NULL CHECK (drop_no >= 0),
  drop_at timestamptz NOT NULL,
  value int NOT NULL CHECK (value IN (5,10,20)),
  title text NOT NULL, mission_text text NOT NULL DEFAULT '', backstory text NOT NULL DEFAULT '', keywords text[] NOT NULL DEFAULT '{}',
  opened_at timestamptz, submitted_at timestamptz,
  proof_mode text CHECK (proof_mode IN ('upload','show')), proof_path text, proof_shared boolean NOT NULL DEFAULT false,
  declined_at timestamptz, declined_by uuid, approved_at timestamptz, approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id, kind, drop_no),
  CHECK ((kind='showcase') = (drop_no=0)),
  CHECK (submitted_at IS NULL OR proof_mode IS NOT NULL),
  CHECK (proof_mode IS DISTINCT FROM 'upload' OR proof_path IS NOT NULL)
);
GRANT ALL ON public.sealed_quests TO service_role;
ALTER TABLE public.sealed_quests ENABLE ROW LEVEL SECURITY;
CREATE INDEX sealed_quests_trip_idx ON public.sealed_quests(trip_id, user_id);
CREATE OR REPLACE FUNCTION trip_private.touch_sealed_quest() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER sealed_quests_updated BEFORE UPDATE ON public.sealed_quests FOR EACH ROW EXECUTE FUNCTION trip_private.touch_sealed_quest();

CREATE OR REPLACE FUNCTION trip_private.quest_cutoff(p_trip uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN t.kind='trip' THEN ((t.start_date - 1)::timestamp AT TIME ZONE t.home_timezone)
  ELSE coalesce((SELECT max(n.starts_at) FROM public.game_nights n WHERE n.trip_id=t.id AND NOT n.skipped),
                ((t.end_date + time '18:00') AT TIME ZONE t.home_timezone)) END
 FROM public.trips t WHERE t.id=p_trip $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_drops(p_trip uuid) RETURNS TABLE(drop_no int, drop_at timestamptz, value int, cutoff timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; v_cut timestamptz; v_cutd date; v_start date; v_days int; v_n int;
BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT FOUND OR t.kind NOT IN ('trip','at_home') THEN RETURN; END IF;
 v_cut := trip_private.quest_cutoff(p_trip);
 v_cutd := (v_cut AT TIME ZONE t.home_timezone)::date;
 IF t.kind='trip' THEN
   v_start := greatest(coalesce(t.game_start, (t.created_at AT TIME ZONE t.home_timezone)::date), v_cutd - 14);
 ELSE v_start := t.start_date; END IF;
 v_days := v_cutd - v_start;
 IF t.kind='trip' THEN v_n := CASE WHEN v_days < 7 THEN 2 WHEN v_days < 11 THEN 3 ELSE 4 END;
 ELSE v_n := CASE WHEN v_days <= 3 THEN 1 WHEN v_days <= 5 THEN 2 ELSE 3 END; END IF;
 RETURN QUERY
 WITH d AS (SELECT gs::date AS day FROM generate_series(v_start, v_cutd, interval '1 day') gs
            WHERE ((gs::date + time '10:00') AT TIME ZONE t.home_timezone) + interval '27 hours' <= v_cut
            ORDER BY md5(p_trip::text || gs::date::text) LIMIT v_n),
      o AS (SELECT d.day, (row_number() OVER (ORDER BY d.day))::int rn FROM d)
 SELECT o.rn, ((o.day + time '10:00') AT TIME ZONE t.home_timezone),
        CASE WHEN abs(hashtext(p_trip::text || o.rn::text)) % 2 = 0 THEN 5 ELSE 10 END, v_cut
 FROM o ORDER BY o.rn;
END $$;

CREATE OR REPLACE FUNCTION trip_private.ensure_sealed(p_trip uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; d record; v_card public.security_missions; v_dest text; v_show date;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user OR NOT trip_private.is_trip_member(p_trip,p_user) THEN RAISE EXCEPTION 'Only approved members can see quests'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT FOUND OR t.kind NOT IN ('trip','at_home') THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_trip::text||p_user::text||'sealed'));
 v_dest := coalesce(nullif(t.destination,''), nullif(t.at_home_pack,''), 'your destination');
 FOR d IN SELECT * FROM trip_private.sealed_drops(p_trip) s WHERE s.drop_at <= now() LOOP
  IF EXISTS (SELECT 1 FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.kind='sealed' AND q.drop_no=d.drop_no) THEN CONTINUE; END IF;
  SELECT * INTO v_card FROM public.security_missions sm WHERE sm.kind='checkin' AND sm.trip_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND x.title=replace(sm.title,'{destination}',v_dest))
   AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND x.title=replace(sm.title,'{destination}',v_dest))
   ORDER BY md5(sm.id::text||p_trip::text||p_user::text||d.drop_no::text) LIMIT 1;
  IF NOT FOUND THEN EXIT; END IF;
  INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords)
  VALUES (p_trip,p_user,'sealed',d.drop_no,d.drop_at,d.value,
   replace(coalesce(v_card.title,'Discover the destination'),'{destination}',v_dest), replace(coalesce(v_card.text,''),'{destination}',v_dest),
   replace(coalesce(v_card.backstory,''),'{destination}',v_dest), ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(coalesce(v_card.keywords,'{}')) k))
  ON CONFLICT DO NOTHING;
 END LOOP;
 v_show := CASE WHEN t.kind='trip' THEN coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date) ELSE t.start_date END;
 IF (now() AT TIME ZONE t.home_timezone)::date >= v_show AND NOT EXISTS (SELECT 1 FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.kind='showcase') THEN
  SELECT * INTO v_card FROM public.security_missions sm WHERE sm.kind='home' AND sm.trip_id IS NULL ORDER BY md5(sm.id::text||p_trip::text||p_user::text||'showcase') LIMIT 1;
  IF FOUND THEN
   INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords)
   VALUES (p_trip,p_user,'showcase',0,now(),20,
    replace(coalesce(v_card.title,'Your Showcase'),'{destination}',v_dest), replace(coalesce(v_card.text,''),'{destination}',v_dest),
    replace(coalesce(v_card.backstory,''),'{destination}',v_dest), ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(coalesce(v_card.keywords,'{}')) k))
   ON CONFLICT DO NOTHING;
  END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_state(q public.sealed_quests, p_cut timestamptz) RETURNS text
LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE
  WHEN q.kind='showcase' THEN CASE WHEN q.approved_at IS NOT NULL THEN 'approved' WHEN q.declined_at IS NOT NULL THEN 'declined' ELSE 'showcase' END
  WHEN q.declined_at IS NOT NULL THEN 'declined'
  WHEN q.submitted_at IS NOT NULL AND (q.proof_mode='upload' OR q.approved_at IS NOT NULL) THEN 'counted'
  WHEN q.submitted_at IS NOT NULL THEN 'show_pending'
  WHEN q.opened_at IS NULL AND now() < least(q.drop_at + interval '3 days', p_cut) THEN 'sealed'
  WHEN q.opened_at IS NULL THEN 'expired'
  WHEN now() < least(q.opened_at + interval '24 hours', p_cut) THEN 'open'
  ELSE 'destroyed' END $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_award(q public.sealed_quests) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
  WHEN q.kind='showcase' THEN CASE WHEN q.approved_at IS NOT NULL AND q.declined_at IS NULL THEN q.value ELSE 0 END
  WHEN q.submitted_at IS NOT NULL AND q.declined_at IS NULL AND (q.proof_mode='upload' OR q.approved_at IS NOT NULL)
   THEN q.value + CASE WHEN q.submitted_at <= q.opened_at + interval '3 hours' THEN 5 ELSE 0 END
  ELSE 0 END $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_quest_state(p_trip uuid)
RETURNS TABLE(id uuid, kind text, drop_no int, value int, drop_at timestamptz, open_by timestamptz, opened_at timestamptz, destroy_at timestamptz, cutoff timestamptz, state text, title text, mission_text text, backstory text, keywords text[], proof_mode text, proof_shared boolean, submitted_at timestamptz, points int, meetup_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cut timestamptz; v_meet timestamptz;
BEGIN
 PERFORM trip_private.ensure_sealed(p_trip, auth.uid());
 v_cut := trip_private.quest_cutoff(p_trip);
 SELECT ss.carry_on_meetup_at INTO v_meet FROM public.season_settings ss WHERE ss.trip_id=p_trip AND ss.season='trip';
 RETURN QUERY
 SELECT q.id, q.kind, q.drop_no, q.value, q.drop_at, least(q.drop_at+interval '3 days', v_cut), q.opened_at,
  CASE WHEN q.opened_at IS NULL THEN NULL ELSE least(q.opened_at+interval '24 hours', v_cut) END, v_cut, s.st,
  CASE WHEN s.vis THEN q.title END, CASE WHEN s.vis THEN q.mission_text END, CASE WHEN s.vis THEN q.backstory END, CASE WHEN s.vis THEN q.keywords END,
  q.proof_mode, q.proof_shared, q.submitted_at, trip_private.sealed_award(q), v_meet
 FROM public.sealed_quests q
 CROSS JOIN LATERAL (SELECT trip_private.sealed_state(q, v_cut) st) s0
 CROSS JOIN LATERAL (SELECT s0.st, (q.kind='showcase' OR (q.opened_at IS NOT NULL AND now() < least(q.opened_at+interval '24 hours', v_cut) AND s0.st IN ('open','counted','show_pending'))) vis) s
 WHERE q.trip_id=p_trip AND q.user_id=auth.uid()
 ORDER BY q.kind DESC, q.drop_no;
END $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_quest_action(p_quest uuid, p_action text, p_mode text DEFAULT NULL, p_path text DEFAULT NULL, p_shared boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.sealed_quests; v_cut timestamptz; v_kind text; v_meet timestamptz; v_me uuid := auth.uid();
BEGIN
 SELECT * INTO q FROM public.sealed_quests WHERE id=p_quest FOR UPDATE;
 IF NOT FOUND OR v_me IS NULL OR NOT trip_private.is_trip_member(q.trip_id, v_me) THEN RAISE EXCEPTION 'Quest not found'; END IF;
 v_cut := trip_private.quest_cutoff(q.trip_id);
 IF p_action='open' THEN
  IF q.user_id<>v_me OR q.kind<>'sealed' THEN RAISE EXCEPTION 'Quest not found'; END IF;
  IF q.opened_at IS NOT NULL THEN RETURN; END IF;
  IF now() >= least(q.drop_at+interval '3 days', v_cut) THEN RAISE EXCEPTION 'This quest expired'; END IF;
  UPDATE public.sealed_quests SET opened_at=now() WHERE id=q.id;
 ELSIF p_action='submit' THEN
  IF q.user_id<>v_me OR q.kind<>'sealed' THEN RAISE EXCEPTION 'Quest not found'; END IF;
  IF q.opened_at IS NULL OR q.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'This quest can''t take proof'; END IF;
  IF now() >= least(q.opened_at+interval '24 hours', v_cut) THEN RAISE EXCEPTION 'Boarding closed — this quest self-destructed'; END IF;
  IF p_mode NOT IN ('upload','show') THEN RAISE EXCEPTION 'Choose a photo or show it at game night'; END IF;
  IF p_mode='upload' THEN
   IF p_path IS NULL OR split_part(p_path,'/',1)<>q.trip_id::text OR split_part(p_path,'/',2)<>q.user_id::text OR split_part(p_path,'/',3)<>q.id::text
      OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='quest-proofs' AND o.name=p_path) THEN RAISE EXCEPTION 'Upload your photo first'; END IF;
  END IF;
  UPDATE public.sealed_quests SET submitted_at=now(), proof_mode=p_mode, proof_path=CASE WHEN p_mode='upload' THEN p_path END, proof_shared=coalesce(p_shared,false) WHERE id=q.id;
 ELSIF p_action='share' THEN
  IF q.user_id<>v_me THEN RAISE EXCEPTION 'Quest not found'; END IF;
  UPDATE public.sealed_quests SET proof_shared=coalesce(p_shared,false) WHERE id=q.id;
 ELSIF p_action IN ('decline','approve') THEN
  IF NOT trip_private.is_leader(q.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can review quests'; END IF;
  IF q.user_id=v_me THEN RAISE EXCEPTION 'You can''t review your own quest'; END IF;
  IF q.declined_at IS NOT NULL OR q.approved_at IS NOT NULL AND p_action='approve' THEN RETURN; END IF;
  IF q.kind='sealed' THEN
   IF q.submitted_at IS NULL THEN RAISE EXCEPTION 'Nothing submitted yet'; END IF;
   IF p_action='decline' AND now() >= v_cut THEN RAISE EXCEPTION 'Reviews closed at the cutoff'; END IF;
   IF p_action='approve' AND (q.proof_mode<>'show' OR now() >= v_cut + interval '6 hours') THEN RAISE EXCEPTION 'Only game-night presentations need approval'; END IF;
  ELSIF p_action='approve' THEN
   SELECT kind INTO v_kind FROM public.trips WHERE id=q.trip_id;
   IF v_kind='trip' THEN
    SELECT ss.carry_on_meetup_at INTO v_meet FROM public.season_settings ss WHERE ss.trip_id=q.trip_id AND ss.season='trip';
    IF v_meet IS NULL OR now() < v_meet - interval '15 minutes' THEN RAISE EXCEPTION 'Showcases are approved at the crowning meet-up'; END IF;
   ELSIF now() < v_cut - interval '15 minutes' THEN RAISE EXCEPTION 'Showcases are approved at the finale'; END IF;
  END IF;
  IF p_action='decline' THEN UPDATE public.sealed_quests SET declined_at=now(), declined_by=v_me WHERE id=q.id;
  ELSE UPDATE public.sealed_quests SET approved_at=now(), approved_by=v_me WHERE id=q.id; END IF;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_proof_feed(p_trip uuid)
RETURNS TABLE(id uuid, user_id uuid, kind text, drop_no int, value int, title text, proof_mode text, proof_path text, submitted_at timestamptz, speed boolean, state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cut timestamptz;
BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can review quests'; END IF;
 v_cut := trip_private.quest_cutoff(p_trip);
 RETURN QUERY SELECT q.id,q.user_id,q.kind,q.drop_no,q.value,q.title,q.proof_mode,q.proof_path,q.submitted_at,
  (q.submitted_at IS NOT NULL AND q.submitted_at <= q.opened_at+interval '3 hours'), trip_private.sealed_state(q, v_cut)
 FROM public.sealed_quests q
 WHERE q.trip_id=p_trip AND q.user_id<>auth.uid() AND q.declined_at IS NULL AND trip_private.is_trip_member(p_trip,q.user_id)
  AND ((q.kind='sealed' AND q.submitted_at IS NOT NULL) OR (q.kind='showcase' AND q.approved_at IS NULL))
 ORDER BY q.submitted_at NULLS LAST, q.user_id;
END $$;

CREATE OR REPLACE FUNCTION trip_private.season_points(p_trip uuid, p_season text)
RETURNS TABLE(user_id uuid, games int, quests int, showcase int, legacy int, other int, total int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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
 hs AS (SELECT r.user_id, r.points::int pts FROM trip_private.home_day_scores(p_trip) r WHERE p_season='home')
 SELECT m.user_id,
  CASE WHEN p_season='preflight' THEN coalesce(gn.pts,0)+coalesce(qa.pts,0)+5*coalesce(m.start_stamps,0)-coalesce(pen.pts,0) ELSE 0 END,
  CASE WHEN p_season IN ('preflight','home') THEN coalesce(sq.qp,0) ELSE 0 END,
  CASE WHEN (p_season='trip' AND v_kind='trip') OR (p_season='home' AND v_kind<>'trip') THEN coalesce(sq.sp,0) ELSE 0 END,
  CASE WHEN p_season='preflight' THEN coalesce(lg.pts,0) ELSE 0 END,
  coalesce(ts.pts,0)+coalesce(hs.pts,0),
  0
 FROM m LEFT JOIN sq ON sq.user_id=m.user_id LEFT JOIN gn ON gn.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id
  LEFT JOIN pen ON pen.user_id=m.user_id LEFT JOIN lg ON lg.user_id=m.user_id LEFT JOIN ts ON ts.user_id=m.user_id LEFT JOIN hs ON hs.user_id=m.user_id;
END $$;

-- total computed in the public wrapper (floor 0)
CREATE OR REPLACE FUNCTION trip_private.proof_upload_ok(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' AND EXISTS (
  SELECT 1 FROM public.sealed_quests q
  WHERE q.id::text=split_part(p_name,'/',3) AND q.trip_id::text=split_part(p_name,'/',1) AND q.user_id::text=split_part(p_name,'/',2)
   AND q.user_id=auth.uid() AND q.kind='sealed' AND q.opened_at IS NOT NULL AND q.submitted_at IS NULL
   AND now() < least(q.opened_at+interval '24 hours', trip_private.quest_cutoff(q.trip_id))
   AND trip_private.is_trip_member(q.trip_id, auth.uid())) $$;

CREATE OR REPLACE FUNCTION trip_private.proof_read_ok(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' AND EXISTS (
  SELECT 1 FROM public.sealed_quests q
  WHERE q.id::text=split_part(p_name,'/',3) AND q.trip_id::text=split_part(p_name,'/',1) AND q.user_id::text=split_part(p_name,'/',2)
   AND trip_private.is_trip_member(q.trip_id, auth.uid())
   AND (q.user_id=auth.uid() OR trip_private.is_leader(q.trip_id) OR (q.proof_shared AND q.proof_path=p_name))) $$;

CREATE POLICY "quest proofs upload own open quest" ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id='quest-proofs' AND trip_private.proof_upload_ok(name));
CREATE POLICY "quest proofs read owner leader shared" ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id='quest-proofs' AND trip_private.proof_read_ok(name));

CREATE OR REPLACE FUNCTION public.sealed_quest_state(p_trip uuid)
RETURNS TABLE(id uuid, kind text, drop_no int, value int, drop_at timestamptz, open_by timestamptz, opened_at timestamptz, destroy_at timestamptz, cutoff timestamptz, state text, title text, mission_text text, backstory text, keywords text[], proof_mode text, proof_shared boolean, submitted_at timestamptz, points int, meetup_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT * FROM trip_private.sealed_quest_state(p_trip) $$;
CREATE OR REPLACE FUNCTION public.sealed_quest_action(p_quest uuid, p_action text, p_mode text DEFAULT NULL, p_path text DEFAULT NULL, p_shared boolean DEFAULT false) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.sealed_quest_action(p_quest,p_action,p_mode,p_path,p_shared) $$;
CREATE OR REPLACE FUNCTION public.sealed_proof_feed(p_trip uuid)
RETURNS TABLE(id uuid, user_id uuid, kind text, drop_no int, value int, title text, proof_mode text, proof_path text, submitted_at timestamptz, speed boolean, state text)
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT * FROM trip_private.sealed_proof_feed(p_trip) $$;
CREATE OR REPLACE FUNCTION public.season_points(p_trip uuid, p_season text)
RETURNS TABLE(user_id uuid, games int, quests int, showcase int, legacy int, other int, total int)
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
 SELECT s.user_id,s.games,s.quests,s.showcase,s.legacy,s.other, greatest(0, s.games+s.quests+s.showcase+s.legacy+s.other)
 FROM trip_private.season_points(p_trip,p_season) s ORDER BY 7 DESC, 1 $$;

REVOKE ALL ON FUNCTION trip_private.quest_cutoff(uuid), trip_private.sealed_drops(uuid), trip_private.ensure_sealed(uuid,uuid),
 trip_private.sealed_state(public.sealed_quests,timestamptz), trip_private.sealed_award(public.sealed_quests), trip_private.sealed_quest_state(uuid),
 trip_private.sealed_quest_action(uuid,text,text,text,boolean), trip_private.sealed_proof_feed(uuid), trip_private.season_points(uuid,text),
 trip_private.proof_upload_ok(text), trip_private.proof_read_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.sealed_quest_state(uuid), trip_private.sealed_quest_action(uuid,text,text,text,boolean),
 trip_private.sealed_proof_feed(uuid), trip_private.season_points(uuid,text), trip_private.proof_upload_ok(text), trip_private.proof_read_ok(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.sealed_quest_state(uuid), public.sealed_quest_action(uuid,text,text,text,boolean), public.sealed_proof_feed(uuid), public.season_points(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sealed_quest_state(uuid), public.sealed_quest_action(uuid,text,text,text,boolean), public.sealed_proof_feed(uuid), public.season_points(uuid,text) TO authenticated, service_role;