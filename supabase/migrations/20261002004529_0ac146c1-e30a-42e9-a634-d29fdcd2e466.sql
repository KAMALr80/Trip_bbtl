DROP POLICY IF EXISTS "Authenticated can read game catalog" ON public.game_catalog;
DROP POLICY IF EXISTS "Anyone can read game catalog" ON public.game_catalog;
DROP POLICY IF EXISTS "Members read game catalog" ON public.game_catalog;
CREATE POLICY "Trip members read game catalog" ON public.game_catalog FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id=auth.uid()));