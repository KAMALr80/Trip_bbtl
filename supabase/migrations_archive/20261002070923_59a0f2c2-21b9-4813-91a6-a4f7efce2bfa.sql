ALTER FUNCTION trip_private.credit_cost(text) SET search_path TO 'public';
GRANT SELECT ON public.ai_credit_purchases TO authenticated;
CREATE POLICY "Founder reads credit purchases" ON public.ai_credit_purchases FOR SELECT TO authenticated USING (trip_private.is_app_admin());