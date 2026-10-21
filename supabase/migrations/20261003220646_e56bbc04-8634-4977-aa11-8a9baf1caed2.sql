ALTER TABLE public.trips DROP CONSTRAINT trips_at_home_length_check;
ALTER TABLE public.trips ADD CONSTRAINT trips_at_home_length_check CHECK (at_home_length IS NULL OR at_home_length IN ('weekend','week','two_weeks') OR at_home_length ~ '^d([1-9]|1[0-2])$');

CREATE TABLE public.home_day_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
 day_date date NOT NULL, starts_at timestamptz NOT NULL, card_id integer NOT NULL REFERENCES public.at_home_pack_items(id),
 step text NOT NULL DEFAULT 'card' CHECK (step IN ('card','present','vote','done')),
 presenter_id uuid, revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trip_id,day_date)
);
GRANT SELECT ON public.home_day_sessions TO authenticated;
GRANT ALL ON public.home_day_sessions TO service_role;
ALTER TABLE public.home_day_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved squad sees home days" ON public.home_day_sessions FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id,auth.uid()));
CREATE TABLE public.home_day_results (
 session_id uuid NOT NULL REFERENCES public.home_day_sessions(id) ON DELETE CASCADE, user_id uuid NOT NULL,
 completed_at timestamptz, presented_at timestamptz, voted_at timestamptz, choice integer CHECK (choice IN (0,1)),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(session_id,user_id)
);
GRANT SELECT ON public.home_day_results TO authenticated;
GRANT ALL ON public.home_day_results TO service_role;
ALTER TABLE public.home_day_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members see their own home results" ON public.home_day_results FOR SELECT TO authenticated USING (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.home_day_sessions s WHERE s.id=session_id AND trip_private.is_trip_member(s.trip_id,auth.uid())));
CREATE TRIGGER home_day_sessions_updated BEFORE UPDATE ON public.home_day_sessions FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE TRIGGER home_day_results_updated BEFORE UPDATE ON public.home_day_results FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE OR REPLACE FUNCTION trip_private.create_at_home(p_pack text,p_length text,p_start date,p_vibe text,p_tz text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_trip uuid; v_end date; v_name text; attempt int; tz text := coalesce(nullif(trim(p_tz),''),'UTC'); v_days int; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF coalesce(trip_private.age_of(auth.uid()),0)<18 THEN RAISE EXCEPTION 'At Home is for players 18 and older.'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'TripJunkies is invite-only during the private beta'; END IF;
 PERFORM now() AT TIME ZONE tz;
 SELECT name INTO v_name FROM public.at_home_packs WHERE key=p_pack;
 IF v_name IS NULL THEN RAISE EXCEPTION 'Pick a destination'; END IF;
 IF p_length ~ '^d([1-9]|1[0-2])$' THEN v_days := substring(p_length from 2)::int;
 ELSIF p_length IN ('weekend','week','two_weeks') THEN v_days := CASE p_length WHEN 'weekend' THEN 3 WHEN 'week' THEN 7 ELSE 14 END;
 ELSE RAISE EXCEPTION 'Pick 1 to 12 days'; END IF;
 IF p_vibe NOT IN ('family','chill','party') THEN RAISE EXCEPTION 'Pick a vibe'; END IF;
 IF p_vibe='party' AND coalesce(trip_private.age_of(auth.uid()),0)<21 THEN RAISE EXCEPTION 'Party vibe needs a Captain who is 21+'; END IF;
 IF p_start IS NULL OR p_start < (now() AT TIME ZONE tz)::date+1 OR p_start > (now() AT TIME ZONE tz)::date+365 THEN RAISE EXCEPTION 'Choose a date at least one day ahead'; END IF;
 IF p_length='weekend' AND extract(isodow FROM p_start)<>5 THEN RAISE EXCEPTION 'Weekend experiences start on a Friday'; END IF;
 v_end := p_start+v_days-1;
 FOR attempt IN 1..15 LOOP BEGIN
 INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,trip_timezone,join_code,kind,at_home_pack,at_home_length,season_scoring,vibe)
 VALUES(v_name||' at Home',v_name||' (at home)',p_start,v_end,tz,tz,public.new_trip_code(),'at_home',p_pack,p_length,false,p_vibe) RETURNING id INTO v_trip;
 EXIT;
 EXCEPTION WHEN unique_violation THEN IF attempt=15 THEN RAISE; END IF; END; END LOOP;
 INSERT INTO public.trip_members(trip_id,user_id,role,approved_at) VALUES(v_trip,auth.uid(),'captain',now());
 IF p_length LIKE 'd%' THEN
   INSERT INTO public.home_day_sessions(trip_id,day_date,starts_at,card_id)
   SELECT v_trip,p_start+g.n,(p_start+g.n+time '19:00') AT TIME ZONE tz,
    (SELECT i.id FROM public.at_home_pack_items i WHERE i.pack=p_pack AND NOT i.adult AND i.category IN ('dish','order_in','phrase','build','culture','dress_up','playlist','movie','snack') ORDER BY md5(i.id::text||v_trip::text) OFFSET g.n LIMIT 1)
   FROM generate_series(0,v_days-1) AS g(n);
 ELSE PERFORM trip_private.plan_at_home(v_trip); END IF;
 RETURN v_trip;
END $$;

CREATE OR REPLACE FUNCTION trip_private.home_day_schedule(p_trip uuid,p_day date,p_time time,p_all boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips; BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set session times'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.kind NOT IN ('at_home','cultural_inspiration') OR p_day NOT BETWEEN t.start_date AND t.end_date OR p_time IS NULL THEN RAISE EXCEPTION 'Choose an experience day and time'; END IF;
 IF p_all THEN
   UPDATE public.home_day_sessions SET starts_at=(day_date+p_time) AT TIME ZONE t.home_timezone WHERE trip_id=p_trip AND step='card' AND starts_at>now();
 ELSE
   UPDATE public.home_day_sessions SET starts_at=(p_day+p_time) AT TIME ZONE t.home_timezone WHERE trip_id=p_trip AND day_date=p_day AND step='card' AND starts_at>now();
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'This session has already started'; END IF;
END $$;
CREATE OR REPLACE FUNCTION trip_private.home_day_view(p_trip uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; t public.trips; BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this experience first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.kind NOT IN ('at_home','cultural_inspiration') THEN RAISE EXCEPTION 'Not a home experience'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'day',s.day_date,'startsAt',s.starts_at,'step',s.step,'presenter',s.presenter_id,'revealed',s.revealed_at IS NOT NULL,'title',CASE WHEN now()>=s.starts_at THEN i.title END,'body',CASE WHEN now()>=s.starts_at THEN i.body END,'mine',coalesce((SELECT jsonb_build_object('completed',r.completed_at IS NOT NULL,'presented',r.presented_at IS NOT NULL,'voted',r.voted_at IS NOT NULL,'choice',r.choice) FROM public.home_day_results r WHERE r.session_id=s.id AND r.user_id=auth.uid()),'{}'::jsonb),'counts',CASE WHEN s.revealed_at IS NOT NULL THEN (SELECT jsonb_build_array(count(*) FILTER(WHERE choice=0),count(*) FILTER(WHERE choice=1)) FROM public.home_day_results r WHERE r.session_id=s.id) ELSE NULL END) ORDER BY s.day_date),'[]'::jsonb) INTO result
 FROM public.home_day_sessions s JOIN public.at_home_pack_items i ON i.id=s.card_id WHERE s.trip_id=p_trip;
 RETURN result;
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
   UPDATE public.home_day_sessions SET step='done',revealed_at=now() WHERE id=s.id;
 ELSE RAISE EXCEPTION 'This step is not open'; END IF;
END $$;
CREATE OR REPLACE FUNCTION trip_private.home_day_scores(p_trip uuid) RETURNS TABLE(user_id uuid,points integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this experience first'; END IF;
 RETURN QUERY SELECT m.user_id,coalesce(sum((CASE WHEN s.revealed_at IS NOT NULL AND r.completed_at IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN s.revealed_at IS NOT NULL AND r.presented_at IS NOT NULL THEN 1 ELSE 0 END)+(CASE WHEN s.revealed_at IS NOT NULL AND r.voted_at IS NOT NULL THEN 1 ELSE 0 END)),0)::int FROM public.trip_members m LEFT JOIN public.home_day_results r ON r.user_id=m.user_id LEFT JOIN public.home_day_sessions s ON s.id=r.session_id AND s.trip_id=p_trip WHERE m.trip_id=p_trip AND m.status='approved' GROUP BY m.user_id ORDER BY 2 DESC,m.user_id;
END $$;
CREATE OR REPLACE FUNCTION public.home_day_schedule(p_trip uuid,p_day date,p_time time,p_all boolean DEFAULT false) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.home_day_schedule(p_trip,p_day,p_time,p_all) $$;
CREATE OR REPLACE FUNCTION public.home_day_view(p_trip uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$ SELECT trip_private.home_day_view(p_trip) $$;
CREATE OR REPLACE FUNCTION public.home_day_action(p_session uuid,p_action text,p_choice integer DEFAULT NULL) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.home_day_action(p_session,p_action,p_choice) $$;
CREATE OR REPLACE FUNCTION public.home_day_scores(p_trip uuid) RETURNS TABLE(user_id uuid,points integer) LANGUAGE sql STABLE SET search_path=public AS $$ SELECT * FROM trip_private.home_day_scores(p_trip) $$;
REVOKE ALL ON FUNCTION trip_private.home_day_schedule(uuid,date,time,boolean),trip_private.home_day_view(uuid),trip_private.home_day_action(uuid,text,integer),trip_private.home_day_scores(uuid),public.home_day_schedule(uuid,date,time,boolean),public.home_day_view(uuid),public.home_day_action(uuid,text,integer),public.home_day_scores(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.home_day_schedule(uuid,date,time,boolean),trip_private.home_day_view(uuid),trip_private.home_day_action(uuid,text,integer),trip_private.home_day_scores(uuid),public.home_day_schedule(uuid,date,time,boolean),public.home_day_view(uuid),public.home_day_action(uuid,text,integer),public.home_day_scores(uuid) TO authenticated;