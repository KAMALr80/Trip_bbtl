ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS has_minors boolean NOT NULL DEFAULT false;

-- Under-18 trips: Family only (new rooms; existing rooms are never reclassified because has_minors defaults false)
CREATE OR REPLACE FUNCTION trip_private.trips_minor_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NEW.has_minors AND NEW.vibe IS DISTINCT FROM 'family' THEN
   RAISE EXCEPTION 'MINORS_FAMILY: Trips with players under 18 use Family content only';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trips_minor_guard ON public.trips;
CREATE TRIGGER trips_minor_guard BEFORE INSERT OR UPDATE OF vibe, has_minors ON public.trips FOR EACH ROW EXECUTE FUNCTION trip_private.trips_minor_guard();

CREATE OR REPLACE FUNCTION trip_private.adult_settings_minor_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF NEW.enabled AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id=NEW.trip_id AND t.has_minors) THEN NEW.enabled := false; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adult_settings_minor_guard ON public.trip_adult_settings;
CREATE TRIGGER adult_settings_minor_guard BEFORE INSERT OR UPDATE ON public.trip_adult_settings FOR EACH ROW EXECUTE FUNCTION trip_private.adult_settings_minor_guard();

CREATE OR REPLACE FUNCTION trip_private.has_teen_member(p_trip uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.status IN ('approved','pending') AND trip_private.age_of(m.user_id) BETWEEN 0 AND 17 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots b WHERE b.user_id=m.user_id)) $$;

CREATE OR REPLACE FUNCTION trip_private.set_trip_minors(p_trip uuid, p_has boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips;
BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF t.season_rule IS DISTINCT FROM 'a2c' THEN RAISE EXCEPTION 'This setting is for new trips'; END IF;
 IF coalesce(p_has,false) THEN
   UPDATE public.trips SET vibe='family', has_minors=true WHERE id=p_trip;
   UPDATE public.trip_adult_settings SET enabled=false WHERE trip_id=p_trip;
 ELSE
   IF trip_private.has_teen_member(p_trip) THEN RAISE EXCEPTION 'A player under 18 is in this trip'; END IF;
   UPDATE public.trips SET has_minors=false WHERE id=p_trip;
 END IF;
END $$;
REVOKE ALL ON FUNCTION trip_private.set_trip_minors(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_trip_minors(uuid,boolean) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.set_trip_minors(p_trip uuid, p_has boolean) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_trip_minors(p_trip, p_has) $$;
REVOKE ALL ON FUNCTION public.set_trip_minors(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_trip_minors(uuid,boolean) TO authenticated;

-- Vibe edits respect has_minors (trigger also enforces)
CREATE OR REPLACE FUNCTION trip_private.set_trip_vibe(p_trip uuid, p_vibe text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 IF p_vibe NOT IN ('family','chill','party') THEN RAISE EXCEPTION 'Pick Family, Chill or Party'; END IF;
 IF p_vibe<>'family' AND EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND has_minors) THEN RAISE EXCEPTION 'MINORS_FAMILY: Trips with players under 18 use Family content only'; END IF;
 UPDATE public.trips SET vibe=p_vibe WHERE id=p_trip;
 INSERT INTO public.trip_adult_settings(trip_id,enabled) VALUES(p_trip,p_vibe='party') ON CONFLICT(trip_id) DO UPDATE SET enabled=excluded.enabled; END $$;

-- Adult content never in under-18 trips
CREATE OR REPLACE FUNCTION trip_private.is_approved_adult(p_trip uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT auth.uid()=p_user AND EXISTS (SELECT 1 FROM public.trips t JOIN public.trip_adult_approvals a ON a.trip_id=t.id AND a.user_id=p_user WHERE t.id=p_trip AND t.vibe='party' AND NOT t.has_minors AND trip_private.is_trip_member(p_trip,p_user) AND coalesce(trip_private.age_of(p_user),0)>=21 AND NOT coalesce((SELECT no_alcohol FROM public.player_private WHERE user_id=p_user),false)) $$;
CREATE OR REPLACE FUNCTION trip_private.adult_badge(p_trip uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT trip_private.is_trip_member(p_trip,auth.uid()) AND EXISTS (SELECT 1 FROM public.trips t JOIN public.trip_adult_approvals a ON a.trip_id=t.id AND a.user_id=p_user WHERE t.id=p_trip AND t.vibe='party' AND NOT t.has_minors AND trip_private.is_trip_member(p_trip,p_user) AND coalesce(trip_private.age_of(p_user),0)>=21) $$;

-- Sign-up: 13–17 may sign up themselves (age recorded); under 13 still blocked
CREATE OR REPLACE FUNCTION trip_private.guard_auth_signup_age() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
DECLARE v_dob date; v_text text; v_age int;
BEGIN
 IF NEW.id IS NULL OR NEW.created_at IS NULL THEN RETURN NEW; END IF;
 IF coalesce(NEW.raw_app_meta_data->>'sandbox_bot','') = 'true' THEN RETURN NEW; END IF;
 IF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.raw_user_meta_data->>'legal_version' IN ('2026-10-02','2026-10-03') THEN
   v_text := NEW.raw_user_meta_data->>'birthday';
   IF v_text IS NULL OR v_text !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'A birthday is required to sign up'; END IF;
   BEGIN v_dob := v_text::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Check your birthday'; END;
   IF v_dob > current_date OR v_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your birthday'; END IF;
   v_age := extract(year FROM age(current_date,v_dob))::int;
   IF v_age < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
 ELSIF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.created_at >= timestamptz '2026-10-02 22:00:00+00' THEN
   RAISE EXCEPTION 'Please provide your birthday and accept the current Terms';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION trip_private.legal_dob_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF auth.uid() IS NOT NULL THEN
 IF EXISTS (SELECT 1 FROM public.sandbox_bots b WHERE b.user_id = NEW.user_id) THEN RETURN NEW; END IF;
 IF NEW.user_id <> auth.uid() THEN RAISE EXCEPTION 'Not your birthday'; END IF;
 IF NOT trip_private.legal_current(NEW.user_id) THEN RAISE EXCEPTION 'Please agree to the current Terms before continuing'; END IF;
 IF extract(year FROM age(current_date, NEW.dob)) < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION trip_private.set_my_dob(p_dob date, p_agree boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm your birthday and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date,p_dob))::int;
 IF a < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your birthday is already saved; contact support for corrections'; END IF;
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 IF a >= 18 AND (SELECT public_launch FROM public.app_settings LIMIT 1) THEN INSERT INTO public.beta_access(user_id,source) VALUES(auth.uid(),'launch') ON CONFLICT DO NOTHING; END IF;
 RETURN trip_private.age_range(a);
END $$;

CREATE OR REPLACE FUNCTION trip_private.set_teen_dob(p_dob date, p_agree boolean, p_invite text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a int; inv public.trip_invites%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date,p_dob))::int;
 IF a < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
 IF a >= 18 THEN RETURN trip_private.set_my_dob(p_dob, p_agree); END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your birthday is already saved; contact support for corrections'; END IF;
 SELECT * INTO inv FROM public.trip_invites WHERE token=upper(trim(coalesce(p_invite,''))) FOR UPDATE;
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 IF FOUND AND inv.teen AND inv.guardian_confirmed_at IS NOT NULL AND inv.used_at IS NULL AND inv.cancelled_at IS NULL AND inv.expires_at > now() THEN
   INSERT INTO trip_private.teen_accounts(user_id,invite_id,trip_id) VALUES(auth.uid(),inv.id,inv.trip_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN trip_private.age_range(a);
END $$;

-- Join: teens may use a join code on new rooms; always pending; one trip only; legacy rooms keep the teen-invite rule
CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; v_count integer; v_approved integer; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; was_removed boolean := false; v_teen_invite boolean := false; BEGIN
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
    v_teen_invite := inv.teen AND inv.guardian_confirmed_at IS NOT NULL;
  ELSE
    SELECT * INTO t FROM public.trips WHERE join_code = v_code FOR UPDATE;
    IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
    IF NOT t.join_locked AND NOT t.join_code_enabled THEN RAISE EXCEPTION 'This trip''s join code is turned off. Ask your Captain for a personal invite link.'; END IF;
    was_removed := EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid());
  END IF;
  IF t.join_locked THEN RAISE EXCEPTION 'This trip isn''t taking new members right now'; END IF;
  IF v_age < 18 THEN
    IF NOT v_teen_invite AND t.season_rule IS DISTINCT FROM 'a2c' THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for a teen invite link.'; END IF;
    IF t.vibe='party' THEN RAISE EXCEPTION 'This trip isn''t open to players under 18'; END IF;
    IF EXISTS (SELECT 1 FROM public.trip_members m WHERE m.user_id=auth.uid()) THEN RAISE EXCEPTION 'Players under 18 can be in one trip at a time'; END IF;
  END IF;
  IF t.level='preview' AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION 'PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.'; END IF;
  SELECT count(*), count(*) FILTER (WHERE status='approved') INTO v_count, v_approved FROM public.trip_members WHERE trip_id = t.id;
  IF v_approved >= t.max_squad THEN RAISE EXCEPTION 'This squad is full'; END IF;
  IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
  IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
  v_status := CASE WHEN t.require_approval OR v_age < 21 OR was_removed THEN 'pending' ELSE 'approved' END;
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

-- Approving a teen into a new room switches it to Family / under-18 mode
CREATE OR REPLACE FUNCTION trip_private.approve_member(p_trip uuid, p_user uuid, p_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can approve members'; END IF;
 IF p_user=auth.uid() THEN RAISE EXCEPTION 'You can''t approve yourself'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='pending') THEN RAISE EXCEPTION 'That request is no longer waiting'; END IF;
 IF p_approve THEN
  IF coalesce(trip_private.age_of(p_user),0) < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_user) THEN
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
 ELSE DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; END IF; END $$;

-- Travel From Home: teen squad members can be Team-up partners; creators stay 18+
CREATE OR REPLACE FUNCTION trip_private.inspiration_age_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a int := coalesce(trip_private.age_of(NEW.creator_id),0); pa int; BEGIN
 IF a < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=NEW.creator_id) THEN RAISE EXCEPTION 'Posting experiences is for players 18 and older'; END IF;
 IF NEW.partner_id IS NOT NULL THEN
   pa := coalesce(trip_private.age_of(NEW.partner_id),0);
   IF pa < 13 OR (pa < 18 AND NOT (NEW.trip_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=NEW.trip_id AND m.user_id=NEW.partner_id AND m.status='approved'))) THEN
     RAISE EXCEPTION 'Team up partners under 18 must be in this trip''s squad'; END IF;
 END IF;
 NEW.captain_approved_at := CASE WHEN a >= 21 OR trip_private.is_captain(NEW.trip_id) THEN now() ELSE NULL END;
 RETURN NEW; END $$;

-- At Home creation needs a 21+ Captain
CREATE OR REPLACE FUNCTION trip_private.create_at_home_a2c(p_pack text, p_days integer, p_start date, p_vibe text, p_tz text, p_format text, p_place text DEFAULT NULL::text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; t public.trips; v_final timestamptz; v_mid date;
BEGIN
 IF coalesce(trip_private.age_of(auth.uid()),0)<21 THEN RAISE EXCEPTION 'Captains are 21+. Ask an adult in your squad to set this up.'; END IF;
 IF p_days NOT BETWEEN 2 AND 7 OR p_format NOT IN ('finale','two_nights') THEN RAISE EXCEPTION 'Choose 2–7 days and a finale format'; END IF;
 IF p_format='two_nights' AND p_days<4 THEN RAISE EXCEPTION 'Two game nights need at least four days'; END IF;
 IF length(trim(coalesce(p_place,''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Set a place for the finale'; END IF;
 v_id:=trip_private.create_at_home(p_pack,'d'||p_days::text,p_start,p_vibe,p_tz);
 SELECT * INTO t FROM public.trips WHERE id=v_id;
 v_final:=(t.end_date+time '19:00') AT TIME ZONE t.home_timezone;
 UPDATE public.trips SET season_rule='a2c',finale_format=p_format,finale_place=trim(p_place),finale_at=v_final,game_start=greatest(t.start_date-7,(now() AT TIME ZONE t.home_timezone)::date) WHERE id=v_id AND season_rule='legacy';
 IF p_format='two_nights' THEN
   v_mid:=t.start_date+(p_days/2)-1;
   INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_id,1,(v_mid+time '19:00') AT TIME ZONE t.home_timezone,auth.uid());
   INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_id,2,v_final,auth.uid());
 ELSE
   INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_id,1,v_final,auth.uid());
 END IF;
 RETURN v_id;
END $$;

-- Quest handouts in under-18 trips never involve photographing or recording strangers
CREATE OR REPLACE FUNCTION trip_private.a2c_quest_card(p_trip uuid, p_user uuid, p_kind text, p_drop integer, p_dest text)
 RETURNS TABLE(title text, mission_text text, backstory text, keywords text[], presentation_tag text, insight text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
 WITH available AS (
 SELECT sm.*,replace(sm.title,'{destination}',p_dest) AS filled_title,replace(sm.text,'{destination}',p_dest) AS filled_text,
 (SELECT count(*) FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND x.presentation_tag=sm.presentation_tag AND lower(btrim(x.title)) LIKE lower(btrim(replace(sm.title,'{destination}',p_dest)))||'%' ) AS prior_uses,
 (SELECT max(x.created_at) FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND x.presentation_tag=sm.presentation_tag AND lower(btrim(x.title)) LIKE lower(btrim(replace(sm.title,'{destination}',p_dest)))||'%') AS last_used
 FROM public.security_missions sm JOIN public.trips t ON t.id=p_trip
 WHERE t.season_rule='a2c' AND sm.trip_id IS NULL AND sm.kind=CASE WHEN p_kind='sealed' THEN 'checkin' ELSE 'home' END
 AND sm.presentation_tag=CASE WHEN p_kind='sealed' THEN 'video_call' WHEN t.kind='at_home' THEN 'at_home_finale' ELSE 'trip_meetup' END
 AND length(btrim(sm.insight))>12 AND sm.budget_note IS NOT NULL
 AND (sm.category NOT ILIKE '%adult%' OR (t.vibe='Party' AND NOT t.has_minors AND NOT trip_private.a2c_minor_trip(p_trip) AND trip_private.age_of(p_user)>=21))
 AND NOT ((t.has_minors OR trip_private.a2c_minor_trip(p_trip)) AND (coalesce(sm.text,'')||' '||coalesce(sm.title,'')) ~* '(stranger|passer|(photo|photograph|film|record|video|selfie)\w*\s+(with\s+|of\s+)?(a\s+|an\s+|the\s+)?(local|people|person|someone|vendor|crowd))')
 AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',p_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',p_dest)))))
 ), chosen AS (
 SELECT a.* FROM available a ORDER BY a.prior_uses ASC,a.last_used ASC NULLS FIRST,md5(a.id::text||p_trip::text||p_user::text||p_drop::text) LIMIT 1
 )
 SELECT CASE WHEN c.prior_uses=0 THEN c.filled_title ELSE c.filled_title||' · new angle '||(c.prior_uses+1)::text END,
 CASE WHEN c.prior_uses=0 THEN c.filled_text ELSE c.filled_text||' This time, choose a different verified example, compare it with the last one and tell the squad what changed. Flight remix '||(c.prior_uses+1)::text||'.' END,
 replace(c.backstory,'{destination}',p_dest),ARRAY(SELECT replace(k,'{destination}',p_dest) FROM unnest(c.keywords) k),c.presentation_tag,replace(c.insight,'{destination}',p_dest)
 FROM chosen c $function$;
REVOKE ALL ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.a2c_quest_card(uuid,uuid,text,integer,text) TO service_role;

-- Trip Season speed bonus: server-recorded first finish per person per released day
CREATE TABLE IF NOT EXISTS trip_private.trip_speed_finishes (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  user_id uuid NOT NULL,
  source text NOT NULL,
  revealed_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, day_date, user_id)
);
REVOKE ALL ON trip_private.trip_speed_finishes FROM PUBLIC, anon, authenticated;
GRANT ALL ON trip_private.trip_speed_finishes TO service_role;

CREATE OR REPLACE FUNCTION trip_private.record_speed_finish() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rel timestamptz;
BEGIN
 SELECT g.released_at INTO v_rel FROM public.trip_day_games g JOIN public.trips t ON t.id=g.trip_id
  WHERE g.trip_id=NEW.trip_id AND g.day_date=NEW.day_date AND t.season_rule='a2c' AND t.kind='trip' AND coalesce(g.tag,'')<>'Travel' AND g.released_at IS NOT NULL AND g.released_at <= now();
 IF v_rel IS NOT NULL THEN
   INSERT INTO trip_private.trip_speed_finishes(trip_id,day_date,user_id,source,revealed_at,finished_at)
   VALUES (NEW.trip_id,NEW.day_date,NEW.user_id,TG_TABLE_NAME,v_rel,now()) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS record_speed_finish ON public.quest_posts;
CREATE TRIGGER record_speed_finish AFTER INSERT ON public.quest_posts FOR EACH ROW EXECUTE FUNCTION trip_private.record_speed_finish();
DROP TRIGGER IF EXISTS record_speed_finish ON public.bingo_marks;
CREATE TRIGGER record_speed_finish AFTER INSERT ON public.bingo_marks FOR EACH ROW EXECUTE FUNCTION trip_private.record_speed_finish();

CREATE OR REPLACE FUNCTION trip_private.speed_bonus_ok(p_revealed timestamptz, p_finished timestamptz) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT p_finished >= p_revealed AND p_finished <= p_revealed + interval '3 hours' $$;

CREATE OR REPLACE FUNCTION trip_private.season_points(p_trip uuid, p_season text)
 RETURNS TABLE(user_id uuid, games integer, quests integer, showcase integer, legacy integer, other integer, total integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_kind text;
BEGIN
 IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 IF p_season NOT IN ('preflight','trip','home') THEN RAISE EXCEPTION 'Unknown season'; END IF;
 SELECT t.kind INTO v_kind FROM public.trips t WHERE t.id=p_trip;
 RETURN QUERY
 WITH m AS (SELECT tm.user_id, tm.start_stamps FROM public.trip_members tm WHERE tm.trip_id=p_trip AND tm.status='approved'),
 sq AS (SELECT q.user_id, coalesce(sum(trip_private.sealed_award(q)) FILTER (WHERE q.kind='sealed'),0)::int qp, coalesce(sum(trip_private.sealed_award(q)) FILTER (WHERE q.kind='showcase'),0)::int sp FROM public.sealed_quests q WHERE q.trip_id=p_trip GROUP BY q.user_id),
 gn AS (SELECT s.user_id, sum(CASE WHEN s.here THEN 10 ELSE 0 END + CASE WHEN s.won THEN 15 WHEN s.here THEN 5 ELSE 0 END + CASE WHEN s.here AND n.host_id=s.user_id THEN 5 ELSE 0 END)::int pts
   FROM public.game_scores s JOIN public.game_nights n ON n.trip_id=s.trip_id AND n.week_number=s.week_number AND NOT n.skipped AND n.starts_at <= now()
   WHERE s.trip_id=p_trip GROUP BY s.user_id),
 qa AS (SELECT a.user_id, (2*count(*) + 4*count(*) FILTER (WHERE q.winner_id=a.user_id))::int pts FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number AND q.revealed_at IS NOT NULL WHERE a.trip_id=p_trip GROUP BY a.user_id),
 pen AS (SELECT hp.user_id, 5*sum(hp.stamps)::int pts FROM public.host_penalties hp WHERE hp.trip_id=p_trip GROUP BY hp.user_id),
 lg AS (SELECT x.user_id, sum(x.p)::int pts FROM (
   SELECT mc.user_id, mc.points p FROM public.mission_claims mc WHERE mc.trip_id=p_trip AND mc.phase='checkin' AND mc.status='released'
   UNION ALL SELECT sq2.user_id, sq2.awarded_points FROM public.season_quests sq2 WHERE sq2.trip_id=p_trip AND sq2.quest_kind='preflight' AND sq2.status='approved') x GROUP BY x.user_id),
 ts AS (SELECT r.user_id, r.stamps::int pts FROM trip_private.trip_season(p_trip) r WHERE p_season='trip'),
 sb AS (SELECT f.user_id, (5*count(*))::int pts FROM trip_private.trip_speed_finishes f WHERE f.trip_id=p_trip AND p_season='trip' AND trip_private.speed_bonus_ok(f.revealed_at,f.finished_at) GROUP BY f.user_id),
 hs AS (SELECT r.user_id, r.points::int pts FROM trip_private.home_day_scores(p_trip) r WHERE p_season='home'),
 parts AS (
 SELECT m.user_id,
  CASE WHEN p_season='preflight' THEN coalesce(gn.pts,0)+coalesce(qa.pts,0)+5*coalesce(m.start_stamps,0)-coalesce(pen.pts,0) ELSE 0 END g,
  CASE WHEN p_season IN ('preflight','home') THEN coalesce(sq.qp,0) ELSE 0 END q,
  CASE WHEN (p_season='trip' AND v_kind='trip') OR (p_season='home' AND v_kind<>'trip') THEN coalesce(sq.sp,0) ELSE 0 END s,
  CASE WHEN p_season='preflight' THEN coalesce(lg.pts,0) ELSE 0 END l,
  coalesce(ts.pts,0)+coalesce(hs.pts,0)+coalesce(sb.pts,0) o
 FROM m LEFT JOIN sq ON sq.user_id=m.user_id LEFT JOIN gn ON gn.user_id=m.user_id LEFT JOIN qa ON qa.user_id=m.user_id
  LEFT JOIN pen ON pen.user_id=m.user_id LEFT JOIN lg ON lg.user_id=m.user_id LEFT JOIN ts ON ts.user_id=m.user_id LEFT JOIN hs ON hs.user_id=m.user_id LEFT JOIN sb ON sb.user_id=m.user_id)
 SELECT p.user_id, p.g::int, p.q::int, p.s::int, p.l::int, p.o::int, greatest(p.g+p.q+p.s+p.l+p.o,0)::int FROM parts p;
END $function$;