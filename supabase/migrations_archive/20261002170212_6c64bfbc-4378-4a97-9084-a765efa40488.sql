ALTER FUNCTION public.culture_quest(text,uuid,uuid,text,uuid,integer,integer) SET SCHEMA trip_private;
REVOKE ALL ON FUNCTION trip_private.culture_quest(text,uuid,uuid,text,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.culture_quest(p_action text,p_session uuid DEFAULT NULL,p_card uuid DEFAULT NULL,p_code text DEFAULT NULL,p_item uuid DEFAULT NULL,p_choice integer DEFAULT NULL,p_teams integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.culture_quest(p_action,p_session,p_card,p_code,p_item,p_choice,p_teams) $$;
REVOKE ALL ON FUNCTION public.culture_quest(text,uuid,uuid,text,uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.culture_quest(text,uuid,uuid,text,uuid,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.culture_quest(text,uuid,uuid,text,uuid,integer,integer) TO authenticated;