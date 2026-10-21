ALTER TABLE public.mission_claims ADD COLUMN IF NOT EXISTS revealed_at timestamptz;

CREATE OR REPLACE FUNCTION trip_private.effective_crowning(p_trip uuid, p_season text)
 RETURNS timestamp with time zone LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT CASE
   WHEN p_season='game' AND t.kind='trip' THEN ((t.start_date - 1 + time '23:59') AT TIME ZONE t.home_timezone)
   WHEN s.crowning_mode='takeoff' THEN coalesce(s.crowning_at,(SELECT n.starts_at+interval '3 hours' FROM public.game_nights n WHERE n.trip_id=p_trip AND NOT n.skipped AND (n.starts_at AT TIME ZONE t.home_timezone)::date<t.start_date ORDER BY n.starts_at DESC LIMIT 1))
   WHEN s.crowning_mode='departure' THEN (t.start_date+time '08:00') AT TIME ZONE t.home_timezone
   ELSE s.crowning_at END
 FROM public.season_settings s JOIN public.trips t ON t.id=s.trip_id WHERE s.trip_id=p_trip AND s.season=p_season $function$;

CREATE OR REPLACE FUNCTION trip_private.season_timing(p_trip uuid)
 RETURNS TABLE(mode text, preflight_start date, cutoff timestamp with time zone, reveal_at timestamp with time zone, drop_count integer, finale_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips; local_today date; days_total integer;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.season_rule<>'a2c' THEN RAISE EXCEPTION 'This room uses its original season'; END IF;
 local_today:=trip_private.trip_today(p_trip);
 days_total:=t.start_date-coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date);
 IF t.kind='trip' THEN
   mode:=CASE WHEN t.start_date<=local_today THEN 'trip_season' WHEN t.game_plan='quick_start' THEN 'quick_start' ELSE 'preflight' END;
   preflight_start:=greatest(coalesce(t.game_start,local_today),t.start_date-10);
   cutoff:=trip_private.quest_cutoff(p_trip);
   reveal_at:=((t.start_date - 1 + time '23:59') AT TIME ZONE t.home_timezone);
   drop_count:=CASE WHEN t.start_date<=(t.created_at AT TIME ZONE t.home_timezone)::date THEN 0 WHEN t.game_plan='quick_start' THEN 1 WHEN days_total<7 THEN 2 ELSE 3 END;
   finale_at:=reveal_at;
 ELSE
   mode:='at_home';preflight_start:=t.game_start;finale_at:=t.finale_at;cutoff:=t.finale_at;reveal_at:=t.finale_at;
   drop_count:=CASE WHEN t.end_date-t.start_date<6 THEN 2 ELSE 3 END;
 END IF;
 RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.mission_action(p_trip uuid, p_action text, p_slot integer, p_claim uuid, p_layover boolean, p_phase text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_kind text; v_t public.trips; v_m public.security_missions; v_c public.mission_claims; v_id uuid; v_phase text := coalesce(p_phase,'takeoff'); v_open boolean;
  v_wopen timestamptz; v_wclose timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=v_uid AND status='approved') THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF v_phase NOT IN ('takeoff','checkin') THEN RAISE EXCEPTION 'Unknown mission type'; END IF;
  SELECT * INTO v_t FROM public.trips WHERE id=p_trip;
  v_open := CASE WHEN v_t.kind IN ('at_home','cultural_inspiration') THEN trip_private.trip_today(p_trip) <= v_t.end_date ELSE trip_private.trip_today(p_trip) <= v_t.start_date - 1 END;
  v_wopen := (v_t.start_date + time '00:00') AT TIME ZONE v_t.home_timezone;
  v_wclose := (v_t.start_date + time '23:59') AT TIME ZONE v_t.home_timezone;
  IF p_action = 'reveal' THEN
    IF v_phase='checkin' THEN
      IF NOT v_open THEN RAISE EXCEPTION 'Early Check-In has closed'; END IF;
      IF p_slot IS NULL OR p_slot < 1 OR p_slot > 3 THEN RAISE EXCEPTION 'Pick a task slot'; END IF;
    ELSE
      IF now() < v_wopen THEN RAISE EXCEPTION 'Airport Missions open on departure day'; END IF;
      IF now() > v_wclose THEN RAISE EXCEPTION 'Airport Missions have closed — unrevealed missions are missed'; END IF;
      IF p_slot IS NULL OR p_slot < 1 OR p_slot > 5 THEN RAISE EXCEPTION 'Pick a mission slot'; END IF;
      IF p_slot > 3 AND NOT coalesce(p_layover,false) THEN RAISE EXCEPTION 'Missions 4 and 5 are for layovers'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND phase=v_phase AND slot=p_slot) THEN RAISE EXCEPTION 'Already revealed'; END IF;
    IF p_slot > 1 AND NOT EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND phase=v_phase AND slot=p_slot-1 AND status<>'revealed') THEN RAISE EXCEPTION 'Finish the one before this first'; END IF;
    v_kind := CASE WHEN v_phase='checkin' THEN 'checkin' WHEN v_t.kind IN ('at_home','cultural_inspiration') THEN 'home' ELSE 'trip' END;
    SELECT * INTO v_m FROM public.security_missions m
      WHERE m.kind=v_kind AND (m.trip_id IS NULL OR m.trip_id=p_trip)
        AND NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.user_id=v_uid AND c.mission_id=m.id)
        AND (v_phase<>'checkin' OR NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.phase='checkin' AND c.mission_id=m.id AND c.user_id<>v_uid)
             OR NOT EXISTS (SELECT 1 FROM public.security_missions m2 WHERE m2.kind='checkin' AND (m2.trip_id IS NULL OR m2.trip_id=p_trip) AND NOT EXISTS (SELECT 1 FROM public.mission_claims c2 WHERE c2.trip_id=p_trip AND c2.phase='checkin' AND c2.mission_id=m2.id)))
      ORDER BY md5(m.id::text || v_uid::text || p_trip::text) LIMIT 1;
    IF v_m.id IS NULL THEN RAISE EXCEPTION 'No more tasks — ask your Captain for more'; END IF;
    INSERT INTO public.mission_claims(trip_id,user_id,slot,mission_id,category,mission_text,points,phase,title,backstory,keywords,revealed_at)
      VALUES (p_trip,v_uid,p_slot,v_m.id,v_m.category,
        replace(v_m.text,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        CASE WHEN v_phase='checkin' THEN CASE WHEN p_slot=1 THEN 4 ELSE 3 END WHEN p_slot<=3 THEN 2 ELSE 3 END, v_phase,
        replace(v_m.title,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        replace(v_m.backstory,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        (SELECT array_agg(replace(k,'{destination}',coalesce(nullif(v_t.destination,''),'your destination'))) FROM unnest(v_m.keywords) k),
        now())
      RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO v_c FROM public.mission_claims WHERE id=p_claim AND trip_id=p_trip FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF p_action IN ('complete','skip') THEN
    IF v_c.user_id <> v_uid THEN RAISE EXCEPTION 'Not your mission'; END IF;
    IF v_c.status <> 'revealed' THEN RAISE EXCEPTION 'Already answered'; END IF;
    IF v_c.phase='checkin' AND p_action='complete' AND NOT v_open THEN RAISE EXCEPTION 'Early Check-In has closed'; END IF;
    IF v_c.phase='takeoff' AND now() > coalesce(v_c.revealed_at, v_c.created_at) + interval '24 hours' THEN RAISE EXCEPTION 'This mission locked 24 hours after you revealed it'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='complete' THEN 'pending' ELSE 'skipped' END, updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  ELSIF p_action IN ('verify','decline') THEN
    IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can verify'; END IF;
    IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;
    IF v_c.user_id = v_uid THEN RAISE EXCEPTION 'Add a Co-Captain to verify your own missions'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='verify' THEN 'released' ELSE 'declined' END, verified_by=v_uid, decided_at=now(), updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $function$;

CREATE OR REPLACE FUNCTION trip_private.mission_window(p_trip uuid)
 RETURNS TABLE(opens_at timestamptz, closes_at timestamptz, proof_due_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN QUERY SELECT (t.start_date + time '00:00') AT TIME ZONE t.home_timezone,
    (t.start_date + time '23:59') AT TIME ZONE t.home_timezone,
    (SELECT min(coalesce(c.revealed_at,c.created_at) + interval '24 hours') FROM public.mission_claims c
      WHERE c.trip_id=p_trip AND c.user_id=auth.uid() AND c.phase='takeoff' AND c.status='revealed'
        AND coalesce(c.revealed_at,c.created_at) + interval '24 hours' > now())
  FROM public.trips t WHERE t.id=p_trip;
END $function$;
REVOKE ALL ON FUNCTION trip_private.mission_window(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.mission_window(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.mission_window(p_trip uuid)
 RETURNS TABLE(opens_at timestamptz, closes_at timestamptz, proof_due_at timestamptz)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ SELECT * FROM trip_private.mission_window(p_trip) $function$;
REVOKE ALL ON FUNCTION public.mission_window(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mission_window(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trip_private.confirm_departure(p_trip uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can confirm arrival'; END IF;
 UPDATE public.trips SET departure_confirmed_at=now() WHERE id=p_trip AND play_arrangement IS NOT NULL AND is_sandbox=false AND departure_confirmed_at IS NULL AND start_date <= trip_private.trip_today(p_trip);
 IF NOT FOUND THEN RAISE EXCEPTION 'Arrival can only be confirmed once, on or after your first trip day'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.trip_season_started(p_trip uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN (SELECT t.departure_confirmed_at IS NOT NULL
    OR now() >= ((t.start_date + 1 + time '23:59') AT TIME ZONE coalesce(t.trip_timezone, t.home_timezone))
    FROM public.trips t WHERE t.id=p_trip);
END $function$;
REVOKE ALL ON FUNCTION trip_private.trip_season_started(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.trip_season_started(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.trip_season_started(p_trip uuid)
 RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$ SELECT trip_private.trip_season_started(p_trip) $function$;
REVOKE ALL ON FUNCTION public.trip_season_started(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trip_season_started(uuid) TO authenticated, service_role;