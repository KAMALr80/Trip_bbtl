ALTER TABLE public.culture_experiences ADD COLUMN IF NOT EXISTS finale_format text CHECK (finale_format IN ('two_nights','finale_only'));

CREATE OR REPLACE FUNCTION trip_private.set_culture_finale(p_exp uuid, p_format text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.culture_experiences;
BEGIN
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
 IF NOT FOUND OR e.creator_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your experience'; END IF;
 IF e.started_at IS NOT NULL THEN RAISE EXCEPTION 'This experience has already started'; END IF;
 IF e.track='home' AND (e.days < 2 OR e.days > 7) THEN RAISE EXCEPTION 'Pick 2–7 days'; END IF;
 IF coalesce(e.play_mode,'group')='solo' THEN
   UPDATE public.culture_experiences SET finale_format=NULL WHERE id=p_exp; RETURN;
 END IF;
 IF p_format NOT IN ('two_nights','finale_only') THEN RAISE EXCEPTION 'Pick a finale format'; END IF;
 IF p_format='two_nights' AND e.days < 4 THEN RAISE EXCEPTION 'Two game nights need 4 or more days'; END IF;
 UPDATE public.culture_experiences SET finale_format=p_format WHERE id=p_exp;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_culture_finale(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_culture_finale(p_exp uuid, p_format text)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_culture_finale(p_exp,p_format) $$;
REVOKE ALL ON FUNCTION public.set_culture_finale(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_culture_finale(uuid,text) TO authenticated;