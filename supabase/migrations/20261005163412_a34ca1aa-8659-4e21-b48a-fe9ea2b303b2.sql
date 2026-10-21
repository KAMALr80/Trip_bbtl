CREATE OR REPLACE FUNCTION public.player_card_read(p_trip uuid, p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT trip_private.player_card_read(p_trip, p_user)
$function$;

REVOKE ALL ON FUNCTION public.player_card_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_card_read(uuid, uuid) TO authenticated, service_role;