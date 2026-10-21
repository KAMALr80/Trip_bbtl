
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS unlocked_at timestamptz, ADD COLUMN IF NOT EXISTS unlocked_by uuid;
UPDATE public.trips t SET unlocked_at = now(), unlocked_by = (SELECT user_id FROM public.trip_members m WHERE m.trip_id=t.id AND m.role='captain' LIMIT 1) WHERE unlocked_at IS NULL;

CREATE OR REPLACE FUNCTION trip_private.is_unlocked(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT coalesce((SELECT unlocked_at IS NOT NULL FROM public.trips WHERE id=p_trip), false) $f$;

CREATE OR REPLACE FUNCTION trip_private.trip_price(p_trip uuid, p_headcount integer)
 RETURNS TABLE(days integer, base_cents integer, addon_cents integer, total_cents integer, headcount integer, unlocked boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ DECLARE t public.trips; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip;
days := t.end_date - t.start_date + 1;
headcount := greatest(1, least(30, coalesce(p_headcount, (SELECT count(*)::int FROM public.trip_members WHERE trip_id=p_trip))));
base_cents := CASE WHEN days <= 5 THEN 599 WHEN days <= 10 THEN 999 WHEN days <= 15 THEN 1499 ELSE 1999 END;
addon_cents := CASE WHEN headcount > 20 THEN 499 ELSE 0 END;
total_cents := base_cents + addon_cents; unlocked := t.unlocked_at IS NOT NULL;
RETURN NEXT; END $f$;

CREATE OR REPLACE FUNCTION trip_private.unlock_trip(p_trip uuid, p_headcount integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$ BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can unlock the trip'; END IF;
-- Beta: free. A real checkout would verify payment here before flipping the flag.
UPDATE public.trips SET unlocked_at = coalesce(unlocked_at, now()), unlocked_by = coalesce(unlocked_by, auth.uid()),
  big_group = big_group OR coalesce(p_headcount,0) > 20 WHERE id=p_trip;
END $f$;

CREATE OR REPLACE FUNCTION trip_private.my_unlocked_trips() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT count(*)::int FROM public.trips WHERE unlocked_by = auth.uid() AND unlocked_at IS NOT NULL $f$;

CREATE OR REPLACE FUNCTION public.trip_price(p_trip uuid, p_headcount integer) RETURNS TABLE(days integer, base_cents integer, addon_cents integer, total_cents integer, headcount integer, unlocked boolean) LANGUAGE sql SET search_path TO 'public' AS $f$ SELECT * FROM trip_private.trip_price(p_trip,p_headcount) $f$;
CREATE OR REPLACE FUNCTION public.unlock_trip(p_trip uuid, p_headcount integer) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $f$ SELECT trip_private.unlock_trip(p_trip,p_headcount) $f$;
CREATE OR REPLACE FUNCTION public.my_unlocked_trips() RETURNS integer LANGUAGE sql SET search_path TO 'public' AS $f$ SELECT trip_private.my_unlocked_trips() $f$;
REVOKE EXECUTE ON FUNCTION public.trip_price(uuid,integer), public.unlock_trip(uuid,integer), public.my_unlocked_trips() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.trip_price(uuid,integer), public.unlock_trip(uuid,integer), public.my_unlocked_trips() TO authenticated;

-- server-side free taste: only week 1 runs and no trip-day games until unlocked
DO $do$ DECLARE src text; BEGIN
  SELECT pg_get_functiondef('trip_private.night_flow_action(uuid,integer,text)'::regprocedure) INTO src;
  src := replace(src, E'IF p_action=''warmup'' THEN\n PERFORM', E'IF p_week > 1 AND NOT trip_private.is_unlocked(p_trip) THEN RAISE EXCEPTION ''Your Captain can unlock the full trip''; END IF;\nIF p_action=''warmup'' THEN\n PERFORM');
  IF position('is_unlocked' in src)=0 THEN RAISE EXCEPTION 'patch failed (flow)'; END IF;
  EXECUTE src;
  SELECT pg_get_functiondef('trip_private.release_trip_day(uuid,date)'::regprocedure) INTO src;
  src := regexp_replace(src, '(\$function\$\s*DECLARE[^;]*;\s*BEGIN|\$function\$\s*BEGIN)', E'\\1\nIF NOT trip_private.is_unlocked(p_trip) THEN RAISE EXCEPTION ''Unlock the full trip to release trip-day games''; END IF;');
  IF position('is_unlocked' in src)=0 THEN RAISE EXCEPTION 'patch failed (release)'; END IF;
  EXECUTE src;
END $do$;

-- security: move pg_net out of public (not relocatable, so recreate)
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
