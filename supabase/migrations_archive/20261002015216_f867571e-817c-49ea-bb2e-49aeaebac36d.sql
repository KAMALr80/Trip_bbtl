CREATE TABLE public.cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  category text NOT NULL CHECK (category IN ('flight','stay','excursion','other')),
  total_cents bigint NOT NULL CHECK (total_cents > 0 AND total_cents <= 100000000),
  split text NOT NULL CHECK (split IN ('even','custom')),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cost_shares (
  item_id uuid NOT NULL REFERENCES public.cost_items(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  share_cents bigint NOT NULL CHECK (share_cents >= 0),
  paid_cents bigint NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  reported_cents bigint CHECK (reported_cents IS NULL OR reported_cents > 0),
  report_note text CHECK (report_note IS NULL OR char_length(report_note) <= 120),
  reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
CREATE INDEX cost_items_trip_idx ON public.cost_items(trip_id);
CREATE INDEX cost_shares_trip_user_idx ON public.cost_shares(trip_id, user_id);
GRANT SELECT ON public.cost_items, public.cost_shares TO authenticated;
GRANT ALL ON public.cost_items, public.cost_shares TO service_role;
ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view cost items" ON public.cost_items FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE POLICY "Own share or captain views shares" ON public.cost_shares FOR SELECT TO authenticated USING (
  (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()))
  OR EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id = cost_shares.trip_id AND m.user_id = auth.uid() AND m.role = 'captain'));
CREATE TRIGGER cost_items_updated BEFORE UPDATE ON public.cost_items FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE TRIGGER cost_shares_updated BEFORE UPDATE ON public.cost_shares FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE OR REPLACE FUNCTION trip_private.is_captain(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') $fn$;

CREATE OR REPLACE FUNCTION trip_private.save_cost_item(p_trip uuid, p_item uuid, p_title text, p_category text, p_total_cents bigint, p_split text, p_shares jsonb, p_due date) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_id uuid; v_n int; v_base bigint; v_rem bigint; v_sum bigint; r record; i int := 0;
BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can edit trip costs'; END IF;
  IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND ended_at IS NOT NULL) THEN RAISE EXCEPTION 'This trip has ended'; END IF;
  IF p_total_cents IS NULL OR p_total_cents <= 0 THEN RAISE EXCEPTION 'Enter a total above zero'; END IF;
  IF p_item IS NULL THEN
    INSERT INTO public.cost_items(trip_id,title,category,total_cents,split,due_date) VALUES (p_trip,trim(p_title),p_category,p_total_cents,p_split,p_due) RETURNING id INTO v_id;
  ELSE
    UPDATE public.cost_items SET title=trim(p_title),category=p_category,total_cents=p_total_cents,split=p_split,due_date=p_due WHERE id=p_item AND trip_id=p_trip RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Cost item not found'; END IF;
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _shares(user_id uuid PRIMARY KEY, share_cents bigint) ON COMMIT DROP;
  DELETE FROM _shares;
  IF p_split = 'even' THEN
    SELECT count(*) INTO v_n FROM public.trip_members WHERE trip_id=p_trip;
    v_base := p_total_cents / v_n; v_rem := p_total_cents - v_base * v_n;
    FOR r IN SELECT user_id FROM public.trip_members WHERE trip_id=p_trip ORDER BY joined_at, user_id LOOP
      INSERT INTO _shares VALUES (r.user_id, v_base + CASE WHEN i < v_rem THEN 1 ELSE 0 END); i := i + 1;
    END LOOP;
  ELSE
    INSERT INTO _shares SELECT (e->>'user_id')::uuid, (e->>'share_cents')::bigint FROM jsonb_array_elements(coalesce(p_shares,'[]'::jsonb)) e WHERE coalesce((e->>'share_cents')::bigint,0) > 0;
    IF EXISTS (SELECT 1 FROM _shares s WHERE NOT public.is_trip_member(p_trip, s.user_id)) THEN RAISE EXCEPTION 'Everyone in a split must be in this trip'; END IF;
    SELECT coalesce(sum(share_cents),0) INTO v_sum FROM _shares;
    IF v_sum <> p_total_cents THEN RAISE EXCEPTION 'Custom shares must add up to the total'; END IF;
  END IF;
  DELETE FROM public.cost_shares c WHERE c.item_id=v_id AND NOT EXISTS (SELECT 1 FROM _shares s WHERE s.user_id=c.user_id);
  INSERT INTO public.cost_shares(item_id,trip_id,user_id,share_cents) SELECT v_id,p_trip,s.user_id,s.share_cents FROM _shares s
    ON CONFLICT (item_id,user_id) DO UPDATE SET share_cents=EXCLUDED.share_cents;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION trip_private.delete_cost_item(p_item uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_trip uuid; BEGIN
  SELECT trip_id INTO v_trip FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_captain(v_trip) THEN RAISE EXCEPTION 'Only the Captain can delete trip costs'; END IF;
  DELETE FROM public.cost_items WHERE id=p_item; END $fn$;

CREATE OR REPLACE FUNCTION trip_private.report_cost_payment(p_item uuid, p_amount_cents bigint, p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE s public.cost_shares; BEGIN
  SELECT * INTO s FROM public.cost_shares WHERE item_id=p_item AND user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You don''t have a share in this cost'; END IF;
  IF p_amount_cents IS NOT NULL AND p_amount_cents <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero'; END IF;
  UPDATE public.cost_shares SET reported_cents=coalesce(p_amount_cents, greatest(s.share_cents - s.paid_cents, 1)), report_note=nullif(left(trim(coalesce(p_note,'')),120),''), reported_at=now()
    WHERE item_id=p_item AND user_id=auth.uid(); END $fn$;

CREATE OR REPLACE FUNCTION trip_private.confirm_cost_payment(p_item uuid, p_user uuid, p_paid_cents bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_trip uuid; BEGIN
  SELECT trip_id INTO v_trip FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_captain(v_trip) THEN RAISE EXCEPTION 'Only the Captain can confirm payments'; END IF;
  IF p_paid_cents IS NULL OR p_paid_cents < 0 THEN RAISE EXCEPTION 'Enter a paid amount'; END IF;
  UPDATE public.cost_shares SET paid_cents=p_paid_cents, reported_cents=NULL, report_note=NULL, reported_at=NULL WHERE item_id=p_item AND user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'That player isn''t in this cost'; END IF; END $fn$;

REVOKE ALL ON FUNCTION trip_private.is_captain(uuid), trip_private.save_cost_item(uuid,uuid,text,text,bigint,text,jsonb,date), trip_private.delete_cost_item(uuid), trip_private.report_cost_payment(uuid,bigint,text), trip_private.confirm_cost_payment(uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.is_captain(uuid), trip_private.save_cost_item(uuid,uuid,text,text,bigint,text,jsonb,date), trip_private.delete_cost_item(uuid), trip_private.report_cost_payment(uuid,bigint,text), trip_private.confirm_cost_payment(uuid,uuid,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_cost_item(p_trip uuid, p_item uuid, p_title text, p_category text, p_total_cents bigint, p_split text, p_shares jsonb, p_due date) RETURNS uuid LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.save_cost_item(p_trip,p_item,p_title,p_category,p_total_cents,p_split,p_shares,p_due) $fn$;
CREATE OR REPLACE FUNCTION public.delete_cost_item(p_item uuid) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.delete_cost_item(p_item) $fn$;
CREATE OR REPLACE FUNCTION public.report_cost_payment(p_item uuid, p_amount_cents bigint, p_note text) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.report_cost_payment(p_item,p_amount_cents,p_note) $fn$;
CREATE OR REPLACE FUNCTION public.confirm_cost_payment(p_item uuid, p_user uuid, p_paid_cents bigint) RETURNS void LANGUAGE sql SET search_path=public AS $fn$ SELECT trip_private.confirm_cost_payment(p_item,p_user,p_paid_cents) $fn$;
REVOKE ALL ON FUNCTION public.save_cost_item(uuid,uuid,text,text,bigint,text,jsonb,date), public.delete_cost_item(uuid), public.report_cost_payment(uuid,bigint,text), public.confirm_cost_payment(uuid,uuid,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cost_item(uuid,uuid,text,text,bigint,text,jsonb,date), public.delete_cost_item(uuid), public.report_cost_payment(uuid,bigint,text), public.confirm_cost_payment(uuid,uuid,bigint) TO authenticated;