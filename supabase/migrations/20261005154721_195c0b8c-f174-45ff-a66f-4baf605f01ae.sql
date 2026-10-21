ALTER TABLE public.orders DROP CONSTRAINT orders_kind_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_kind_check CHECK (kind = ANY (ARRAY['trip_unlock','at_home','tier_upgrade','seat_addon']));