ALTER FUNCTION trip_private.speed_bonus_ok(timestamptz, timestamptz) SET search_path = public;
REVOKE ALL ON FUNCTION trip_private.speed_bonus_ok(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.record_speed_finish() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION trip_private.has_teen_member(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.has_teen_member(uuid) TO service_role;