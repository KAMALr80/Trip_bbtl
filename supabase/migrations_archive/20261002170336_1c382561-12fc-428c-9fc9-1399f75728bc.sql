ALTER FUNCTION public.culture_quest_previews() SET SCHEMA trip_private;
REVOKE ALL ON FUNCTION trip_private.culture_quest_previews() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.culture_quest_previews() RETURNS TABLE(id uuid,trip_id uuid,creator_id uuid,partner_id uuid,category text,title text,photo_path text,quest_length text) LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT * FROM trip_private.culture_quest_previews() $$;
REVOKE ALL ON FUNCTION public.culture_quest_previews() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.culture_quest_previews() TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.culture_quest_previews() TO authenticated;