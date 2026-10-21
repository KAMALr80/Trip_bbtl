CREATE TABLE public.app_settings (id boolean PRIMARY KEY DEFAULT true CHECK (id), public_launch boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.app_settings TO authenticated; GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
INSERT INTO public.app_settings(id) VALUES (true);

CREATE TABLE public.beta_access (user_id uuid PRIMARY KEY, source text NOT NULL DEFAULT 'invite', created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.beta_access TO authenticated; GRANT ALL ON public.beta_access TO service_role;
ALTER TABLE public.beta_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own beta access" ON public.beta_access FOR SELECT TO authenticated USING (user_id = auth.uid());
INSERT INTO public.beta_access(user_id, source) SELECT id, 'existing' FROM public.profiles ON CONFLICT DO NOTHING;

CREATE TABLE public.player_private (user_id uuid PRIMARY KEY, dob date NOT NULL, no_alcohol boolean NOT NULL DEFAULT false, agreed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.player_private TO authenticated; GRANT ALL ON public.player_private TO service_role;
ALTER TABLE public.player_private ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads private info" ON public.player_private FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.trip_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token text NOT NULL UNIQUE, trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days', used_by uuid, used_at timestamptz, cancelled_at timestamptz);
GRANT SELECT ON public.trip_invites TO authenticated; GRANT ALL ON public.trip_invites TO service_role;
ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaders read trip invites" ON public.trip_invites FOR SELECT TO authenticated USING (trip_private.is_leader(trip_id));

ALTER TABLE public.trips ADD COLUMN vibe text NOT NULL DEFAULT 'chill' CHECK (vibe IN ('family','chill','party')),
  ADD COLUMN join_code_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN require_approval boolean NOT NULL DEFAULT true;
UPDATE public.trips SET require_approval = false;
UPDATE public.trips t SET vibe = 'party' WHERE EXISTS (SELECT 1 FROM public.trip_adult_settings s WHERE s.trip_id=t.id AND s.enabled) AND t.id <> 'a4842ba8-540c-4595-9417-a9a7fb53f395';
UPDATE public.trips SET vibe='chill' WHERE id='a4842ba8-540c-4595-9417-a9a7fb53f395';
ALTER TABLE public.trip_members ADD COLUMN status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending'));

-- Helpers
CREATE OR REPLACE FUNCTION trip_private.age_of(p_user uuid) RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT extract(year FROM age(current_date, dob))::int FROM public.player_private WHERE user_id = p_user $$;
CREATE OR REPLACE FUNCTION trip_private.age_range(p_age int) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p_age IS NULL THEN 'Unknown' WHEN p_age < 18 THEN 'Teen 13–17' WHEN p_age < 21 THEN '18–20' ELSE '21+' END $$;
CREATE OR REPLACE FUNCTION trip_private.has_beta_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND ((SELECT public_launch FROM public.app_settings LIMIT 1) OR EXISTS (SELECT 1 FROM public.beta_access WHERE user_id=auth.uid()) OR trip_private.is_app_admin()) $$;

CREATE OR REPLACE FUNCTION trip_private.is_trip_member(p_trip uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = p_trip AND user_id = p_user AND status = 'approved') $$;

DROP POLICY "Members view their squad" ON public.trip_members;
CREATE POLICY "Members view their squad" ON public.trip_members FOR SELECT TO authenticated USING (trip_private.is_trip_member(trip_id, auth.uid()) AND status = 'approved');

CREATE OR REPLACE FUNCTION trip_private.trip_roster(p_trip uuid) RETURNS TABLE(user_id uuid, role text, display_name text, avatar_url text, joined_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not a member'; END IF;
 RETURN QUERY SELECT m.user_id,m.role,coalesce(c.game_name,'New traveler'),c.avatar_path,m.joined_at FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id WHERE m.trip_id=p_trip AND m.status='approved' ORDER BY CASE m.role WHEN 'captain' THEN 0 WHEN 'co_captain' THEN 1 ELSE 2 END,m.joined_at;
END $function$;

-- 21+ is now vibe-aware
CREATE OR REPLACE FUNCTION trip_private.is_approved_adult(p_trip uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT auth.uid()=p_user AND EXISTS (SELECT 1 FROM public.trips t JOIN public.trip_adult_approvals a ON a.trip_id=t.id AND a.user_id=p_user
  WHERE t.id=p_trip AND t.vibe='party' AND trip_private.is_trip_member(p_trip,p_user)
  AND coalesce(trip_private.age_of(p_user), (SELECT extract(year FROM age(current_date,b.birthday))::int FROM public.player_birthdays b WHERE b.user_id=p_user), 0) >= 21
  AND NOT coalesce((SELECT no_alcohol FROM public.player_private WHERE user_id=p_user), false)) $$;
CREATE OR REPLACE FUNCTION trip_private.adult_badge(p_trip uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT trip_private.is_trip_member(p_trip,auth.uid()) AND EXISTS (SELECT 1 FROM public.trips t JOIN public.trip_adult_approvals a ON a.trip_id=t.id AND a.user_id=p_user
  WHERE t.id=p_trip AND t.vibe='party' AND trip_private.is_trip_member(p_trip,p_user)
  AND coalesce(trip_private.age_of(p_user), (SELECT extract(year FROM age(current_date,b.birthday))::int FROM public.player_birthdays b WHERE b.user_id=p_user), 0) >= 21) $$;
CREATE OR REPLACE FUNCTION trip_private.set_adult_cards(p_trip uuid, p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Captain only'; END IF;
 INSERT INTO public.trip_adult_settings(trip_id,enabled) VALUES(p_trip,p_enabled) ON CONFLICT(trip_id) DO UPDATE SET enabled=excluded.enabled;
 UPDATE public.trips SET vibe = CASE WHEN p_enabled THEN 'party' WHEN vibe='party' THEN 'chill' ELSE vibe END WHERE id=p_trip; END $$;

-- Self-service
CREATE OR REPLACE FUNCTION trip_private.my_access() RETURNS TABLE(beta boolean, launch boolean, has_dob boolean, age_range text, no_alcohol boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT trip_private.has_beta_access(), (SELECT public_launch FROM public.app_settings LIMIT 1),
  EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()), trip_private.age_range(trip_private.age_of(auth.uid())),
  coalesce((SELECT no_alcohol FROM public.player_private WHERE user_id=auth.uid()), false) $$;
CREATE OR REPLACE FUNCTION trip_private.public_launch() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT coalesce((SELECT public_launch FROM public.app_settings LIMIT 1), false) $$;
CREATE OR REPLACE FUNCTION trip_private.set_my_dob(p_dob date, p_agree boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a int; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT coalesce(p_agree,false) THEN RAISE EXCEPTION 'Please confirm you''re 13 or older and agree'; END IF;
 IF p_dob IS NULL OR p_dob > current_date OR p_dob < date '1900-01-01' THEN RAISE EXCEPTION 'Check your date of birth'; END IF;
 a := extract(year FROM age(current_date, p_dob))::int;
 IF a < 13 THEN RAISE EXCEPTION 'Sorry, you need to be 13 or older to use TripJunkie'; END IF;
 IF EXISTS (SELECT 1 FROM public.player_private WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Your date of birth is already saved'; END IF;
 INSERT INTO public.player_private(user_id,dob) VALUES (auth.uid(), p_dob);
 IF (SELECT public_launch FROM public.app_settings LIMIT 1) THEN INSERT INTO public.beta_access(user_id,source) VALUES (auth.uid(),'launch') ON CONFLICT DO NOTHING; END IF;
 RETURN trip_private.age_range(a);
END $$;
CREATE OR REPLACE FUNCTION trip_private.set_no_alcohol(p_on boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN UPDATE public.player_private SET no_alcohol=coalesce(p_on,false), updated_at=now() WHERE user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Add your date of birth first'; END IF; END $$;
CREATE OR REPLACE FUNCTION trip_private.set_public_launch(p_on boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 UPDATE public.app_settings SET public_launch=coalesce(p_on,false), updated_at=now(); END $$;

-- Trip access
CREATE OR REPLACE FUNCTION trip_private.set_trip_access(p_trip uuid, p_code_enabled boolean, p_require_approval boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 UPDATE public.trips SET join_code_enabled=coalesce(p_code_enabled,join_code_enabled), require_approval=coalesce(p_require_approval,require_approval) WHERE id=p_trip; END $$;
CREATE OR REPLACE FUNCTION trip_private.set_trip_vibe(p_trip uuid, p_vibe text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 IF p_vibe NOT IN ('family','chill','party') THEN RAISE EXCEPTION 'Pick Family, Chill or Party'; END IF;
 UPDATE public.trips SET vibe=p_vibe WHERE id=p_trip;
 INSERT INTO public.trip_adult_settings(trip_id,enabled) VALUES(p_trip,p_vibe='party') ON CONFLICT(trip_id) DO UPDATE SET enabled=excluded.enabled; END $$;
CREATE OR REPLACE FUNCTION trip_private.create_trip_invite(p_trip uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tok text; BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can invite'; END IF;
 IF (SELECT count(*) FROM public.trip_invites WHERE trip_id=p_trip AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()) >= 50 THEN RAISE EXCEPTION 'That''s 50 open invites — cancel some first'; END IF;
 tok := (SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random()*24)::int, 1), '') FROM generate_series(1,10));
 INSERT INTO public.trip_invites(token,trip_id,created_by) VALUES (tok,p_trip,auth.uid());
 RETURN tok; END $$;
CREATE OR REPLACE FUNCTION trip_private.cancel_trip_invite(p_invite uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v uuid; BEGIN SELECT trip_id INTO v FROM public.trip_invites WHERE id=p_invite;
 IF v IS NULL OR NOT trip_private.is_leader(v) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 UPDATE public.trip_invites SET cancelled_at=now() WHERE id=p_invite AND used_at IS NULL AND cancelled_at IS NULL; END $$;
CREATE OR REPLACE FUNCTION trip_private.pending_members(p_trip uuid) RETURNS TABLE(user_id uuid, name text, avatar_style text, avatar_seed text, age_range text, joined_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 RETURN QUERY SELECT m.user_id, coalesce(c.game_name, p.game_name, 'New traveler'), coalesce(c.avatar_style, p.avatar_style, 'street'), coalesce(c.avatar_seed, p.avatar_seed, m.user_id::text), trip_private.age_range(trip_private.age_of(m.user_id)), m.joined_at
  FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id LEFT JOIN public.player_profiles p ON p.user_id=m.user_id
  WHERE m.trip_id=p_trip AND m.status='pending' ORDER BY m.joined_at; END $$;
CREATE OR REPLACE FUNCTION trip_private.approve_member(p_trip uuid, p_user uuid, p_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can approve members'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='pending') THEN RAISE EXCEPTION 'That request is no longer waiting'; END IF;
 IF p_approve THEN UPDATE public.trip_members SET status='approved', joined_at=now() WHERE trip_id=p_trip AND user_id=p_user;
 ELSE DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; END IF; END $$;
CREATE OR REPLACE FUNCTION trip_private.my_waiting_trips() RETURNS TABLE(trip_id uuid, name text, destination text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT t.id, t.name, t.destination FROM public.trip_members m JOIN public.trips t ON t.id=m.trip_id WHERE m.user_id=auth.uid() AND m.status='pending' $$;

-- create_trip: beta + 18+
CREATE OR REPLACE FUNCTION trip_private.create_trip(p_name text, p_destination text, p_start_date date, p_end_date date, p_home_timezone text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE trip_id uuid; attempt int; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'TripJunkie is invite-only during the private beta'; END IF;
 IF coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION 'Captains need to be 18 or older'; END IF;
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

-- pass the crown only to 18+
CREATE OR REPLACE FUNCTION trip_private.manage_trip_member(p_trip uuid, p_user uuid, p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE actor_role text; target_role text; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT role INTO actor_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='approved';
 SELECT role INTO target_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='approved';
 IF actor_role NOT IN ('captain','co_captain') OR target_role IS NULL OR p_user=auth.uid() THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF target_role='captain' THEN RAISE EXCEPTION 'The Captain cannot be removed or replaced here'; END IF;
 IF p_action='promote' THEN
  IF target_role='co_captain' THEN RETURN; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role='co_captain';
  UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=p_user;
 ELSIF p_action='remove' THEN
  DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user;
 ELSIF p_action='pass_crown' AND actor_role='captain' THEN
  IF coalesce(trip_private.age_of(p_user),0) < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_user) THEN RAISE EXCEPTION 'The new Captain needs to be 18 or older'; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=auth.uid();
  UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=p_user;
 ELSE RAISE EXCEPTION 'Not allowed'; END IF;
END $function$;

-- invite preview accepts personal tokens; respects disabled codes
CREATE OR REPLACE FUNCTION trip_private.trip_invite_preview(p_code text) RETURNS TABLE(name text, destination text, motto text, start_date date, end_date date, member_count bigint, captain_name text, captain_style text, captain_seed text, captain_avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT t.name, t.destination, t.motto, t.start_date, t.end_date,
    (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = t.id AND m.status='approved'),
    COALESCE(p.game_name, c.game_name, captain_profile.display_name, 'Your Captain'),
    COALESCE(p.avatar_style, c.avatar_style, 'street'),
    COALESCE(p.avatar_seed, c.avatar_seed, captain.user_id::text),
    captain_profile.avatar_url
  FROM public.trips t
  JOIN public.trip_members captain ON captain.trip_id = t.id AND captain.role = 'captain'
  LEFT JOIN public.profiles captain_profile ON captain_profile.id = captain.user_id
  LEFT JOIN public.player_profiles p ON p.user_id = captain.user_id
  LEFT JOIN public.trip_player_cards c ON c.trip_id = t.id AND c.user_id = captain.user_id
  WHERE auth.uid() IS NOT NULL AND t.ended_at IS NULL AND (
    (t.join_code = upper(trim(p_code)) AND t.join_code_enabled)
    OR EXISTS (SELECT 1 FROM public.trip_invites i WHERE i.trip_id=t.id AND i.token=upper(trim(p_code)) AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > now()))
  LIMIT 1
$function$;

-- join_trip: codes + personal invites + ages + approval + beta access
CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; gr trip_private.trip_join_grants%ROWTYPE; v_avg integer := 0; v_week integer; v_count integer; v_closed boolean; v_trip_avg integer := 0; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 v_age := trip_private.age_of(auth.uid());
 IF v_age IS NULL THEN RAISE EXCEPTION 'Add your date of birth first'; END IF;
 IF length(v_code) = 10 THEN
   SELECT * INTO inv FROM public.trip_invites WHERE token=v_code FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'That invite link was not found'; END IF;
   SELECT * INTO t FROM public.trips WHERE id=inv.trip_id FOR UPDATE;
   IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
   IF inv.used_at IS NOT NULL OR inv.cancelled_at IS NOT NULL OR inv.expires_at <= now() THEN RAISE EXCEPTION 'This invite link has expired or was already used. Ask your Captain for a new one.'; END IF;
   via_invite := true;
 ELSE
   SELECT * INTO t FROM public.trips WHERE join_code = v_code FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'That invite code was not found'; END IF;
   IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
   IF NOT t.join_code_enabled THEN RAISE EXCEPTION 'This trip''s join code is turned off. Ask your Captain for a personal invite link.'; END IF;
 END IF;
 IF v_age < 18 AND NOT via_invite THEN RAISE EXCEPTION 'Players under 18 need a personal invite link from the Captain'; END IF;
 SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;
 IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
 IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
 INSERT INTO public.beta_access(user_id, source) VALUES (auth.uid(), 'invite') ON CONFLICT DO NOTHING;
 v_status := CASE WHEN t.require_approval OR v_age < 18 THEN 'pending' ELSE 'approved' END;
 IF via_invite THEN UPDATE public.trip_invites SET used_by=auth.uid(), used_at=now() WHERE id=inv.id; END IF;
 SELECT * INTO gr FROM trip_private.trip_join_grants WHERE trip_id=t.id AND user_id=auth.uid();
 IF FOUND THEN
   INSERT INTO public.trip_members(trip_id,user_id,start_stamps,joined_week,trip_start_stamps,season_closed,status) VALUES(t.id,auth.uid(),gr.start_stamps,gr.joined_week,gr.trip_start_stamps,gr.season_closed,v_status);
   RETURN t.id;
 END IF;
 v_closed := EXISTS (SELECT 1 FROM public.season_champions WHERE trip_id=t.id AND season='game') OR coalesce(trip_private.effective_crowning(t.id,'game') <= now(), false);
 IF NOT v_closed AND EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=t.id AND NOT skipped AND starts_at <= now()) THEN
   SELECT coalesce(floor(avg(g.stamps) FILTER (WHERE g.stamps > 0)),0)::int INTO v_avg FROM trip_private.game_stamps(t.id) g;
   SELECT coalesce(min(week_number) FILTER (WHERE starts_at > now()), max(week_number)+1) INTO v_week FROM public.game_nights WHERE trip_id=t.id;
 END IF;
 INSERT INTO public.trip_members(trip_id,user_id,start_stamps,joined_week,season_closed,status) VALUES(t.id,auth.uid(),v_avg,v_week,v_closed,v_status);
 IF v_closed AND (now() AT TIME ZONE t.home_timezone)::date > t.start_date THEN
   SELECT coalesce(floor(avg(s.stamps) FILTER (WHERE s.stamps > 0 AND s.user_id <> auth.uid())),0)::int INTO v_trip_avg FROM trip_private.trip_season(t.id) s;
   UPDATE public.trip_members SET trip_start_stamps=v_trip_avg WHERE trip_id=t.id AND user_id=auth.uid();
 END IF;
 INSERT INTO trip_private.trip_join_grants(trip_id,user_id,start_stamps,joined_week,trip_start_stamps,season_closed) VALUES(t.id,auth.uid(),v_avg,v_week,v_trip_avg,v_closed);
 RETURN t.id;
END $function$;

-- Test Lab: bots get an adult birth date by default; sandboxes start without approval
CREATE OR REPLACE FUNCTION trip_private.lab_card(p_trip uuid, p_user uuid, p_name text, p_n int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pp public.player_profiles;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_user) THEN
    INSERT INTO public.player_private(user_id,dob) VALUES (p_user, date '1995-06-15') ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO pp FROM public.player_profiles WHERE user_id=p_user;
  IF FOUND THEN
    INSERT INTO public.trip_player_cards(trip_id,user_id,real_name,game_name,avatar_style,avatar_seed,hometown,occupation,fun_fact,pronouns)
    VALUES (p_trip,p_user,pp.real_name,pp.game_name,CASE WHEN pp.avatar_style='photo' THEN 'street' ELSE pp.avatar_style END,pp.avatar_seed,pp.hometown,pp.occupation,pp.fun_fact,pp.pronouns) ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.trip_player_cards(trip_id,user_id,real_name,game_name,avatar_style,avatar_seed,hometown,fun_fact)
    VALUES (p_trip,p_user,p_name,p_name,(ARRAY['street','crew','hero'])[1 + (p_n % 3)],p_name || '-' || p_n,'Botville','I am a test bot 🤖') ON CONFLICT DO NOTHING;
  END IF;
END $$;
DO $do$ DECLARE d text; BEGIN
 d := pg_get_functiondef('trip_private.lab_create(integer,integer,integer)'::regprocedure);
 d := replace(d, $a$'America/Los_Angeles',public.new_trip_code(),true) RETURNING id INTO v_trip;$a$, $a$'America/Los_Angeles',public.new_trip_code(),true) RETURNING id INTO v_trip;
  UPDATE public.trips SET require_approval=false WHERE id=v_trip;$a$);
 EXECUTE d;
 d := pg_get_functiondef('trip_private.lab_as(uuid,text)'::regprocedure);
 d := replace(d, $a$    PERFORM trip_private.lab_become(v); PERFORM public.join_trip(t.join_code);$a$, $a$    INSERT INTO public.player_private(user_id,dob) VALUES (v, date '1995-06-15') ON CONFLICT DO NOTHING;
    PERFORM trip_private.lab_become(v); PERFORM public.join_trip(t.join_code);$a$);
 EXECUTE d;
END $do$;

-- Test Lab extras: teen bot, no-alcohol bot, waiting bot, vibe
CREATE OR REPLACE FUNCTION trip_private.lab_extra(p_trip uuid, p_action text, p_arg text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); v uuid; t public.trips; tok text; v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  IF p_action = 'vibe' THEN
    PERFORM trip_private.set_trip_vibe(p_trip, p_arg); RETURN 'Vibe: ' || p_arg;
  ELSIF p_action IN ('teen','pending') THEN
    SELECT user_id INTO v FROM public.sandbox_bots WHERE trip_id IS NULL ORDER BY created_at LIMIT 1;
    IF v IS NULL THEN RAISE EXCEPTION 'No spare bot ready'; END IF;
    INSERT INTO public.player_private(user_id,dob) VALUES (v, CASE WHEN p_action='teen' THEN current_date - interval '15 years' ELSE date '1995-06-15' END)
      ON CONFLICT (user_id) DO UPDATE SET dob=excluded.dob;
    IF p_action = 'pending' THEN UPDATE public.trips SET require_approval=true WHERE id=p_trip; END IF;
    tok := trip_private.create_trip_invite(p_trip);
    PERFORM trip_private.lab_become(v);
    PERFORM public.join_trip(tok);
    PERFORM set_config('request.jwt.claims', coalesce(v_claims,''), true);
    PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub,''), true);
    UPDATE public.sandbox_bots SET trip_id=p_trip WHERE user_id=v;
    PERFORM trip_private.lab_card(p_trip, v, (SELECT name FROM public.sandbox_bots WHERE user_id=v) || CASE WHEN p_action='teen' THEN ' (teen)' ELSE '' END, 5);
    RETURN CASE WHEN p_action='teen' THEN 'A teen bot joined with an invite and is waiting for approval' ELSE 'A bot is waiting for your approval' END;
  ELSIF p_action = 'noalcohol' THEN
    SELECT m.user_id INTO v FROM public.trip_members m JOIN public.sandbox_bots b ON b.user_id=m.user_id WHERE m.trip_id=p_trip ORDER BY random() LIMIT 1;
    INSERT INTO public.player_private(user_id,dob,no_alcohol) VALUES (v, date '1995-06-15', true) ON CONFLICT (user_id) DO UPDATE SET no_alcohol=true;
    RETURN 'One bot turned on No alcohol (only that bot can see it)';
  ELSIF p_action = 'invite' THEN
    RETURN trip_private.create_trip_invite(p_trip);
  END IF;
  RAISE EXCEPTION 'Unknown Test Lab action';
END $$;

-- Wrappers
CREATE OR REPLACE FUNCTION public.my_access() RETURNS TABLE(beta boolean, launch boolean, has_dob boolean, age_range text, no_alcohol boolean) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.my_access() $$;
CREATE OR REPLACE FUNCTION public.public_launch() RETURNS boolean LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.public_launch() $$;
CREATE OR REPLACE FUNCTION public.set_my_dob(p_dob date, p_agree boolean) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_my_dob(p_dob,p_agree) $$;
CREATE OR REPLACE FUNCTION public.set_no_alcohol(p_on boolean) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_no_alcohol(p_on) $$;
CREATE OR REPLACE FUNCTION public.set_public_launch(p_on boolean) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_public_launch(p_on) $$;
CREATE OR REPLACE FUNCTION public.set_trip_access(p_trip uuid, p_code_enabled boolean, p_require_approval boolean) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_trip_access(p_trip,p_code_enabled,p_require_approval) $$;
CREATE OR REPLACE FUNCTION public.set_trip_vibe(p_trip uuid, p_vibe text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_trip_vibe(p_trip,p_vibe) $$;
CREATE OR REPLACE FUNCTION public.create_trip_invite(p_trip uuid) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.create_trip_invite(p_trip) $$;
CREATE OR REPLACE FUNCTION public.cancel_trip_invite(p_invite uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.cancel_trip_invite(p_invite) $$;
CREATE OR REPLACE FUNCTION public.pending_members(p_trip uuid) RETURNS TABLE(user_id uuid, name text, avatar_style text, avatar_seed text, age_range text, joined_at timestamptz) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.pending_members(p_trip) $$;
CREATE OR REPLACE FUNCTION public.approve_member(p_trip uuid, p_user uuid, p_approve boolean) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.approve_member(p_trip,p_user,p_approve) $$;
CREATE OR REPLACE FUNCTION public.my_waiting_trips() RETURNS TABLE(trip_id uuid, name text, destination text) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.my_waiting_trips() $$;
CREATE OR REPLACE FUNCTION public.lab_extra(p_trip uuid, p_action text, p_arg text) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.lab_extra(p_trip,p_action,p_arg) $$;

REVOKE EXECUTE ON FUNCTION public.my_access(), public.set_my_dob(date,boolean), public.set_no_alcohol(boolean), public.set_public_launch(boolean), public.set_trip_access(uuid,boolean,boolean), public.set_trip_vibe(uuid,text), public.create_trip_invite(uuid), public.cancel_trip_invite(uuid), public.pending_members(uuid), public.approve_member(uuid,uuid,boolean), public.my_waiting_trips(), public.lab_extra(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_access(), public.set_my_dob(date,boolean), public.set_no_alcohol(boolean), public.set_public_launch(boolean), public.set_trip_access(uuid,boolean,boolean), public.set_trip_vibe(uuid,text), public.create_trip_invite(uuid), public.cancel_trip_invite(uuid), public.pending_members(uuid), public.approve_member(uuid,uuid,boolean), public.my_waiting_trips(), public.lab_extra(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_launch(), trip_private.public_launch() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.my_access(), trip_private.set_my_dob(date,boolean), trip_private.set_no_alcohol(boolean), trip_private.set_public_launch(boolean), trip_private.set_trip_access(uuid,boolean,boolean), trip_private.set_trip_vibe(uuid,text), trip_private.create_trip_invite(uuid), trip_private.cancel_trip_invite(uuid), trip_private.pending_members(uuid), trip_private.approve_member(uuid,uuid,boolean), trip_private.my_waiting_trips(), trip_private.lab_extra(uuid,text,text), trip_private.has_beta_access(), trip_private.age_of(uuid), trip_private.age_range(int) TO authenticated;