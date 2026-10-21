CREATE OR REPLACE FUNCTION trip_private.refund_failed_ai(p_usage uuid, p_user uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v public.ai_usage%ROWTYPE; BEGIN SELECT * INTO v FROM public.ai_usage WHERE id=p_usage AND user_id=p_user AND kind IN ('custom_game','regen_set','mission_topup') AND created_at>now()-interval '20 minutes' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'AI usage unavailable'; END IF; UPDATE public.ai_usage SET kind='failed_'||v.kind,credits=0 WHERE id=v.id; RETURN true; END $$;
REVOKE EXECUTE ON FUNCTION trip_private.refund_failed_ai(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.refund_failed_ai(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.refund_failed_ai(uuid) FROM authenticated, PUBLIC, anon;
CREATE OR REPLACE FUNCTION public.refund_failed_ai(p_usage uuid,p_user uuid) RETURNS boolean LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.refund_failed_ai(p_usage,p_user) $$;
REVOKE EXECUTE ON FUNCTION public.refund_failed_ai(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_failed_ai(uuid,uuid) TO service_role;