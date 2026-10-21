ALTER TABLE public.cultural_inspirations ADD COLUMN IF NOT EXISTS country text, ADD COLUMN IF NOT EXISTS region text, ADD COLUMN IF NOT EXISTS city text, ADD COLUMN IF NOT EXISTS public_approved_at timestamptz;

CREATE OR REPLACE FUNCTION trip_private.inspiration_place_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.country IS NOT NULL AND NEW.country !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Choose a country'; END IF;
  IF TG_OP='INSERT' AND NEW.country IS NULL THEN RAISE EXCEPTION 'Choose a country'; END IF;
  NEW.region := nullif(left(btrim(coalesce(NEW.region,'')),80),'');
  NEW.city := nullif(left(btrim(coalesce(NEW.city,'')),80),'');
  -- Public approval is founder-only (via moderate_inspiration); clients can never set it.
  IF TG_OP='INSERT' THEN NEW.public_approved_at := NULL;
  ELSIF NEW.public_approved_at IS DISTINCT FROM OLD.public_approved_at AND coalesce(current_setting('trip.moderating',true),'')<>'on' THEN NEW.public_approved_at := OLD.public_approved_at; END IF;
  IF NOT NEW.feature_later THEN NEW.public_approved_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inspiration_place_guard ON public.cultural_inspirations;
CREATE TRIGGER inspiration_place_guard BEFORE INSERT OR UPDATE ON public.cultural_inspirations FOR EACH ROW EXECUTE FUNCTION trip_private.inspiration_place_guard();

CREATE OR REPLACE FUNCTION trip_private.inspiration_public(p_card uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.cultural_inspirations c JOIN public.trips t ON t.id=c.trip_id WHERE c.id=p_card AND c.feature_later AND c.public_approved_at IS NOT NULL AND c.hidden_at IS NULL AND c.reveal_on<=CURRENT_DATE AND NOT coalesce(t.is_sandbox,false)) $$;

CREATE OR REPLACE FUNCTION trip_private.quest_access(p_card uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_user IS NOT NULL AND (EXISTS(SELECT 1 FROM public.cultural_inspirations c WHERE c.id=p_card AND c.hidden_at IS NULL AND c.reveal_on<=CURRENT_DATE AND trip_private.feature_on(c.trip_id,'inspiration') AND trip_private.is_trip_member(c.trip_id,p_user)) OR trip_private.inspiration_public(p_card)) $$;

DROP FUNCTION IF EXISTS public.culture_quest_previews();
DROP FUNCTION IF EXISTS trip_private.culture_quest_previews();
CREATE FUNCTION trip_private.culture_quest_previews() RETURNS TABLE(id uuid, trip_id uuid, creator_id uuid, partner_id uuid, category text, title text, photo_path text, quest_length text, country text, region text, city text, is_public boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id,c.trip_id,c.creator_id,c.partner_id,c.category,c.title,c.photo_path,c.quest_length,c.country,c.region,c.city,trip_private.inspiration_public(c.id)
  FROM public.cultural_inspirations c
  WHERE auth.uid() IS NOT NULL AND c.hidden_at IS NULL AND c.reveal_on<=CURRENT_DATE
    AND ((trip_private.feature_on(c.trip_id,'inspiration') AND trip_private.is_trip_member(c.trip_id,auth.uid())) OR trip_private.inspiration_public(c.id)) $$;
CREATE FUNCTION public.culture_quest_previews() RETURNS TABLE(id uuid, trip_id uuid, creator_id uuid, partner_id uuid, category text, title text, photo_path text, quest_length text, country text, region text, city text, is_public boolean)
LANGUAGE sql SET search_path=public AS $$ SELECT * FROM trip_private.culture_quest_previews() $$;
REVOKE ALL ON FUNCTION trip_private.culture_quest_previews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_quest_previews() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.culture_quest_previews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.culture_quest_previews() TO authenticated, service_role;
REVOKE ALL ON FUNCTION trip_private.inspiration_public(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.inspiration_public(uuid) TO authenticated, service_role;

-- Founder moderation list for "Feature publicly" requests
CREATE OR REPLACE FUNCTION trip_private.public_inspiration_queue() RETURNS TABLE(id uuid, title text, category text, country text, region text, city text, approved boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
RETURN QUERY SELECT c.id,c.title,c.category,c.country,c.region,c.city,c.public_approved_at IS NOT NULL,c.created_at FROM public.cultural_inspirations c JOIN public.trips t ON t.id=c.trip_id WHERE c.feature_later AND c.hidden_at IS NULL AND NOT coalesce(t.is_sandbox,false) ORDER BY (c.public_approved_at IS NOT NULL), c.created_at DESC; END $$;
CREATE OR REPLACE FUNCTION public.public_inspiration_queue() RETURNS TABLE(id uuid, title text, category text, country text, region text, city text, approved boolean, created_at timestamptz)
LANGUAGE sql SET search_path=public AS $$ SELECT * FROM trip_private.public_inspiration_queue() $$;

CREATE OR REPLACE FUNCTION trip_private.moderate_inspiration(p_card uuid, p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF p_action NOT IN ('approve','unapprove','hide') THEN RAISE EXCEPTION 'Unknown action'; END IF;
  IF p_action='hide' THEN PERFORM trip_private.hide_inspiration(p_card); RETURN; END IF;
  PERFORM set_config('trip.moderating','on',true);
  UPDATE public.cultural_inspirations SET public_approved_at = CASE WHEN p_action='approve' THEN now() ELSE NULL END WHERE id=p_card AND feature_later AND hidden_at IS NULL;
  PERFORM set_config('trip.moderating','off',true);
  IF FOUND THEN INSERT INTO trip_private.inspiration_moderation(card_id,actor,action) VALUES(p_card,auth.uid(),p_action); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.moderate_inspiration(p_card uuid, p_action text) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.moderate_inspiration(p_card,p_action) $$;

REVOKE ALL ON FUNCTION trip_private.public_inspiration_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.moderate_inspiration(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.public_inspiration_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moderate_inspiration(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.public_inspiration_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.moderate_inspiration(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_inspiration_queue() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.moderate_inspiration(uuid,text) TO authenticated, service_role;