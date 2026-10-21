REVOKE EXECUTE ON FUNCTION trip_private.refund_failed_ai(uuid) FROM authenticated, PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refund_failed_ai(uuid) FROM authenticated, PUBLIC, anon;