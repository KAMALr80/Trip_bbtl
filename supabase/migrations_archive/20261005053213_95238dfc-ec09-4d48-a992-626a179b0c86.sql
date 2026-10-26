CREATE OR REPLACE FUNCTION trip_private.a2c_quest_card(p_trip uuid,p_user uuid,p_kind text,p_drop integer,p_dest text)
RETURNS TABLE(title text,mission_text text,backstory text,keywords text[],presentation_tag text,insight text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
 WITH eligible AS (
  SELECT sm.*,replace(sm.title,'{destination}',p_dest) AS filled_title,replace(sm.text,'{destination}',p_dest) AS filled_text,
    replace(sm.backstory,'{destination}',p_dest) AS filled_story,
    ARRAY(SELECT replace(k,'{destination}',p_dest) FROM unnest(sm.keywords) k) AS filled_keywords,
    replace(sm.insight,'{destination}',p_dest) AS filled_insight
  FROM public.security_missions sm JOIN public.trips t ON t.id=p_trip
  WHERE t.season_rule='a2c' AND sm.trip_id IS NULL AND sm.kind=CASE WHEN p_kind='sealed' THEN 'checkin' ELSE 'home' END
   AND sm.presentation_tag=CASE WHEN p_kind='sealed' THEN 'video_call' WHEN t.kind='at_home' THEN 'at_home_finale' ELSE 'trip_meetup' END
   AND length(btrim(sm.insight))>12 AND sm.budget_note IS NOT NULL
   AND (sm.category NOT ILIKE '%adult%' OR (t.vibe='Party' AND NOT trip_private.a2c_minor_trip(p_trip) AND trip_private.age_of(p_user)>=21))
 ), ranked AS (
  SELECT e.*, (SELECT max(q.created_at) FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.title LIKE e.filled_title||' — %') AS last_used,
   EXISTS(SELECT 1 FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(e.filled_title)) OR lower(btrim(x.mission_text))=lower(btrim(e.filled_text)))) OR
   EXISTS(SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(e.filled_title)) OR lower(btrim(x.mission_text))=lower(btrim(e.filled_text)))) AS used
  FROM eligible e
 ), picked AS (
  SELECT r.* FROM ranked r ORDER BY r.used ASC, CASE WHEN r.used THEN r.last_used END ASC NULLS FIRST, md5(r.id::text||p_trip::text||p_user::text||p_drop::text) LIMIT 1
 )
 SELECT CASE WHEN used THEN filled_title||' — new angle '|| (1+(SELECT count(*) FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.title LIKE filled_title||' — new angle %'))::text ELSE filled_title END,
 CASE WHEN used THEN filled_text||' This time, choose a different detail from your first try and explain what surprised you about it.' ELSE filled_text END,
 filled_story,filled_keywords,presentation_tag,filled_insight FROM picked
 $function$;
REVOKE ALL ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) TO service_role;