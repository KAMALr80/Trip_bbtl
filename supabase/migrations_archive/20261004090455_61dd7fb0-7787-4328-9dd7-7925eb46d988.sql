ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_daily_global_cap integer NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS ai_daily_user_cap integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS ai_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS trip_private.ai_guard_log (
  id bigserial PRIMARY KEY, actor uuid, old_value jsonb, new_value jsonb, created_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON trip_private.ai_guard_log FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON public.ai_usage(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON public.ai_usage(user_id, created_at);

CREATE OR REPLACE FUNCTION trip_private.ai_gate(p_kind text, p_trip uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; n int;
BEGIN
  SELECT ai_enabled, ai_daily_global_cap, ai_daily_user_cap INTO s FROM public.app_settings LIMIT 1;
  IF s IS NULL THEN RETURN; END IF;
  IF NOT s.ai_enabled THEN RAISE EXCEPTION 'AI_PAUSED: AI ideas are taking a break — pre-written content keeps playing.'; END IF;
  SELECT count(*) INTO n FROM public.ai_usage WHERE created_at >= date_trunc('day', now());
  IF n >= s.ai_daily_global_cap THEN RAISE EXCEPTION 'AI_DAILY_CAP: AI ideas are taking a break — pre-written content keeps playing.'; END IF;
  IF p_user IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.ai_usage WHERE user_id = p_user AND created_at >= date_trunc('day', now());
    IF n >= s.ai_daily_user_cap THEN RAISE EXCEPTION 'AI_USER_CAP: AI ideas are taking a break — pre-written content keeps playing.'; END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION trip_private.ai_gate(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.ai_gate(text, uuid, uuid) TO authenticated, service_role;

-- Server-only wrapper for app-paid calls: returns NULL when allowed, else the refusal code.
CREATE OR REPLACE FUNCTION public.ai_gate_server(p_kind text, p_trip uuid, p_user uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM trip_private.ai_gate(p_kind, p_trip, p_user);
  RETURN NULL;
EXCEPTION WHEN raise_exception THEN RETURN split_part(SQLERRM, ':', 1);
END $$;
REVOKE ALL ON FUNCTION public.ai_gate_server(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_gate_server(text, uuid, uuid) TO service_role;

-- Inject the gate as the first statement of the three spend paths (bodies otherwise unchanged).
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('trip_private.use_ai_quota(text,uuid)'::regprocedure);
  d := regexp_replace(d, '\mBEGIN\M', 'BEGIN PERFORM trip_private.ai_gate(p_kind, p_trip, auth.uid());');
  EXECUTE d;
  d := pg_get_functiondef('trip_private.spend_credits(uuid,text)'::regprocedure);
  d := regexp_replace(d, '\mBEGIN\M', 'BEGIN PERFORM trip_private.ai_gate(p_action, p_trip, auth.uid());');
  EXECUTE d;
  d := pg_get_functiondef('trip_private.mix_ai_quota(uuid)'::regprocedure);
  d := regexp_replace(d, '\mBEGIN\M', 'BEGIN PERFORM trip_private.ai_gate(''arcade_mix'', p_trip, auth.uid());');
  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION trip_private.set_ai_guard(p_enabled boolean, p_global_cap integer, p_user_cap integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o jsonb;
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF p_global_cap IS NOT NULL AND (p_global_cap < 0 OR p_global_cap > 100000) THEN RAISE EXCEPTION 'Daily cap must be 0–100000'; END IF;
  IF p_user_cap IS NOT NULL AND (p_user_cap < 0 OR p_user_cap > 1000) THEN RAISE EXCEPTION 'Per-person cap must be 0–1000'; END IF;
  SELECT jsonb_build_object('enabled', ai_enabled, 'global', ai_daily_global_cap, 'user', ai_daily_user_cap) INTO o FROM public.app_settings LIMIT 1;
  UPDATE public.app_settings SET ai_enabled = coalesce(p_enabled, ai_enabled),
    ai_daily_global_cap = coalesce(p_global_cap, ai_daily_global_cap),
    ai_daily_user_cap = coalesce(p_user_cap, ai_daily_user_cap), ai_updated_at = now();
  INSERT INTO trip_private.ai_guard_log(actor, old_value, new_value)
  SELECT auth.uid(), o, jsonb_build_object('enabled', ai_enabled, 'global', ai_daily_global_cap, 'user', ai_daily_user_cap) FROM public.app_settings LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_ai_guard(boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_ai_guard(boolean, integer, integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.set_ai_guard(p_enabled boolean, p_global_cap integer, p_user_cap integer)
RETURNS void LANGUAGE sql SET search_path = public AS $$ SELECT trip_private.set_ai_guard(p_enabled, p_global_cap, p_user_cap) $$;
REVOKE ALL ON FUNCTION public.set_ai_guard(boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ai_guard(boolean, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.ai_guard_report()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; t0 timestamptz := date_trunc('day', now()); w0 timestamptz := date_trunc('day', now()) - interval '6 days';
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  SELECT jsonb_build_object(
    'settings', (SELECT jsonb_build_object('enabled', ai_enabled, 'global_cap', ai_daily_global_cap, 'user_cap', ai_daily_user_cap, 'updated_at', ai_updated_at) FROM public.app_settings LIMIT 1),
    'today', (SELECT jsonb_build_object('calls', count(*), 'credits', coalesce(sum(credits),0), 'input', coalesce(sum(input_tokens),0), 'output', coalesce(sum(output_tokens),0)) FROM public.ai_usage WHERE created_at >= t0),
    'week', (SELECT jsonb_build_object('calls', count(*), 'credits', coalesce(sum(credits),0), 'input', coalesce(sum(input_tokens),0), 'output', coalesce(sum(output_tokens),0)) FROM public.ai_usage WHERE created_at >= w0),
    'top_trips', coalesce((SELECT jsonb_agg(x) FROM (SELECT u.trip_id, t.name, count(*) calls FROM public.ai_usage u LEFT JOIN public.trips t ON t.id=u.trip_id WHERE u.created_at >= t0 AND u.trip_id IS NOT NULL GROUP BY u.trip_id, t.name ORDER BY calls DESC LIMIT 5) x), '[]'),
    'top_users', coalesce((SELECT jsonb_agg(x) FROM (SELECT u.user_id, p.display_name AS name, count(*) calls FROM public.ai_usage u LEFT JOIN public.profiles p ON p.id=u.user_id WHERE u.created_at >= t0 AND u.user_id IS NOT NULL GROUP BY u.user_id, p.display_name ORDER BY calls DESC LIMIT 5) x), '[]'),
    'recent', coalesce((SELECT jsonb_agg(x) FROM (SELECT u.kind, t.name AS trip, p.display_name AS name, u.input_tokens, u.output_tokens, u.credits, u.created_at FROM public.ai_usage u LEFT JOIN public.trips t ON t.id=u.trip_id LEFT JOIN public.profiles p ON p.id=u.user_id ORDER BY u.created_at DESC LIMIT 20) x), '[]')
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION trip_private.ai_guard_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.ai_guard_report() TO authenticated;
CREATE OR REPLACE FUNCTION public.ai_guard_report()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$ SELECT trip_private.ai_guard_report() $$;
REVOKE ALL ON FUNCTION public.ai_guard_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_guard_report() TO authenticated;