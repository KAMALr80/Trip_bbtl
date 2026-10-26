-- M2-11: what the per-phase Captain tool tiles edit after setup. Captain or Co-Captain (R-208, R-210).
-- rollback: DROP FUNCTION public.set_preflight(uuid, int, boolean), public.set_crowning_night(uuid, timestamptz, text, text)
--   and their trip_private bodies.

-- Pre-Flight days or Skip. Call nights that would fall outside the new Pre-Flight have to be moved
-- or removed first (the Captain gets told which).
CREATE FUNCTION trip_private.set_preflight(p_trip uuid, p_days int, p_skipped boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; w record;
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can change Pre-Flight'; END IF;
  UPDATE public.trips SET preflight_days = coalesce(p_days, 0), preflight_skipped = coalesce(p_skipped, false)
  WHERE id = p_trip RETURNING * INTO t;
  SELECT * INTO w FROM trip_private.trip_phase_windows(p_trip) x WHERE x.phase = 'preflight';
  IF EXISTS (SELECT 1 FROM public.call_nights c WHERE c.trip_id = p_trip AND c.starts_at > now()
             AND (w.ends_at <= w.starts_at OR c.starts_at < w.starts_at OR c.starts_at >= w.ends_at)) THEN
    RAISE EXCEPTION 'Some call nights would fall outside Pre-Flight. Move or remove them first.' USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_preflight(uuid, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.set_preflight(uuid, int, boolean) TO authenticated, service_role;
CREATE FUNCTION public.set_preflight(p_trip uuid, p_days int, p_skipped boolean) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_preflight(p_trip, p_days, p_skipped) $$;
REVOKE ALL ON FUNCTION public.set_preflight(uuid, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_preflight(uuid, int, boolean) TO authenticated, service_role;

-- The crowning / finale night: on one of the trip days (R-205). Re-plans the schedule (trigger).
CREATE FUNCTION trip_private.set_crowning_night(p_trip uuid, p_at timestamptz, p_place text, p_call_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; v_zone text; r jsonb;
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set the crowning night'; END IF;
  SELECT * INTO t FROM public.trips WHERE id = p_trip FOR UPDATE;
  r := trip_private.room_rules(t.room);
  IF p_at IS NULL THEN RAISE EXCEPTION 'Pick the date and time'; END IF;
  v_zone := CASE WHEN (r->>'atHome')::boolean THEN t.home_timezone ELSE coalesce(t.trip_timezone, t.home_timezone) END;
  IF (p_at AT TIME ZONE v_zone)::date NOT BETWEEN t.start_date AND t.end_date THEN
    RAISE EXCEPTION 'The % has to be on one of the trip days', lower(r->>'crowningLabel');
  END IF;
  UPDATE public.trips SET crowning_at = p_at, crowning_place = nullif(btrim(p_place), ''),
    crowning_call_link = nullif(btrim(p_call_link), '')
  WHERE id = p_trip;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_crowning_night(uuid, timestamptz, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.set_crowning_night(uuid, timestamptz, text, text) TO authenticated, service_role;
CREATE FUNCTION public.set_crowning_night(p_trip uuid, p_at timestamptz, p_place text, p_call_link text) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_crowning_night(p_trip, p_at, p_place, p_call_link) $$;
REVOKE ALL ON FUNCTION public.set_crowning_night(uuid, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_crowning_night(uuid, timestamptz, text, text) TO authenticated, service_role;
