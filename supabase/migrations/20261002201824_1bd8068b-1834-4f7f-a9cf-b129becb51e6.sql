ALTER TABLE public.quest_posts ALTER COLUMN photo_path DROP NOT NULL;
CREATE TABLE public.quest_challenges (post_id uuid PRIMARY KEY REFERENCES public.quest_posts(id) ON DELETE CASCADE, trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, challenged_by uuid NOT NULL, decision boolean, decided_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.quest_challenges TO authenticated;
GRANT ALL ON public.quest_challenges TO service_role;
ALTER TABLE public.quest_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY quest_challenges_approved ON public.quest_challenges FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=quest_challenges.trip_id AND m.user_id=auth.uid() AND m.status='approved'));
CREATE OR REPLACE FUNCTION trip_private.post_quest(p_trip uuid,p_date date,p_quest integer,p_photo text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE g public.trip_day_games := trip_private.play_day(p_trip,p_date); BEGIN
 IF g.tag NOT IN ('Explore','Party') OR p_quest NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'No quests today'; END IF;
 IF p_photo IS NOT NULL AND NOT trip_private.valid_photo(p_trip,p_photo) THEN RAISE EXCEPTION 'Photo upload failed'; END IF;
 INSERT INTO public.quest_posts(trip_id,day_date,user_id,quest,photo_path) VALUES(p_trip,p_date,auth.uid(),p_quest,p_photo) ON CONFLICT(trip_id,day_date,user_id,quest) DO UPDATE SET photo_path=coalesce(excluded.photo_path,public.quest_posts.photo_path);
END $fn$;
CREATE OR REPLACE FUNCTION trip_private.thumb_quest(p_post uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE q public.quest_posts; BEGIN
 SELECT * INTO q FROM public.quest_posts WHERE id=p_post; IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found'; END IF;
 PERFORM trip_private.play_day(q.trip_id,q.day_date);
 IF q.user_id=auth.uid() THEN RAISE EXCEPTION 'You can''t verify your own quest'; END IF;
 IF q.photo_path IS NULL THEN RAISE EXCEPTION 'Honor-system quests do not need squad verification'; END IF;
 INSERT INTO public.quest_thumbs(post_id,trip_id,user_id) VALUES(p_post,q.trip_id,auth.uid()) ON CONFLICT DO NOTHING;
END $fn$;
CREATE FUNCTION trip_private.quest_review(p_post uuid,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE q public.quest_posts; BEGIN
 SELECT * INTO q FROM public.quest_posts WHERE id=p_post FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found'; END IF;
 PERFORM trip_private.play_day(q.trip_id,q.day_date);
 IF p_action='challenge' THEN
  IF q.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot challenge your own item'; END IF;
  INSERT INTO public.quest_challenges(post_id,trip_id,challenged_by) VALUES(p_post,q.trip_id,auth.uid()) ON CONFLICT DO NOTHING;
 ELSIF p_action IN ('approve','reject') THEN
  IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=q.trip_id AND user_id=auth.uid() AND status='approved' AND role='captain') THEN RAISE EXCEPTION 'Captain only'; END IF;
  UPDATE public.quest_challenges SET decision=(p_action='approve'),decided_by=auth.uid(),updated_at=now() WHERE post_id=p_post AND decision IS NULL;
 ELSE RAISE EXCEPTION 'Unknown review action'; END IF;
END $fn$;
REVOKE ALL ON FUNCTION trip_private.quest_review(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.quest_review(uuid,text) TO authenticated;
CREATE FUNCTION public.quest_review(p_post uuid,p_action text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.quest_review(p_post,p_action) $$;
REVOKE ALL ON FUNCTION public.quest_review(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quest_review(uuid,text) TO authenticated;