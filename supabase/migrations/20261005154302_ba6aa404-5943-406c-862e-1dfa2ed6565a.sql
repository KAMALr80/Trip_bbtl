-- One editable source of truth for list prices (display/quote only during beta)
CREATE TABLE public.price_rules (
  key text PRIMARY KEY,
  label text NOT NULL,
  cents integer NOT NULL CHECK (cents >= 0),
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.price_rules TO anon, authenticated;
GRANT ALL ON public.price_rules TO service_role;
ALTER TABLE public.price_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Prices are public list info" ON public.price_rules FOR SELECT TO anon, authenticated USING (true);
CREATE TRIGGER price_rules_updated BEFORE UPDATE ON public.price_rules FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

INSERT INTO public.price_rules(key,label,cents,sort) VALUES
 ('window_solo','Window Seat · Solo',299,10),
 ('window_crew','Window Seat · crew up to 4',599,11),
 ('culture_base','Explore a Culture / Show Your Culture · up to 6',499,20),
 ('culture_addon','Explore a Culture / Show Your Culture · +6 seats',399,21),
 ('trip_d5','Going on a Trip · up to 6 · up to 5 days',599,30),
 ('trip_d10','Going on a Trip · up to 6 · 6–10 days',999,31),
 ('trip_d15','Going on a Trip · up to 6 · 11–15 days',1499,32),
 ('trip_d16','Going on a Trip · up to 6 · 16+ days',1999,33),
 ('trip_addon','Going on a Trip · +6 seats',499,34),
 ('game_night','Game Night (Games on Flight)',0,40),
 ('legacy_big_group','Older trips · Big Group add-on (21–30)',499,90),
 ('legacy_home_6','Older At Home rooms · 1–6 people',599,91),
 ('legacy_home_12','Older At Home rooms · 7–12 people',899,92),
 ('legacy_home_returning','Older At Home rooms · returning discount',100,93);

-- Beta-free switch, ON by default; fails closed
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS beta_free boolean NOT NULL DEFAULT true;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS collected_cents integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION trip_private.beta_free() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT coalesce((SELECT beta_free FROM public.app_settings ORDER BY id LIMIT 1), true) $$;
CREATE OR REPLACE FUNCTION trip_private.price(p_key text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT cents FROM public.price_rules WHERE key=p_key $$;

-- Nothing can be collected or marked paid while beta is on (and no provider exists yet)
CREATE OR REPLACE FUNCTION trip_private.guard_order_money() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.collected_cents <> 0 OR NEW.status <> 'beta_free' OR NEW.provider_ref IS NOT NULL THEN
    IF trip_private.beta_free() THEN RAISE EXCEPTION 'Free during beta — nothing can be charged.'; END IF;
    IF NEW.status='paid' AND NEW.provider_ref IS NULL THEN RAISE EXCEPTION 'Paid status needs a verified payment.'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_money_guard BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION trip_private.guard_order_money();

-- Which rule applies to a room. New rooms only; NULL keys for legacy.
CREATE OR REPLACE FUNCTION trip_private.room_pricing(p_trip uuid)
RETURNS TABLE(is_new boolean, base_key text, addon_key text, base_cents integer, addon_cents integer, days integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  days := t.end_date - t.start_date + 1;
  is_new := t.play_arrangement IS NOT NULL OR (t.kind='at_home' AND t.season_rule='a2c');
  IF NOT is_new THEN RETURN NEXT; RETURN; END IF;
  IF trip_private.is_window_room(p_trip) THEN
    base_key := CASE WHEN t.play_arrangement='solo' THEN 'window_solo' ELSE 'window_crew' END; addon_key := NULL;
  ELSIF t.kind='at_home' OR t.a2e_room THEN
    base_key := 'culture_base'; addon_key := 'culture_addon';
  ELSE
    base_key := CASE WHEN days<=5 THEN 'trip_d5' WHEN days<=10 THEN 'trip_d10' WHEN days<=15 THEN 'trip_d15' ELSE 'trip_d16' END; addon_key := 'trip_addon';
  END IF;
  base_cents := trip_private.price(base_key);
  addon_cents := CASE WHEN addon_key IS NOT NULL AND t.extra_seats THEN trip_private.price(addon_key) ELSE 0 END;
  RETURN NEXT;
END $$;

-- trip_price: same shape; new rooms read rules, legacy keeps its numbers (now read from the same table)
CREATE OR REPLACE FUNCTION trip_private.trip_price(p_trip uuid, p_headcount integer)
RETURNS TABLE(days integer, base_cents integer, addon_cents integer, total_cents integer, headcount integer, unlocked boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t public.trips; rp record; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip;
SELECT * INTO rp FROM trip_private.room_pricing(p_trip);
days := t.end_date - t.start_date + 1;
headcount := greatest(1, least(30, coalesce(p_headcount, (SELECT count(*)::int FROM public.trip_members WHERE status='approved' AND trip_id=p_trip))));
IF rp.is_new THEN
  base_cents := rp.base_cents; addon_cents := rp.addon_cents;
ELSE
  base_cents := trip_private.price(CASE WHEN days <= 5 THEN 'trip_d5' WHEN days <= 10 THEN 'trip_d10' WHEN days <= 15 THEN 'trip_d15' ELSE 'trip_d16' END);
  addon_cents := CASE WHEN headcount > 20 THEN trip_private.price('legacy_big_group') ELSE 0 END;
END IF;
total_cents := base_cents + addon_cents; unlocked := t.unlocked_at IS NOT NULL;
RETURN NEXT; END $function$;

-- order_quote: saved orders are shown exactly as stored; new rooms read rules; legacy numbers unchanged
CREATE OR REPLACE FUNCTION trip_private.order_quote(p_trip uuid)
RETURNS TABLE(kind text, label text, tier text, headcount integer, list_cents integer, discount_cents integer, discount_source text, amount_due_cents integer, paid boolean, upgrade_cents integer, order_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t public.trips; ret int := 0; code int := 0; pr record; rp record; o public.orders; BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can check out'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  SELECT count(*)::int INTO headcount FROM public.trip_members m WHERE m.trip_id=p_trip AND m.status='approved';
  SELECT * INTO o FROM public.orders x WHERE x.trip_id=p_trip AND x.kind IN ('at_home','trip_unlock') ORDER BY x.created_at LIMIT 1;
  SELECT * INTO rp FROM trip_private.room_pricing(p_trip);
  IF o.id IS NOT NULL THEN
    kind:=o.kind; label:=o.label; tier:=o.tier; list_cents:=o.list_cents; discount_cents:=o.discount_cents; discount_source:=o.discount_source; amount_due_cents:=o.amount_due_cents; order_id:=o.id; paid:=true;
    upgrade_cents := CASE WHEN rp.is_new THEN rp.addon_cents WHEN t.kind='at_home' AND EXISTS (SELECT 1 FROM public.orders x WHERE x.trip_id=p_trip AND x.kind='tier_upgrade') THEN 300 ELSE 0 END;
    RETURN NEXT; RETURN;
  END IF;
  IF rp.is_new THEN
    kind := CASE WHEN t.kind='at_home' THEN 'at_home' ELSE 'trip_unlock' END;
    tier := rp.base_key; list_cents := rp.base_cents + rp.addon_cents;
    label := t.name || CASE WHEN rp.base_key LIKE 'trip_%' THEN ' · ' || rp.days || '-day trip' ELSE '' END;
    upgrade_cents := rp.addon_cents;
  ELSIF t.kind='at_home' THEN
    kind := 'at_home'; tier := CASE WHEN headcount <= 6 THEN '1-6' ELSE '7-12' END; list_cents := trip_private.price(CASE WHEN headcount <= 6 THEN 'legacy_home_6' ELSE 'legacy_home_12' END);
    label := (SELECT name FROM public.at_home_packs WHERE key=t.at_home_pack) || ' at Home · ' || CASE t.at_home_length WHEN 'weekend' THEN 'Weekend' WHEN 'week' THEN '1 week' ELSE '2 weeks' END;
    IF EXISTS (SELECT 1 FROM public.orders x WHERE x.captain_id=auth.uid() AND x.kind='at_home' AND x.trip_id IS DISTINCT FROM p_trip) THEN ret := trip_private.price('legacy_home_returning'); END IF;
    upgrade_cents := CASE WHEN EXISTS (SELECT 1 FROM public.orders x WHERE x.trip_id=p_trip AND x.kind='tier_upgrade') THEN 300 ELSE 0 END;
  ELSE
    SELECT * INTO pr FROM trip_private.trip_price(p_trip, NULL);
    kind := 'trip_unlock'; tier := CASE WHEN pr.addon_cents > 0 THEN 'big_group' ELSE 'base' END; list_cents := pr.total_cents; label := t.name || ' · ' || pr.days || '-day trip';
    upgrade_cents := 0;
  END IF;
  SELECT r.cents INTO code FROM public.reward_codes r WHERE r.user_id=auth.uid() AND r.used_at IS NULL AND r.expires_at > now() ORDER BY r.created_at LIMIT 1;
  code := coalesce(code, 0);
  IF code > 0 AND code >= ret THEN discount_cents := least(code, list_cents); discount_source := 'captain_code';
  ELSIF ret > 0 THEN discount_cents := ret; discount_source := 'returning';
  ELSE discount_cents := 0; discount_source := NULL; END IF;
  amount_due_cents := list_cents - discount_cents;
  order_id := NULL; paid := t.unlocked_at IS NOT NULL;
  RETURN NEXT;
END $function$;

-- checkout_beta: Captain-checked, fails closed when beta is off, records a $0-collected beta_free receipt only
CREATE OR REPLACE FUNCTION trip_private.checkout_beta(p_trip uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE t public.trips; q record; v_order uuid; v_code uuid; BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can check out'; END IF;
  IF NOT trip_private.beta_free() THEN RAISE EXCEPTION 'Checkout isn''t open yet. Nothing was charged.'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
  SELECT * INTO q FROM trip_private.order_quote(p_trip);
  IF q.order_id IS NOT NULL THEN RETURN q.order_id; END IF;
  IF t.unlocked_at IS NOT NULL THEN RAISE EXCEPTION 'This trip is already unlocked'; END IF;
  IF q.discount_source = 'captain_code' THEN
    SELECT id INTO v_code FROM public.reward_codes WHERE user_id=auth.uid() AND used_at IS NULL AND expires_at > now() ORDER BY created_at LIMIT 1 FOR UPDATE;
  END IF;
  INSERT INTO public.orders(trip_id,captain_id,kind,label,tier,list_cents,discount_cents,discount_source,amount_due_cents,status,collected_cents,provider_ref)
  VALUES (p_trip, auth.uid(), q.kind, q.label, q.tier, q.list_cents, q.discount_cents, q.discount_source, q.amount_due_cents, 'beta_free', 0, NULL) RETURNING id INTO v_order;
  IF v_code IS NOT NULL THEN UPDATE public.reward_codes SET used_at=now(), used_order=v_order WHERE id=v_code AND user_id=auth.uid(); END IF;
  UPDATE public.trips SET unlocked_at=now(), unlocked_by=auth.uid(), big_group = big_group OR q.tier='big_group' WHERE id=p_trip;
  RETURN v_order;
END $function$;

-- Extra seats: free during beta, fails closed otherwise, leaves a $0 receipt
CREATE OR REPLACE FUNCTION public.unlock_extra_seats(p_trip uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE rp record;
BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can add seats'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND play_arrangement IS NOT NULL) THEN RAISE EXCEPTION 'This room uses its existing seat limit'; END IF;
  IF trip_private.is_window_room(p_trip) THEN RAISE EXCEPTION 'Bigger group? Start a Going on a Trip instead.'; END IF;
  IF NOT trip_private.beta_free() THEN RAISE EXCEPTION 'Seat add-ons aren''t open yet. Nothing was charged.'; END IF;
  IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND extra_seats) THEN RETURN; END IF;
  UPDATE public.trips SET extra_seats=true WHERE id=p_trip AND play_arrangement IS NOT NULL;
  SELECT * INTO rp FROM trip_private.room_pricing(p_trip);
  INSERT INTO public.orders(trip_id,captain_id,kind,label,tier,list_cents,discount_cents,amount_due_cents,status,collected_cents)
  VALUES (p_trip, auth.uid(), 'seat_addon', '+6 seats', rp.addon_key, rp.addon_cents, rp.addon_cents, 0, 'beta_free', 0);
END $function$;

-- Public read of the list (prices are non-sensitive) + beta switch state
CREATE OR REPLACE FUNCTION public.price_list()
RETURNS TABLE(key text, label text, cents integer, beta_free boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS
$$ SELECT r.key, r.label, r.cents, trip_private.beta_free() FROM public.price_rules r ORDER BY r.sort $$;
REVOKE ALL ON FUNCTION public.price_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.price_list() TO anon, authenticated;

-- Founder-only price edits
CREATE OR REPLACE FUNCTION public.set_price_rule(p_key text, p_cents integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF p_cents < 0 THEN RAISE EXCEPTION 'Price can''t be negative'; END IF;
  UPDATE public.price_rules SET cents=p_cents WHERE key=p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown price'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_price_rule(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_price_rule(text,integer) TO authenticated;

REVOKE ALL ON FUNCTION trip_private.beta_free(), trip_private.price(text), trip_private.room_pricing(uuid), trip_private.guard_order_money() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.beta_free(), trip_private.price(text), trip_private.room_pricing(uuid) TO authenticated, service_role;