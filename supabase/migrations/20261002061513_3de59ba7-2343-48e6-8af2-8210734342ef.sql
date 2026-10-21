
-- Round 17: Captain-only vs game-partner permissions, takeover, team picking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS team_mode text NOT NULL DEFAULT 'assign' CHECK (team_mode IN ('assign','pick'));
ALTER TABLE public.trip_teams ADD COLUMN IF NOT EXISTS capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 30);

CREATE TABLE public.trip_role_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  from_user uuid,
  to_user uuid,
  role text NOT NULL,
  reason text NOT NULL,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trip_role_changes TO authenticated;
GRANT ALL ON public.trip_role_changes TO service_role;
ALTER TABLE public.trip_role_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaders and founder read role changes" ON public.trip_role_changes FOR SELECT TO authenticated
  USING (trip_private.is_leader(trip_id) OR trip_private.is_app_admin() OR to_user = auth.uid() OR from_user = auth.uid());
CREATE INDEX ON public.trip_role_changes(trip_id, created_at DESC);

CREATE OR REPLACE FUNCTION trip_private.log_role(p_trip uuid, p_from uuid, p_to uuid, p_role text, p_reason text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  INSERT INTO public.trip_role_changes(trip_id,from_user,to_user,role,reason,actor) VALUES (p_trip,p_from,p_to,p_role,p_reason,auth.uid()) $$;

CREATE OR REPLACE FUNCTION trip_private.night_live(p_trip uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped AND starts_at BETWEEN now()-interval '4 hours' AND now()+interval '2 hours') $$;

-- Captain-only: details/dates, invites, code, time zone, game days
CREATE OR REPLACE FUNCTION trip_private.edit_trip(p_trip uuid, p_name text, p_destination text, p_start_date date, p_end_date date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can edit trip details'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100 OR length(trim(coalesce(p_destination,''))) NOT BETWEEN 1 AND 120 OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN RAISE EXCEPTION 'Check your trip details'; END IF;
 UPDATE public.trips SET name=trim(p_name),destination=trim(p_destination),start_date=p_start_date,end_date=p_end_date WHERE id=p_trip;
END $function$;

DO $$ DECLARE r record; d text; BEGIN
 FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='trip_private' AND p.proname IN ('create_trip_invite','cancel_trip_invite','reset_trip_code','set_trip_timezone','set_game_days') LOOP
   d := pg_get_functiondef(r.oid);
   d := replace(d, 'trip_private.is_leader(', 'trip_private.is_captain(');
   d := replace(d, 'role IN (''captain'',''co_captain'')', 'role=''captain''');
   IF d ~ 'is_leader\(|co_captain' THEN RAISE EXCEPTION 'Unexpected leader check left in %', r.proname; END IF;
   EXECUTE d;
 END LOOP;
END $$;

-- Members: only the Captain picks/replaces Co-Captain, removes, passes crown
CREATE OR REPLACE FUNCTION trip_private.manage_trip_member(p_trip uuid, p_user uuid, p_action text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE actor_role text; target_role text; old_co uuid; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT role INTO actor_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='approved';
 SELECT role INTO target_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='approved';
 IF actor_role IS DISTINCT FROM 'captain' OR target_role IS NULL OR p_user=auth.uid() THEN RAISE EXCEPTION 'Only the Captain can manage members'; END IF;
 IF p_action='promote' THEN
  IF target_role='co_captain' THEN RETURN; END IF;
  SELECT user_id INTO old_co FROM public.trip_members WHERE trip_id=p_trip AND role='co_captain' LIMIT 1;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role='co_captain';
  IF old_co IS NOT NULL THEN PERFORM trip_private.log_role(p_trip, old_co, NULL, 'co_captain', 'replaced'); END IF;
  UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.log_role(p_trip, old_co, p_user, 'co_captain', 'picked by Captain');
 ELSIF p_action='demote' THEN
  IF target_role<>'co_captain' THEN RETURN; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.log_role(p_trip, p_user, NULL, 'co_captain', 'removed by Captain');
 ELSIF p_action='remove' THEN
  DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; INSERT INTO trip_private.trip_removals(trip_id,user_id) VALUES (p_trip,p_user) ON CONFLICT DO NOTHING;
  PERFORM trip_private.log_role(p_trip, p_user, NULL, target_role, 'removed from trip');
 ELSIF p_action='pass_crown' THEN
  IF coalesce(trip_private.age_of(p_user),0) < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_user) THEN RAISE EXCEPTION 'The new Captain needs to be 18 or older'; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=auth.uid();
  UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.log_role(p_trip, auth.uid(), p_user, 'captain', 'handed off');
 ELSE RAISE EXCEPTION 'Not allowed'; END IF;
END $function$;

-- Step down / takeover / reclaim
CREATE OR REPLACE FUNCTION trip_private.step_down(p_trip uuid, p_to uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can step down'; END IF;
 IF p_to = auth.uid() OR NOT trip_private.is_trip_member(p_trip, p_to) THEN RAISE EXCEPTION 'Pick an approved member'; END IF;
 IF coalesce(trip_private.age_of(p_to),0) < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_to) THEN RAISE EXCEPTION 'The new Captain needs to be 18 or older'; END IF;
 UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=auth.uid();
 UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=p_to;
 PERFORM trip_private.log_role(p_trip, auth.uid(), p_to, 'captain', 'stepped down');
END $function$;

CREATE OR REPLACE FUNCTION trip_private.captain_status(p_trip uuid)
 RETURNS TABLE(captain_id uuid, captain_last_seen timestamptz, can_take_over boolean, can_reclaim boolean, reclaim_until timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
 WITH c AS (SELECT m.user_id, p.last_seen_at FROM public.trip_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=p_trip AND m.role='captain' LIMIT 1),
 t AS (SELECT * FROM public.trip_role_changes WHERE trip_id=p_trip AND role='captain' AND reason='takeover' ORDER BY created_at DESC LIMIT 1)
 SELECT c.user_id, c.last_seen_at,
   EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='co_captain' AND status='approved') AND coalesce(c.last_seen_at < now()-interval '14 days', false),
   EXISTS (SELECT 1 FROM t WHERE t.from_user=auth.uid() AND t.to_user=c.user_id AND t.created_at > now()-interval '7 days') AND trip_private.is_trip_member(p_trip, auth.uid()),
   (SELECT created_at + interval '7 days' FROM t WHERE t.from_user=auth.uid())
 FROM c WHERE trip_private.is_trip_member(p_trip, auth.uid()) $$;

CREATE OR REPLACE FUNCTION trip_private.take_over_captain(p_trip uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE cap uuid; seen timestamptz; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='co_captain' AND status='approved') THEN RAISE EXCEPTION 'Only the Co-Captain can take over'; END IF;
 SELECT m.user_id, p.last_seen_at INTO cap, seen FROM public.trip_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=p_trip AND m.role='captain';
 IF cap IS NOT NULL AND coalesce(seen, now()) > now()-interval '14 days' THEN RAISE EXCEPTION 'The Captain has been active in the last 14 days'; END IF;
 UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=cap;
 UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=auth.uid();
 PERFORM trip_private.log_role(p_trip, cap, auth.uid(), 'captain', 'takeover');
END $function$;

CREATE OR REPLACE FUNCTION trip_private.reclaim_captain(p_trip uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE t public.trip_role_changes; cap uuid; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT * INTO t FROM public.trip_role_changes WHERE trip_id=p_trip AND role='captain' AND reason='takeover' ORDER BY created_at DESC LIMIT 1;
 SELECT user_id INTO cap FROM public.trip_members WHERE trip_id=p_trip AND role='captain';
 IF t.id IS NULL OR t.from_user<>auth.uid() OR t.to_user IS DISTINCT FROM cap OR t.created_at < now()-interval '7 days' OR NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'The 7-day reclaim window has passed'; END IF;
 UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role='co_captain' AND user_id<>cap;
 UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=cap;
 UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=auth.uid();
 PERFORM trip_private.log_role(p_trip, cap, auth.uid(), 'captain', 'reclaimed');
END $function$;

CREATE OR REPLACE FUNCTION trip_private.touch_last_seen()
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ UPDATE public.profiles SET last_seen_at=now() WHERE id=auth.uid() AND last_seen_at < now()-interval '10 minutes' $$;

-- Teams: Captain anytime, Co-Captain only during a live game night
CREATE OR REPLACE FUNCTION trip_private.can_manage_teams(p_trip uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT trip_private.is_captain(p_trip) OR (trip_private.is_leader(p_trip) AND trip_private.night_live(p_trip)) $$;

CREATE OR REPLACE FUNCTION trip_private.save_teams(p_trip uuid, p_teams jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE t jsonb; tid uuid; u text; BEGIN
IF NOT trip_private.can_manage_teams(p_trip) THEN RAISE EXCEPTION 'Only the Captain can set teams (Co-Captain during a game night)'; END IF;
IF jsonb_typeof(coalesce(p_teams,'[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(p_teams,'[]'::jsonb)) > 4 THEN RAISE EXCEPTION 'Up to 4 teams'; END IF;
DELETE FROM public.trip_teams WHERE trip_id=p_trip;
FOR t IN SELECT * FROM jsonb_array_elements(coalesce(p_teams,'[]'::jsonb)) LOOP
  INSERT INTO public.trip_teams(trip_id, name, color, capacity) VALUES (p_trip, left(trim(t->>'name'),40), t->>'color', nullif(t->>'capacity','')::int) RETURNING id INTO tid;
  FOR u IN SELECT jsonb_array_elements_text(coalesce(t->'members','[]'::jsonb)) LOOP
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=u::uuid) THEN
      INSERT INTO public.trip_team_members(trip_id, user_id, team_id) VALUES (p_trip, u::uuid, tid) ON CONFLICT (trip_id, user_id) DO UPDATE SET team_id=EXCLUDED.team_id; END IF;
  END LOOP; END LOOP; END $function$;

CREATE OR REPLACE FUNCTION trip_private.team_capacity(p_team uuid)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(t.capacity, greatest(1, ceil((SELECT count(*) FROM public.trip_members m WHERE m.trip_id=t.trip_id AND m.status='approved')::numeric / greatest(1,(SELECT count(*) FROM public.trip_teams x WHERE x.trip_id=t.trip_id)))::int)) FROM public.trip_teams t WHERE t.id=p_team $$;

CREATE OR REPLACE FUNCTION trip_private.set_team_mode(p_trip uuid, p_mode text, p_caps jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE k text; BEGIN
 IF NOT trip_private.can_manage_teams(p_trip) THEN RAISE EXCEPTION 'Only the Captain can change team settings'; END IF;
 IF p_mode NOT IN ('assign','pick') THEN RAISE EXCEPTION 'Pick a team mode'; END IF;
 UPDATE public.trips SET team_mode=p_mode WHERE id=p_trip;
 FOR k IN SELECT jsonb_object_keys(coalesce(p_caps,'{}'::jsonb)) LOOP
   UPDATE public.trip_teams SET capacity=nullif(p_caps->>k,'')::int WHERE id=k::uuid AND trip_id=p_trip;
 END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.pick_team(p_trip uuid, p_team uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE t public.trips; cap int; taken int; BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Not a trip member'; END IF;
 IF t.team_mode<>'pick' AND NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Your Captain is assigning teams'; END IF;
 IF EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND NOT skipped AND starts_at <= now()) AND NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Teams are locked now that game nights have started — ask your Captain'; END IF;
 PERFORM 1 FROM public.trip_teams WHERE id=p_team AND trip_id=p_trip FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'That team no longer exists'; END IF;
 cap := trip_private.team_capacity(p_team);
 SELECT count(*) INTO taken FROM public.trip_team_members WHERE team_id=p_team AND user_id<>auth.uid();
 IF taken >= cap THEN RAISE EXCEPTION 'That team is full'; END IF;
 INSERT INTO public.trip_team_members(trip_id,user_id,team_id) VALUES (p_trip,auth.uid(),p_team) ON CONFLICT (trip_id,user_id) DO UPDATE SET team_id=EXCLUDED.team_id;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.auto_team_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE tid uuid; BEGIN
 IF NEW.status='approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved')
    AND NOT EXISTS (SELECT 1 FROM public.trip_team_members WHERE trip_id=NEW.trip_id AND user_id=NEW.user_id) THEN
   SELECT t.id INTO tid FROM public.trip_teams t WHERE t.trip_id=NEW.trip_id
     ORDER BY (SELECT count(*) FROM public.trip_team_members x WHERE x.team_id=t.id), t.created_at LIMIT 1 FOR UPDATE;
   IF tid IS NOT NULL THEN INSERT INTO public.trip_team_members(trip_id,user_id,team_id) VALUES (NEW.trip_id,NEW.user_id,tid) ON CONFLICT DO NOTHING; END IF;
 END IF;
 RETURN NEW; END $function$;
CREATE TRIGGER trip_members_auto_team AFTER INSERT OR UPDATE OF status ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.auto_team_trg();

-- Public wrappers
CREATE OR REPLACE FUNCTION public.step_down(p_trip uuid, p_to uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.step_down(p_trip,p_to) $$;
CREATE OR REPLACE FUNCTION public.take_over_captain(p_trip uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.take_over_captain(p_trip) $$;
CREATE OR REPLACE FUNCTION public.reclaim_captain(p_trip uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.reclaim_captain(p_trip) $$;
CREATE OR REPLACE FUNCTION public.captain_status(p_trip uuid) RETURNS TABLE(captain_id uuid, captain_last_seen timestamptz, can_take_over boolean, can_reclaim boolean, reclaim_until timestamptz) LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.captain_status(p_trip) $$;
CREATE OR REPLACE FUNCTION public.touch_last_seen() RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.touch_last_seen() $$;
CREATE OR REPLACE FUNCTION public.pick_team(p_trip uuid, p_team uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.pick_team(p_trip,p_team) $$;
CREATE OR REPLACE FUNCTION public.set_team_mode(p_trip uuid, p_mode text, p_caps jsonb) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_team_mode(p_trip,p_mode,p_caps) $$;
CREATE OR REPLACE FUNCTION public.team_capacities(p_trip uuid) RETURNS TABLE(team_id uuid, capacity integer, taken bigint) LANGUAGE sql SET search_path TO 'public' AS $$
  SELECT t.id, trip_private.team_capacity(t.id), (SELECT count(*) FROM public.trip_team_members x WHERE x.team_id=t.id) FROM public.trip_teams t WHERE t.trip_id=p_trip AND trip_private.is_trip_member(p_trip, auth.uid()) $$;

REVOKE ALL ON FUNCTION trip_private.log_role(uuid,uuid,uuid,text,text), trip_private.night_live(uuid), trip_private.step_down(uuid,uuid), trip_private.captain_status(uuid), trip_private.take_over_captain(uuid), trip_private.reclaim_captain(uuid), trip_private.touch_last_seen(), trip_private.can_manage_teams(uuid), trip_private.team_capacity(uuid), trip_private.set_team_mode(uuid,text,jsonb), trip_private.pick_team(uuid,uuid), trip_private.auto_team_trg() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.night_live(uuid), trip_private.step_down(uuid,uuid), trip_private.captain_status(uuid), trip_private.take_over_captain(uuid), trip_private.reclaim_captain(uuid), trip_private.touch_last_seen(), trip_private.can_manage_teams(uuid), trip_private.team_capacity(uuid), trip_private.set_team_mode(uuid,text,jsonb), trip_private.pick_team(uuid,uuid), trip_private.log_role(uuid,uuid,uuid,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.step_down(uuid,uuid), public.take_over_captain(uuid), public.reclaim_captain(uuid), public.captain_status(uuid), public.touch_last_seen(), public.pick_team(uuid,uuid), public.set_team_mode(uuid,text,jsonb), public.team_capacities(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.step_down(uuid,uuid), public.take_over_captain(uuid), public.reclaim_captain(uuid), public.captain_status(uuid), public.touch_last_seen(), public.pick_team(uuid,uuid), public.set_team_mode(uuid,text,jsonb), public.team_capacities(uuid) TO authenticated;

-- Test Lab (founder + sandbox only)
CREATE OR REPLACE FUNCTION trip_private.lab_r17(p_trip uuid, p_action text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE me uuid := auth.uid(); bot uuid; cap uuid; res text := ''; ok boolean; b record; tm record; claims text; BEGIN
 IF NOT trip_private.is_app_admin() OR NOT EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND is_sandbox) THEN RAISE EXCEPTION 'Test Lab is founder-only'; END IF;
 claims := current_setting('request.jwt.claims', true);
 SELECT m.user_id INTO bot FROM public.trip_members m JOIN public.sandbox_bots s ON s.user_id=m.user_id WHERE m.trip_id=p_trip AND m.status='approved' ORDER BY m.joined_at LIMIT 1;
 IF p_action IN ('co_captain_try','takeover_setup') THEN
   UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role IN ('captain','co_captain');
   UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=bot;
   UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=me;
 END IF;
 IF p_action='co_captain_try' THEN
   BEGIN PERFORM trip_private.edit_trip(p_trip,'x','y',current_date,current_date+3); res:=res||'dates: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'dates: refused ✓; '; END;
   BEGIN PERFORM trip_private.set_trip_vibe(p_trip,'party'); res:=res||'vibe: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'vibe: refused ✓; '; END;
   BEGIN PERFORM trip_private.set_trip_timezone(p_trip,'UTC'); res:=res||'time zone: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'time zone: refused ✓; '; END;
   BEGIN PERFORM trip_private.create_trip_invite(p_trip); res:=res||'invites: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'invites: refused ✓; '; END;
   BEGIN PERFORM trip_private.set_trip_access(p_trip,true,true); res:=res||'approval: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'approval: refused ✓; '; END;
   BEGIN PERFORM trip_private.approve_adult_player(p_trip,bot,true); res:=res||'21+: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'21+: refused ✓; '; END;
   BEGIN PERFORM trip_private.unlock_trip(p_trip); res:=res||'unlock: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'unlock: refused ✓; '; END;
   BEGIN PERFORM trip_private.save_cost_item(p_trip,NULL,'t','other',100,'even','[]'::jsonb,NULL); res:=res||'costs: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'costs: refused ✓; '; END;
   BEGIN PERFORM trip_private.manage_trip_member(p_trip,bot,'remove'); res:=res||'remove: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'remove: refused ✓; '; END;
   BEGIN PERFORM trip_private.apply_reschedule(p_trip,7,3); res:=res||'plan: ALLOWED ✗; '; EXCEPTION WHEN others THEN res:=res||'plan: refused ✓; '; END;
   res := res || 'can run night: ' || CASE WHEN trip_private.is_leader(p_trip) THEN 'yes ✓' ELSE 'no ✗' END;
   RETURN res;
 ELSIF p_action='takeover_setup' THEN
   UPDATE public.profiles SET last_seen_at=now()-interval '15 days' WHERE id=bot;
   RETURN 'A bot is Captain (last seen 15 days ago); you are Co-Captain — open Squad/Trip to see "Take over as Captain".';
 ELSIF p_action='reclaim_setup' THEN
   UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role IN ('captain','co_captain');
   UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=bot;
   INSERT INTO public.trip_role_changes(trip_id,from_user,to_user,role,reason,actor) VALUES (p_trip,me,bot,'captain','takeover',bot);
   RETURN 'A bot took over from you 2 minutes ago — you can reclaim for 7 days.';
 ELSIF p_action='teams_pick' THEN
   UPDATE public.trips SET team_mode='pick' WHERE id=p_trip;
   IF NOT EXISTS (SELECT 1 FROM public.trip_teams WHERE trip_id=p_trip) THEN
     INSERT INTO public.trip_teams(trip_id,name,color) VALUES (p_trip,'Mango','orange'),(p_trip,'Neon','pink');
   END IF;
   DELETE FROM public.trip_team_members WHERE trip_id=p_trip;
   FOR b IN SELECT m.user_id FROM public.trip_members m JOIN public.sandbox_bots s ON s.user_id=m.user_id WHERE m.trip_id=p_trip AND m.status='approved' ORDER BY m.joined_at LOOP
     PERFORM set_config('request.jwt.claims', json_build_object('sub',b.user_id,'role','authenticated')::text, true);
     ok := false;
     FOR tm IN SELECT id FROM public.trip_teams WHERE trip_id=p_trip ORDER BY name LOOP
       BEGIN PERFORM trip_private.pick_team(p_trip, tm.id); ok := true; EXIT; EXCEPTION WHEN others THEN NULL; END;
     END LOOP;
     IF NOT ok THEN res := res || '1 bot found every team full; '; END IF;
   END LOOP;
   PERFORM set_config('request.jwt.claims', claims, true);
   RETURN res || 'Bots picked teams in order — the first team filled up, the rest overflowed to the next. You pick last.';
 END IF;
 RAISE EXCEPTION 'Unknown lab action';
END $function$;
CREATE OR REPLACE FUNCTION public.lab_r17(p_trip uuid, p_action text) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.lab_r17(p_trip,p_action) $$;
REVOKE ALL ON FUNCTION trip_private.lab_r17(uuid,text), public.lab_r17(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.lab_r17(uuid,text), public.lab_r17(uuid,text) TO authenticated;
