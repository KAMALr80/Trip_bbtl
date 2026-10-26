
-- (1) approved-only helpers
CREATE OR REPLACE FUNCTION trip_private.shares_trip(p_other uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT p_other = auth.uid() OR EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON a.trip_id=b.trip_id
  WHERE a.user_id=auth.uid() AND b.user_id=p_other AND a.status='approved' AND b.status='approved') $$;

CREATE OR REPLACE FUNCTION trip_private.day_vote_results(p_trip uuid, p_date date) RETURNS TABLE(kind text, choice_id uuid, votes integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF p_date >= trip_private.trip_today(p_trip) THEN RETURN; END IF;
RETURN QUERY SELECT d.kind, d.choice_id, count(*)::int FROM public.day_votes d WHERE d.trip_id=p_trip AND d.day_date=p_date GROUP BY d.kind, d.choice_id; END $$;

CREATE OR REPLACE FUNCTION trip_private.play_day(p_trip uuid, p_date date) RETURNS trip_day_games
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ DECLARE g public.trip_day_games; BEGIN
IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
IF p_date IS DISTINCT FROM trip_private.trip_today(p_trip) THEN RAISE EXCEPTION 'That day''s games are closed'; END IF;
SELECT * INTO g FROM public.trip_day_games WHERE trip_id=p_trip AND day_date=p_date;
IF NOT FOUND OR g.released_at IS NULL THEN RAISE EXCEPTION 'Today''s games aren''t ready yet'; END IF; RETURN g; END $$;

DO $do$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('trip_private.trip_season(uuid)'::regprocedure) INTO d;
 d := replace(d, 'IF NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid()) THEN', 'IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN');
 d := replace(d, 'WHERE m.trip_id=p_trip GROUP BY m.user_id, m.trip_start_stamps', 'WHERE m.trip_id=p_trip AND m.status=''approved'' GROUP BY m.user_id, m.trip_start_stamps');
 IF position('is_trip_member' in d)=0 OR position('m.status=''approved''' in d)=0 THEN RAISE EXCEPTION 'trip_season patch failed'; END IF;
 EXECUTE d;
END $do$;

-- storage policies: approved members only + image types
DROP POLICY IF EXISTS "Members view trip game photos" ON storage.objects;
CREATE POLICY "Members view trip game photos" ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='trip-photos' AND CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN trip_private.is_trip_member(split_part(name,'/',1)::uuid, auth.uid()) ELSE false END);
DROP POLICY IF EXISTS "Players upload own trip game photos" ON storage.objects;
CREATE POLICY "Players upload own trip game photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='trip-photos' AND split_part(name,'/',2)=auth.uid()::text AND lower(name) ~ '\.(jpe?g|png|webp)$'
 AND CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN trip_private.is_trip_member(split_part(name,'/',1)::uuid, auth.uid()) ELSE false END
 AND trip_private.photo_quota_ok(name));
DROP POLICY IF EXISTS "Players upload own trip photo" ON storage.objects;
CREATE POLICY "Players upload own trip photo" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='player-avatars' AND split_part(name,'/',2)=auth.uid()::text AND lower(name) ~ '\.(jpe?g|png|webp)$'
 AND CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN trip_private.is_trip_member(split_part(name,'/',1)::uuid, auth.uid()) ELSE false END);
DROP POLICY IF EXISTS "Players replace own trip photo" ON storage.objects;
CREATE POLICY "Players replace own trip photo" ON storage.objects FOR UPDATE TO authenticated
 USING (bucket_id='player-avatars' AND split_part(name,'/',2)=auth.uid()::text AND CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN trip_private.is_trip_member(split_part(name,'/',1)::uuid, auth.uid()) ELSE false END)
 WITH CHECK (bucket_id='player-avatars' AND split_part(name,'/',2)=auth.uid()::text AND lower(name) ~ '\.(jpe?g|png|webp)$' AND CASE WHEN split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' THEN trip_private.is_trip_member(split_part(name,'/',1)::uuid, auth.uid()) ELSE false END);
DROP POLICY IF EXISTS "Account avatar upload" ON storage.objects;
CREATE POLICY "Account avatar upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='player-avatars' AND split_part(name,'/',1)='account' AND split_part(name,'/',2)=auth.uid()::text AND lower(name) ~ '\.(jpe?g|png|webp)$');
DROP POLICY IF EXISTS "Upload own bug screenshots" ON storage.objects;
CREATE POLICY "Upload own bug screenshots" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='bug-screenshots' AND split_part(name,'/',1)=auth.uid()::text AND lower(name) ~ '\.(jpe?g|png|webp)$');

-- (3) photo quota by real owner, trip folder and server date
CREATE OR REPLACE FUNCTION trip_private.photo_quota_ok(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','storage' AS $$
 SELECT (SELECT count(*) FROM storage.objects o WHERE o.bucket_id='trip-photos' AND o.owner_id=auth.uid()::text
   AND split_part(o.name,'/',1)=split_part(p_name,'/',1) AND o.created_at >= date_trunc('day', now())) < 15 $$;

-- (2) QOTW salted shuffle
ALTER TABLE public.weekly_questions ADD COLUMN IF NOT EXISTS shuffle_salt uuid NOT NULL DEFAULT gen_random_uuid();
CREATE OR REPLACE FUNCTION trip_private.ordered_answers(p_trip uuid, p_week integer) RETURNS TABLE(idx integer, user_id uuid, answer text, emoji text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT (row_number() OVER (ORDER BY md5(q.shuffle_salt::text || a.user_id::text)) - 1)::int, a.user_id, a.answer, a.emoji
 FROM public.weekly_answers a JOIN public.weekly_questions q ON q.trip_id=a.trip_id AND q.week_number=a.week_number
 WHERE a.trip_id=p_trip AND a.week_number=p_week $$;

-- (4) codes, invites, rate limits, removals
CREATE TABLE IF NOT EXISTS trip_private.code_attempts (id bigserial PRIMARY KEY, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS code_attempts_user_time ON trip_private.code_attempts(user_id, created_at);
CREATE TABLE IF NOT EXISTS trip_private.trip_removals (trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id,user_id));

CREATE OR REPLACE FUNCTION trip_private.code_rate_check() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
 IF (SELECT count(*) FROM trip_private.code_attempts WHERE user_id=auth.uid() AND created_at > now() - interval '1 hour') >= 10 THEN
  RAISE EXCEPTION 'Too many tries. Take a breather and try again in an hour.'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.new_trip_code() RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE bytes bytea := extensions.gen_random_bytes(8); code text := ''; i int; BEGIN
 FOR i IN 0..7 LOOP code := code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', get_byte(bytes,i) % 24 + 1, 1); END LOOP; RETURN code; END $$;

CREATE OR REPLACE FUNCTION trip_private.create_trip_invite(p_trip uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tok text := ''; bytes bytea := extensions.gen_random_bytes(10); i int; BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can invite'; END IF;
 IF (SELECT count(*) FROM public.trip_invites WHERE trip_id=p_trip AND used_at IS NULL AND cancelled_at IS NULL AND expires_at > now()) >= 50 THEN RAISE EXCEPTION 'That''s 50 open invites — cancel some first'; END IF;
 FOR i IN 0..9 LOOP tok := tok || substr('ABCDEFGHJKLMNPQRSTUVWXYZ', get_byte(bytes,i) % 24 + 1, 1); END LOOP;
 INSERT INTO public.trip_invites(token,trip_id,created_by) VALUES (tok,p_trip,auth.uid());
 RETURN tok; END $$;

DROP FUNCTION IF EXISTS public.trip_invite_preview(text);
DROP FUNCTION IF EXISTS trip_private.trip_invite_preview(text);
CREATE FUNCTION trip_private.trip_invite_preview(p_code text)
 RETURNS TABLE(name text, destination text, motto text, start_date date, end_date date, member_count bigint, captain_name text, captain_style text, captain_seed text, captain_avatar_url text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
 IF auth.uid() IS NULL THEN RETURN; END IF;
 PERFORM trip_private.code_rate_check();
 RETURN QUERY SELECT t.name, t.destination, t.motto, t.start_date, t.end_date,
    (SELECT count(*) FROM public.trip_members m WHERE m.trip_id = t.id AND m.status='approved'),
    COALESCE(p.game_name, c.game_name, cp.display_name, 'Your Captain'), COALESCE(p.avatar_style, c.avatar_style, 'street'),
    COALESCE(p.avatar_seed, c.avatar_seed, cap.user_id::text), cp.avatar_url
  FROM public.trips t JOIN public.trip_members cap ON cap.trip_id = t.id AND cap.role = 'captain'
  LEFT JOIN public.profiles cp ON cp.id = cap.user_id LEFT JOIN public.player_profiles p ON p.user_id = cap.user_id
  LEFT JOIN public.trip_player_cards c ON c.trip_id = t.id AND c.user_id = cap.user_id
  WHERE t.ended_at IS NULL AND ((t.join_code = upper(trim(p_code)) AND t.join_code_enabled)
    OR EXISTS (SELECT 1 FROM public.trip_invites i WHERE i.trip_id=t.id AND i.token=upper(trim(p_code)) AND i.used_at IS NULL AND i.cancelled_at IS NULL AND i.expires_at > now()))
  LIMIT 1;
 IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); END IF;
END $$;
CREATE FUNCTION public.trip_invite_preview(p_code text)
 RETURNS TABLE(name text, destination text, motto text, start_date date, end_date date, member_count bigint, captain_name text, captain_style text, captain_seed text, captain_avatar_url text)
 LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.trip_invite_preview(p_code) $$;

CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; gr trip_private.trip_join_grants%ROWTYPE; v_avg integer := 0; v_week integer; v_count integer; v_closed boolean; v_trip_avg integer := 0; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; BEGIN
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
 SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;
 IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
 IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
 v_status := CASE WHEN t.require_approval OR v_age < 18 THEN 'pending' ELSE 'approved' END;
 IF v_status = 'approved' THEN INSERT INTO public.beta_access(user_id, source) VALUES (auth.uid(), 'invite') ON CONFLICT DO NOTHING; END IF;
 IF via_invite THEN
   UPDATE public.trip_invites SET used_by=auth.uid(), used_at=now() WHERE id=inv.id;
   DELETE FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid();
 END IF;
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
 IF v_closed AND v_status='approved' AND (now() AT TIME ZONE t.home_timezone)::date > t.start_date THEN
   SELECT coalesce(floor(avg(s.stamps) FILTER (WHERE s.stamps > 0 AND s.user_id <> auth.uid())),0)::int INTO v_trip_avg FROM trip_private.trip_season(t.id) s;
   UPDATE public.trip_members SET trip_start_stamps=v_trip_avg WHERE trip_id=t.id AND user_id=auth.uid();
 END IF;
 INSERT INTO trip_private.trip_join_grants(trip_id,user_id,start_stamps,joined_week,trip_start_stamps,season_closed) VALUES(t.id,auth.uid(),v_avg,v_week,v_trip_avg,v_closed);
 RETURN t.id;
END $$;

CREATE OR REPLACE FUNCTION trip_private.approve_member(p_trip uuid, p_user uuid, p_approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can approve members'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='pending') THEN RAISE EXCEPTION 'That request is no longer waiting'; END IF;
 IF p_approve THEN
  UPDATE public.trip_members SET status='approved', joined_at=now() WHERE trip_id=p_trip AND user_id=p_user;
  INSERT INTO public.beta_access(user_id, source) VALUES (p_user, 'invite') ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; END IF; END $$;

DO $do$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('trip_private.manage_trip_member(uuid,uuid,text)'::regprocedure) INTO d;
 d := replace(d, 'DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user;',
  'DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; INSERT INTO trip_private.trip_removals(trip_id,user_id) VALUES (p_trip,p_user) ON CONFLICT DO NOTHING;');
 IF position('trip_removals' in d)=0 THEN RAISE EXCEPTION 'manage patch failed'; END IF;
 EXECUTE d;
END $do$;

-- (6) teens / vibe for weekly prompts; no member spicy cards
CREATE OR REPLACE FUNCTION trip_private.pick_weekly_prompt(p_trip uuid) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
SELECT p.prompt FROM public.weekly_question_pool p WHERE (NOT p.spicy OR (
  (SELECT vibe FROM public.trips WHERE id=p_trip)='party'
  AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.status='approved' AND coalesce(trip_private.age_of(m.user_id),0) < 21)))
ORDER BY (p.prompt IN (SELECT prompt FROM public.weekly_questions WHERE trip_id=p_trip)), random() LIMIT 1 $$;
DROP POLICY IF EXISTS "Members add trip cards" ON public.game_cards;
CREATE POLICY "Members add trip cards" ON public.game_cards FOR INSERT TO authenticated WITH CHECK (trip_id IS NOT NULL AND category <> 'spicy' AND trip_private.is_trip_member(trip_id, auth.uid()));

-- (9) AI usage
CREATE TABLE public.ai_usage (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Founder reads AI usage" ON public.ai_usage FOR SELECT TO authenticated USING (trip_private.is_app_admin());
CREATE INDEX ai_usage_lookup ON public.ai_usage(kind, created_at);

CREATE OR REPLACE FUNCTION trip_private.use_ai_quota(p_kind text, p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE lim int; used int; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'AI ideas are for beta members only.'; END IF;
 IF p_trip IS NOT NULL AND NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first.'; END IF;
 lim := CASE p_kind WHEN 'names' THEN 10 WHEN 'cards' THEN 5 WHEN 'trip_day' THEN 3 WHEN 'itinerary' THEN 20 ELSE 0 END;
 IF lim = 0 OR (p_kind <> 'names' AND p_trip IS NULL) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF p_kind = 'names' THEN SELECT count(*) INTO used FROM public.ai_usage WHERE kind='names' AND user_id=auth.uid() AND created_at >= date_trunc('day', now());
 ELSE SELECT count(*) INTO used FROM public.ai_usage WHERE kind=p_kind AND trip_id=p_trip AND created_at >= date_trunc('day', now()); END IF;
 IF used >= lim THEN RAISE EXCEPTION 'That''s today''s limit for AI ideas — try again tomorrow.'; END IF;
 INSERT INTO public.ai_usage(user_id, trip_id, kind) VALUES (auth.uid(), p_trip, p_kind);
END $$;
CREATE OR REPLACE FUNCTION public.use_ai_quota(p_kind text, p_trip uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.use_ai_quota(p_kind, p_trip) $$;

-- (5) function permissions
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA trip_private FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA trip_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE USAGE ON SCHEMA trip_private FROM anon;
GRANT USAGE ON SCHEMA trip_private TO authenticated, service_role;
DO $do$ DECLARE f record; src text; BEGIN
 SELECT string_agg(p.prosrc, ' ') INTO src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
 src := src || ' ' || coalesce((SELECT string_agg(coalesce(qual,'')||' '||coalesce(with_check,''),' ') FROM pg_policies WHERE schemaname IN ('public','storage')),'');
 FOR f IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND p.prokind='f' LOOP
  IF src ~ ('trip_private\.' || f.proname || '\(') OR f.proname = ANY (ARRAY['lab_card','lab_itinerary','lab_teams','ordered_answers','qotw_finalize','game_stamps','captain_of','night_no_show_check','effective_crowning']) THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
 END LOOP;
END $do$;
DO $do$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND (p.proname LIKE 'qotw\_%' OR p.proname IN ('season_info','set_season','crown_now','weekly_question_status','use_ai_quota','trip_invite_preview','join_trip')) LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
 END LOOP;
END $do$;
