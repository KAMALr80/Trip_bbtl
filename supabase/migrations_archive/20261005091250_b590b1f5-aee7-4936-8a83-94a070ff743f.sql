ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS extra_seats boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS guide_published_at timestamptz;

CREATE OR REPLACE FUNCTION trip_private.is_window_room(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.culture_experiences WHERE trip_id=p_trip AND a2e_kind='inspire') $$;

CREATE OR REPLACE FUNCTION trip_private.seat_cap(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT CASE WHEN t.play_arrangement IS NULL THEN NULL WHEN trip_private.is_window_room(t.id) THEN 4 WHEN t.extra_seats THEN 12 ELSE 6 END FROM public.trips t WHERE t.id=p_trip $$;

CREATE OR REPLACE FUNCTION trip_private.enforce_seat_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cap int; v_used int;
BEGIN
  PERFORM 1 FROM public.trips WHERE id=NEW.trip_id FOR UPDATE;
  v_cap := trip_private.seat_cap(NEW.trip_id);
  IF v_cap IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_used FROM public.trip_members WHERE trip_id=NEW.trip_id AND user_id<>NEW.user_id AND status IN ('approved','pending');
  IF v_used >= v_cap THEN RAISE EXCEPTION 'This flight is full'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trip_members_seat_cap ON public.trip_members;
CREATE TRIGGER trip_members_seat_cap BEFORE INSERT ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.enforce_seat_cap();

CREATE OR REPLACE FUNCTION public.seat_status(p_trip uuid) RETURNS TABLE(used integer, cap integer, is_window boolean, extra_seats boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT (SELECT count(*)::int FROM public.trip_members WHERE trip_id=t.id AND status IN ('approved','pending')), trip_private.seat_cap(t.id), trip_private.is_window_room(t.id), t.extra_seats
  FROM public.trips t WHERE t.id=p_trip AND t.play_arrangement IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=t.id AND m.user_id=auth.uid() AND m.status='approved') $$;

CREATE OR REPLACE FUNCTION public.unlock_extra_seats(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can add seats'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND play_arrangement IS NOT NULL) THEN RAISE EXCEPTION 'This room uses its existing seat limit'; END IF;
  IF trip_private.is_window_room(p_trip) THEN RAISE EXCEPTION 'Bigger group? Start a Going on a Trip instead.'; END IF;
  UPDATE public.trips SET extra_seats=true WHERE id=p_trip AND play_arrangement IS NOT NULL;
END $$;

-- Culture home modes with three ways to play
CREATE OR REPLACE FUNCTION public.create_culture_play_mode(p_kind text, p_mode text, p_title text, p_country text, p_region text, p_city text, p_start date, p_days integer, p_layer text, p_vibe text, p_types text[], p_finale text, p_place text, p_repeat boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_exp uuid; v_trip uuid;
BEGIN
  IF p_kind NOT IN ('explore','show') OR p_mode NOT IN ('solo','online','offline') OR (p_kind='explore' AND p_mode='solo') THEN RAISE EXCEPTION 'Choose who is playing'; END IF;
  v_exp := trip_private.create_culture_a2e(p_kind, CASE WHEN p_mode='solo' THEN 'solo' ELSE 'group' END, p_title, p_country, p_region, p_city, p_start, p_days, p_layer, p_vibe, p_types, 0, p_finale, p_place, p_repeat);
  IF p_mode<>'solo' THEN
    SELECT trip_id INTO v_trip FROM public.culture_experiences WHERE id=v_exp AND creator_id=auth.uid() AND a2e_kind=p_kind;
    IF v_trip IS NULL THEN RAISE EXCEPTION 'Could not create your room'; END IF;
    UPDATE public.trips SET play_arrangement=p_mode, join_code_enabled=(p_mode='online') WHERE id=v_trip AND season_rule='a2c' AND a2e_room=true AND is_sandbox=false;
  END IF;
  RETURN v_exp;
END $$;

-- Shared Window Seat guide
CREATE TABLE public.window_guide_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('photo','review','tip')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 600),
  photo_path text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','removed')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX window_guide_items_trip ON public.window_guide_items(trip_id, status, position);
GRANT SELECT ON public.window_guide_items TO authenticated;
GRANT ALL ON public.window_guide_items TO service_role;
ALTER TABLE public.window_guide_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors, Captain, and crew after publish read guide items" ON public.window_guide_items FOR SELECT TO authenticated USING (
  author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=window_guide_items.trip_id AND m.user_id=auth.uid() AND m.role='captain' AND m.status='approved')
  OR (status='approved' AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id=window_guide_items.trip_id AND t.guide_published_at IS NOT NULL)
      AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=window_guide_items.trip_id AND m.user_id=auth.uid() AND m.status='approved')));
CREATE OR REPLACE FUNCTION trip_private.touch_guide_item() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER window_guide_items_updated BEFORE UPDATE ON public.window_guide_items FOR EACH ROW EXECUTE FUNCTION trip_private.touch_guide_item();

CREATE OR REPLACE FUNCTION public.guide_propose(p_trip uuid, p_kind text, p_body text, p_photo text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_cap boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND play_arrangement IS NOT NULL) OR NOT trip_private.is_window_room(p_trip) THEN RAISE EXCEPTION 'Guides are for Window Seat rooms'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'Only the crew can add to the guide'; END IF;
  IF p_kind NOT IN ('photo','review','tip') OR length(trim(coalesce(p_body,''))) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Add a short caption, review or tip'; END IF;
  IF p_photo IS NOT NULL AND p_photo NOT LIKE p_trip::text || '/' || auth.uid()::text || '/%' THEN RAISE EXCEPTION 'Upload the photo again'; END IF;
  IF p_kind='photo' AND p_photo IS NULL THEN RAISE EXCEPTION 'Choose a photo'; END IF;
  IF (SELECT count(*) FROM public.window_guide_items WHERE trip_id=p_trip AND author_id=auth.uid() AND created_at>now()-interval '1 day')>=30 THEN RAISE EXCEPTION 'Daily limit reached'; END IF;
  v_cap := trip_private.is_captain(p_trip);
  INSERT INTO public.window_guide_items(trip_id,author_id,kind,body,photo_path,status,position)
  VALUES (p_trip,auth.uid(),p_kind,trim(p_body),p_photo,CASE WHEN v_cap THEN 'approved' ELSE 'proposed' END,
    coalesce((SELECT max(position)+1 FROM public.window_guide_items WHERE trip_id=p_trip),0)) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.guide_review(p_item uuid, p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it public.window_guide_items%ROWTYPE; other public.window_guide_items%ROWTYPE;
BEGIN
  SELECT * INTO it FROM public.window_guide_items WHERE id=p_item FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_captain(it.trip_id) THEN RAISE EXCEPTION 'Only the Captain can edit the guide'; END IF;
  IF p_action='approve' THEN UPDATE public.window_guide_items SET status='approved' WHERE id=it.id AND trip_id=it.trip_id;
  ELSIF p_action='remove' THEN UPDATE public.window_guide_items SET status='removed' WHERE id=it.id AND trip_id=it.trip_id;
  ELSIF p_action IN ('up','down') THEN
    SELECT * INTO other FROM public.window_guide_items WHERE trip_id=it.trip_id AND status='approved' AND id<>it.id
      AND CASE WHEN p_action='up' THEN position<=it.position ELSE position>=it.position END
      ORDER BY CASE WHEN p_action='up' THEN -position ELSE position END LIMIT 1;
    IF FOUND THEN
      UPDATE public.window_guide_items SET position=other.position WHERE id=it.id AND trip_id=it.trip_id;
      UPDATE public.window_guide_items SET position=it.position + CASE WHEN other.position=it.position THEN (CASE WHEN p_action='up' THEN 1 ELSE -1 END) ELSE 0 END WHERE id=other.id AND trip_id=it.trip_id;
    END IF;
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guide_publish(p_trip uuid, p_on boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT trip_private.is_captain(p_trip) OR NOT trip_private.is_window_room(p_trip) THEN RAISE EXCEPTION 'Only the Captain can publish the guide'; END IF;
  UPDATE public.trips SET guide_published_at=CASE WHEN p_on THEN now() ELSE NULL END WHERE id=p_trip AND play_arrangement IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION trip_private.is_window_room(uuid), trip_private.seat_cap(uuid), trip_private.enforce_seat_cap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.is_window_room(uuid), trip_private.seat_cap(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.seat_status(uuid), public.unlock_extra_seats(uuid), public.create_culture_play_mode(text,text,text,text,text,text,date,integer,text,text,text[],text,text,boolean), public.guide_propose(uuid,text,text,text), public.guide_review(uuid,text), public.guide_publish(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seat_status(uuid), public.unlock_extra_seats(uuid), public.create_culture_play_mode(text,text,text,text,text,text,date,integer,text,text,text[],text,text,boolean), public.guide_propose(uuid,text,text,text), public.guide_review(uuid,text), public.guide_publish(uuid,boolean) TO authenticated;

-- Private storage for guide photos: path <trip>/<uploader>/<file>
CREATE POLICY "Window crew upload own guide photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='window-guide' AND (storage.foldername(name))[2]=auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id::text=(storage.foldername(name))[1] AND m.user_id=auth.uid() AND m.status='approved'));
CREATE POLICY "Window crew read guide photos" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='window-guide' AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id::text=(storage.foldername(name))[1] AND m.user_id=auth.uid() AND m.status='approved'));