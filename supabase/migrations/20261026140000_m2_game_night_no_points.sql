-- M2-14: rooms without points (the one-night Game Night, R-008) never count for boards, crowns or
-- Captain badges: season_scoring follows the room. Passport stamps already come from trips only.
-- rollback: re-apply trip_private.check_trip_rules from 20261026110000_m2_limits_co_captain.sql.
CREATE OR REPLACE FUNCTION trip_private.check_trip_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r jsonb := trip_private.room_rules(NEW.room); v_days int := NEW.end_date - NEW.start_date + 1;
BEGIN
  IF NEW.rules_version = 1 THEN RETURN NEW; END IF;
  IF v_days > (r#>>'{mainDays,max}')::int AND (r#>>'{mainDays,max}')::int = 14 THEN
    RAISE EXCEPTION 'Trips can be up to 14 days. For a longer trip, start a second one.' USING ERRCODE = '22023';
  END IF;
  IF v_days < (r#>>'{mainDays,min}')::int OR v_days > (r#>>'{mainDays,max}')::int THEN
    RAISE EXCEPTION 'This room runs % to % days', r#>>'{mainDays,min}', r#>>'{mainDays,max}' USING ERRCODE = '22023';
  END IF;
  IF NOT (r->'modes') ? NEW.play_mode THEN
    RAISE EXCEPTION 'That way of playing isn''t available in this room' USING ERRCODE = '22023';
  END IF;
  IF NEW.preflight_days > (r#>>'{preFlightDays,max}')::int THEN
    RAISE EXCEPTION 'Pre-Flight can be up to % days', r#>>'{preFlightDays,max}' USING ERRCODE = '22023';
  END IF;
  IF NEW.preflight_skipped AND NOT (r#>>'{preFlightDays,skippable}')::boolean THEN
    RAISE EXCEPTION 'This room has no Pre-Flight to skip' USING ERRCODE = '22023';
  END IF;
  IF cardinality(NEW.focuses) > (r->>'maxFocuses')::int THEN
    RAISE EXCEPTION 'Pick up to % focuses', r->>'maxFocuses' USING ERRCODE = '22023';
  END IF;
  IF NOT (r->>'pointsEnabled')::boolean THEN NEW.season_scoring := false; END IF;
  RETURN NEW;
END $$;
