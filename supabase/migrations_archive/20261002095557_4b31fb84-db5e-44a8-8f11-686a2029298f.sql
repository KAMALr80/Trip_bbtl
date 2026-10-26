ALTER TABLE public.cost_items DROP CONSTRAINT cost_items_category_check;
ALTER TABLE public.cost_items ADD CONSTRAINT cost_items_category_check CHECK (category = ANY (ARRAY['flight','stay','transport','excursion','food','other']));
ALTER TABLE public.cost_items ADD COLUMN IF NOT EXISTS custom_category text CHECK (custom_category IS NULL OR char_length(custom_category) <= 40);
ALTER TABLE public.cost_items ADD COLUMN IF NOT EXISTS is_estimate boolean NOT NULL DEFAULT false;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pay_note text CHECK (pay_note IS NULL OR char_length(pay_note) <= 200);

CREATE TABLE public.cost_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  item_id uuid,
  actor uuid NOT NULL,
  target_user uuid,
  action text NOT NULL,
  amount_cents bigint,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cost_log_trip_idx ON public.cost_log(trip_id, created_at DESC);
GRANT SELECT ON public.cost_log TO authenticated;
GRANT ALL ON public.cost_log TO service_role;
ALTER TABLE public.cost_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaders read cost log" ON public.cost_log FOR SELECT TO authenticated USING (trip_private.is_leader(trip_id));

CREATE TABLE public.cost_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cost_notes_user_idx ON public.cost_notes(user_id, trip_id);
GRANT SELECT ON public.cost_notes TO authenticated;
GRANT ALL ON public.cost_notes TO service_role;
ALTER TABLE public.cost_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own cost notes" ON public.cost_notes FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid()));

DROP POLICY "Own share or captain views shares" ON public.cost_shares;
CREATE POLICY "Own share or leader views shares" ON public.cost_shares FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND public.is_trip_member(trip_id, auth.uid())) OR trip_private.is_leader(trip_id));

CREATE OR REPLACE FUNCTION trip_private.log_cost(p_trip uuid, p_item uuid, p_target uuid, p_action text, p_amount bigint, p_detail text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.cost_log(trip_id,item_id,actor,target_user,action,amount_cents,detail) VALUES (p_trip,p_item,auth.uid(),p_target,p_action,p_amount,left(p_detail,200)) $$;

-- Save (leaders), with estimate + custom category
DROP FUNCTION public.save_cost_item(uuid,uuid,text,text,bigint,text,jsonb,date);
CREATE OR REPLACE FUNCTION trip_private.save_cost_item(p_trip uuid, p_item uuid, p_title text, p_category text, p_total_cents bigint, p_split text, p_shares jsonb, p_due date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_n int; v_base bigint; v_rem bigint; v_sum bigint; r record; i int := 0;
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can edit trip costs'; END IF;
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
    SELECT count(*) INTO v_n FROM public.trip_members WHERE status='approved' AND trip_id=p_trip;
    v_base := p_total_cents / v_n; v_rem := p_total_cents - v_base * v_n;
    FOR r IN SELECT user_id FROM public.trip_members WHERE status='approved' AND trip_id=p_trip ORDER BY joined_at, user_id LOOP
      INSERT INTO _shares VALUES (r.user_id, v_base + CASE WHEN i < v_rem THEN 1 ELSE 0 END); i := i + 1;
    END LOOP;
  ELSE
    INSERT INTO _shares SELECT (e->>'user_id')::uuid, (e->>'share_cents')::bigint FROM jsonb_array_elements(coalesce(p_shares,'[]'::jsonb)) e WHERE coalesce((e->>'share_cents')::bigint,0) > 0;
    IF EXISTS (SELECT 1 FROM _shares s WHERE NOT trip_private.is_trip_member(p_trip, s.user_id)) THEN RAISE EXCEPTION 'Everyone in a split must be in this trip'; END IF;
    SELECT coalesce(sum(share_cents),0) INTO v_sum FROM _shares;
    IF v_sum <> p_total_cents THEN RAISE EXCEPTION 'Custom shares must add up to the total'; END IF;
  END IF;
  DELETE FROM public.cost_shares c WHERE c.item_id=v_id AND NOT EXISTS (SELECT 1 FROM _shares s WHERE s.user_id=c.user_id);
  INSERT INTO public.cost_shares(item_id,trip_id,user_id,share_cents) SELECT v_id,p_trip,s.user_id,s.share_cents FROM _shares s
    ON CONFLICT (item_id,user_id) DO UPDATE SET share_cents=EXCLUDED.share_cents;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.save_cost_item_v2(p_trip uuid, p_item uuid, p_title text, p_category text, p_custom text, p_estimate boolean, p_total_cents bigint, p_split text, p_shares jsonb, p_due date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v uuid; BEGIN
  v := trip_private.save_cost_item(p_trip,p_item,p_title,p_category,p_total_cents,p_split,p_shares,p_due);
  UPDATE public.cost_items SET needs_review=false, is_estimate=coalesce(p_estimate,false),
    custom_category=CASE WHEN p_category='other' THEN nullif(left(trim(coalesce(p_custom,'')),40),'') END WHERE id=v;
  PERFORM trip_private.log_cost(p_trip, v, NULL, CASE WHEN p_item IS NULL THEN 'added cost' ELSE 'edited cost' END, p_total_cents, trim(p_title));
  RETURN v; END $$;
CREATE OR REPLACE FUNCTION public.save_cost_item(p_trip uuid, p_item uuid, p_title text, p_category text, p_custom text, p_estimate boolean, p_total_cents bigint, p_split text, p_shares jsonb, p_due date)
RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.save_cost_item_v2(p_trip,p_item,p_title,p_category,p_custom,p_estimate,p_total_cents,p_split,p_shares,p_due) $$;

CREATE OR REPLACE FUNCTION trip_private.confirm_cost_payment(p_item uuid, p_user uuid, p_paid_cents bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip uuid; v_old bigint; BEGIN
  SELECT trip_id INTO v_trip FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_leader(v_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can confirm payments'; END IF;
  IF p_paid_cents IS NULL OR p_paid_cents < 0 THEN RAISE EXCEPTION 'Enter a paid amount'; END IF;
  SELECT paid_cents INTO v_old FROM public.cost_shares WHERE item_id=p_item AND user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'That player isn''t in this cost'; END IF;
  UPDATE public.cost_shares SET paid_cents=p_paid_cents, reported_cents=NULL, report_note=NULL, reported_at=NULL WHERE item_id=p_item AND user_id=p_user;
  PERFORM trip_private.log_cost(v_trip, p_item, p_user, 'set paid', p_paid_cents, 'was '||v_old);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.delete_cost_item(p_item uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip uuid; v_title text; v_total bigint; BEGIN
  SELECT trip_id, title, total_cents INTO v_trip, v_title, v_total FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_leader(v_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can delete trip costs'; END IF;
  DELETE FROM public.cost_items WHERE id=p_item;
  PERFORM trip_private.log_cost(v_trip, p_item, NULL, 'deleted cost', v_total, v_title);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.report_cost_payment(p_item uuid, p_amount_cents bigint, p_note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.cost_shares; v bigint; BEGIN
  SELECT * INTO s FROM public.cost_shares WHERE item_id=p_item AND user_id=auth.uid();
  IF NOT FOUND OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) THEN RAISE EXCEPTION 'You don''t have a share in this cost'; END IF;
  IF p_amount_cents IS NOT NULL AND p_amount_cents <= 0 THEN RAISE EXCEPTION 'Enter an amount above zero'; END IF;
  v := coalesce(p_amount_cents, greatest(s.share_cents - s.paid_cents, 1));
  UPDATE public.cost_shares SET reported_cents=v, report_note=nullif(left(trim(coalesce(p_note,'')),120),''), reported_at=now()
    WHERE item_id=p_item AND user_id=auth.uid();
  PERFORM trip_private.log_cost(s.trip_id, p_item, auth.uid(), 'reported payment', v, NULL);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.undo_cost_payment(p_item uuid, p_user uuid, p_amount_cents bigint, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_trip uuid; s public.cost_shares; v bigint; BEGIN
  SELECT trip_id INTO v_trip FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_leader(v_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can undo payments'; END IF;
  IF nullif(trim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Add a short reason'; END IF;
  SELECT * INTO s FROM public.cost_shares WHERE item_id=p_item AND user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'That player isn''t in this cost'; END IF;
  v := least(coalesce(p_amount_cents, s.paid_cents), s.paid_cents);
  IF v <= 0 THEN RAISE EXCEPTION 'There is no confirmed payment to undo'; END IF;
  UPDATE public.cost_shares SET paid_cents=paid_cents - v WHERE item_id=p_item AND user_id=p_user;
  INSERT INTO public.cost_notes(trip_id,user_id,message) VALUES (v_trip, p_user,
    'Your '||to_char(v/100.0,'FM$999,999,990.00')||' payment couldn''t be confirmed — check with your Captain.');
  PERFORM trip_private.log_cost(v_trip, p_item, p_user, 'undid payment', v, left(trim(p_reason),200));
END $$;
CREATE OR REPLACE FUNCTION public.undo_cost_payment(p_item uuid, p_user uuid, p_amount_cents bigint, p_reason text)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.undo_cost_payment(p_item,p_user,p_amount_cents,p_reason) $$;

CREATE OR REPLACE FUNCTION trip_private.set_pay_note(p_trip uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can change this'; END IF;
  UPDATE public.trips SET pay_note=nullif(left(trim(coalesce(p_note,'')),200),'') WHERE id=p_trip;
  PERFORM trip_private.log_cost(p_trip, NULL, NULL, 'updated how to pay', NULL, left(trim(coalesce(p_note,'')),200));
END $$;
CREATE OR REPLACE FUNCTION public.set_pay_note(p_trip uuid, p_note text)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_pay_note(p_trip,p_note) $$;

CREATE OR REPLACE FUNCTION trip_private.dismiss_cost_note(p_note uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.cost_notes SET dismissed_at=now() WHERE id=p_note AND user_id=auth.uid() $$;
CREATE OR REPLACE FUNCTION public.dismiss_cost_note(p_note uuid)
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.dismiss_cost_note(p_note) $$;

-- Group pot: aggregates only, never names or shares
CREATE OR REPLACE FUNCTION trip_private.trip_pot(p_trip uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb; BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'total', coalesce(sum(i.total_cents),0),
    'collected', coalesce(sum((SELECT coalesce(sum(least(s.paid_cents,s.share_cents)),0) FROM public.cost_shares s WHERE s.item_id=i.id)),0),
    'has_estimates', coalesce(bool_or(i.is_estimate),false),
    'pay_note', (SELECT pay_note FROM public.trips WHERE id=p_trip),
    'categories', coalesce((SELECT jsonb_agg(jsonb_build_object('category',c.category,'total',c.t,'estimate',c.e)) FROM (
        SELECT category, sum(total_cents) t, bool_or(is_estimate) e FROM public.cost_items WHERE trip_id=p_trip GROUP BY category) c),'[]'::jsonb))
  INTO r FROM public.cost_items i WHERE i.trip_id=p_trip;
  RETURN r; END $$;
CREATE OR REPLACE FUNCTION public.trip_pot(p_trip uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT trip_private.trip_pot(p_trip) $$;

REVOKE ALL ON FUNCTION trip_private.log_cost(uuid,uuid,uuid,text,bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION trip_private.save_cost_item_v2(uuid,uuid,text,text,text,boolean,bigint,text,jsonb,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.undo_cost_payment(uuid,uuid,bigint,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.set_pay_note(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.dismiss_cost_note(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.trip_pot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.save_cost_item_v2(uuid,uuid,text,text,text,boolean,bigint,text,jsonb,date), trip_private.undo_cost_payment(uuid,uuid,bigint,text), trip_private.set_pay_note(uuid,text), trip_private.dismiss_cost_note(uuid), trip_private.trip_pot(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_cost_item(uuid,uuid,text,text,text,boolean,bigint,text,jsonb,date), public.undo_cost_payment(uuid,uuid,bigint,text), public.set_pay_note(uuid,text), public.dismiss_cost_note(uuid), public.trip_pot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cost_item(uuid,uuid,text,text,text,boolean,bigint,text,jsonb,date), public.undo_cost_payment(uuid,uuid,bigint,text), public.set_pay_note(uuid,text), public.dismiss_cost_note(uuid), public.trip_pot(uuid) TO authenticated;