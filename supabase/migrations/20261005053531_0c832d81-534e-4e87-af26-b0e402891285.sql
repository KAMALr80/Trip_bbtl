CREATE OR REPLACE FUNCTION trip_private.a2c_quest_card(p_trip uuid,p_user uuid,p_kind text,p_drop int,p_dest text)
RETURNS TABLE(title text,mission_text text,backstory text,keywords text[],presentation_tag text,insight text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH available AS (
 SELECT sm.*,replace(sm.title,'{destination}',p_dest) AS filled_title,replace(sm.text,'{destination}',p_dest) AS filled_text,
 (SELECT count(*) FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND x.presentation_tag=sm.presentation_tag AND lower(btrim(x.title)) LIKE lower(btrim(replace(sm.title,'{destination}',p_dest)))||'%' ) AS prior_uses,
 (SELECT max(x.created_at) FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND x.presentation_tag=sm.presentation_tag AND lower(btrim(x.title)) LIKE lower(btrim(replace(sm.title,'{destination}',p_dest)))||'%') AS last_used
 FROM public.security_missions sm JOIN public.trips t ON t.id=p_trip
 WHERE t.season_rule='a2c' AND sm.trip_id IS NULL AND sm.kind=CASE WHEN p_kind='sealed' THEN 'checkin' ELSE 'home' END
 AND sm.presentation_tag=CASE WHEN p_kind='sealed' THEN 'video_call' WHEN t.kind='at_home' THEN 'at_home_finale' ELSE 'trip_meetup' END
 AND length(btrim(sm.insight))>12 AND sm.budget_note IS NOT NULL
 AND (sm.category NOT ILIKE '%adult%' OR (t.vibe='Party' AND NOT trip_private.a2c_minor_trip(p_trip) AND trip_private.age_of(p_user)>=21))
 AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',p_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',p_dest)))))
 ), chosen AS (
 SELECT a.* FROM available a ORDER BY a.prior_uses ASC,a.last_used ASC NULLS FIRST,md5(a.id::text||p_trip::text||p_user::text||p_drop::text) LIMIT 1
 )
 SELECT CASE WHEN c.prior_uses=0 THEN c.filled_title ELSE c.filled_title||' · new angle '||(c.prior_uses+1)::text END,
 CASE WHEN c.prior_uses=0 THEN c.filled_text ELSE c.filled_text||' This time, choose a different verified example, compare it with the last one and tell the squad what changed. Flight remix '||(c.prior_uses+1)::text||'.' END,
 replace(c.backstory,'{destination}',p_dest),ARRAY(SELECT replace(k,'{destination}',p_dest) FROM unnest(c.keywords) k),c.presentation_tag,replace(c.insight,'{destination}',p_dest)
 FROM chosen c $$;
REVOKE ALL ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) TO service_role;