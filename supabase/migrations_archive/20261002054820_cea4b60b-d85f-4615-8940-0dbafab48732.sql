
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS trip_timezone text;
UPDATE public.trips SET trip_timezone = home_timezone WHERE trip_timezone IS NULL;
ALTER TABLE public.trips ALTER COLUMN trip_timezone SET NOT NULL;
CREATE OR REPLACE FUNCTION trip_private.default_trip_timezone() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$ BEGIN NEW.trip_timezone := coalesce(NEW.trip_timezone, NEW.home_timezone); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS default_trip_timezone ON public.trips;
CREATE TRIGGER default_trip_timezone BEFORE INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION trip_private.default_trip_timezone();
ALTER TABLE public.game_nights ADD COLUMN IF NOT EXISTS host_checked_in_at timestamptz;
ALTER TABLE public.trip_members ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE OR REPLACE FUNCTION trip_private.trip_today(p_trip uuid) RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT (now() AT TIME ZONE coalesce(trip_timezone, home_timezone))::date FROM public.trips WHERE id=p_trip $$;

CREATE OR REPLACE FUNCTION trip_private.set_trip_timezone(p_trip uuid, p_tz text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can change the trip time zone'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN RAISE EXCEPTION 'Pick a valid time zone'; END IF;
 UPDATE public.trips SET trip_timezone = p_tz WHERE id = p_trip; END $$;
CREATE OR REPLACE FUNCTION public.set_trip_timezone(p_trip uuid, p_tz text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_trip_timezone(p_trip, p_tz) $$;

CREATE OR REPLACE FUNCTION trip_private.host_check_in(p_trip uuid, p_week integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ DECLARE n public.game_nights; BEGIN
 SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week FOR UPDATE;
 IF NOT FOUND OR n.host_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only tonight''s host can check in'; END IF;
 IF clock_timestamp() < n.starts_at - interval '2 hours' OR clock_timestamp() > n.starts_at + interval '3 hours' THEN RAISE EXCEPTION 'Check-in opens 2 hours before game night'; END IF;
 UPDATE public.game_nights SET host_checked_in_at = coalesce(host_checked_in_at, now()) WHERE trip_id=p_trip AND week_number=p_week; END $$;
CREATE OR REPLACE FUNCTION public.host_check_in(p_trip uuid, p_week integer) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.host_check_in(p_trip, p_week) $$;

CREATE OR REPLACE FUNCTION trip_private.night_no_show_check(p_trip uuid, p_week integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ DECLARE n public.game_nights; BEGIN
 SELECT * INTO n FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week;
 IF n.host_id IS NULL OR n.host_id=auth.uid() OR n.host_checked_in_at IS NOT NULL OR n.skipped THEN RETURN; END IF;
 IF clock_timestamp() < n.starts_at + interval '15 minutes' THEN
   IF trip_private.is_leader(p_trip) THEN RETURN; END IF;
   RAISE EXCEPTION 'Give the host until 15 minutes after start, then you can take over';
 END IF;
 INSERT INTO public.host_penalties(trip_id,week_number,user_id) VALUES(p_trip,p_week,n.host_id) ON CONFLICT DO NOTHING;
END $$;

-- approved-only patches
DO $do$ DECLARE r record; d text; o text; BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('vote_weekly_answer(uuid,integer,integer)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('weekly_question_status(uuid)', 'public.trip_members m WHERE m.trip_id=p_trip', 'public.trip_members m WHERE m.status=''approved'' AND m.trip_id=p_trip'),
  ('apply_game_plan(uuid,text,integer,time without time zone,date,integer)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('apply_game_plan(uuid,text,integer,time without time zone,date,integer)', 'ORDER BY joined_at,user_id', 'ORDER BY coalesce(approved_at,joined_at),user_id'),
  ('apply_reschedule(uuid,integer,integer)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('apply_reschedule(uuid,integer,integer)', 'ORDER BY joined_at,user_id', 'ORDER BY coalesce(approved_at,joined_at),user_id'),
  ('start_game_turns(uuid,integer,integer,boolean)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('night_flow_action(uuid,integer,text)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('night_flow_action(uuid,integer,text)', 'public.trip_members m WHERE m.trip_id=p_trip', 'public.trip_members m WHERE m.status=''approved'' AND m.trip_id=p_trip'),
  ('night_flow_action(uuid,integer,text)', 'JOIN public.trip_members m ON m.trip_id=x.trip_id AND m.user_id=x.user_id', 'JOIN public.trip_members m ON m.trip_id=x.trip_id AND m.user_id=x.user_id AND m.status=''approved'''),
  ('night_flow_action(uuid,integer,text)', 'AND game_number IS NOT NULL AND starts_at BETWEEN clock_timestamp()-interval ''12 hours'' AND clock_timestamp()+interval ''12 hours'')', 'AND game_number IS NOT NULL AND (trip_private.is_leader(p_trip) OR starts_at BETWEEN clock_timestamp()-interval ''12 hours'' AND clock_timestamp()+interval ''12 hours''))'),
  ('night_flow_action(uuid,integer,text)', 'IF p_week > 1 AND NOT trip_private.is_unlocked(p_trip)', 'UPDATE public.game_nights SET host_checked_in_at=coalesce(host_checked_in_at,now()) WHERE trip_id=p_trip AND week_number=p_week AND host_id=auth.uid();
IF p_week > 1 AND NOT trip_private.is_unlocked(p_trip)'),
  ('room_rounds(uuid)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('save_cost_item(uuid,uuid,text,text,bigint,text,jsonb,date)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('save_cost_item(uuid,uuid,text,text,bigint,text,jsonb,date)', 'NOT public.is_trip_member(p_trip, s.user_id)', 'NOT trip_private.is_trip_member(p_trip, s.user_id)'),
  ('trip_price(uuid,integer)', 'public.trip_members WHERE trip_id=p_trip', 'public.trip_members WHERE status=''approved'' AND trip_id=p_trip'),
  ('leave_trip(uuid)', '(SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip)>1', '(SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip AND status=''approved'')>1'),
  ('reschedule_preview(uuid,integer,integer)', 'v_anchor := v_last + make_interval(days => 7*greatest(1,least(2,coalesce(p_every,1))));', 'v_anchor := ((v_last AT TIME ZONE (SELECT home_timezone FROM public.trips WHERE id=p_trip)) + make_interval(days => 7*greatest(1,least(2,coalesce(p_every,1))))) AT TIME ZONE (SELECT home_timezone FROM public.trips WHERE id=p_trip);'),
  ('ensure_weekly_questions(uuid)', 'IF t.start_date - v_start < 14 THEN', 'FOR n IN SELECT cur.week_number, cur.starts_at cur_start, prev.starts_at prev_start FROM public.game_nights cur JOIN public.game_nights prev ON prev.trip_id=cur.trip_id AND prev.week_number=cur.week_number-1
  WHERE cur.trip_id=p_trip AND cur.starts_at - prev.starts_at >= interval ''14 days'' LOOP
  d := (n.prev_start AT TIME ZONE tz)::date; d := d + (8 - extract(isodow FROM d)::int) + 7;
  IF d < (n.cur_start AT TIME ZONE tz)::date AND NOT EXISTS (SELECT 1 FROM public.weekly_questions q WHERE q.trip_id=p_trip AND (q.week_number=2000+n.week_number OR abs((q.drops_at AT TIME ZONE tz)::date - d) <= 1)) THEN
    INSERT INTO public.weekly_questions(trip_id, week_number, prompt, drops_at) VALUES (p_trip, 2000+n.week_number, trip_private.pick_weekly_prompt(p_trip), (d + time ''09:00'') AT TIME ZONE tz) ON CONFLICT DO NOTHING;
  END IF;
END LOOP;
IF t.start_date - v_start < 14 THEN')
 ) v(sig, f, t) LOOP
  SELECT pg_get_functiondef(('trip_private.'||r.sig)::regprocedure) INTO d; o := d;
  d := replace(d, r.f, r.t);
  IF d = o THEN RAISE EXCEPTION 'patch did not apply: % / %', r.sig, left(r.f,60); END IF;
  EXECUTE d;
 END LOOP;
 -- trip_season max: only real game days
 SELECT pg_get_functiondef('trip_private.trip_season(uuid)'::regprocedure) INTO d; o := d;
 d := regexp_replace(d, 'SELECT coalesce\(sum\(CASE WHEN coalesce\(g\.tag,dt\.tag\)=''Travel'' THEN 10 ELSE 30 END\),0\)::int INTO v_max.*?WHERE t\.id=p_trip;',
  'SELECT coalesce(sum(CASE trip_private.game_day_status(p_trip, s.d::date) WHEN ''travel'' THEN 10 WHEN ''rest'' THEN 0 WHEN ''off'' THEN 0 ELSE 30 END),0)::int INTO v_max FROM public.trips t CROSS JOIN LATERAL generate_series(t.start_date, least(t.end_date, v_today), interval ''1 day'') s(d) WHERE t.id=p_trip;');
 IF d = o THEN RAISE EXCEPTION 'trip_season max patch failed'; END IF;
 EXECUTE d;
END $do$;

CREATE OR REPLACE FUNCTION trip_private.game_stamps(p_trip uuid) RETURNS TABLE(user_id uuid, stamps integer, mx integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
WITH v AS (SELECT coalesce((SELECT here_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) h, coalesce((SELECT win_stamps FROM public.stamp_settings WHERE trip_id=p_trip),3) w, coalesce((SELECT host_stamps FROM public.stamp_settings WHERE trip_id=p_trip),1) ho),
g AS (SELECT m.user_id,
  sum(v.h + v.w + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END) mx,
  sum(CASE WHEN s.here THEN v.h + CASE WHEN n.host_id=m.user_id THEN v.ho ELSE 0 END ELSE 0 END + CASE WHEN s.won THEN v.w ELSE 0 END) stamps
  FROM public.trip_members m CROSS JOIN v JOIN public.game_nights n ON n.trip_id=m.trip_id AND n.starts_at <= now() AND NOT n.skipped
  LEFT JOIN public.game_scores s ON s.trip_id=m.trip_id AND s.week_number=n.week_number AND s.user_id=m.user_id
  WHERE m.trip_id=p_trip AND m.status='approved' GROUP BY m.user_id),
qw AS (SELECT (3*count(*) FILTER (WHERE week_number < 1000) + count(*) FILTER (WHERE week_number >= 1000))::int total FROM public.weekly_questions WHERE trip_id=p_trip AND revealed_at IS NOT NULL),
qa AS (SELECT a.user_id, (count(*) + 2*count(*) FILTER (WHERE q.winner_id=a.user_id))::int n FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id),
pen AS (SELECT hp.user_id, sum(hp.stamps)::int n FROM public.host_penalties hp JOIN public.game_nights gn ON gn.trip_id=hp.trip_id AND gn.week_number=hp.week_number AND NOT gn.skipped WHERE hp.trip_id=p_trip GROUP BY hp.user_id)
SELECT m.user_id, greatest(0, coalesce(g.stamps,0)+coalesce(qa.n,0)+m.start_stamps-coalesce(pen.n,0))::int, (coalesce(g.mx,0)+qw.total)::int
FROM public.trip_members m CROSS JOIN qw LEFT JOIN g ON g.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id LEFT JOIN pen ON pen.user_id=m.user_id WHERE m.trip_id=p_trip AND m.status='approved' AND NOT m.season_closed $$;

CREATE OR REPLACE FUNCTION trip_private.resplit_even_costs(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it record; r record; v_n int; v_base bigint; v_rem bigint; i int; v_gone int; BEGIN
  DELETE FROM public.cost_shares cs WHERE cs.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=cs.user_id AND m.status='approved');
  GET DIAGNOSTICS v_gone = ROW_COUNT;
  SELECT count(*) INTO v_n FROM public.trip_members WHERE trip_id=p_trip AND status='approved';
  IF v_n = 0 THEN RETURN; END IF;
  FOR it IN SELECT id, total_cents FROM public.cost_items WHERE trip_id=p_trip AND split='even' LOOP
    v_base := it.total_cents / v_n; v_rem := it.total_cents - v_base*v_n; i := 0;
    FOR r IN SELECT user_id FROM public.trip_members WHERE trip_id=p_trip AND status='approved' ORDER BY joined_at, user_id LOOP
      INSERT INTO public.cost_shares(item_id,trip_id,user_id,share_cents) VALUES (it.id,p_trip,r.user_id,v_base + CASE WHEN i < v_rem THEN 1 ELSE 0 END)
      ON CONFLICT (item_id,user_id) DO UPDATE SET share_cents=EXCLUDED.share_cents; i := i+1;
    END LOOP;
  END LOOP;
  UPDATE public.cost_items SET needs_review=true WHERE trip_id=p_trip AND split='custom';
END $$;
CREATE OR REPLACE FUNCTION trip_private.on_member_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.trips WHERE id=coalesce(NEW.trip_id, OLD.trip_id)) THEN PERFORM trip_private.resplit_even_costs(coalesce(NEW.trip_id, OLD.trip_id)); END IF;
 RETURN coalesce(NEW, OLD); END $$;
DROP TRIGGER IF EXISTS trip_members_resplit_on_change ON public.trip_members;
CREATE TRIGGER trip_members_resplit_on_change AFTER UPDATE OF status OR DELETE ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.on_member_changed();

-- late-joiner baseline computed once, when the member becomes approved
CREATE OR REPLACE FUNCTION trip_private.apply_join_baseline(p_trip uuid, p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; gr trip_private.trip_join_grants%ROWTYPE; v_avg int := 0; v_week int; v_closed boolean; v_trip_avg int := 0; BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 SELECT * INTO gr FROM trip_private.trip_join_grants WHERE trip_id=p_trip AND user_id=p_user;
 IF FOUND THEN
   UPDATE public.trip_members SET start_stamps=gr.start_stamps, joined_week=gr.joined_week, trip_start_stamps=gr.trip_start_stamps, season_closed=gr.season_closed WHERE trip_id=p_trip AND user_id=p_user;
   RETURN;
 END IF;
 v_closed := EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=p_trip AND season='game') OR coalesce(trip_private.effective_crowning(p_trip,'game') <= now(), false);
 IF NOT v_closed AND EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped AND starts_at <= now()) THEN
   SELECT coalesce(floor(avg(g.stamps) FILTER (WHERE g.stamps > 0 AND g.user_id <> p_user)),0)::int INTO v_avg FROM trip_private.game_stamps(p_trip) g;
   SELECT coalesce(min(week_number) FILTER (WHERE starts_at > now()), max(week_number)+1) INTO v_week FROM public.game_nights WHERE trip_id=p_trip;
 END IF;
 IF v_closed AND (now() AT TIME ZONE t.home_timezone)::date > t.start_date AND trip_private.is_trip_member(p_trip, auth.uid()) THEN
   SELECT coalesce(floor(avg(s.stamps) FILTER (WHERE s.stamps > 0 AND s.user_id <> p_user)),0)::int INTO v_trip_avg FROM trip_private.trip_season(p_trip) s;
 END IF;
 UPDATE public.trip_members SET start_stamps=v_avg, joined_week=v_week, season_closed=v_closed, trip_start_stamps=v_trip_avg WHERE trip_id=p_trip AND user_id=p_user;
 INSERT INTO trip_private.trip_join_grants(trip_id,user_id,start_stamps,joined_week,trip_start_stamps,season_closed) VALUES(p_trip,p_user,v_avg,v_week,v_trip_avg,v_closed);
END $$;

CREATE OR REPLACE FUNCTION trip_private.approve_member(p_trip uuid, p_user uuid, p_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can approve members'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='pending') THEN RAISE EXCEPTION 'That request is no longer waiting'; END IF;
 IF p_approve THEN
  UPDATE public.trip_members SET status='approved', approved_at=now() WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.apply_join_baseline(p_trip, p_user);
  INSERT INTO public.beta_access(user_id, source) VALUES (p_user, 'invite') ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; END IF; END $$;

CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; v_count integer; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM trip_private.code_rate_check();
 v_age := trip_private.age_of(auth.uid());
 IF v_age IS NULL THEN RAISE EXCEPTION 'Add your date of birth first'; END IF;
 IF length(v_code) = 10 THEN
   SELECT * INTO inv FROM public.trip_invites WHERE token=v_code FOR UPDATE;
   IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
   SELECT * INTO t FROM public.trips WHERE id=inv.trip_id FOR UPDATE;
   IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
   IF inv.used_at IS NOT NULL OR inv.cancelled_at IS NOT NULL OR inv.expires_at <= now() THEN RAISE EXCEPTION 'This invite link has expired or was already used. Ask your Captain for a new one.'; END IF;
   via_invite := true;
 ELSE
   SELECT * INTO t FROM public.trips WHERE join_code = v_code FOR UPDATE;
   IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
   IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
   IF NOT t.join_code_enabled THEN RAISE EXCEPTION 'This trip''s join code is turned off. Ask your Captain for a personal invite link.'; END IF;
   IF EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You can''t rejoin with the trip code. Ask your Captain for a new personal invite link.'; END IF;
 END IF;
 IF v_age < 18 AND NOT via_invite THEN RAISE EXCEPTION 'Players under 18 need a personal invite link from the Captain'; END IF;
 SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;  -- approved + pending
 IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
 IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
 v_status := CASE WHEN t.require_approval OR v_age < 18 THEN 'pending' ELSE 'approved' END;
 IF via_invite THEN
   UPDATE public.trip_invites SET used_by=auth.uid(), used_at=now() WHERE id=inv.id;
   DELETE FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid();
 END IF;
 INSERT INTO public.trip_members(trip_id,user_id,status,approved_at) VALUES(t.id,auth.uid(),v_status,CASE WHEN v_status='approved' THEN now() END);
 IF v_status = 'approved' THEN
   PERFORM trip_private.apply_join_baseline(t.id, auth.uid());
   INSERT INTO public.beta_access(user_id, source) VALUES (auth.uid(), 'invite') ON CONFLICT DO NOTHING;
 END IF;
 RETURN t.id;
END $$;

-- poll-confirmed seasons end on Takeoff Night (last night before departure)
CREATE OR REPLACE FUNCTION trip_private.confirm_game_nights(p_trip uuid, p_option integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_start timestamptz; t public.trips; v_host uuid; v_count integer; p record; v_local timestamp; v_gap int; v_take timestamp; v_list timestamp[] := '{}'; x timestamp; i int := 0; BEGIN
IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can confirm'; END IF;
SELECT (options->>p_option)::timestamptz INTO v_start FROM public.game_night_polls WHERE trip_id=p_trip AND confirmed_option IS NULL;
IF v_start IS NULL OR v_start <= now() THEN RAISE EXCEPTION 'Choose a future option'; END IF;
SELECT * INTO t FROM public.trips WHERE id=p_trip;
IF (v_start AT TIME ZONE t.home_timezone)::date >= t.start_date THEN RAISE EXCEPTION 'Time must be before the trip'; END IF;
SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id=p_trip AND status='approved'; IF v_count=0 THEN RAISE EXCEPTION 'Trip has no members'; END IF;
DELETE FROM public.game_nights WHERE trip_id=p_trip;
v_local := v_start AT TIME ZONE t.home_timezone;
WHILE v_local::date < t.start_date - 84 LOOP v_local := v_local + interval '7 days'; END LOOP;
IF t.start_date - v_local::date < 14 THEN
  FOR p IN SELECT * FROM trip_private.plan_nights(p_trip, v_start, t.schedule_every, NULL) LOOP v_list := v_list || (p.starts_at AT TIME ZONE t.home_timezone); END LOOP;
ELSE
  v_gap := 7 * greatest(1, least(2, coalesce(t.schedule_every,1)));
  v_take := v_local + make_interval(days => ((t.start_date - 1 - v_local::date) / v_gap) * v_gap);
  x := v_take;
  WHILE x >= v_local AND cardinality(v_list) < 12 LOOP v_list := x || v_list; x := x - make_interval(days => v_gap); END LOOP;
END IF;
FOREACH x IN ARRAY v_list LOOP
  i := i + 1;
  SELECT user_id INTO v_host FROM public.trip_members WHERE trip_id=p_trip AND status='approved' ORDER BY coalesce(approved_at,joined_at),user_id LIMIT 1 OFFSET ((i-1)%v_count);
  INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,i,x AT TIME ZONE t.home_timezone,v_host);
END LOOP;
IF NOT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip) THEN RAISE EXCEPTION 'Pick a time before the trip'; END IF;
UPDATE public.trips SET game_start=(SELECT min((starts_at AT TIME ZONE home_timezone)::date) FROM public.game_nights WHERE trip_id=p_trip) WHERE id=p_trip;
UPDATE public.game_night_polls SET confirmed_option=p_option WHERE trip_id=p_trip;
PERFORM trip_private.ensure_weekly_questions(p_trip); END $$;

DROP FUNCTION IF EXISTS trip_private.pick_weekly_prompt(uuid, integer);

-- Test Lab: trip time zone + host check-in
DO $do$ DECLARE d text; o text; BEGIN
 SELECT pg_get_functiondef('trip_private.lab_extra(uuid,text,text)'::regprocedure) INTO d; o := d;
 d := replace(d, 'ELSIF p_action = ''invite'' THEN', 'ELSIF p_action = ''tz'' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = coalesce(nullif(p_arg,''''),''Asia/Bangkok'')) THEN RAISE EXCEPTION ''Unknown time zone''; END IF;
    UPDATE public.trips SET trip_timezone = coalesce(nullif(p_arg,''''),''Asia/Bangkok'') WHERE id=p_trip;
    RETURN ''Trip time zone: '' || coalesce(nullif(p_arg,''''),''Asia/Bangkok'') || '' · trip-day today is '' || trip_private.trip_today(p_trip);
  ELSIF p_action = ''checkin'' THEN
    UPDATE public.game_nights SET host_checked_in_at = now() WHERE trip_id=p_trip AND week_number = (SELECT min(week_number) FROM public.game_nights WHERE trip_id=p_trip AND starts_at > now() - interval ''3 hours'');
    IF NOT FOUND THEN RAISE EXCEPTION ''No upcoming game night''; END IF;
    RETURN ''The host checked in — no -5 for this night'';
  ELSIF p_action = ''invite'' THEN');
 IF d = o THEN RAISE EXCEPTION 'lab patch failed'; END IF;
 EXECUTE d;
END $do$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA trip_private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_trip_timezone(uuid,text), trip_private.host_check_in(uuid,integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_trip_timezone(uuid,text), public.host_check_in(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_trip_timezone(uuid,text), public.host_check_in(uuid,integer) TO authenticated;
