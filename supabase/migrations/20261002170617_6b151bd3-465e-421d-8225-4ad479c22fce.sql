ALTER FUNCTION public.culture_quest_card(uuid) SET SCHEMA trip_private;
REVOKE ALL ON FUNCTION trip_private.culture_quest_card(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.culture_quest_card(p_session uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.culture_quest_card(p_session) $$;
REVOKE ALL ON FUNCTION public.culture_quest_card(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.culture_quest_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.culture_quest_card(uuid) TO authenticated;