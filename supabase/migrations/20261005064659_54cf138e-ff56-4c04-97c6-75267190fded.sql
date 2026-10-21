CREATE OR REPLACE FUNCTION trip_private.a2e_solo_ensure(p_exp uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.culture_experiences; d int; v_today date; v_first int; c public.security_missions; v_dest text; v_age int; v_layer text; v_title text; v_text text;
BEGIN
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp;
 IF NOT FOUND OR e.a2e_kind IS NULL OR e.play_mode<>'solo' OR e.creator_id IS DISTINCT FROM auth.uid() THEN RETURN; END IF;
 v_today:=trip_private.solo_today(auth.uid()); v_first:=CASE WHEN e.a2e_kind='inspire' THEN 1-coalesce(e.prep_days,0) ELSE 1 END;
 v_dest:=coalesce(nullif(e.city,''),nullif(e.region,''),e.country); v_age:=coalesce(trip_private.age_of(auth.uid()),0);
 FOR d IN v_first..least(e.days,v_today-e.start_date+1) LOOP
  IF EXISTS(SELECT 1 FROM public.solo_quests q WHERE q.experience_id=p_exp AND q.day_number=d) THEN CONTINUE; END IF;
  v_layer:=CASE WHEN e.culture_layer='food' THEN 'food' WHEN e.culture_layer='music' THEN 'music' WHEN e.culture_layer='language' THEN 'language' WHEN e.culture_layer='traditions' THEN 'traditions' WHEN e.culture_layer='history' THEN 'history' WHEN e.culture_layer='fashion' THEN 'art' WHEN e.culture_layer='games' THEN 'sports' WHEN e.culture_layer='everyday' THEN 'work' END;
  SELECT * INTO c FROM public.security_missions sm WHERE sm.trip_id IS NULL AND sm.kind='solo' AND sm.presentation_tag='solo_guide' AND length(btrim(sm.insight))>12
   AND (v_layer IS NULL OR sm.category=v_layer)
   AND (v_age>=21 OR NOT (sm.traveler_tags @> ARRAY['night_owl']))
   AND NOT (v_age<18 AND (sm.text||' '||sm.title) ~* '(stranger|passer|after dark|late at night|photograph.*(local|person|people))')
   AND NOT EXISTS (SELECT 1 FROM public.solo_quests q JOIN public.culture_experiences x ON x.id=q.experience_id WHERE q.user_id=auth.uid() AND x.country=e.country AND x.culture_layer IS NOT DISTINCT FROM e.culture_layer AND lower(q.title)=lower(replace(sm.title,'{destination}',v_dest)))
   ORDER BY (sm.traveler_tags && e.traveler_types) DESC,md5(sm.id::text||p_exp::text||d::text) LIMIT 1;
  IF NOT FOUND THEN
   SELECT * INTO c FROM public.security_missions sm WHERE sm.trip_id IS NULL AND sm.kind='solo' AND sm.presentation_tag='solo_guide' AND (v_age>=21 OR NOT (sm.traveler_tags @> ARRAY['night_owl'])) AND (v_layer IS NULL OR sm.category=v_layer)
   ORDER BY md5(sm.id::text||p_exp::text||d::text) LIMIT 1;
   IF NOT FOUND THEN SELECT * INTO c FROM public.security_missions sm WHERE sm.trip_id IS NULL AND sm.kind='solo' AND (v_age>=21 OR NOT (sm.traveler_tags @> ARRAY['night_owl'])) ORDER BY md5(sm.id::text||p_exp::text||d::text) LIMIT 1; END IF;
   IF NOT FOUND THEN RAISE EXCEPTION 'No safe quest available'; END IF;
  END IF;
  v_title:=replace(c.title,'{destination}',v_dest);
  IF EXISTS(SELECT 1 FROM public.solo_quests q WHERE q.user_id=auth.uid() AND lower(q.title)=lower(v_title)) THEN v_title:=left(v_title,85)||' · Day '||d::text; END IF;
  v_text:=replace(c.text,'{destination}',v_dest);
  IF d<1 THEN v_text:='Before you travel, research or safely try this from home: '||v_text; END IF;
  INSERT INTO public.solo_quests(experience_id,user_id,day_number,title,mission_text,backstory,keywords,insight,lens,budget_note)
   VALUES(p_exp,auth.uid(),d,v_title,v_text,replace(c.backstory,'{destination}',v_dest),ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(c.keywords) k),replace(c.insight,'{destination}',v_dest),c.category,c.budget_note)
   ON CONFLICT DO NOTHING;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION trip_private.a2e_solo_ensure(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION trip_private.a2e_solo_ensure(uuid) TO service_role;
DO $migration$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.proname='solo_ensure' AND pg_get_function_identity_arguments(p.oid)='p_exp uuid';
 IF def IS NULL THEN RAISE EXCEPTION 'Legacy selector missing'; END IF;
 def:=replace(def,'trip_private.solo_ensure(', 'trip_private.solo_ensure_legacy(');
 EXECUTE def;
END $migration$;
REVOKE ALL ON FUNCTION trip_private.solo_ensure_legacy(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION trip_private.solo_ensure_legacy(uuid) TO service_role;
CREATE OR REPLACE FUNCTION trip_private.solo_ensure(p_exp uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.culture_experiences WHERE id=p_exp AND a2e_kind IS NOT NULL) THEN PERFORM trip_private.a2e_solo_ensure(p_exp);
 ELSE PERFORM trip_private.solo_ensure_legacy(p_exp); END IF;
END $$;
REVOKE ALL ON FUNCTION trip_private.solo_ensure(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION trip_private.solo_ensure(uuid) TO service_role;