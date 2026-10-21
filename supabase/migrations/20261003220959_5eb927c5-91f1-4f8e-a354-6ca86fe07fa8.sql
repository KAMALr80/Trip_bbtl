CREATE OR REPLACE FUNCTION trip_private.home_day_scores(p_trip uuid) RETURNS TABLE(user_id uuid,points integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this experience first'; END IF;
 RETURN QUERY SELECT m.user_id,coalesce(sum((CASE WHEN r.completed_at IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN r.presented_at IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN r.voted_at IS NOT NULL THEN 1 ELSE 0 END)) FILTER (WHERE s.revealed_at IS NOT NULL),0)::int
 FROM public.trip_members m
 LEFT JOIN public.home_day_sessions s ON s.trip_id=m.trip_id
 LEFT JOIN public.home_day_results r ON r.session_id=s.id AND r.user_id=m.user_id
 WHERE m.trip_id=p_trip AND m.status='approved' GROUP BY m.user_id ORDER BY 2 DESC,m.user_id;
END $$;
CREATE OR REPLACE FUNCTION trip_private.home_day_action(p_session uuid,p_action text,p_choice integer DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.home_day_sessions; v_next uuid; BEGIN
 SELECT * INTO s FROM public.home_day_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR NOT trip_private.is_trip_member(s.trip_id,auth.uid()) THEN RAISE EXCEPTION 'Join this experience first'; END IF;
 IF now()<s.starts_at THEN RAISE EXCEPTION 'This Game Day has not started'; END IF;
 IF p_action='complete' AND s.step IN ('card','present') THEN
   INSERT INTO public.home_day_results(session_id,user_id,completed_at) VALUES(s.id,auth.uid(),now()) ON CONFLICT(session_id,user_id) DO UPDATE SET completed_at=coalesce(home_day_results.completed_at,EXCLUDED.completed_at);
 ELSIF p_action='presented' THEN
   IF NOT trip_private.is_leader(s.trip_id) OR s.step<>'present' OR s.presenter_id IS NULL THEN RAISE EXCEPTION 'The host marks each presentation'; END IF;
   INSERT INTO public.home_day_results(session_id,user_id,presented_at) VALUES(s.id,s.presenter_id,now()) ON CONFLICT(session_id,user_id) DO UPDATE SET presented_at=coalesce(home_day_results.presented_at,EXCLUDED.presented_at);
   SELECT m.user_id INTO v_next FROM public.trip_members m WHERE m.trip_id=s.trip_id AND m.status='approved' AND m.user_id<>s.presenter_id AND NOT EXISTS(SELECT 1 FROM public.home_day_results r WHERE r.session_id=s.id AND r.user_id=m.user_id AND r.presented_at IS NOT NULL) ORDER BY m.approved_at,m.joined_at LIMIT 1;
   UPDATE public.home_day_sessions SET presenter_id=v_next,step=CASE WHEN v_next IS NULL THEN 'vote' ELSE 'present' END WHERE id=s.id;
 ELSIF p_action='next' THEN
   IF NOT trip_private.is_leader(s.trip_id) OR s.step<>'card' THEN RAISE EXCEPTION 'Only the host opens presentations'; END IF;
   SELECT m.user_id INTO v_next FROM public.trip_members m WHERE m.trip_id=s.trip_id AND m.status='approved' ORDER BY m.approved_at,m.joined_at LIMIT 1;
   UPDATE public.home_day_sessions SET presenter_id=v_next,step=CASE WHEN v_next IS NULL THEN 'vote' ELSE 'present' END WHERE id=s.id;
 ELSIF p_action='vote' THEN
   IF s.step<>'vote' OR p_choice NOT IN (0,1) THEN RAISE EXCEPTION 'Voting is not open'; END IF;
   INSERT INTO public.home_day_results(session_id,user_id,voted_at,choice) VALUES(s.id,auth.uid(),now(),p_choice) ON CONFLICT(session_id,user_id) DO UPDATE SET voted_at=EXCLUDED.voted_at,choice=EXCLUDED.choice;
 ELSIF p_action='reveal' THEN
   IF NOT trip_private.is_leader(s.trip_id) OR s.step<>'vote' THEN RAISE EXCEPTION 'Only the host reveals votes'; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.home_day_results WHERE session_id=s.id AND voted_at IS NOT NULL) THEN RAISE EXCEPTION 'Wait for at least one vote'; END IF;
   UPDATE public.home_day_sessions SET step='done',revealed_at=now() WHERE id=s.id;
 ELSE RAISE EXCEPTION 'This step is not open'; END IF;
END $$;