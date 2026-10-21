CREATE OR REPLACE FUNCTION trip_private.culture_showcase(p_action text,p_exp uuid DEFAULT NULL,p_code text DEFAULT NULL,p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.culture_experiences; v_code text; v_until timestamptz; v_at timestamptz; v_place text;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'Sign in to the private beta first'; END IF;
 IF p_action='join' THEN
  IF p_code !~ '^[A-Z2-9]{16}$' THEN RAISE EXCEPTION 'Showcase invitation not found'; END IF;
  SELECT * INTO e FROM public.culture_experiences WHERE showcase_code=p_code AND showcase_revoked_at IS NULL AND showcase_expires_at>now() AND a2e_kind='show' AND play_mode='solo' AND finished_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Showcase invitation expired or unavailable'; END IF;
  IF e.creator_id=auth.uid() THEN RAISE EXCEPTION 'This is your Showcase'; END IF;
  INSERT INTO public.culture_showcase_viewers(experience_id,viewer_id) VALUES(e.id,auth.uid()) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('id',e.id);
 END IF;
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
 IF NOT FOUND OR e.a2e_kind<>'show' OR e.play_mode<>'solo' THEN RAISE EXCEPTION 'Showcase unavailable'; END IF;
 IF p_action IN ('invite','revoke','present') THEN
  IF e.creator_id IS DISTINCT FROM auth.uid() OR e.finished_at IS NULL THEN RAISE EXCEPTION 'Only the finished guide creator can do this'; END IF;
  IF p_action='invite' THEN
   v_at:=(p->>'at')::timestamptz; v_place:=btrim(coalesce(p->>'place',''));
   IF v_at IS NULL OR v_at<=now() OR v_at>now()+interval '1 year' OR length(v_place) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Choose a future date, time and place'; END IF;
   v_code:=upper(substr(translate(encode(gen_random_bytes(12),'hex'),'01','AB'),1,16));
   v_until:=least(v_at+interval '1 day',now()+interval '30 days');
   UPDATE public.culture_experiences SET showcase_at=v_at,showcase_place=v_place,showcase_code=v_code,showcase_expires_at=v_until,showcase_revoked_at=NULL,updated_at=now() WHERE id=e.id AND creator_id=auth.uid();
   RETURN jsonb_build_object('id',e.id,'code',v_code,'at',v_at,'place',v_place);
  ELSIF p_action='revoke' THEN
   UPDATE public.culture_experiences SET showcase_revoked_at=now(),showcase_code=NULL,updated_at=now() WHERE id=e.id AND creator_id=auth.uid(); RETURN '{}'::jsonb;
  END IF;
  IF e.showcase_at IS NULL OR now()<e.showcase_at OR e.showcase_revoked_at IS NOT NULL THEN RAISE EXCEPTION 'The Showcase has not begun'; END IF;
  INSERT INTO public.culture_showcase_rewards(experience_id,creator_id) VALUES(e.id,auth.uid()) ON CONFLICT DO NOTHING;
  UPDATE public.culture_experiences SET showcase_presented_at=coalesce(showcase_presented_at,now()),updated_at=now() WHERE id=e.id AND creator_id=auth.uid(); RETURN jsonb_build_object('bonus',5);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.culture_showcase_viewers WHERE experience_id=e.id AND viewer_id=auth.uid()) THEN RAISE EXCEPTION 'Invitation required'; END IF;
 IF e.showcase_revoked_at IS NOT NULL OR e.showcase_expires_at<=now() THEN RAISE EXCEPTION 'Showcase invitation expired'; END IF;
 IF p_action='view' THEN
  RETURN jsonb_build_object('id',e.id,'title',e.title,'culture',e.country,'layer',e.culture_layer,'at',e.showcase_at,'place',e.showcase_place,'guide',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',d.day_number,'title',d.title,'story',left(d.what_to_do,500)) ORDER BY d.day_number),'[]'::jsonb) FROM public.culture_exp_days d WHERE d.experience_id=e.id AND d.done_at IS NOT NULL),'reactions',(SELECT coalesce(jsonb_object_agg(reaction,n),'{}'::jsonb) FROM (SELECT reaction,count(*) n FROM public.culture_showcase_ballots WHERE experience_id=e.id GROUP BY reaction) b),'votes',(SELECT coalesce(jsonb_object_agg(vote,n),'{}'::jsonb) FROM (SELECT vote,count(*) n FROM public.culture_showcase_ballots WHERE experience_id=e.id GROUP BY vote) b),'mine',(SELECT to_jsonb(b) - 'experience_id' - 'viewer_id' FROM public.culture_showcase_ballots b WHERE b.experience_id=e.id AND b.viewer_id=auth.uid()));
 ELSIF p_action='react' THEN
  IF now()<e.showcase_at OR now()>e.showcase_at+interval '1 day' OR p->>'reaction' NOT IN ('applause','heart','star') OR p->>'vote' NOT IN ('inspiring','learned_something','would_try') THEN RAISE EXCEPTION 'Votes open on Showcase Night'; END IF;
  INSERT INTO public.culture_showcase_ballots(experience_id,viewer_id,reaction,vote) VALUES(e.id,auth.uid(),p->>'reaction',p->>'vote') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('saved',true);
 END IF;
 RAISE EXCEPTION 'Unknown Showcase action';
END $$;
REVOKE ALL ON FUNCTION trip_private.culture_showcase(text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_showcase(text,uuid,text,jsonb) TO authenticated,service_role;