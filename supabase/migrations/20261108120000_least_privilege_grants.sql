-- QA-20, least privilege.
-- 1. Signed-in users held TRUNCATE, TRIGGER and REFERENCES on every public table. The API can't
--    use them and RLS doesn't cover TRUNCATE, so they go, including for tables made later.
-- 2. A player could delete their own profiles row; account deletion removes it with the account.
-- 3. A player could write the token cost of their own AI call. Only the server logs it now.
-- The per-trip AI cap (the other half of QA-20) waits for a number from the founder.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

DROP POLICY IF EXISTS "Users delete own profile" ON public.profiles;
REVOKE DELETE ON public.profiles FROM anon, authenticated;

-- Called with the service role by src/lib/ai-quota.server.ts, so there is no auth.uid() to match;
-- the usage id comes from use_ai_quota on the same request.
CREATE OR REPLACE FUNCTION trip_private.log_ai_call(p_usage uuid, p_model text, p_in integer, p_out integer, p_cost numeric)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 UPDATE public.ai_usage SET model=left(p_model,80), input_tokens=greatest(0,p_in), output_tokens=greatest(0,p_out), est_cost_usd=greatest(0,p_cost) WHERE id=p_usage AND model IS NULL $function$;

REVOKE ALL ON FUNCTION trip_private.log_ai_call(uuid, text, integer, integer, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_ai_call(uuid, text, integer, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.log_ai_call(uuid, text, integer, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_ai_call(uuid, text, integer, integer, numeric) TO service_role;
