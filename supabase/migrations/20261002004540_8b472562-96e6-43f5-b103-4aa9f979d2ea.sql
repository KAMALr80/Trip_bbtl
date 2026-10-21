DROP POLICY IF EXISTS "Signed-in users can read games" ON public.game_catalog;
DROP POLICY IF EXISTS "Authenticated read game catalog" ON public.game_catalog;
DROP POLICY IF EXISTS "Users read game catalog" ON public.game_catalog;
DROP POLICY IF EXISTS "Everyone can read games" ON public.game_catalog;