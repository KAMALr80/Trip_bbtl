CREATE OR REPLACE FUNCTION trip_private.preview_room_ok() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT trip_private.is_app_admin() OR (SELECT count(DISTINCT m.trip_id) FROM public.trip_members m JOIN public.trips t ON t.id=m.trip_id
   WHERE m.user_id=auth.uid() AND t.level='preview' AND NOT coalesce(t.is_sandbox,false) AND t.ended_at IS NULL AND t.end_date >= CURRENT_DATE) < (SELECT max_trips FROM trip_private.preview_settings) $$;
DO $do$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.proname='create_trip' LIMIT 1;
 IF d IS NULL OR position('IF auth.uid() IS NOT NULL AND NOT trip_private.preview_room_ok()' IN d)=0 THEN RAISE EXCEPTION 'Expected trip creation guard was not found'; END IF;
 d := replace(d, 'IF auth.uid() IS NOT NULL AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION ''PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.''; END IF;', '');
 d := replace(d, 'IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION ''TripJunkies is invite-only during the private beta''; END IF;', '');
 d := replace(d, 'IF coalesce(trip_private.age_of(auth.uid()),0) < 21 THEN RAISE EXCEPTION ''Captains are 21+. Ask your crew''''s Captain to invite you.''; END IF;', 'IF coalesce(trip_private.age_of(auth.uid()),0) < 21 THEN RAISE EXCEPTION ''Captains are 21+. Ask your crew''''s Captain to invite you.''; END IF; IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION ''TripJunkies is invite-only during the private beta''; END IF;');
 EXECUTE d;
 SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.proname='create_at_home' LIMIT 1;
 IF d IS NULL OR position('At Home is coming soon' IN d)=0 THEN RAISE EXCEPTION 'Expected At Home guard was not found'; END IF;
 d := replace(d, 'IF auth.uid() IS NOT NULL AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION ''PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.''; END IF;', '');
 d := replace(d, 'IF NOT trip_private.is_app_admin() AND NOT coalesce((SELECT (features->>''at_home'')::boolean FROM trip_private.preview_settings),false) THEN RAISE EXCEPTION ''COMING_SOON: At Home is coming soon.''; END IF;', '');
 d := replace(d, 'IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION ''TripJunkies is invite-only during the private beta''; END IF;', '');
 d := replace(d, 'IF coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION ''Captains need to be 18 or older''; END IF;', 'IF coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION ''At Home is for players 18 and older.''; END IF; IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION ''TripJunkies is invite-only during the private beta''; END IF;');
 EXECUTE d;
END $do$;
CREATE OR REPLACE FUNCTION trip_private.culture_quest_previews() RETURNS TABLE(id uuid,trip_id uuid,creator_id uuid,partner_id uuid,category text,title text,photo_path text,quest_length text,country text,region text,city text,is_public boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.id,c.trip_id,c.creator_id,c.partner_id,c.category,c.title,c.photo_path,c.quest_length,c.country,c.region,c.city,trip_private.inspiration_public(c.id) FROM public.cultural_inspirations c WHERE auth.uid() IS NOT NULL AND c.hidden_at IS NULL AND c.reveal_on<=CURRENT_DATE AND c.captain_approved_at IS NOT NULL AND ((trip_private.feature_on(c.trip_id,'inspiration') AND trip_private.is_trip_member(c.trip_id,auth.uid())) OR trip_private.inspiration_public(c.id)) $$;