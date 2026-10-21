CREATE TABLE public.app_admins (user_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.app_admins TO authenticated; GRANT ALL ON public.app_admins TO service_role;
ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins see own row" ON public.app_admins FOR SELECT TO authenticated USING (user_id = auth.uid());
INSERT INTO public.app_admins(user_id) SELECT id FROM auth.users WHERE email = 'tymekasmith23@gmail.com' ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.is_app_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()) $fn$;
REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

CREATE TABLE public.trip_feedback (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  skipped boolean NOT NULL DEFAULT false,
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 10),
  favorite text CHECK (favorite IS NULL OR favorite IN ('game_nights','qotw','bingo','photo_wall','wrapped','other')),
  change_text text CHECK (change_text IS NULL OR char_length(change_text) <= 500),
  squad_message text CHECK (squad_message IS NULL OR char_length(squad_message) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
GRANT SELECT ON public.trip_feedback TO authenticated; GRANT ALL ON public.trip_feedback TO service_role;
ALTER TABLE public.trip_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "App owner reads feedback" ON public.trip_feedback FOR SELECT TO authenticated USING (public.is_app_admin());
CREATE TRIGGER trip_feedback_updated BEFORE UPDATE ON public.trip_feedback FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE OR REPLACE FUNCTION trip_private.submit_trip_feedback(p_trip uuid, p_skipped boolean, p_score integer, p_favorite text, p_change text, p_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE t public.trips; BEGIN
  IF NOT public.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  IF t.ended_at IS NULL AND (now() AT TIME ZONE t.home_timezone)::date <= t.end_date THEN RAISE EXCEPTION 'Feedback opens when the trip ends'; END IF;
  IF NOT coalesce(p_skipped,false) AND p_score IS NULL THEN RAISE EXCEPTION 'Pick a score from 0 to 10'; END IF;
  INSERT INTO public.trip_feedback(trip_id,user_id,skipped,score,favorite,change_text,squad_message)
  VALUES (p_trip, auth.uid(), coalesce(p_skipped,false),
    CASE WHEN p_skipped THEN NULL ELSE p_score END, CASE WHEN p_skipped THEN NULL ELSE p_favorite END,
    CASE WHEN p_skipped THEN NULL ELSE nullif(left(trim(coalesce(p_change,'')),500),'') END,
    CASE WHEN p_skipped THEN NULL ELSE nullif(left(trim(coalesce(p_message,'')),280),'') END)
  ON CONFLICT (trip_id,user_id) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'You already shared feedback for this trip'; END IF;
END $fn$;
CREATE OR REPLACE FUNCTION trip_private.my_trip_feedback_done(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$ SELECT EXISTS (SELECT 1 FROM public.trip_feedback WHERE trip_id=p_trip AND user_id=auth.uid()) $fn$;
CREATE OR REPLACE FUNCTION trip_private.trip_squad_messages(p_trip uuid) RETURNS TABLE(user_id uuid, message text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
  IF NOT public.is_trip_member(p_trip, auth.uid()) THEN RETURN; END IF;
  RETURN QUERY SELECT f.user_id, f.squad_message FROM public.trip_feedback f WHERE f.trip_id=p_trip AND f.squad_message IS NOT NULL ORDER BY f.created_at; END $fn$;
REVOKE ALL ON FUNCTION trip_private.submit_trip_feedback(uuid,boolean,integer,text,text,text), trip_private.my_trip_feedback_done(uuid), trip_private.trip_squad_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.submit_trip_feedback(uuid,boolean,integer,text,text,text), trip_private.my_trip_feedback_done(uuid), trip_private.trip_squad_messages(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.submit_trip_feedback(p_trip uuid, p_skipped boolean, p_score integer, p_favorite text, p_change text, p_message text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.submit_trip_feedback(p_trip,p_skipped,p_score,p_favorite,p_change,p_message) $fn$;
CREATE OR REPLACE FUNCTION public.my_trip_feedback_done(p_trip uuid) RETURNS boolean LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.my_trip_feedback_done(p_trip) $fn$;
CREATE OR REPLACE FUNCTION public.trip_squad_messages(p_trip uuid) RETURNS TABLE(user_id uuid, message text) LANGUAGE sql SET search_path=public AS $fn$ SELECT * FROM trip_private.trip_squad_messages(p_trip) $fn$;
REVOKE ALL ON FUNCTION public.submit_trip_feedback(uuid,boolean,integer,text,text,text), public.my_trip_feedback_done(uuid), public.trip_squad_messages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_trip_feedback(uuid,boolean,integer,text,text,text), public.my_trip_feedback_done(uuid), public.trip_squad_messages(uuid) TO authenticated;

ALTER TABLE public.cost_items ADD COLUMN needs_review boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION trip_private.resplit_even_costs(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE it record; r record; v_n int; v_base bigint; v_rem bigint; i int; BEGIN
  SELECT count(*) INTO v_n FROM public.trip_members WHERE trip_id=p_trip;
  IF v_n = 0 THEN RETURN; END IF;
  FOR it IN SELECT id, total_cents FROM public.cost_items WHERE trip_id=p_trip AND split='even' LOOP
    v_base := it.total_cents / v_n; v_rem := it.total_cents - v_base*v_n; i := 0;
    FOR r IN SELECT user_id FROM public.trip_members WHERE trip_id=p_trip ORDER BY joined_at, user_id LOOP
      INSERT INTO public.cost_shares(item_id,trip_id,user_id,share_cents) VALUES (it.id,p_trip,r.user_id,v_base + CASE WHEN i < v_rem THEN 1 ELSE 0 END)
      ON CONFLICT (item_id,user_id) DO UPDATE SET share_cents=EXCLUDED.share_cents; i := i+1;
    END LOOP;
  END LOOP;
  UPDATE public.cost_items SET needs_review=true WHERE trip_id=p_trip AND split='custom';
END $fn$;
REVOKE ALL ON FUNCTION trip_private.resplit_even_costs(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION trip_private.on_member_joined() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN PERFORM trip_private.resplit_even_costs(NEW.trip_id); RETURN NEW; END $fn$;
REVOKE ALL ON FUNCTION trip_private.on_member_joined() FROM PUBLIC;
CREATE TRIGGER trip_members_resplit_costs AFTER INSERT ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.on_member_joined();

CREATE OR REPLACE FUNCTION trip_private.clear_cost_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $fn$ BEGIN IF NEW.needs_review AND OLD.needs_review AND (NEW.updated_at IS DISTINCT FROM OLD.updated_at OR true) AND current_setting('trip.resplit', true) IS DISTINCT FROM 'on' THEN NEW.needs_review := false; END IF; RETURN NEW; END $fn$;
CREATE TRIGGER cost_items_clear_review BEFORE UPDATE ON public.cost_items FOR EACH ROW EXECUTE FUNCTION trip_private.clear_cost_review();