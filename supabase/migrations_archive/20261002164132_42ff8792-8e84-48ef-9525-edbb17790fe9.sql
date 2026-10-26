ALTER TABLE public.cultural_inspirations ADD COLUMN votes_revealed_at timestamptz;
DROP POLICY inspiration_votes_read ON public.inspiration_votes;
CREATE POLICY inspiration_votes_read ON public.inspiration_votes FOR SELECT TO authenticated USING (voter_id=auth.uid() OR EXISTS (SELECT 1 FROM public.cultural_inspirations c WHERE c.id=card_id AND c.votes_revealed_at IS NOT NULL AND c.hidden_at IS NULL AND c.reveal_on<=CURRENT_DATE AND trip_private.feature_on(c.trip_id,'inspiration') AND trip_private.is_trip_member(c.trip_id,auth.uid())));
CREATE OR REPLACE FUNCTION trip_private.reveal_inspiration_votes(p_card uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE public.cultural_inspirations SET votes_revealed_at=now() WHERE id=p_card AND creator_id=auth.uid() AND mode='challenge' AND hidden_at IS NULL AND reveal_on<=CURRENT_DATE; IF NOT FOUND THEN RAISE EXCEPTION 'Only the creator can reveal votes on a displayed challenge'; END IF; END $$;
REVOKE ALL ON FUNCTION trip_private.reveal_inspiration_votes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.reveal_inspiration_votes(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.reveal_inspiration_votes(p_card uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.reveal_inspiration_votes(p_card) $$;
REVOKE ALL ON FUNCTION public.reveal_inspiration_votes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reveal_inspiration_votes(uuid) TO authenticated;