CREATE OR REPLACE FUNCTION trip_private.effective_crowning(p_trip uuid,p_season text)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE
   WHEN t.season_rule='a2c' AND p_season='game' AND t.kind='trip' THEN ((t.start_date-1+time '20:00') AT TIME ZONE t.home_timezone)
   WHEN s.crowning_mode='takeoff' THEN coalesce(s.crowning_at,(SELECT n.starts_at+interval '3 hours' FROM public.game_nights n WHERE n.trip_id=p_trip AND NOT n.skipped AND (n.starts_at AT TIME ZONE t.home_timezone)::date<t.start_date ORDER BY n.starts_at DESC LIMIT 1))
   WHEN s.crowning_mode='departure' THEN (t.start_date+time '08:00') AT TIME ZONE t.home_timezone
   ELSE s.crowning_at END
 FROM public.season_settings s JOIN public.trips t ON t.id=s.trip_id WHERE s.trip_id=p_trip AND s.season=p_season $$;