-- QA-B02: the "+6 seats" add-on did nothing. A crew already gets every seat its room allows
-- (room_rules maxCrew: 12 for a trip, 4 for Window Seat; R-005, R-901), trip_private.seat_cap never
-- read trips.extra_seats, and the flag only added the add-on price to the trip's cost and wrote a
-- beta order. extra_seats is on the deck's retire list (dev-docs/04-data-model.md); bigger groups are
-- the later-phase Event Group (13–24). The app no longer offers it, and the function now refuses
-- instead of recording an add-on that can't change anything. Trips that already set the flag keep it.
--
-- Rollback: re-run public.unlock_extra_seats from the baseline.

CREATE OR REPLACE FUNCTION public.unlock_extra_seats(p_trip uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can add seats'; END IF;
  RAISE EXCEPTION 'This crew already has every seat its room allows. Bigger groups come in a later update.';
END $$;
