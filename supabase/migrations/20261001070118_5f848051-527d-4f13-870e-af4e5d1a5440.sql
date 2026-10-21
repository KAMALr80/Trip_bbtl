ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS motto text CHECK (motto IS NULL OR length(motto) <= 60),
  ADD COLUMN IF NOT EXISTS call_link text CHECK (call_link IS NULL OR (length(call_link) <= 500 AND call_link ~* '^https://')),
  ADD COLUMN IF NOT EXISTS backup_call_link text CHECK (backup_call_link IS NULL OR (length(backup_call_link) <= 500 AND backup_call_link ~* '^https://'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS seen_tips text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION trip_private.set_trip_extras(p_trip uuid, p_motto text, p_call text, p_backup text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can edit details'; END IF;
  IF length(coalesce(p_motto,'')) > 60 THEN RAISE EXCEPTION 'Keep the motto to 60 characters'; END IF;
  IF nullif(trim(coalesce(p_call,'')),'') IS NOT NULL AND trim(p_call) !~* '^https://' THEN RAISE EXCEPTION 'Call links should start with https://'; END IF;
  IF nullif(trim(coalesce(p_backup,'')),'') IS NOT NULL AND trim(p_backup) !~* '^https://' THEN RAISE EXCEPTION 'Call links should start with https://'; END IF;
  UPDATE public.trips SET motto=nullif(trim(coalesce(p_motto,'')),''), call_link=nullif(trim(coalesce(p_call,'')),''), backup_call_link=nullif(trim(coalesce(p_backup,'')),'') WHERE id=p_trip;
END $$;
CREATE OR REPLACE FUNCTION public.set_trip_extras(p_trip uuid, p_motto text, p_call text, p_backup text)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_trip_extras(p_trip,p_motto,p_call,p_backup) $$;

CREATE OR REPLACE FUNCTION trip_private.trip_invite_preview(p_code text)
RETURNS TABLE(name text, destination text, motto text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.name, t.destination, t.motto FROM public.trips t WHERE auth.uid() IS NOT NULL AND t.join_code = upper(trim(p_code)) AND t.ended_at IS NULL LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.trip_invite_preview(p_code text)
RETURNS TABLE(name text, destination text, motto text) LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.trip_invite_preview(p_code) $$;

REVOKE ALL ON FUNCTION trip_private.set_trip_extras(uuid,text,text,text), public.set_trip_extras(uuid,text,text,text), trip_private.trip_invite_preview(text), public.trip_invite_preview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_trip_extras(uuid,text,text,text), public.set_trip_extras(uuid,text,text,text), trip_private.trip_invite_preview(text), public.trip_invite_preview(text) TO authenticated;