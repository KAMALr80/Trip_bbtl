ALTER TABLE public.culture_experiences ADD COLUMN showcase_at timestamptz, ADD COLUMN showcase_place text, ADD COLUMN showcase_code text, ADD COLUMN showcase_expires_at timestamptz, ADD COLUMN showcase_revoked_at timestamptz, ADD COLUMN showcase_presented_at timestamptz;
ALTER TABLE public.culture_experiences ADD CONSTRAINT culture_showcase_details CHECK (showcase_at IS NULL OR (a2e_kind='show' AND play_mode='solo' AND length(showcase_place) BETWEEN 2 AND 120));
CREATE UNIQUE INDEX culture_showcase_code_unique ON public.culture_experiences(showcase_code) WHERE showcase_code IS NOT NULL;
CREATE TABLE public.culture_showcase_viewers (experience_id uuid NOT NULL REFERENCES public.culture_experiences(id) ON DELETE CASCADE, viewer_id uuid NOT NULL, joined_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(experience_id,viewer_id));
GRANT SELECT ON public.culture_showcase_viewers TO authenticated;
GRANT ALL ON public.culture_showcase_viewers TO service_role;
ALTER TABLE public.culture_showcase_viewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Viewers see only their own invitation" ON public.culture_showcase_viewers FOR SELECT TO authenticated USING(viewer_id=auth.uid());
CREATE TRIGGER culture_showcase_viewers_updated BEFORE UPDATE ON public.culture_showcase_viewers FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE TABLE public.culture_showcase_ballots (experience_id uuid NOT NULL REFERENCES public.culture_experiences(id) ON DELETE CASCADE, viewer_id uuid NOT NULL, reaction text NOT NULL, vote text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(experience_id,viewer_id), FOREIGN KEY(experience_id,viewer_id) REFERENCES public.culture_showcase_viewers(experience_id,viewer_id) ON DELETE CASCADE, CONSTRAINT showcase_reaction_check CHECK(reaction IN ('applause','heart','star')), CONSTRAINT showcase_vote_check CHECK(vote IN ('inspiring','learned_something','would_try')));
GRANT SELECT ON public.culture_showcase_ballots TO authenticated;
GRANT ALL ON public.culture_showcase_ballots TO service_role;
ALTER TABLE public.culture_showcase_ballots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Viewers see only their own reaction" ON public.culture_showcase_ballots FOR SELECT TO authenticated USING(viewer_id=auth.uid());
CREATE TRIGGER culture_showcase_ballots_updated BEFORE UPDATE ON public.culture_showcase_ballots FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE TABLE public.culture_showcase_rewards (experience_id uuid PRIMARY KEY REFERENCES public.culture_experiences(id) ON DELETE CASCADE, creator_id uuid NOT NULL, points integer NOT NULL DEFAULT 5 CHECK(points=5), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.culture_showcase_rewards TO authenticated;
GRANT ALL ON public.culture_showcase_rewards TO service_role;
ALTER TABLE public.culture_showcase_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator sees their presentation bonus" ON public.culture_showcase_rewards FOR SELECT TO authenticated USING(creator_id=auth.uid());
CREATE TRIGGER culture_showcase_rewards_updated BEFORE UPDATE ON public.culture_showcase_rewards FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE OR REPLACE FUNCTION trip_private.culture_showcase(p_action text,p_exp uuid DEFAULT NULL,p_code text DEFAULT NULL,p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.culture_experiences; v_code text; v_until timestamptz; v_at timestamptz; v_place text; v_count int;
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
  RETURN jsonb_build_object('id',e.id,'title',e.title,'culture',e.country,'layer',e.culture_layer,'at',e.showcase_at,'place',e.showcase_place,'guide',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',d.day_number,'title',d.title,'story',left(coalesce(d.note,d.what_to_do),500)) ORDER BY d.day_number),'[]'::jsonb) FROM public.culture_exp_days d WHERE d.experience_id=e.id AND d.done_at IS NOT NULL),'reactions',(SELECT coalesce(jsonb_object_agg(reaction,n),'{}'::jsonb) FROM (SELECT reaction,count(*) n FROM public.culture_showcase_ballots WHERE experience_id=e.id GROUP BY reaction) b),'votes',(SELECT coalesce(jsonb_object_agg(vote,n),'{}'::jsonb) FROM (SELECT vote,count(*) n FROM public.culture_showcase_ballots WHERE experience_id=e.id GROUP BY vote) b),'mine',(SELECT to_jsonb(b) - 'experience_id' - 'viewer_id' FROM public.culture_showcase_ballots b WHERE b.experience_id=e.id AND b.viewer_id=auth.uid()));
 ELSIF p_action='react' THEN
  IF now()<e.showcase_at OR now()>e.showcase_at+interval '1 day' OR p->>'reaction' NOT IN ('applause','heart','star') OR p->>'vote' NOT IN ('inspiring','learned_something','would_try') THEN RAISE EXCEPTION 'Votes open on Showcase Night'; END IF;
  INSERT INTO public.culture_showcase_ballots(experience_id,viewer_id,reaction,vote) VALUES(e.id,auth.uid(),p->>'reaction',p->>'vote') ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('saved',true);
 END IF;
 RAISE EXCEPTION 'Unknown Showcase action';
END $$;
REVOKE ALL ON FUNCTION trip_private.culture_showcase(text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_showcase(text,uuid,text,jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.culture_showcase(p_action text,p_exp uuid DEFAULT NULL,p_code text DEFAULT NULL,p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.culture_showcase(p_action,p_exp,p_code,p) $$;
REVOKE ALL ON FUNCTION public.culture_showcase(text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.culture_showcase(text,uuid,text,jsonb) TO authenticated;
DO $migration$ DECLARE def text; BEGIN SELECT pg_get_functiondef('trip_private.solo_score(uuid)'::regprocedure) INTO def; def:=replace(def,'trip_private.solo_score(', 'trip_private.solo_score_legacy('); EXECUTE def; END $migration$;
REVOKE ALL ON FUNCTION trip_private.solo_score_legacy(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION trip_private.solo_score_legacy(uuid) TO service_role;
CREATE OR REPLACE FUNCTION trip_private.solo_score(p_exp uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT CASE WHEN EXISTS(SELECT 1 FROM public.culture_experiences WHERE id=p_exp AND a2e_kind='show' AND play_mode='solo') THEN jsonb_set(trip_private.solo_score_legacy(p_exp),'{points}',to_jsonb((trip_private.solo_score_legacy(p_exp)->>'points')::int+CASE WHEN EXISTS(SELECT 1 FROM public.culture_showcase_rewards WHERE experience_id=p_exp) THEN 5 ELSE 0 END)) ELSE trip_private.solo_score_legacy(p_exp) END $$;
REVOKE ALL ON FUNCTION trip_private.solo_score(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION trip_private.solo_score(uuid) TO service_role;