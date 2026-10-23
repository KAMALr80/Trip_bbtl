ALTER TABLE public.solo_quests ADD COLUMN IF NOT EXISTS presentation text NOT NULL DEFAULT 'solo_guide' CHECK (presentation IN ('solo_guide','at_home_finale','trip_meetup'));

CREATE OR REPLACE FUNCTION trip_private.culture_switch_group(p_exp uuid, p_trip uuid, p_format text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.culture_experiences; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
 IF NOT FOUND OR e.creator_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Only the person who made this experience can switch it'; END IF;
 IF coalesce(e.play_mode,'group') <> 'solo' THEN RAISE EXCEPTION 'This experience is already played with others'; END IF;
 IF e.started_at IS NOT NULL OR e.finished_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.solo_quests q WHERE q.experience_id=p_exp AND (q.opened_at IS NOT NULL OR q.finished_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'This experience has already started, so it can''t switch to playing with others';
 END IF;
 IF p_trip IS NULL OR NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.id=p_trip AND t.created_by=uid AND NOT coalesce(t.is_sandbox,false))
    OR NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=uid AND m.status='approved') THEN
   RAISE EXCEPTION 'Pick a trip where you are the Captain';
 END IF;
 IF e.track='home' THEN
   IF p_format NOT IN ('two_nights','finale_only') THEN RAISE EXCEPTION 'Pick a finale format'; END IF;
   IF p_format='two_nights' AND e.days < 4 THEN RAISE EXCEPTION 'Two game nights need 4 or more days'; END IF;
 END IF;
 UPDATE public.culture_experiences
   SET play_mode='group', traveler_types='{}', trip_id=p_trip,
       finale_format=CASE WHEN e.track='home' THEN p_format ELSE NULL END, updated_at=now()
 WHERE id=p_exp AND creator_id=uid;
 UPDATE public.solo_quests
   SET presentation=CASE WHEN e.track='home' THEN 'at_home_finale' ELSE 'trip_meetup' END, updated_at=now()
 WHERE experience_id=p_exp AND user_id=uid AND presentation='solo_guide';
END $$;
REVOKE ALL ON FUNCTION trip_private.culture_switch_group(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_switch_group(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.culture_switch_group(p_exp uuid, p_trip uuid, p_format text)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.culture_switch_group(p_exp,p_trip,p_format) $$;
REVOKE ALL ON FUNCTION public.culture_switch_group(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.culture_switch_group(uuid,uuid,text) TO authenticated;