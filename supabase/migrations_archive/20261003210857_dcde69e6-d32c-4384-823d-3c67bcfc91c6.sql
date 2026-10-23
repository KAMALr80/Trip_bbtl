ALTER TABLE public.trip_play_state ADD COLUMN play_phase_override integer;
ALTER TABLE public.trip_play_state ADD CONSTRAINT trip_play_phase_range CHECK (play_phase_override IS NULL OR play_phase_override BETWEEN 0 AND 3);
CREATE OR REPLACE FUNCTION trip_private.advance_play_phase(p_trip uuid, p_current integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_current integer; v_next integer;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can move the phase'; END IF;
 IF p_current NOT BETWEEN 0 AND 2 THEN RAISE EXCEPTION 'Invalid phase'; END IF;
 INSERT INTO public.trip_play_state(trip_id) VALUES(p_trip) ON CONFLICT(trip_id) DO NOTHING;
 SELECT play_phase_override INTO v_current FROM public.trip_play_state WHERE trip_id=p_trip FOR UPDATE;
 IF v_current IS NOT NULL AND v_current <> p_current THEN RAISE EXCEPTION 'The phase changed; refresh and try again'; END IF;
 v_next := p_current + 1;
 UPDATE public.trip_play_state SET play_phase_override=v_next, updated_at=now() WHERE trip_id=p_trip;
 RETURN v_next;
END $fn$;
REVOKE ALL ON FUNCTION trip_private.advance_play_phase(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.advance_play_phase(uuid,integer) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.advance_play_phase(p_trip uuid,p_current integer) RETURNS integer LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.advance_play_phase(p_trip,p_current) $$;
REVOKE ALL ON FUNCTION public.advance_play_phase(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_play_phase(uuid,integer) TO authenticated;
ALTER TABLE public.live_votes DROP CONSTRAINT IF EXISTS live_votes_status_check;
ALTER TABLE public.live_votes ADD CONSTRAINT live_votes_status_check CHECK (status IN ('open','locked','revealed'));
CREATE OR REPLACE FUNCTION trip_private.quick_vote_action(p_trip uuid,p_action text,p_vote uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v public.live_votes; v_id uuid; v_week integer; v_counts jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Trip not found'; END IF;
 SELECT week_number INTO v_week FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped AND starts_at BETWEEN now()-interval '3 hours' AND now()+interval '15 minutes' ORDER BY starts_at DESC LIMIT 1;
 IF NOT (trip_private.is_leader(p_trip) OR (v_week IS NOT NULL AND EXISTS(SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=v_week AND host_id=auth.uid()))) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can run a vote'; END IF;
 IF p_action='start' THEN
   IF EXISTS(SELECT 1 FROM public.live_votes WHERE trip_id=p_trip AND kind='custom' AND prompt='Quick vote' AND status IN ('open','locked')) THEN RAISE EXCEPTION 'Finish the current Quick Vote first'; END IF;
   INSERT INTO public.live_votes(trip_id,kind,prompt,options,week_number,created_by) VALUES(p_trip,'custom','Quick vote','[{"label":"Cleared for Takeoff"},{"label":"Grounded"}]'::jsonb,NULL,auth.uid()) RETURNING id INTO v_id;
   RETURN v_id;
 END IF;
 SELECT * INTO v FROM public.live_votes WHERE id=p_vote AND trip_id=p_trip AND kind='custom' AND prompt='Quick vote' AND options='[{"label":"Cleared for Takeoff"},{"label":"Grounded"}]'::jsonb FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quick Vote not found'; END IF;
 IF p_action='lock' THEN
   IF v.status <> 'open' THEN RAISE EXCEPTION 'Vote is not open'; END IF;
   UPDATE public.live_votes SET status='locked' WHERE id=v.id;
 ELSIF p_action='reveal' THEN
   IF v.status <> 'locked' THEN RAISE EXCEPTION 'Lock the vote first'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.live_vote_ballots WHERE vote_id=v.id) THEN RAISE EXCEPTION 'Waiting for votes'; END IF;
   SELECT jsonb_agg((SELECT count(*) FROM public.live_vote_ballots b WHERE b.vote_id=v.id AND b.option_index=i) ORDER BY i) INTO v_counts FROM generate_series(0,1) i;
   UPDATE public.live_votes SET status='revealed',results=v_counts,revealed_at=now() WHERE id=v.id;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
 RETURN v.id;
END $fn$;
REVOKE ALL ON FUNCTION trip_private.quick_vote_action(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.quick_vote_action(uuid,text,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.quick_vote_action(p_trip uuid,p_action text,p_vote uuid DEFAULT NULL) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.quick_vote_action(p_trip,p_action,p_vote) $$;
REVOKE ALL ON FUNCTION public.quick_vote_action(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quick_vote_action(uuid,text,uuid) TO authenticated;