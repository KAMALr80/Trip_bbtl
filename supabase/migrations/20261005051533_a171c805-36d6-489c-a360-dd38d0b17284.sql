ALTER TABLE public.culture_experiences ADD COLUMN IF NOT EXISTS prep_days integer;
CREATE OR REPLACE FUNCTION trip_private.set_window_prep(p_exp uuid,p_days integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.culture_experiences;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
 IF NOT FOUND OR e.creator_id<>auth.uid() THEN RAISE EXCEPTION 'Only the creator can set preparation'; END IF;
 IF e.track<>'travel' OR e.started_at IS NOT NULL OR e.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Preparation can only be set on a new Window Seat experience'; END IF;
 IF e.prep_days IS NOT NULL THEN RAISE EXCEPTION 'Preparation is already set'; END IF;
 IF p_days IS NOT NULL AND p_days NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Choose up to ten preparation days'; END IF;
 UPDATE public.culture_experiences SET prep_days=p_days,updated_at=now() WHERE id=p_exp AND creator_id=auth.uid() AND prep_days IS NULL;
END $$;
CREATE OR REPLACE FUNCTION public.set_window_prep(p_exp uuid,p_days integer)
RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.set_window_prep(p_exp,p_days) $$;
REVOKE ALL ON FUNCTION public.set_window_prep(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_window_prep(uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.set_window_prep(uuid,integer) TO authenticated;