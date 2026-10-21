ALTER TABLE public.ai_usage ADD COLUMN IF NOT EXISTS credits int NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS model text, ADD COLUMN IF NOT EXISTS input_tokens int, ADD COLUMN IF NOT EXISTS output_tokens int, ADD COLUMN IF NOT EXISTS est_cost_usd numeric(12,6);
ALTER TABLE public.ai_usage ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS ai_usage_trip_credits ON public.ai_usage(trip_id) WHERE credits > 0;

-- Credits bought with packs; written only by the verified payment webhook (service role).
CREATE TABLE public.ai_credit_purchases (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, pack text NOT NULL, credits int NOT NULL CHECK (credits > 0), provider_ref text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ai_credit_purchases TO service_role;
ALTER TABLE public.ai_credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION trip_private.credit_cost(p_action text) RETURNS int LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE p_action WHEN 'custom_game' THEN 3 WHEN 'regen_set' THEN 5 WHEN 'dest_activities' THEN 3 WHEN 'team_challenges' THEN 3 WHEN 'athome_pack' THEN 5 WHEN 'itinerary_extra' THEN 2 ELSE NULL END $$;

CREATE OR REPLACE FUNCTION trip_private.credits_included(p_trip uuid) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT CASE WHEN t.unlocked_at IS NULL THEN 0 ELSE (WITH d AS (SELECT (t.end_date - t.start_date + 1) AS n) SELECT CASE WHEN n <= 5 THEN 20 WHEN n <= 10 THEN 35 WHEN n <= 15 THEN 50 ELSE 70 END FROM d) END FROM public.trips t WHERE t.id = p_trip $$;

CREATE OR REPLACE FUNCTION trip_private.credit_status(p_trip uuid) RETURNS TABLE(included int, purchased int, used int, remaining int, itinerary_today int) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first.'; END IF;
 included := coalesce(trip_private.credits_included(p_trip),0);
 SELECT coalesce(sum(credits),0)::int INTO purchased FROM public.ai_credit_purchases WHERE trip_id=p_trip;
 SELECT coalesce(sum(credits),0)::int INTO used FROM public.ai_usage WHERE trip_id=p_trip;
 SELECT count(*)::int INTO itinerary_today FROM public.ai_usage WHERE trip_id=p_trip AND kind='itinerary' AND created_at >= date_trunc('day', now());
 remaining := greatest(0, included + purchased - used); RETURN NEXT;
END $$;

-- Atomic: locks the trip row so two taps can't spend the same credits.
CREATE OR REPLACE FUNCTION trip_private.spend_credits(p_trip uuid, p_action text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c int := trip_private.credit_cost(p_action); have int; uid uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF c IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'AI ideas are for beta members only.'; END IF;
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can use AI credits.'; END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT remaining INTO have FROM trip_private.credit_status(p_trip);
 IF have < c THEN RAISE EXCEPTION 'OUT_OF_CREDITS: This needs % AI credits and the trip has %.', c, have; END IF;
 INSERT INTO public.ai_usage(user_id, trip_id, kind, credits) VALUES (auth.uid(), p_trip, p_action, c) RETURNING id INTO uid;
 RETURN uid;
END $$;

-- Daily-limit check, now returning the usage row id; itinerary beyond 20/day spends 2 credits instead of refusing.
DROP FUNCTION IF EXISTS public.use_ai_quota(text, uuid);
DROP FUNCTION IF EXISTS trip_private.use_ai_quota(text, uuid);
CREATE FUNCTION trip_private.use_ai_quota(p_kind text, p_trip uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE lim int; used int; uid uuid; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'AI ideas are for beta members only.'; END IF;
 IF p_trip IS NOT NULL AND NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first.'; END IF;
 lim := CASE p_kind WHEN 'names' THEN 10 WHEN 'itinerary' THEN 20 ELSE 0 END;
 IF lim = 0 OR (p_kind <> 'names' AND p_trip IS NULL) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF p_kind = 'names' THEN SELECT count(*) INTO used FROM public.ai_usage WHERE kind='names' AND user_id=auth.uid() AND created_at >= date_trunc('day', now());
 ELSE SELECT count(*) INTO used FROM public.ai_usage WHERE kind=p_kind AND trip_id=p_trip AND created_at >= date_trunc('day', now()); END IF;
 IF used >= lim THEN
   IF p_kind = 'itinerary' THEN RETURN trip_private.spend_credits(p_trip, 'itinerary_extra'); END IF;
   RAISE EXCEPTION 'That''s today''s limit for AI ideas — try again tomorrow.';
 END IF;
 INSERT INTO public.ai_usage(user_id, trip_id, kind) VALUES (auth.uid(), p_trip, p_kind) RETURNING id INTO uid;
 RETURN uid;
END $$;

-- Records model/tokens/cost on the caller's own usage row (once).
CREATE OR REPLACE FUNCTION trip_private.log_ai_call(p_usage uuid, p_model text, p_in int, p_out int, p_cost numeric) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
 UPDATE public.ai_usage SET model=left(p_model,80), input_tokens=greatest(0,p_in), output_tokens=greatest(0,p_out), est_cost_usd=greatest(0,p_cost) WHERE id=p_usage AND user_id=auth.uid() AND model IS NULL $$;

CREATE OR REPLACE FUNCTION trip_private.ai_cost_summary() RETURNS TABLE(action text, calls int, credits int, avg_cost_usd numeric, total_cost_usd numeric, avg_in int, avg_out int) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
 RETURN QUERY SELECT u.kind, count(*)::int, coalesce(sum(u.credits),0)::int, round(avg(u.est_cost_usd),5), round(coalesce(sum(u.est_cost_usd),0),4), avg(u.input_tokens)::int, avg(u.output_tokens)::int
  FROM public.ai_usage u WHERE u.created_at >= now() - interval '30 days' GROUP BY u.kind ORDER BY 5 DESC;
END $$;
CREATE OR REPLACE FUNCTION trip_private.ai_cost_per_trip() RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r numeric; BEGIN
 IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT round(avg(s),4) INTO r FROM (SELECT sum(coalesce(est_cost_usd,0)) s FROM public.ai_usage WHERE trip_id IS NOT NULL AND created_at >= now() - interval '30 days' GROUP BY trip_id) x;
 RETURN coalesce(r,0); END $$;

REVOKE EXECUTE ON FUNCTION trip_private.credit_cost(text), trip_private.credits_included(uuid), trip_private.credit_status(uuid), trip_private.spend_credits(uuid,text), trip_private.use_ai_quota(text,uuid), trip_private.log_ai_call(uuid,text,int,int,numeric), trip_private.ai_cost_summary(), trip_private.ai_cost_per_trip() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.credit_cost(text), trip_private.credits_included(uuid), trip_private.credit_status(uuid), trip_private.spend_credits(uuid,text), trip_private.use_ai_quota(text,uuid), trip_private.log_ai_call(uuid,text,int,int,numeric), trip_private.ai_cost_summary(), trip_private.ai_cost_per_trip() TO authenticated;

CREATE FUNCTION public.use_ai_quota(p_kind text, p_trip uuid) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.use_ai_quota(p_kind, p_trip) $$;
CREATE OR REPLACE FUNCTION public.spend_ai_credits(p_trip uuid, p_action text) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.spend_credits(p_trip, p_action) $$;
CREATE OR REPLACE FUNCTION public.ai_credit_status(p_trip uuid) RETURNS TABLE(included int, purchased int, used int, remaining int, itinerary_today int) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.credit_status(p_trip) $$;
CREATE OR REPLACE FUNCTION public.log_ai_call(p_usage uuid, p_model text, p_in int, p_out int, p_cost numeric) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.log_ai_call(p_usage,p_model,p_in,p_out,p_cost) $$;
CREATE OR REPLACE FUNCTION public.ai_cost_summary() RETURNS TABLE(action text, calls int, credits int, avg_cost_usd numeric, total_cost_usd numeric, avg_in int, avg_out int) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.ai_cost_summary() $$;
CREATE OR REPLACE FUNCTION public.ai_cost_per_trip() RETURNS numeric LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.ai_cost_per_trip() $$;
REVOKE EXECUTE ON FUNCTION public.use_ai_quota(text,uuid), public.spend_ai_credits(uuid,text), public.ai_credit_status(uuid), public.log_ai_call(uuid,text,int,int,numeric), public.ai_cost_summary(), public.ai_cost_per_trip() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_ai_quota(text,uuid), public.spend_ai_credits(uuid,text), public.ai_credit_status(uuid), public.log_ai_call(uuid,text,int,int,numeric), public.ai_cost_summary(), public.ai_cost_per_trip() TO authenticated;