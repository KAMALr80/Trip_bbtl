GRANT EXECUTE ON FUNCTION trip_private.set_culture_finale(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_culture_finale(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_culture_finale(uuid,text) TO authenticated;
DELETE FROM public.culture_experiences
 WHERE id = '889a3bb1-a9e9-4158-a89f-e84f3457af59'
   AND creator_id = 'fd99920f-d997-4397-b80c-9495587aa10b'
   AND track = 'home' AND started_at IS NULL AND finale_format IS NULL;