CREATE TABLE public.user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.user_credits FROM anon, authenticated;
GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own wallet" ON public.user_credits FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Read model only. Spend order (payments round): trip included credits first, then the acting user's wallet.
CREATE OR REPLACE FUNCTION public.my_credits(p_trip uuid DEFAULT NULL)
RETURNS TABLE(trip_included integer, trip_remaining integer, wallet integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    CASE WHEN p_trip IS NULL THEN NULL ELSE (SELECT s.included FROM public.ai_credit_status(p_trip) s LIMIT 1) END,
    CASE WHEN p_trip IS NULL THEN NULL ELSE (SELECT s.remaining FROM public.ai_credit_status(p_trip) s LIMIT 1) END,
    COALESCE((SELECT c.balance FROM public.user_credits c WHERE c.user_id = auth.uid()), 0)
$$;
REVOKE ALL ON FUNCTION public.my_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_credits(uuid) TO authenticated;