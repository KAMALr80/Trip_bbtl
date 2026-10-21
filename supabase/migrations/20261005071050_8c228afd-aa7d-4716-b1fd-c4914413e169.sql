DO $migration$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('trip_private.a2e_solo_ensure(uuid)'::regprocedure) INTO def;
  IF def IS NULL OR position('IF NOT FOUND THEN RAISE EXCEPTION ''No safe quest available''; END IF;' in def)=0 THEN RAISE EXCEPTION 'A2e selector shape changed'; END IF;
  def:=replace(def,
    'ORDER BY md5(sm.id::text||p_exp::text||d::text) LIMIT 1;',
    'AND length(btrim(sm.insight))>12 AND NOT (v_age<18 AND (sm.text||'' ''||sm.title) ~* ''(stranger|passer|after dark|late at night|photograph.*(local|person|people))'') ORDER BY md5(sm.id::text||p_exp::text||d::text) LIMIT 1;');
  def:=replace(def,
    'IF EXISTS(SELECT 1 FROM public.solo_quests q WHERE q.user_id=auth.uid() AND lower(q.title)=lower(v_title)) THEN v_title:=left(v_title,85)||'' · Day ''||d::text; END IF;',
    'IF EXISTS(SELECT 1 FROM public.solo_quests q WHERE q.user_id=auth.uid() AND lower(q.title)=lower(v_title)) THEN v_title:=left(v_title,85)||'' · Day ''||d::text; END IF;');
  def:=replace(def,
    'IF d<1 THEN v_text:=''Before you travel, research or safely try this from home: ''||v_text; END IF;',
    'IF EXISTS(SELECT 1 FROM public.solo_quests q JOIN public.culture_experiences x ON x.id=q.experience_id WHERE q.user_id=auth.uid() AND x.country=e.country AND x.culture_layer IS NOT DISTINCT FROM e.culture_layer AND q.mission_text=replace(c.text,''{destination}'',v_dest)) THEN v_text:=v_text||'' For day ''||d::text||'', choose a different real example, trace its origin using local voices, and compare what you learned with your earlier work.''; END IF; IF d<1 THEN v_text:=''Before you travel, research or safely try this from home: ''||v_text; END IF;');
  IF position('For day ' in def)=0 THEN RAISE EXCEPTION 'A2e fallback replacement failed'; END IF;
  EXECUTE def;
END $migration$;