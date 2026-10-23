CREATE OR REPLACE FUNCTION trip_private.extend_draw_timer(p_trip uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.trip_play_state%ROWTYPE; n integer;
BEGIN
  IF NOT (trip_private.is_leader(p_trip) OR trip_private.lab_bypass(p_trip) OR EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND host_id=auth.uid() AND NOT skipped AND starts_at BETWEEN now()-interval '4 hours' AND now()+interval '2 hours')) THEN
    RAISE EXCEPTION 'Only the host, Captain or Co-Captain can extend the timer';
  END IF;
  SELECT * INTO s FROM public.trip_play_state WHERE trip_id=p_trip FOR UPDATE;
  IF NOT FOUND OR s.timer_label IS DISTINCT FROM '20-sec Draw' OR s.timer_ends_at IS NULL OR s.timer_ends_at <= now() THEN
    RAISE EXCEPTION 'Start the drawing timer first';
  END IF;
  n := COALESCE(s.timer_secs, 20);
  IF n < 20 OR n >= 50 THEN RAISE EXCEPTION 'The drawing timer has reached its extra-time limit'; END IF;
  UPDATE public.trip_play_state SET timer_secs=n+10, timer_ends_at=s.timer_ends_at + interval '10 seconds', updated_at=now() WHERE trip_id=p_trip;
  RETURN n+10;
END $function$;
REVOKE ALL ON FUNCTION trip_private.extend_draw_timer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.extend_draw_timer(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.extend_draw_timer(p_trip uuid) RETURNS integer LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.extend_draw_timer(p_trip) $$;
REVOKE ALL ON FUNCTION public.extend_draw_timer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extend_draw_timer(uuid) TO authenticated;