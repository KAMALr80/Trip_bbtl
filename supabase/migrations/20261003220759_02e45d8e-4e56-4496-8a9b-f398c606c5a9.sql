REVOKE SELECT ON public.home_day_sessions FROM authenticated;
DROP POLICY "Approved squad sees home days" ON public.home_day_sessions;
DROP POLICY "Members see their own home results" ON public.home_day_results;
REVOKE SELECT ON public.home_day_results FROM authenticated;