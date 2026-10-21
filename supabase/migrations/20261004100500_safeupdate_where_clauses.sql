-- The API role (authenticator) loads pg-safeupdate, which rejects any UPDATE/DELETE
-- without a WHERE clause — including statements inside SECURITY DEFINER functions.
-- The founder switches (AI, Public launch, Founding Members, Boarding tile) updated the
-- single-row app_settings table with no WHERE and failed with "UPDATE requires a WHERE
-- clause"; three Captain functions cleared temp tables the same way. Same checks,
-- same behaviour — only the statements change (WHERE id / TRUNCATE).

CREATE OR REPLACE FUNCTION trip_private.set_ai_guard(p_enabled boolean, p_global_cap integer, p_user_cap integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o jsonb;
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF p_global_cap IS NOT NULL AND (p_global_cap < 0 OR p_global_cap > 100000) THEN RAISE EXCEPTION 'Daily cap must be 0–100000'; END IF;
  IF p_user_cap IS NOT NULL AND (p_user_cap < 0 OR p_user_cap > 1000) THEN RAISE EXCEPTION 'Per-person cap must be 0–1000'; END IF;
  SELECT jsonb_build_object('enabled', ai_enabled, 'global', ai_daily_global_cap, 'user', ai_daily_user_cap) INTO o FROM public.app_settings LIMIT 1;
  UPDATE public.app_settings SET ai_enabled = coalesce(p_enabled, ai_enabled),
    ai_daily_global_cap = coalesce(p_global_cap, ai_daily_global_cap),
    ai_daily_user_cap = coalesce(p_user_cap, ai_daily_user_cap), ai_updated_at = now()
  WHERE id;
  INSERT INTO trip_private.ai_guard_log(actor, old_value, new_value)
  SELECT auth.uid(), o, jsonb_build_object('enabled', ai_enabled, 'global', ai_daily_global_cap, 'user', ai_daily_user_cap) FROM public.app_settings LIMIT 1;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.set_public_launch(p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 UPDATE public.app_settings SET public_launch=coalesce(p_on,false), updated_at=now() WHERE id; END $function$;

CREATE OR REPLACE FUNCTION trip_private.set_founding_open(p_open boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF; IF p_open IS NULL THEN RAISE EXCEPTION 'Choose open or closed'; END IF; UPDATE public.app_settings SET founding_open=p_open,founding_closed_at=CASE WHEN p_open THEN NULL ELSE coalesce(founding_closed_at,now()) END WHERE id; END $function$;

CREATE OR REPLACE FUNCTION trip_private.set_boarding_tile(p_tile text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF p_tile NOT IN ('current','a','b') THEN RAISE EXCEPTION 'Pick A, B or current'; END IF;
  UPDATE public.app_settings SET boarding_tile=p_tile WHERE id;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.apply_game_plan(p_trip uuid, p_plan text, p_weekday integer, p_time time without time zone, p_start date, p_every integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_count int; v_host uuid; v_keep int; t public.trips; v_today date; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE status='approved' AND trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can confirm a game plan'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip; v_today := (now() AT TIME ZONE t.home_timezone)::date;
CREATE TEMP TABLE IF NOT EXISTS _gplan(week_number int, starts_at timestamptz, kept boolean) ON COMMIT DROP; TRUNCATE _gplan;
INSERT INTO _gplan SELECT * FROM trip_private.plan_game_nights(p_trip,p_plan,p_weekday,p_time,p_start,p_every);
IF NOT EXISTS (SELECT 1 FROM _gplan) THEN RAISE EXCEPTION 'A season needs at least 1 game night before the trip'; END IF;
SELECT coalesce(max(week_number) FILTER (WHERE kept),0) INTO v_keep FROM _gplan;
SELECT count(*) INTO v_count FROM public.trip_members WHERE status='approved' AND trip_id=p_trip;
DELETE FROM public.host_swaps s WHERE s.trip_id=p_trip AND s.week_number > v_keep AND s.status='open';
DELETE FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number > v_keep;
DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.drops_at > now() AND ((q.week_number > v_keep AND q.week_number < 1000) OR q.week_number >= 1000);
DELETE FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number > v_keep;
FOR r IN SELECT * FROM _gplan WHERE NOT kept ORDER BY week_number LOOP
  SELECT user_id INTO v_host FROM public.trip_members WHERE status='approved' AND trip_id=p_trip ORDER BY coalesce(approved_at,joined_at),user_id LIMIT 1 OFFSET ((r.week_number-1)%greatest(v_count,1));
  INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,r.week_number,r.starts_at,v_host);
END LOOP;
UPDATE public.trips SET game_plan=p_plan, schedule_every=CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END,
  game_start = CASE WHEN p_plan='custom' THEN greatest(p_start, v_today)
                    WHEN p_plan='short' THEN coalesce((SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now()), v_today)
                    ELSE greatest(v_today, start_date - 84) END
  WHERE id=p_trip;
UPDATE public.trips SET game_start = least(game_start, (SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip)) WHERE id=p_trip;
UPDATE public.game_night_polls SET confirmed_option=coalesce(confirmed_option,0) WHERE trip_id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN (SELECT count(*) FROM _gplan)::int; END $function$;

CREATE OR REPLACE FUNCTION trip_private.apply_reschedule(p_trip uuid, p_every integer, p_count integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_count int; v_host uuid; v_max int; t public.trips; BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE status='approved' AND trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can confirm a new schedule'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip;
CREATE TEMP TABLE IF NOT EXISTS _plan(week_number int, starts_at timestamptz, played boolean) ON COMMIT DROP; TRUNCATE _plan;
INSERT INTO _plan SELECT * FROM trip_private.reschedule_preview(p_trip, p_every, p_count);
IF NOT EXISTS (SELECT 1 FROM _plan) THEN RAISE EXCEPTION 'A season needs at least 1 game night before the trip'; END IF;
SELECT max(week_number) INTO v_max FROM _plan; SELECT count(*) INTO v_count FROM public.trip_members WHERE status='approved' AND trip_id=p_trip;
DELETE FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number > v_max;
DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number > v_max AND q.drops_at > now();
DELETE FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number > v_max AND n.starts_at > now();
FOR r IN SELECT * FROM _plan WHERE NOT played LOOP
  IF EXISTS (SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=r.week_number) THEN
    UPDATE public.game_nights n SET starts_at=r.starts_at WHERE n.trip_id=p_trip AND n.week_number=r.week_number AND n.starts_at IS DISTINCT FROM r.starts_at;
    IF FOUND THEN DELETE FROM public.weekly_questions q WHERE q.trip_id=p_trip AND q.week_number=r.week_number AND q.drops_at > now() AND q.source='pool';
      UPDATE public.weekly_questions q SET drops_at=least(q.drops_at, r.starts_at - interval '1 day') WHERE q.trip_id=p_trip AND q.week_number=r.week_number AND q.drops_at > now(); END IF;
  ELSE
    SELECT user_id INTO v_host FROM public.trip_members WHERE status='approved' AND trip_id=p_trip ORDER BY coalesce(approved_at,joined_at),user_id LIMIT 1 OFFSET ((r.week_number-1)%greatest(v_count,1));
    INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,r.week_number,r.starts_at,v_host);
  END IF;
END LOOP;
UPDATE public.trips SET schedule_every=greatest(1,least(2,coalesce(p_every,1))) WHERE id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip);
RETURN (SELECT count(*) FROM _plan)::int; END $function$;

CREATE OR REPLACE FUNCTION trip_private.save_cost_item(p_trip uuid, p_item uuid, p_title text, p_category text, p_total_cents bigint, p_split text, p_shares jsonb, p_due date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_n int; v_base bigint; v_rem bigint; v_sum bigint; r record; i int := 0;
BEGIN PERFORM trip_private.require_feature(p_trip, 'trip_pot');
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
  TRUNCATE _shares;
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
