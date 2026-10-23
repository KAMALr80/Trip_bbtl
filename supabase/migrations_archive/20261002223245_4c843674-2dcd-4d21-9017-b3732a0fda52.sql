ALTER TABLE public.trip_invites ADD COLUMN IF NOT EXISTS teen boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS guardian_confirmed_at timestamptz;
CREATE TABLE IF NOT EXISTS trip_private.teen_accounts (user_id uuid PRIMARY KEY, invite_id uuid NOT NULL, trip_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.cultural_inspirations ADD COLUMN IF NOT EXISTS captain_approved_at timestamptz DEFAULT now();
ALTER TABLE public.cultural_inspirations ALTER COLUMN captain_approved_at DROP DEFAULT;

-- Signup guard
CREATE OR REPLACE FUNCTION trip_private.guard_auth_signup_age() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth' AS $function$
DECLARE v_dob date; v_text text; v_age int; v_tok text;
BEGIN
 IF NEW.id IS NULL OR NEW.created_at IS NULL THEN RETURN NEW; END IF;
 IF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.raw_user_meta_data->>'legal_version' IN ('2026-10-02','2026-10-03') THEN
   v_text := NEW.raw_user_meta_data->>'birthday';
   IF v_text IS NULL OR v_text !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'A birthday is required to sign up'; END IF;
   BEGIN v_dob := v_text::date; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Check your birthday'; END;
   IF v_dob > current_date OR v_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your birthday'; END IF;
   v_age := extract(year FROM age(current_date,v_dob))::int;
   IF v_age < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
   IF v_age < 18 THEN
     v_tok := upper(trim(coalesce(NEW.raw_user_meta_data->>'teen_invite','')));
     IF NOT EXISTS (SELECT 1 FROM public.trip_invites i WHERE i.token=v_tok AND i.teen AND i.guardian_confirmed_at IS NOT NULL AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > now()) THEN
       RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for an invite link.'; END IF;
   END IF;
 ELSIF NEW.raw_app_meta_data->>'provider' = 'email' AND NEW.created_at >= timestamptz '2026-10-02 22:00:00+00' THEN
   RAISE EXCEPTION 'Please provide your birthday and accept the current Terms';
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.accept_legal(p_version text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE v_created timestamptz; v_open boolean; v_closed timestamptz; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF; IF p_version <> '2026-10-03' THEN RAISE EXCEPTION 'Please review the current terms'; END IF; SELECT created_at INTO v_created FROM auth.users WHERE id=auth.uid(); SELECT founding_open,founding_closed_at INTO v_open,v_closed FROM public.app_settings LIMIT 1; INSERT INTO public.account_consents(user_id,legal_version,accepted_at,founding_member) VALUES(auth.uid(),p_version,now(),coalesce(v_open,false) OR (v_closed IS NOT NULL AND v_created < v_closed)) ON CONFLICT(user_id) DO UPDATE SET legal_version=excluded.legal_version,accepted_at=excluded.accepted_at,updated_at=now(),founding_member=public.account_consents.founding_member OR excluded.founding_member; END $function$;

CREATE OR REPLACE FUNCTION trip_private.set_my_dob(p_dob date, p_agree boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a int;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm you are 18 or older and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date,p_dob))::int;
 IF a < 13 THEN RAISE EXCEPTION 'Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.'; END IF;
 IF a < 18 THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for an invite link.'; END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your birthday is already saved; contact support for corrections'; END IF;
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 IF (SELECT public_launch FROM public.app_settings LIMIT 1) THEN INSERT INTO public.beta_access(user_id,source) VALUES(auth.uid(),'launch') ON CONFLICT DO NOTHING; END IF;
 RETURN trip_private.age_range(a);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.set_teen_dob(p_dob date, p_agree boolean, p_invite text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
 IF NOT FOUND OR NOT inv.teen OR inv.guardian_confirmed_at IS NULL OR inv.used_at IS NOT NULL OR inv.cancelled_at IS NOT NULL OR inv.expires_at <= now() THEN
   RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for an invite link.'; END IF;
 INSERT INTO public.player_private(user_id,dob) VALUES(auth.uid(),p_dob);
 INSERT INTO trip_private.teen_accounts(user_id,invite_id,trip_id) VALUES(auth.uid(),inv.id,inv.trip_id) ON CONFLICT DO NOTHING;
 RETURN trip_private.age_range(a);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.create_teen_invite(p_trip uuid, p_guardian boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE tok text := ''; bytes bytea := extensions.gen_random_bytes(10); i int; BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can create teen invites'; END IF;
 IF NOT coalesce(p_guardian,false) THEN RAISE EXCEPTION 'Please confirm you are this player''s parent/guardian or have their parent''s permission'; END IF;
 IF (SELECT vibe FROM public.trips WHERE id=p_trip)='party' THEN RAISE EXCEPTION 'Teens can''t join Party trips. Switch the vibe to Family or Chill first.'; END IF;
 IF (SELECT count(*) FROM public.trip_invites WHERE trip_id=p_trip AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()) >= 50 THEN RAISE EXCEPTION 'That''s 50 open invites — cancel some first'; END IF;
 FOR i IN 0..9 LOOP tok := tok || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', get_byte(bytes,i) % 24 + 1, 1); END LOOP;
 INSERT INTO public.trip_invites(token,trip_id,created_by,teen,guardian_confirmed_at) VALUES (tok,p_trip,auth.uid(),true,now());
 RETURN tok; END $function$;

-- Joining
CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
  IF v_age < 18 AND NOT (via_invite AND inv.teen AND inv.guardian_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for a teen invite link.'; END IF;
  IF v_age < 18 AND (t.vibe='party' OR t.kind='at_home' AND false) THEN RAISE EXCEPTION 'This trip isn''t open to players under 18'; END IF;
  IF t.level='preview' AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION 'PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.'; END IF;
  SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;
  IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
  IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
  v_status := CASE WHEN t.require_approval OR v_age < 21 THEN 'pending' ELSE 'approved' END;
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
END $function$;

-- Captains 21+
CREATE OR REPLACE FUNCTION trip_private.create_trip(p_name text, p_destination text, p_start_date date, p_end_date date, p_home_timezone text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE trip_id uuid; attempt int; BEGIN IF auth.uid() IS NOT NULL AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION 'PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.'; END IF;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'TripJunkies is invite-only during the private beta'; END IF;
 IF coalesce(trip_private.age_of(auth.uid()),0) < 21 THEN RAISE EXCEPTION 'Captains are 21+. Ask your crew''s Captain to invite you.'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100 OR length(trim(coalesce(p_destination,''))) NOT BETWEEN 1 AND 120 OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date OR length(trim(coalesce(p_home_timezone,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Check your trip details'; END IF;
 FOR attempt IN 1..15 LOOP
  BEGIN
   INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,join_code) VALUES (trim(p_name),trim(p_destination),p_start_date,p_end_date,trim(p_home_timezone),public.new_trip_code()) RETURNING id INTO trip_id;
   EXIT;
  EXCEPTION WHEN unique_violation THEN IF attempt = 15 THEN RAISE; END IF;
  END;
 END LOOP;
 INSERT INTO public.trip_members(trip_id,user_id,role) VALUES(trip_id,auth.uid(),'captain');
 RETURN trip_id;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.step_down(p_trip uuid, p_to uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can step down'; END IF;
 IF p_to = auth.uid() OR NOT trip_private.is_trip_member(p_trip, p_to) THEN RAISE EXCEPTION 'Pick an approved member'; END IF;
 IF coalesce(trip_private.age_of(p_to),0) < 21 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_to) THEN RAISE EXCEPTION 'Captains are 21+. Pick someone 21 or older.'; END IF;
 UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=auth.uid();
 UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=p_to;
 PERFORM trip_private.log_role(p_trip, auth.uid(), p_to, 'captain', 'stepped down');
END $function$;

CREATE OR REPLACE FUNCTION trip_private.take_over_captain(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE cap uuid; seen timestamptz; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='co_captain' AND status='approved') THEN RAISE EXCEPTION 'Only the Co-Captain can take over'; END IF;
 IF coalesce(trip_private.age_of(auth.uid()),0) < 21 THEN RAISE EXCEPTION 'Captains are 21+. Ask your crew''s Captain to hand off to someone 21 or older.'; END IF;
 SELECT m.user_id, p.last_seen_at INTO cap, seen FROM public.trip_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=p_trip AND m.role='captain';
 IF cap IS NOT NULL AND coalesce(seen, now()) > now()-interval '14 days' THEN RAISE EXCEPTION 'The Captain has been active in the last 14 days'; END IF;
 UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=auth.uid(); UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=cap;
 UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=auth.uid();
 PERFORM trip_private.log_role(p_trip, cap, auth.uid(), 'captain', 'takeover');
END $function$;

CREATE OR REPLACE FUNCTION trip_private.manage_trip_member(p_trip uuid, p_user uuid, p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE actor_role text; target_role text; old_co uuid; v_age int; is_bot boolean; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT role INTO actor_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='approved';
 SELECT role INTO target_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='approved';
 IF actor_role IS DISTINCT FROM 'captain' OR target_role IS NULL OR p_user=auth.uid() THEN RAISE EXCEPTION 'Only the Captain can manage members'; END IF;
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
END $function$;

-- At Home creation: 18+ (teens blocked)
CREATE OR REPLACE FUNCTION trip_private.teen_block(p_what text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF auth.uid() IS NULL OR coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION '% is for players 18 and older.', p_what; END IF; END $function$;

CREATE OR REPLACE FUNCTION trip_private.use_ai_quota(p_kind text, p_trip uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE lim int; used int; uid uuid; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM trip_private.teen_block('AI');
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'AI ideas are for beta members only.'; END IF;
 IF p_trip IS NOT NULL AND NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first.'; END IF;
 lim := CASE p_kind WHEN 'names' THEN 10 WHEN 'itinerary' THEN 20 ELSE 0 END;
 IF p_trip IS NOT NULL AND (SELECT level FROM public.trips WHERE id=p_trip)='preview' THEN lim := LEAST(lim,(SELECT ai_daily FROM trip_private.preview_settings)); IF lim=0 THEN RAISE EXCEPTION 'COMING_SOON: AI ideas are coming soon for preview trips.'; END IF; END IF;
 IF lim = 0 OR (p_kind <> 'names' AND p_trip IS NULL) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF p_kind = 'names' THEN SELECT count(*) INTO used FROM public.ai_usage WHERE kind='names' AND user_id=auth.uid() AND created_at >= date_trunc('day', now());
 ELSE SELECT count(*) INTO used FROM public.ai_usage WHERE kind=p_kind AND trip_id=p_trip AND created_at >= date_trunc('day', now()); END IF;
 IF used >= lim THEN
   IF p_kind = 'itinerary' THEN RETURN trip_private.spend_credits(p_trip, 'itinerary_extra'); END IF;
   RAISE EXCEPTION 'That''s today''s limit for AI ideas — try again tomorrow.';
 END IF;
 INSERT INTO public.ai_usage(user_id, trip_id, kind) VALUES (auth.uid(), p_trip, p_kind) RETURNING id INTO uid;
 RETURN uid;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.spend_credits(p_trip uuid, p_action text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c int := trip_private.credit_cost(p_action); have int; uid uuid;
BEGIN PERFORM trip_private.require_feature(p_trip, 'ai_extras');
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM trip_private.teen_block('AI');
 IF c IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'AI ideas are for beta members only.'; END IF;
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can use AI credits.'; END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT remaining INTO have FROM trip_private.credit_status(p_trip);
 IF have < c THEN RAISE EXCEPTION 'OUT_OF_CREDITS: This needs % AI credits and the trip has %.', c, have; END IF;
 INSERT INTO public.ai_usage(user_id, trip_id, kind, credits) VALUES (auth.uid(), p_trip, p_action, c) RETURNING id INTO uid;
 RETURN uid;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.mix_ai_quota(p_trip uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_used int; v_remaining int; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT trip_private.has_beta_access() OR coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION 'Sign in with an eligible account first'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
  SELECT count(*)::int INTO v_used FROM public.ai_usage WHERE user_id=auth.uid() AND kind='arcade_mix' AND created_at >= date_trunc('day', now());
  IF v_used >= 10 THEN RAISE EXCEPTION 'That is today''s AI limit. Come back tomorrow.'; END IF;
  IF v_used >= 3 THEN
    IF p_trip IS NULL OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'After three free mixes, choose a trip with AI credits.'; END IF;
    PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
    SELECT remaining INTO v_remaining FROM trip_private.credit_status(p_trip);
    IF coalesce(v_remaining,0) < 1 THEN RAISE EXCEPTION 'OUT_OF_CREDITS: This trip has no AI credits left.'; END IF;
  END IF;
  INSERT INTO public.ai_usage(user_id,trip_id,kind,credits) VALUES(auth.uid(),CASE WHEN v_used >= 3 THEN p_trip ELSE NULL END,'arcade_mix',CASE WHEN v_used >= 3 THEN 1 ELSE 0 END) RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

-- Game Rooms: teens can't browse; teen names never listed
CREATE OR REPLACE FUNCTION trip_private.game_rooms() RETURNS TABLE(trip_id uuid, nickname text, country text, region text, city text, nights_played integer, ended boolean, crowns jsonb, leaders jsonb, is_member boolean, requested boolean) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id, t.room_nickname, t.room_country, t.room_region, t.room_city,
    (SELECT count(*)::int FROM game_nights gn WHERE gn.trip_id=t.id AND NOT gn.skipped AND gn.starts_at <= now()),
    (t.ended_at IS NOT NULL OR t.end_date < current_date),
    coalesce((SELECT jsonb_agg(sc.season) FROM season_champions sc WHERE sc.trip_id=t.id), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score) ORDER BY x.score DESC) FROM (
       SELECT coalesce(nullif(pc.game_name,''),'Player') AS name, b.score FROM trip_private.game_board(t.id) b
       JOIN trip_members m ON m.trip_id=t.id AND m.user_id=b.user_id AND m.status='approved'
       LEFT JOIN trip_player_cards pc ON pc.trip_id=t.id AND pc.user_id=b.user_id
       WHERE coalesce(trip_private.age_of(b.user_id),21) >= 18
       ORDER BY b.score DESC LIMIT CASE WHEN (t.ended_at IS NOT NULL OR t.end_date < current_date) THEN 3 ELSE 5 END) x), '[]'::jsonb),
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id=t.id AND m.user_id=auth.uid() AND m.status='approved'),
    EXISTS (SELECT 1 FROM room_requests r WHERE r.trip_id=t.id AND r.user_id=auth.uid() AND r.status='pending' AND r.expires_at > now())
  FROM trips t WHERE t.room_listed AND NOT t.is_sandbox AND t.room_nickname IS NOT NULL AND t.room_country IS NOT NULL
  ORDER BY t.created_at;
END $function$;

-- Inspiration: teens can't post; 18–20 need Captain approval
CREATE OR REPLACE FUNCTION trip_private.inspiration_age_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE a int := coalesce(trip_private.age_of(NEW.creator_id),0); BEGIN
 IF a < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=NEW.creator_id) THEN RAISE EXCEPTION 'Posting experiences is for players 18 and older'; END IF;
 IF NEW.partner_id IS NOT NULL AND coalesce(trip_private.age_of(NEW.partner_id),0) < 18 THEN RAISE EXCEPTION 'Team up partners need to be 18 or older'; END IF;
 NEW.captain_approved_at := CASE WHEN a >= 21 OR trip_private.is_captain(NEW.trip_id) THEN now() ELSE NULL END;
 RETURN NEW; END $function$;
DROP TRIGGER IF EXISTS inspiration_age_gate ON public.cultural_inspirations;
CREATE TRIGGER inspiration_age_gate BEFORE INSERT ON public.cultural_inspirations FOR EACH ROW EXECUTE FUNCTION trip_private.inspiration_age_gate();
CREATE OR REPLACE FUNCTION trip_private.inspiration_keep_approval() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF NEW.captain_approved_at IS DISTINCT FROM OLD.captain_approved_at AND coalesce(current_setting('trip.approving',true),'') <> 'on' THEN NEW.captain_approved_at := OLD.captain_approved_at; END IF; RETURN NEW; END $function$;
DROP TRIGGER IF EXISTS inspiration_keep_approval ON public.cultural_inspirations;
CREATE TRIGGER inspiration_keep_approval BEFORE UPDATE ON public.cultural_inspirations FOR EACH ROW EXECUTE FUNCTION trip_private.inspiration_keep_approval();

CREATE OR REPLACE FUNCTION trip_private.approve_inspiration(p_card uuid, p_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_trip uuid; BEGIN
 SELECT trip_id INTO v_trip FROM public.cultural_inspirations WHERE id=p_card AND captain_approved_at IS NULL;
 IF v_trip IS NULL OR NOT trip_private.is_captain(v_trip) THEN RAISE EXCEPTION 'Only the Captain can approve this experience'; END IF;
 IF p_approve THEN PERFORM set_config('trip.approving','on',true); UPDATE public.cultural_inspirations SET captain_approved_at=now() WHERE id=p_card; PERFORM set_config('trip.approving','',true);
 ELSE DELETE FROM public.cultural_inspirations WHERE id=p_card; END IF; END $function$;

DROP POLICY IF EXISTS inspiration_read ON public.cultural_inspirations;
CREATE POLICY inspiration_read ON public.cultural_inspirations FOR SELECT USING (trip_private.feature_on(trip_id,'inspiration') AND trip_private.is_trip_member(trip_id, auth.uid()) AND ((creator_id = auth.uid()) OR (partner_id = auth.uid()) OR (captain_approved_at IS NULL AND trip_private.is_captain(trip_id)) OR ((captain_approved_at IS NOT NULL) AND (reveal_on <= CURRENT_DATE) AND (hidden_at IS NULL) AND (EXISTS (SELECT 1 FROM culture_stamps st WHERE st.card_id = cultural_inspirations.id AND st.user_id = auth.uid())))));

CREATE OR REPLACE FUNCTION trip_private.inspiration_public(p_card uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT EXISTS(SELECT 1 FROM public.cultural_inspirations c JOIN public.trips t ON t.id=c.trip_id WHERE c.id=p_card AND c.captain_approved_at IS NOT NULL AND c.feature_later AND c.public_approved_at IS NOT NULL AND c.hidden_at IS NULL AND c.reveal_on<=CURRENT_DATE AND NOT coalesce(t.is_sandbox,false)) $function$;

-- Founder age tier counts
CREATE OR REPLACE FUNCTION trip_private.founder_age_tiers() RETURNS TABLE(tier text, people integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','auth' AS $function$ BEGIN
 IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 RETURN QUERY SELECT trip_private.age_range(CASE WHEN pp.dob IS NULL THEN NULL ELSE extract(year FROM age(current_date,pp.dob))::int END), count(*)::int
  FROM auth.users u LEFT JOIN public.player_private pp ON pp.user_id=u.id
  WHERE NOT EXISTS (SELECT 1 FROM public.sandbox_bots b WHERE b.user_id=u.id) GROUP BY 1 ORDER BY 1; END $function$;

-- Public wrappers + privileges
CREATE OR REPLACE FUNCTION public.set_teen_dob(p_dob date, p_agree boolean, p_invite text) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_teen_dob(p_dob,p_agree,p_invite) $$;
CREATE OR REPLACE FUNCTION public.create_teen_invite(p_trip uuid, p_guardian boolean) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.create_teen_invite(p_trip,p_guardian) $$;
CREATE OR REPLACE FUNCTION public.approve_inspiration(p_card uuid, p_approve boolean) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.approve_inspiration(p_card,p_approve) $$;
CREATE OR REPLACE FUNCTION public.founder_age_tiers() RETURNS TABLE(tier text, people integer) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.founder_age_tiers() $$;
REVOKE ALL ON FUNCTION trip_private.set_teen_dob(date,boolean,text), trip_private.create_teen_invite(uuid,boolean), trip_private.approve_inspiration(uuid,boolean), trip_private.founder_age_tiers(), trip_private.teen_block(text), public.set_teen_dob(date,boolean,text), public.create_teen_invite(uuid,boolean), public.approve_inspiration(uuid,boolean), public.founder_age_tiers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_teen_dob(date,boolean,text), trip_private.create_teen_invite(uuid,boolean), trip_private.approve_inspiration(uuid,boolean), trip_private.founder_age_tiers(), trip_private.teen_block(text), public.set_teen_dob(date,boolean,text), public.create_teen_invite(uuid,boolean), public.approve_inspiration(uuid,boolean), public.founder_age_tiers() TO authenticated, service_role;
REVOKE ALL ON FUNCTION trip_private.inspiration_age_gate(), trip_private.inspiration_keep_approval() FROM PUBLIC, anon;
REVOKE ALL ON trip_private.teen_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON trip_private.teen_accounts TO service_role;