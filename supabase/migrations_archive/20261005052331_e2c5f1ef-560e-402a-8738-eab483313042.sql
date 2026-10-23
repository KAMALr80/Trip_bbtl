ALTER TABLE public.security_missions ADD COLUMN presentation_tag text CHECK (presentation_tag IN ('video_call','trip_meetup','at_home_finale','solo_guide')), ADD COLUMN insight text, ADD COLUMN budget_note text;
ALTER TABLE public.sealed_quests ADD COLUMN presentation_tag text CHECK (presentation_tag IN ('video_call','trip_meetup','at_home_finale','solo_guide')), ADD COLUMN insight text;

CREATE OR REPLACE FUNCTION trip_private.a2c_minor_trip(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT t.season_rule='a2c' AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=t.id AND m.status='approved' AND trip_private.age_of(m.user_id) BETWEEN 0 AND 17) FROM public.trips t WHERE t.id=p_trip),false) $$;
REVOKE ALL ON FUNCTION trip_private.a2c_minor_trip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.a2c_minor_trip(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.proof_read_ok(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' AND EXISTS (
 SELECT 1 FROM public.sealed_quests q WHERE q.id::text=split_part(p_name,'/',3) AND q.trip_id::text=split_part(p_name,'/',1) AND q.user_id::text=split_part(p_name,'/',2)
 AND trip_private.is_trip_member(q.trip_id,auth.uid()) AND (q.user_id=auth.uid() OR trip_private.is_leader(q.trip_id) OR (NOT trip_private.a2c_minor_trip(q.trip_id) AND q.proof_shared AND q.proof_path=p_name))) $$;

CREATE OR REPLACE FUNCTION trip_private.a2c_quest_card(p_trip uuid,p_user uuid,p_kind text,p_drop int,p_dest text)
RETURNS TABLE(title text,mission_text text,backstory text,keywords text[],presentation_tag text,insight text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT replace(sm.title,'{destination}',p_dest),replace(sm.text,'{destination}',p_dest),replace(sm.backstory,'{destination}',p_dest),
 ARRAY(SELECT replace(k,'{destination}',p_dest) FROM unnest(sm.keywords) k),sm.presentation_tag,replace(sm.insight,'{destination}',p_dest)
 FROM public.security_missions sm JOIN public.trips t ON t.id=p_trip
 WHERE t.season_rule='a2c' AND sm.trip_id IS NULL AND sm.kind=CASE WHEN p_kind='sealed' THEN 'checkin' ELSE 'home' END
 AND sm.presentation_tag=CASE WHEN p_kind='sealed' THEN 'video_call' WHEN t.kind='at_home' THEN 'at_home_finale' ELSE 'trip_meetup' END
 AND length(btrim(sm.insight))>12 AND sm.budget_note IS NOT NULL
 AND (sm.category NOT ILIKE '%adult%' OR (t.vibe='Party' AND NOT trip_private.a2c_minor_trip(p_trip) AND trip_private.age_of(p_user)>=21))
 AND NOT EXISTS (SELECT 1 FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',p_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',p_dest)))))
 AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',p_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',p_dest)))))
 ORDER BY md5(sm.id::text||p_trip::text||p_user::text||p_drop::text) LIMIT 1 $$;
REVOKE ALL ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.ensure_sealed(p_trip uuid,p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; d record; v_card public.security_missions; v_dest text; v_show date; c record;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user OR NOT trip_private.is_trip_member(p_trip,p_user) THEN RAISE EXCEPTION 'Only approved members can see quests'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT FOUND OR t.kind NOT IN ('trip','at_home') THEN RETURN; END IF;
 IF t.id='a4842ba8-540c-4595-9417-a9a7fb53f395'::uuid AND t.season_rule='legacy' THEN RETURN; END IF;
 IF t.season_rule='a2c' AND t.kind='trip' AND t.start_date>current_date AND t.game_plan IS NULL THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_trip::text||p_user::text||'sealed'));
 v_dest:=coalesce(nullif(btrim(regexp_replace(coalesce(t.destination,''),'\s*\((sandbox|at home)\)\s*$','','i')),''),nullif(initcap(replace(t.at_home_pack,'_',' ')),''),'your destination');
 FOR d IN SELECT * FROM trip_private.sealed_drops(p_trip) s WHERE s.drop_at<=now() LOOP
  IF EXISTS (SELECT 1 FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.kind='sealed' AND q.drop_no=d.drop_no) THEN CONTINUE; END IF;
  IF t.season_rule='a2c' THEN
   SELECT * INTO c FROM trip_private.a2c_quest_card(p_trip,p_user,'sealed',d.drop_no,v_dest);
   IF NOT FOUND THEN CONTINUE; END IF;
   INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords,presentation_tag,insight)
   VALUES(p_trip,p_user,'sealed',d.drop_no,d.drop_at,d.value,c.title,c.mission_text,c.backstory,c.keywords,c.presentation_tag,c.insight) ON CONFLICT DO NOTHING;
  ELSE
   SELECT * INTO v_card FROM public.security_missions sm WHERE sm.kind='checkin' AND sm.trip_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
    AND NOT EXISTS(SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
    ORDER BY md5(sm.id::text||p_trip::text||p_user::text||d.drop_no::text) LIMIT 1;
   IF NOT FOUND THEN EXIT; END IF;
   INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords)
   VALUES(p_trip,p_user,'sealed',d.drop_no,d.drop_at,d.value,replace(coalesce(v_card.title,'Discover the destination'),'{destination}',v_dest),replace(coalesce(v_card.text,''),'{destination}',v_dest),replace(coalesce(v_card.backstory,''),'{destination}',v_dest),ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(coalesce(v_card.keywords,'{}')) k)) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 v_show:=CASE WHEN t.kind='trip' THEN coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date) ELSE t.start_date END;
 IF (now() AT TIME ZONE t.home_timezone)::date>=v_show AND NOT EXISTS (SELECT 1 FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.kind='showcase') THEN
  IF t.season_rule='a2c' THEN
   SELECT * INTO c FROM trip_private.a2c_quest_card(p_trip,p_user,'showcase',0,v_dest);
   IF FOUND THEN INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords,presentation_tag,insight)
    VALUES(p_trip,p_user,'showcase',0,now(),20,c.title,c.mission_text,c.backstory,c.keywords,c.presentation_tag,c.insight) ON CONFLICT DO NOTHING; END IF;
  ELSE
   SELECT * INTO v_card FROM public.security_missions sm WHERE sm.kind='home' AND sm.trip_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
    AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
    ORDER BY md5(sm.id::text||p_trip::text||p_user::text||'showcase') LIMIT 1;
   IF FOUND THEN INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords)
    VALUES(p_trip,p_user,'showcase',0,now(),20,replace(coalesce(v_card.title,'Your Showcase'),'{destination}',v_dest),replace(coalesce(v_card.text,''),'{destination}',v_dest),replace(coalesce(v_card.backstory,''),'{destination}',v_dest),ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(coalesce(v_card.keywords,'{}')) k)) ON CONFLICT DO NOTHING; END IF;
  END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_quest_action(p_quest uuid,p_action text,p_mode text DEFAULT NULL,p_path text DEFAULT NULL,p_shared boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.sealed_quests; v_cut timestamptz; v_kind text; v_meet timestamptz; v_me uuid:=auth.uid();
BEGIN
 SELECT * INTO q FROM public.sealed_quests WHERE id=p_quest FOR UPDATE;
 IF NOT FOUND OR v_me IS NULL OR NOT trip_private.is_trip_member(q.trip_id,v_me) THEN RAISE EXCEPTION 'Quest not found'; END IF;
 v_cut:=trip_private.quest_cutoff(q.trip_id);
 IF p_action='open' THEN
  IF q.user_id<>v_me OR q.kind<>'sealed' THEN RAISE EXCEPTION 'Quest not found'; END IF;
  IF q.opened_at IS NOT NULL THEN RETURN; END IF;
  IF now()>=least(q.drop_at+interval '3 days',v_cut) THEN RAISE EXCEPTION 'This quest expired'; END IF;
  UPDATE public.sealed_quests SET opened_at=now() WHERE id=q.id;
 ELSIF p_action='submit' THEN
  IF q.user_id<>v_me OR q.kind<>'sealed' THEN RAISE EXCEPTION 'Quest not found'; END IF;
  IF q.opened_at IS NULL OR q.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'This quest can''t take proof'; END IF;
  IF now()>=least(q.opened_at+interval '24 hours',v_cut) THEN RAISE EXCEPTION 'Boarding closed — this quest self-destructed'; END IF;
  IF p_mode NOT IN ('upload','show') THEN RAISE EXCEPTION 'Choose a photo or show it at game night'; END IF;
  IF p_mode='upload' AND (p_path IS NULL OR split_part(p_path,'/',1)<>q.trip_id::text OR split_part(p_path,'/',2)<>q.user_id::text OR split_part(p_path,'/',3)<>q.id::text OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='quest-proofs' AND o.name=p_path)) THEN RAISE EXCEPTION 'Upload your photo first'; END IF;
  IF p_shared AND trip_private.a2c_minor_trip(q.trip_id) THEN RAISE EXCEPTION 'Quest proof cannot be shared with the squad'; END IF;
  UPDATE public.sealed_quests SET submitted_at=now(),proof_mode=p_mode,proof_path=CASE WHEN p_mode='upload' THEN p_path END,proof_shared=coalesce(p_shared,false) WHERE id=q.id;
 ELSIF p_action='share' THEN
  IF q.user_id<>v_me THEN RAISE EXCEPTION 'Quest not found'; END IF;
  IF p_shared AND trip_private.a2c_minor_trip(q.trip_id) THEN RAISE EXCEPTION 'Quest proof cannot be shared with the squad'; END IF;
  UPDATE public.sealed_quests SET proof_shared=coalesce(p_shared,false) WHERE id=q.id;
 ELSIF p_action IN ('decline','approve') THEN
  IF NOT trip_private.is_leader(q.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can review quests'; END IF;
  IF q.user_id=v_me THEN RAISE EXCEPTION 'You can''t review your own quest'; END IF;
  IF q.declined_at IS NOT NULL OR q.approved_at IS NOT NULL AND p_action='approve' THEN RETURN; END IF;
  IF q.kind='sealed' THEN
   IF q.submitted_at IS NULL THEN RAISE EXCEPTION 'Nothing submitted yet'; END IF;
   IF p_action='decline' AND now()>=v_cut THEN RAISE EXCEPTION 'Reviews closed at the cutoff'; END IF;
   IF p_action='approve' AND (q.proof_mode<>'show' OR now()>=v_cut+interval '6 hours') THEN RAISE EXCEPTION 'Only game-night presentations need approval'; END IF;
  ELSIF p_action='approve' THEN
   SELECT kind INTO v_kind FROM public.trips WHERE id=q.trip_id;
   IF v_kind='trip' THEN
    SELECT ss.carry_on_meetup_at INTO v_meet FROM public.season_settings ss WHERE ss.trip_id=q.trip_id AND ss.season='trip';
    IF v_meet IS NULL OR now()<v_meet-interval '15 minutes' THEN RAISE EXCEPTION 'Showcases are approved at the crowning meet-up'; END IF;
   ELSIF now()<v_cut-interval '15 minutes' THEN RAISE EXCEPTION 'Showcases are approved at the finale'; END IF;
  END IF;
  IF p_action='decline' THEN UPDATE public.sealed_quests SET declined_at=now(),declined_by=v_me WHERE id=q.id;
  ELSE UPDATE public.sealed_quests SET approved_at=now(),approved_by=v_me WHERE id=q.id; END IF;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.sealed_quest_state(p_trip uuid)
RETURNS TABLE(id uuid,kind text,drop_no int,value int,drop_at timestamptz,open_by timestamptz,opened_at timestamptz,destroy_at timestamptz,cutoff timestamptz,state text,title text,mission_text text,backstory text,keywords text[],proof_mode text,proof_shared boolean,submitted_at timestamptz,points int,meetup_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cut timestamptz; v_meet timestamptz;
BEGIN
 PERFORM trip_private.ensure_sealed(p_trip,auth.uid());
 v_cut:=trip_private.quest_cutoff(p_trip);
 SELECT ss.carry_on_meetup_at INTO v_meet FROM public.season_settings ss WHERE ss.trip_id=p_trip AND ss.season='trip';
 RETURN QUERY SELECT q.id,q.kind,q.drop_no,q.value,q.drop_at,least(q.drop_at+interval '3 days',v_cut),q.opened_at,
 CASE WHEN q.opened_at IS NULL THEN NULL ELSE least(q.opened_at+interval '24 hours',v_cut) END,v_cut,s.st,
 CASE WHEN s.vis THEN q.title END,CASE WHEN s.vis THEN q.mission_text END,CASE WHEN s.vis THEN q.backstory END,CASE WHEN s.vis THEN q.keywords END,
 q.proof_mode,CASE WHEN trip_private.a2c_minor_trip(p_trip) THEN false ELSE q.proof_shared END,q.submitted_at,trip_private.sealed_award(q),v_meet
 FROM public.sealed_quests q CROSS JOIN LATERAL (SELECT trip_private.sealed_state(q,v_cut) st) s0
 CROSS JOIN LATERAL (SELECT s0.st,(q.kind='showcase' OR (q.opened_at IS NOT NULL AND now()<least(q.opened_at+interval '24 hours',v_cut) AND s0.st IN ('open','counted','show_pending'))) vis) s
 WHERE q.trip_id=p_trip AND q.user_id=auth.uid() ORDER BY q.kind DESC,q.drop_no;
END $$;

CREATE OR REPLACE FUNCTION trip_private.a2c_quest_insights(p_trip uuid)
RETURNS TABLE(quest_id uuid, insight text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT q.id,q.insight FROM public.sealed_quests q JOIN public.trips t ON t.id=q.trip_id
 WHERE t.season_rule='a2c' AND q.trip_id=p_trip AND q.user_id=auth.uid() AND trip_private.is_trip_member(p_trip,auth.uid()) AND q.insight IS NOT NULL
 AND (q.kind='showcase' OR (q.opened_at IS NOT NULL AND now()<least(q.opened_at+interval '24 hours',trip_private.quest_cutoff(p_trip)))) $$;
CREATE OR REPLACE FUNCTION public.a2c_quest_insights(p_trip uuid) RETURNS TABLE(quest_id uuid,insight text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$ SELECT * FROM trip_private.a2c_quest_insights(p_trip) $$;
REVOKE ALL ON FUNCTION trip_private.a2c_quest_insights(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.a2c_quest_insights(uuid),public.a2c_quest_insights(uuid) TO authenticated,service_role;
