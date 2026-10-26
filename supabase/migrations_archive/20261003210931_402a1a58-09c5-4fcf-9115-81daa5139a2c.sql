CREATE OR REPLACE FUNCTION trip_private.quick_vote_totals(p_vote uuid) RETURNS TABLE(cleared bigint,grounded bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v public.live_votes; v_week integer;
BEGIN
 SELECT * INTO v FROM public.live_votes WHERE id=p_vote AND kind='custom' AND prompt='Quick vote' AND options='[{"label":"Cleared for Takeoff"},{"label":"Grounded"}]'::jsonb;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT trip_private.is_trip_member(v.trip_id,auth.uid()) THEN RAISE EXCEPTION 'Quick Vote not found'; END IF;
 SELECT week_number INTO v_week FROM public.game_nights WHERE trip_id=v.trip_id AND NOT skipped AND starts_at BETWEEN now()-interval '3 hours' AND now()+interval '15 minutes' ORDER BY starts_at DESC LIMIT 1;
 IF NOT (trip_private.is_leader(v.trip_id) OR (v_week IS NOT NULL AND EXISTS(SELECT 1 FROM public.game_nights WHERE trip_id=v.trip_id AND week_number=v_week AND host_id=auth.uid()))) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can see totals before reveal'; END IF;
 RETURN QUERY SELECT count(*) FILTER(WHERE b.option_index=0),count(*) FILTER(WHERE b.option_index=1) FROM public.live_vote_ballots b WHERE b.vote_id=p_vote;
END $fn$;
REVOKE ALL ON FUNCTION trip_private.quick_vote_totals(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.quick_vote_totals(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.quick_vote_totals(p_vote uuid) RETURNS TABLE(cleared bigint,grounded bigint) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.quick_vote_totals(p_vote) $$;
REVOKE ALL ON FUNCTION public.quick_vote_totals(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.quick_vote_totals(uuid) TO authenticated;