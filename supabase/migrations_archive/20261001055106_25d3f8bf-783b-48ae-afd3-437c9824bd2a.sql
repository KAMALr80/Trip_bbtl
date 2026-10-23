ALTER FUNCTION trip_private.valid_photo(uuid,text) SET search_path=public;
CREATE POLICY "Trivia answers are hidden" ON public.trip_day_trivia_keys FOR SELECT TO authenticated USING (false);