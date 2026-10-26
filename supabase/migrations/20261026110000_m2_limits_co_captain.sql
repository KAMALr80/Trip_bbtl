-- M2-13 server-side limits and M2-10 Co-Captain powers.
-- rollback: re-apply the previous definitions from supabase/migrations/00000000000000_baseline.sql;
--   DROP TRIGGER trips_room_rules ON public.trips; DROP TRIGGER trip_members_crew_size ON public.trip_members;
--   DROP TRIGGER call_nights_limit ON public.call_nights; DROP FUNCTION trip_private.check_trip_rules(),
--   trip_private.check_crew_size(), trip_private.check_call_nights(), trip_private.mark_arrived(uuid), public.mark_arrived(uuid).
--   manage_trip_member is replaced too (Co-Captain may remove players); re-create trigger
--   trip_members_seat_cap and the old seat_cap() from the baseline.

-- ---------------------------------------------------------------------------------------------
-- M2-13: every trip write is checked against its room's rules (trip_private.room_rules), whatever
-- function made it. Archived trips (rules_version 1) keep the rules they were played under.
CREATE FUNCTION trip_private.check_trip_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r jsonb := trip_private.room_rules(NEW.room); v_days int := NEW.end_date - NEW.start_date + 1;
BEGIN
  IF NEW.rules_version = 1 THEN RETURN NEW; END IF;
  IF v_days > (r#>>'{mainDays,max}')::int AND (r#>>'{mainDays,max}')::int = 14 THEN
    RAISE EXCEPTION 'Trips can be up to 14 days. For a longer trip, start a second one.' USING ERRCODE = '22023';
  END IF;
  IF v_days < (r#>>'{mainDays,min}')::int OR v_days > (r#>>'{mainDays,max}')::int THEN
    RAISE EXCEPTION 'This room runs % to % days', r#>>'{mainDays,min}', r#>>'{mainDays,max}' USING ERRCODE = '22023';
  END IF;
  IF NOT (r->'modes') ? NEW.play_mode THEN
    RAISE EXCEPTION 'That way of playing isn''t available in this room' USING ERRCODE = '22023';
  END IF;
  IF NEW.preflight_days > (r#>>'{preFlightDays,max}')::int THEN
    RAISE EXCEPTION 'Pre-Flight can be up to % days', r#>>'{preFlightDays,max}' USING ERRCODE = '22023';
  END IF;
  IF NEW.preflight_skipped AND NOT (r#>>'{preFlightDays,skippable}')::boolean THEN
    RAISE EXCEPTION 'This room has no Pre-Flight to skip' USING ERRCODE = '22023';
  END IF;
  IF cardinality(NEW.focuses) > (r->>'maxFocuses')::int THEN
    RAISE EXCEPTION 'Pick up to % focuses', r->>'maxFocuses' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trip_private.check_trip_rules() FROM PUBLIC;
CREATE TRIGGER trips_room_rules
  BEFORE INSERT OR UPDATE OF room, play_mode, start_date, end_date, preflight_days, preflight_skipped, focuses
  ON public.trips FOR EACH ROW EXECUTE FUNCTION trip_private.check_trip_rules();

-- Crew size counts approved and pending players (R-005, R-901): 12, or 4 for Window Seat. Solo and
-- off-app rooms have the Captain only (off-app names never become accounts, R-006).
CREATE FUNCTION trip_private.check_crew_size() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t record; v_limit int; v_count int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.trip_id = NEW.trip_id THEN RETURN NEW; END IF;  -- pending -> approved adds no one
  SELECT room, play_mode, rules_version INTO t FROM public.trips WHERE id = NEW.trip_id FOR UPDATE;
  IF NOT FOUND OR t.rules_version = 1 THEN RETURN NEW; END IF;
  v_limit := CASE t.play_mode WHEN 'crew' THEN (trip_private.room_rules(t.room)->>'maxCrew')::int ELSE 1 END;
  SELECT count(*) INTO v_count FROM public.trip_members
  WHERE trip_id = NEW.trip_id AND user_id <> NEW.user_id AND status IN ('approved', 'pending');
  IF v_count >= v_limit THEN
    RAISE EXCEPTION '%', CASE WHEN v_limit = 1 THEN 'This room is played by its Captain only'
                         ELSE format('This crew is full (%s players max)', v_limit) END USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trip_private.check_crew_size() FROM PUBLIC;
CREATE TRIGGER trip_members_crew_size BEFORE INSERT OR UPDATE OF trip_id ON public.trip_members
  FOR EACH ROW EXECUTE FUNCTION trip_private.check_crew_size();

-- The older seat cap (6 seats unless the paid "extra seats" add-on, 12 with it) was a price tier.
-- Payments are Phase 2 and the deck's crew is 12 (R-005), so the room limit above replaces it;
-- seat_cap() now reports that limit to the screens that show seats.
DROP TRIGGER trip_members_seat_cap ON public.trip_members;
CREATE OR REPLACE FUNCTION trip_private.seat_cap(p_trip uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE t.play_mode WHEN 'crew' THEN (trip_private.room_rules(t.room)->>'maxCrew')::int ELSE 1 END
  FROM public.trips t WHERE t.id = p_trip
$$;

-- Call nights: up to the room's maximum (4, R-204).
CREATE FUNCTION trip_private.check_call_nights() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_max int; v_count int;
BEGIN
  SELECT (trip_private.room_rules(room)->>'maxCallNights')::int INTO v_max FROM public.trips WHERE id = NEW.trip_id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.call_nights WHERE trip_id = NEW.trip_id AND id <> NEW.id;
  IF v_count >= coalesce(v_max, 0) THEN
    RAISE EXCEPTION 'Up to % call nights per trip', coalesce(v_max, 0) USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trip_private.check_call_nights() FROM PUBLIC;
CREATE TRIGGER call_nights_limit BEFORE INSERT ON public.call_nights
  FOR EACH ROW EXECUTE FUNCTION trip_private.check_call_nights();

-- ---------------------------------------------------------------------------------------------
-- M2-10: the Co-Captain has every Captain power except deleting the trip and handing over the
-- Captaincy (R-208). Still Captain-only: delete_trip, step_down, birthday/age data
-- (member_age_ranges, inspiration_age_gate), teen invites and approving players under 18 (age
-- tiers, Q12), and the dormant payment and cost functions. The definitions below are the
-- baseline's with is_captain -> is_leader.
CREATE OR REPLACE FUNCTION public.guide_propose(p_trip uuid, p_kind text, p_body text, p_photo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_cap boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND play_arrangement IS NOT NULL) OR NOT trip_private.is_window_room(p_trip) THEN RAISE EXCEPTION 'Guides are for Window Seat rooms'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'Only the crew can add to the guide'; END IF;
  IF p_kind NOT IN ('photo','review','tip') OR length(trim(coalesce(p_body,''))) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Add a short caption, review or tip'; END IF;
  IF p_photo IS NOT NULL AND p_photo NOT LIKE p_trip::text || '/' || auth.uid()::text || '/%' THEN RAISE EXCEPTION 'Upload the photo again'; END IF;
  IF p_kind='photo' AND p_photo IS NULL THEN RAISE EXCEPTION 'Choose a photo'; END IF;
  IF (SELECT count(*) FROM public.window_guide_items WHERE trip_id=p_trip AND author_id=auth.uid() AND created_at>now()-interval '1 day')>=30 THEN RAISE EXCEPTION 'Daily limit reached'; END IF;
  v_cap := trip_private.is_leader(p_trip);
  INSERT INTO public.window_guide_items(trip_id,author_id,kind,body,photo_path,status,position)
  VALUES (p_trip,auth.uid(),p_kind,trim(p_body),p_photo,CASE WHEN v_cap THEN 'approved' ELSE 'proposed' END,
    coalesce((SELECT max(position)+1 FROM public.window_guide_items WHERE trip_id=p_trip),0)) RETURNING id INTO v_id;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.guide_publish(p_trip uuid, p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT trip_private.is_leader(p_trip) OR NOT trip_private.is_window_room(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can publish the guide'; END IF;
  UPDATE public.trips SET guide_published_at=CASE WHEN p_on THEN now() ELSE NULL END WHERE id=p_trip AND play_arrangement IS NOT NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.guide_review(p_item uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE it public.window_guide_items%ROWTYPE; other public.window_guide_items%ROWTYPE;
BEGIN
  SELECT * INTO it FROM public.window_guide_items WHERE id=p_item FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_leader(it.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can edit the guide'; END IF;
  IF p_action='approve' THEN UPDATE public.window_guide_items SET status='approved' WHERE id=it.id AND trip_id=it.trip_id;
  ELSIF p_action='remove' THEN UPDATE public.window_guide_items SET status='removed' WHERE id=it.id AND trip_id=it.trip_id;
  ELSIF p_action IN ('up','down') THEN
    SELECT * INTO other FROM public.window_guide_items WHERE trip_id=it.trip_id AND status='approved' AND id<>it.id
      AND CASE WHEN p_action='up' THEN position<=it.position ELSE position>=it.position END
      ORDER BY CASE WHEN p_action='up' THEN -position ELSE position END LIMIT 1;
    IF FOUND THEN
      UPDATE public.window_guide_items SET position=other.position WHERE id=it.id AND trip_id=it.trip_id;
      UPDATE public.window_guide_items SET position=it.position + CASE WHEN other.position=it.position THEN (CASE WHEN p_action='up' THEN 1 ELSE -1 END) ELSE 0 END WHERE id=other.id AND trip_id=it.trip_id;
    END IF;
  ELSE RAISE EXCEPTION 'Unknown action'; END IF;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.approve_member(p_trip uuid, p_user uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can approve members'; END IF;
 IF p_user=auth.uid() THEN RAISE EXCEPTION 'You can''t approve yourself'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='pending') THEN RAISE EXCEPTION 'That request is no longer waiting'; END IF;
 IF p_approve THEN
  IF coalesce(trip_private.age_of(p_user),0) < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_user) THEN
    IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can approve players under 18'; END IF;
    IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND vibe='party') THEN RAISE EXCEPTION 'Party trips aren''t open to players under 18'; END IF;
    IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND season_rule='a2c') THEN
      UPDATE public.trips SET vibe='family', has_minors=true WHERE id=p_trip;
      UPDATE public.trip_adult_settings SET enabled=false WHERE trip_id=p_trip;
    END IF;
  END IF;
  UPDATE public.trip_members SET status='approved', approved_at=now() WHERE trip_id=p_trip AND user_id=p_user;
  DELETE FROM trip_private.trip_removals WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.apply_join_baseline(p_trip, p_user);
  INSERT INTO public.beta_access(user_id, source) VALUES (p_user, 'invite') ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; END IF; END $function$
;

CREATE OR REPLACE FUNCTION trip_private.at_home_move_call(p_activity uuid, p_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a public.at_home_activities; t public.trips; BEGIN
  SELECT * INTO a FROM public.at_home_activities WHERE id=p_activity;
  IF NOT FOUND OR NOT trip_private.is_leader(a.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can move a call'; END IF;
  IF a.starts_at IS NULL THEN RAISE EXCEPTION 'This activity has no call time'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=a.trip_id;
  IF (p_at AT TIME ZONE t.home_timezone)::date NOT BETWEEN t.start_date AND t.end_date THEN RAISE EXCEPTION 'Keep it inside the experience dates'; END IF;
  UPDATE public.at_home_activities SET starts_at=p_at, day_date=(p_at AT TIME ZONE t.home_timezone)::date, updated_at=now() WHERE id=a.id;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.cancel_trip_invite(p_invite uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v uuid; BEGIN SELECT trip_id INTO v FROM public.trip_invites WHERE id=p_invite;
 IF v IS NULL OR NOT trip_private.is_leader(v) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 UPDATE public.trip_invites SET cancelled_at=now() WHERE id=p_invite AND used_at IS NULL AND cancelled_at IS NULL; END $function$
;

CREATE OR REPLACE FUNCTION trip_private.create_trip_invite(p_trip uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tok text := ''; bytes bytea := extensions.gen_random_bytes(10); i int; BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can invite'; END IF;
 IF (SELECT count(*) FROM public.trip_invites WHERE trip_id=p_trip AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()) >= 50 THEN RAISE EXCEPTION 'That''s 50 open invites — cancel some first'; END IF;
 FOR i IN 0..9 LOOP tok := tok || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', get_byte(bytes,i) % 24 + 1, 1); END LOOP;
 INSERT INTO public.trip_invites(token,trip_id,created_by) VALUES (tok,p_trip,auth.uid());
 RETURN tok; END $function$
;

CREATE OR REPLACE FUNCTION trip_private.culture_switch_group(p_exp uuid, p_trip uuid, p_format text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE e public.culture_experiences; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
 IF NOT FOUND OR e.creator_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Only the person who made this experience can switch it'; END IF;
 IF coalesce(e.play_mode,'group') <> 'solo' THEN RAISE EXCEPTION 'This experience is already played with others'; END IF;
 IF e.started_at IS NOT NULL OR e.finished_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.solo_quests q WHERE q.experience_id=p_exp AND (q.opened_at IS NOT NULL OR q.finished_at IS NOT NULL)) THEN
   RAISE EXCEPTION 'This experience has already started, so it can''t switch to playing with others';
 END IF;
 IF p_trip IS NULL OR NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.id=p_trip AND NOT coalesce(t.is_sandbox,false))
    OR NOT trip_private.is_leader(p_trip) THEN
   RAISE EXCEPTION 'Pick a trip where you are the Captain or Co-Captain';
 END IF;
 IF e.track='home' THEN
   IF p_format NOT IN ('two_nights','finale_only') THEN RAISE EXCEPTION 'Pick a finale format'; END IF;
   IF p_format='two_nights' AND e.days < 4 THEN RAISE EXCEPTION 'Two game nights need 4 or more days'; END IF;
 END IF;
 UPDATE public.culture_experiences
   SET play_mode='group', traveler_types='{}', trip_id=p_trip,
       finale_format=CASE WHEN e.track='home' THEN p_format ELSE NULL END, updated_at=now()
 WHERE id=p_exp AND creator_id=uid;
 UPDATE public.solo_quests
   SET presentation=CASE WHEN e.track='home' THEN 'at_home_finale' ELSE 'trip_meetup' END, updated_at=now()
 WHERE experience_id=p_exp AND user_id=uid AND presentation='solo_guide';
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.edit_trip(p_trip uuid, p_name text, p_destination text, p_start_date date, p_end_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can edit trip details'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100 OR length(trim(coalesce(p_destination,''))) NOT BETWEEN 1 AND 120 OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN RAISE EXCEPTION 'Check your trip details'; END IF;
 UPDATE public.trips SET name=trim(p_name),destination=trim(p_destination),start_date=p_start_date,end_date=p_end_date WHERE id=p_trip;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.home_day_schedule(p_trip uuid, p_day date, p_time time without time zone, p_all boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.trips; BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set session times'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.kind NOT IN ('at_home','cultural_inspiration') OR p_day NOT BETWEEN t.start_date AND t.end_date OR p_time IS NULL THEN RAISE EXCEPTION 'Choose an experience day and time'; END IF;
 IF p_all THEN
   UPDATE public.home_day_sessions SET starts_at=(day_date+p_time) AT TIME ZONE t.home_timezone WHERE trip_id=p_trip AND step='card' AND starts_at>now();
 ELSE
   UPDATE public.home_day_sessions SET starts_at=(p_day+p_time) AT TIME ZONE t.home_timezone WHERE trip_id=p_trip AND day_date=p_day AND step='card' AND starts_at>now();
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'This session has already started'; END IF;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.reset_trip_code(p_trip uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_code text; attempt int; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can reset the join code'; END IF;
 FOR attempt IN 1..15 LOOP
  BEGIN
   new_code := public.new_trip_code();
   UPDATE public.trips SET join_code=new_code WHERE id=p_trip AND join_code<>new_code;
   IF FOUND THEN
     INSERT INTO public.trip_role_changes(trip_id, role, reason, actor) VALUES (p_trip, 'join_settings', 'Join code reset', auth.uid());
     RETURN new_code; END IF;
  EXCEPTION WHEN unique_violation THEN IF attempt=15 THEN RAISE; END IF;
  END;
 END LOOP;
 RAISE EXCEPTION 'Could not reset the code';
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_carry_on_meetup(p_trip uuid, p_at timestamp with time zone, p_place text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE t public.trips; BEGIN IF NOT trip_private.is_leader(p_trip) OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can schedule the meet-up'; END IF; SELECT * INTO t FROM public.trips WHERE id=p_trip; IF t.kind='at_home' OR p_at IS NULL OR p_place IS NULL OR length(trim(p_place)) NOT BETWEEN 2 AND 160 OR (p_at AT TIME ZONE t.trip_timezone)::date NOT BETWEEN t.start_date AND t.end_date THEN RAISE EXCEPTION 'Choose a time and place during the Trip'; END IF; IF NOT EXISTS(SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND NOT n.skipped HAVING p_at>max(n.starts_at)+interval '3 hours 30 minutes') THEN RAISE EXCEPTION 'Schedule the meet-up after Final Call Night'; END IF; INSERT INTO public.season_settings(trip_id,season,carry_on_meetup_at,carry_on_meetup_place) VALUES(p_trip,'trip',p_at,trim(p_place)) ON CONFLICT(trip_id,season) DO UPDATE SET carry_on_meetup_at=excluded.carry_on_meetup_at,carry_on_meetup_place=excluded.carry_on_meetup_place WHERE season_settings.trip_id=p_trip AND season_settings.season='trip'; END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_home_day_place(p_trip uuid, p_day date, p_place text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set the meeting place'; END IF;
 IF char_length(coalesce(p_place,'')) > 80 THEN RAISE EXCEPTION 'Place must be 80 characters or less'; END IF;
 UPDATE public.home_day_sessions SET place=nullif(trim(p_place),'') WHERE trip_id=p_trip AND day_date=p_day AND starts_at>now() AND step='card';
 IF NOT FOUND THEN RAISE EXCEPTION 'This Game Day can no longer be changed'; END IF;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_home_ready_start(p_trip uuid, p_start date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.trips; BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set Get Ready'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.kind NOT IN ('at_home','cultural_inspiration') OR p_start IS NULL OR p_start < (now() AT TIME ZONE t.home_timezone)::date OR p_start > t.start_date-1 THEN RAISE EXCEPTION 'Choose a Get Ready date before Day 1'; END IF;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_join_controls(p_trip uuid, p_locked boolean, p_max integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o public.trips%ROWTYPE; BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Captain or Co-Captain only'; END IF;
  IF p_max IS NOT NULL AND (p_max < 2 OR p_max > 40) THEN RAISE EXCEPTION 'Max squad size must be 2 to 40'; END IF;
  SELECT * INTO o FROM public.trips WHERE id=p_trip FOR UPDATE;
  UPDATE public.trips SET join_locked=coalesce(p_locked,join_locked), max_squad=coalesce(p_max,max_squad) WHERE id=p_trip;
  IF p_locked IS NOT NULL AND p_locked <> o.join_locked THEN
    INSERT INTO public.trip_role_changes(trip_id, role, reason, actor) VALUES (p_trip, 'join_settings', CASE WHEN p_locked THEN 'Joining locked' ELSE 'Joining unlocked' END, auth.uid()); END IF;
  IF p_max IS NOT NULL AND p_max <> o.max_squad THEN
    INSERT INTO public.trip_role_changes(trip_id, role, reason, actor) VALUES (p_trip, 'join_settings', 'Max squad size '||o.max_squad||' → '||p_max, auth.uid()); END IF;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_preflight_a2c(p_trip uuid, p_start date, p_weekday integer, p_time time without time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.trips; today_local date; final_day date; first_day date; first_at timestamptz; call_at timestamptz; total integer:=0;
BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set Pre-Flight'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.season_rule<>'a2c' OR t.kind<>'trip' THEN RAISE EXCEPTION 'This room uses its original plan'; END IF;
 today_local:=(now() AT TIME ZONE t.home_timezone)::date;
 IF p_time IS NULL OR p_weekday NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'Choose a night and time'; END IF;
 IF t.start_date<=today_local THEN RETURN 0; END IF;
 IF EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip) THEN RAISE EXCEPTION 'This Trip already has game nights'; END IF;
 IF t.start_date=today_local+1 THEN
   call_at:=(today_local+p_time) AT TIME ZONE t.home_timezone;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   IF call_at >= (t.start_date::timestamp AT TIME ZONE t.home_timezone) THEN RAISE EXCEPTION 'No call time remains before departure'; END IF;
   UPDATE public.trips SET game_start=today_local,game_plan='quick_start' WHERE id=p_trip AND season_rule='a2c';
 ELSE
   IF p_start IS NULL OR p_start<greatest(today_local,t.start_date-10) OR p_start>t.start_date-2 THEN RAISE EXCEPTION 'Choose a date within ten days of departure'; END IF;
   final_day:=t.start_date-2;
   call_at:=(final_day+p_time) AT TIME ZONE t.home_timezone;
   IF call_at<=now() THEN call_at:=now()+interval '10 minutes'; END IF;
   IF final_day-p_start>=6 THEN
     first_day:=p_start+((p_weekday-extract(dow FROM p_start)::int+7)%7);
     IF first_day>=final_day THEN first_day:=p_start+greatest(1,(final_day-p_start)/2); END IF;
     first_at:=(first_day+p_time) AT TIME ZONE t.home_timezone;
     IF first_at<=now() THEN first_at:=now()+interval '10 minutes'; END IF;
     IF first_at<call_at THEN
       INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,1,first_at,auth.uid());
       total:=1;
     END IF;
   END IF;
   UPDATE public.trips SET game_start=p_start,game_plan='recommended' WHERE id=p_trip AND season_rule='a2c';
 END IF;
 INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(p_trip,total+1,call_at,auth.uid());
 RETURN total+1;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_preflight_start(p_trip uuid, p_start date, p_plan text, p_weekday integer, p_time time without time zone, p_every integer, p_count integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.trips; v_today date; v_count int;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can set Pre-Flight'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR t.kind='at_home' THEN RAISE EXCEPTION 'Choose a real trip'; END IF;
 v_today := (now() AT TIME ZONE t.home_timezone)::date;
 IF p_start IS NULL OR p_start < v_today OR p_start > t.start_date-2 THEN RAISE EXCEPTION 'Choose a Pre-Flight date before departure'; END IF;
 IF p_plan NOT IN ('recommended','short','custom') OR p_weekday NOT BETWEEN 0 AND 6 OR p_time IS NULL THEN RAISE EXCEPTION 'Choose a game plan, day and time'; END IF;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
 SELECT trip_private.apply_game_plan(p_trip,p_plan,p_weekday,p_time,p_start,p_every,p_count) INTO v_count;
 UPDATE public.trips SET game_start=p_start WHERE id=p_trip;
 RETURN v_count;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_trip_access(p_trip uuid, p_code_enabled boolean, p_require_approval boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Captain or Co-Captain only'; END IF;
 UPDATE public.trips SET join_code_enabled=coalesce(p_code_enabled,join_code_enabled), require_approval=coalesce(p_require_approval,require_approval) WHERE id=p_trip; END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_trip_minors(p_trip uuid, p_has boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE t public.trips;
BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Captain or Co-Captain only'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF t.season_rule IS DISTINCT FROM 'a2c' THEN RAISE EXCEPTION 'This setting is for new trips'; END IF;
 IF coalesce(p_has,false) THEN
   UPDATE public.trips SET vibe='family', has_minors=true WHERE id=p_trip;
   UPDATE public.trip_adult_settings SET enabled=false WHERE trip_id=p_trip;
 ELSE
   IF trip_private.has_teen_member(p_trip) THEN RAISE EXCEPTION 'A player under 18 is in this trip'; END IF;
   UPDATE public.trips SET has_minors=false WHERE id=p_trip;
 END IF;
END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_trip_timezone(p_trip uuid, p_tz text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can change the trip time zone'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN RAISE EXCEPTION 'Pick a valid time zone'; END IF;
 UPDATE public.trips SET trip_timezone = p_tz WHERE id = p_trip; END $function$
;

CREATE OR REPLACE FUNCTION trip_private.set_trip_vibe(p_trip uuid, p_vibe text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Captain or Co-Captain only'; END IF;
 IF p_vibe NOT IN ('family','chill','party') THEN RAISE EXCEPTION 'Pick Family, Chill or Party'; END IF;
 IF p_vibe<>'family' AND EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND has_minors) THEN RAISE EXCEPTION 'MINORS_FAMILY: Trips with players under 18 use Family content only'; END IF;
 UPDATE public.trips SET vibe=p_vibe WHERE id=p_trip;
 INSERT INTO public.trip_adult_settings(trip_id,enabled) VALUES(p_trip,p_vibe='party') ON CONFLICT(trip_id) DO UPDATE SET enabled=excluded.enabled; END $function$
;


CREATE OR REPLACE FUNCTION trip_private.manage_trip_member(p_trip uuid, p_user uuid, p_action text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ DECLARE actor_role text; target_role text; old_co uuid; v_age int; is_bot boolean; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT role INTO actor_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='approved';
 SELECT role INTO target_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='approved';
 IF actor_role IS NULL OR actor_role='player' OR target_role IS NULL OR p_user=auth.uid() THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can manage members'; END IF;
 -- The Co-Captain can remove players (R-210); naming the Co-Captain and passing the crown stay with the Captain (R-208).
 IF actor_role='co_captain' AND (p_action<>'remove' OR target_role<>'player') THEN RAISE EXCEPTION 'Only the Captain can do that'; END IF;
 is_bot := EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_user);
 v_age := coalesce(trip_private.age_of(p_user),0);
 IF p_action IN ('promote','promote_under21') THEN
  IF target_role='co_captain' THEN RETURN; END IF;
  IF NOT is_bot AND v_age < 18 THEN RAISE EXCEPTION 'Players under 18 can''t be Co-Captain'; END IF;
  IF NOT is_bot AND v_age < 21 AND p_action <> 'promote_under21' THEN RAISE EXCEPTION 'UNDER_21: Confirm first — this player is under 21.'; END IF;
  SELECT user_id INTO old_co FROM public.trip_members WHERE trip_id=p_trip AND role='co_captain' LIMIT 1;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role='co_captain';
  IF old_co IS NOT NULL THEN PERFORM trip_private.log_role(p_trip, old_co, NULL, 'co_captain', 'replaced'); END IF;
  UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.log_role(p_trip, old_co, p_user, 'co_captain', CASE WHEN p_action='promote_under21' THEN 'picked by Captain (under 21, confirmed)' ELSE 'picked by Captain' END);
 ELSIF p_action='demote' THEN
  IF target_role<>'co_captain' THEN RETURN; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.log_role(p_trip, p_user, NULL, 'co_captain', 'removed by Captain');
 ELSIF p_action='remove' THEN
  DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; INSERT INTO trip_private.trip_removals(trip_id,user_id) VALUES (p_trip,p_user) ON CONFLICT DO NOTHING;
  PERFORM trip_private.log_role(p_trip, p_user, NULL, target_role, 'removed from trip');
 ELSIF p_action='pass_crown' THEN
  IF v_age < 21 AND NOT is_bot THEN RAISE EXCEPTION 'Captains are 21+. Pick someone 21 or older.'; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=auth.uid();
  UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.log_role(p_trip, auth.uid(), p_user, 'captain', 'handed off');
 ELSE RAISE EXCEPTION 'Not allowed'; END IF;
END $$;

-- "We've arrived" (R-103): the Captain or Co-Captain, once, while the trip is in Takeoff.
CREATE FUNCTION trip_private.mark_arrived(p_trip uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_phase text; v_at timestamptz := now();
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can tap "We''ve arrived"'; END IF;
  IF (SELECT trip_private.room_rules(room)->>'tripSeasonStart' FROM public.trips WHERE id = p_trip) <> 'arrival_button' THEN
    RAISE EXCEPTION 'This room starts on its first experience day';
  END IF;
  IF (SELECT arrived_at FROM public.trips WHERE id = p_trip) IS NOT NULL THEN RAISE EXCEPTION 'Arrival was already confirmed'; END IF;
  SELECT phase INTO v_phase FROM trip_private.trip_phase(p_trip, v_at);
  IF v_phase IS DISTINCT FROM 'takeoff' THEN RAISE EXCEPTION '"We''ve arrived" opens on takeoff day, until Trip Season starts'; END IF;
  UPDATE public.trips SET arrived_at = v_at, arrived_by = auth.uid() WHERE id = p_trip AND arrived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Arrival was already confirmed'; END IF;
  RETURN v_at;
END $$;
REVOKE ALL ON FUNCTION trip_private.mark_arrived(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.mark_arrived(uuid) TO authenticated, service_role;
CREATE FUNCTION public.mark_arrived(p_trip uuid) RETURNS timestamptz
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.mark_arrived(p_trip) $$;
REVOKE ALL ON FUNCTION public.mark_arrived(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_arrived(uuid) TO authenticated, service_role;

-- The older button calls the same rule.
CREATE OR REPLACE FUNCTION trip_private.confirm_departure(p_trip uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT trip_private.mark_arrived(p_trip); $$;
