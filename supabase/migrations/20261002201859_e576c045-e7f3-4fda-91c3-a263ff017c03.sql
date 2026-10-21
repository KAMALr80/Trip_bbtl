DO $migration$ DECLARE olddef text; newdef text; BEGIN
 SELECT pg_get_functiondef('trip_private.trip_season(uuid)'::regprocedure) INTO olddef;
 IF position('UNION ALL SELECT q.user_id, q.day_date, 2 FROM public.quest_posts q WHERE q.trip_id=p_trip AND (SELECT count(*) FROM public.quest_thumbs th WHERE th.post_id=q.id AND th.user_id<>q.user_id) >= 2' IN olddef)=0 THEN RAISE EXCEPTION 'Expected quest score clause not found'; END IF;
 newdef := replace(olddef, 'UNION ALL SELECT q.user_id, q.day_date, 2 FROM public.quest_posts q WHERE q.trip_id=p_trip AND (SELECT count(*) FROM public.quest_thumbs th WHERE th.post_id=q.id AND th.user_id<>q.user_id) >= 2', 'UNION ALL SELECT q.user_id, q.day_date, CASE WHEN q.photo_path IS NULL THEN 1 WHEN EXISTS (SELECT 1 FROM public.quest_challenges c WHERE c.post_id=q.id AND c.decision=false) THEN 0 WHEN (SELECT count(*) FROM public.quest_thumbs th WHERE th.post_id=q.id AND th.user_id<>q.user_id)>=2 OR EXISTS (SELECT 1 FROM public.quest_challenges c WHERE c.post_id=q.id AND c.decision=true) THEN 2 ELSE 0 END FROM public.quest_posts q WHERE q.trip_id=p_trip');
 EXECUTE newdef;
END $migration$;
CREATE OR REPLACE FUNCTION trip_private.quest_review(p_post uuid,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE q public.quest_posts; BEGIN
 SELECT * INTO q FROM public.quest_posts WHERE id=p_post FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Quest not found'; END IF;
 IF p_action='challenge' THEN
  PERFORM trip_private.play_day(q.trip_id,q.day_date);
  IF q.user_id=auth.uid() THEN RAISE EXCEPTION 'You cannot challenge your own item'; END IF;
  INSERT INTO public.quest_challenges(post_id,trip_id,challenged_by) VALUES(p_post,q.trip_id,auth.uid()) ON CONFLICT DO NOTHING;
 ELSIF p_action IN ('approve','reject') THEN
  IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=q.trip_id AND user_id=auth.uid() AND status='approved' AND role='captain') THEN RAISE EXCEPTION 'Captain only'; END IF;
  UPDATE public.quest_challenges SET decision=(p_action='approve'),decided_by=auth.uid(),updated_at=now() WHERE post_id=p_post AND decision IS NULL;
 ELSE RAISE EXCEPTION 'Unknown review action'; END IF;
END $fn$;
CREATE FUNCTION public.quest_challenge_update_time() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER quest_challenge_updated BEFORE UPDATE ON public.quest_challenges FOR EACH ROW EXECUTE FUNCTION public.quest_challenge_update_time();