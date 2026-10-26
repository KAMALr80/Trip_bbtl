REVOKE ALL ON FUNCTION public.player_card_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_card_read(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION trip_private.player_card_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.player_card_read(uuid, uuid) TO authenticated, service_role;