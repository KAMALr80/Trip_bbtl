ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'preview' CHECK (level IN ('full','preview'));
UPDATE public.trips SET level='full';

CREATE TABLE trip_private.preview_settings (id int PRIMARY KEY DEFAULT 1 CHECK (id=1),
 features jsonb NOT NULL DEFAULT '{"at_home":false,"ai_extras":false,"trip_pot":false,"passport":true,"challenges":true,"sing_off":false,"calendar":true,"photo_wall":false,"qotw":true,"host_timer":true,"spin_wheel":true,"teams":true,"wrapped":true,"party_cards":false}',
 slice_pct int NOT NULL DEFAULT 20 CHECK (slice_pct BETWEEN 1 AND 100), max_trips int NOT NULL DEFAULT 1 CHECK (max_trips BETWEEN 1 AND 50),
 ai_daily int NOT NULL DEFAULT 3 CHECK (ai_daily BETWEEN 0 AND 100), ai_credits int NOT NULL DEFAULT 5 CHECK (ai_credits BETWEEN 0 AND 500), updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO trip_private.preview_settings DEFAULT VALUES;
CREATE TABLE trip_private.preview_log (id bigserial PRIMARY KEY, actor uuid, kind text NOT NULL, target text, old_value jsonb, new_value jsonb, created_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION trip_private.trip_level_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN NEW.level := CASE WHEN coalesce(NEW.is_sandbox,false) OR trip_private.is_app_admin() THEN 'full' ELSE 'preview' END; RETURN NEW; END $$;
CREATE TRIGGER trips_level_default BEFORE INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION trip_private.trip_level_trg();

CREATE OR REPLACE FUNCTION trip_private.feature_on(p_trip uuid, p_feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT t.level='full' OR coalesce((s.features->>p_feature)::boolean,false) FROM public.trips t, trip_private.preview_settings s WHERE t.id=p_trip), true) $$;
CREATE OR REPLACE FUNCTION trip_private.require_feature(p_trip uuid, p_feature text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT trip_private.feature_on(p_trip,p_feature) THEN RAISE EXCEPTION 'COMING_SOON: This feature is coming soon for preview trips.'; END IF; END $$;
CREATE OR REPLACE FUNCTION trip_private.in_slice(p_trip uuid, p_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT t.level='full' OR abs(hashtext(p_key||':'||to_char(now(),'IYYY-IW'))) % 100 < s.slice_pct FROM public.trips t, trip_private.preview_settings s WHERE t.id=p_trip), true) $$;
CREATE OR REPLACE FUNCTION trip_private.preview_room_ok() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT trip_private.is_app_admin() OR (SELECT count(DISTINCT m.trip_id) FROM public.trip_members m JOIN public.trips t ON t.id=m.trip_id
   WHERE m.user_id=auth.uid() AND NOT coalesce(t.is_sandbox,false) AND (m.role='captain' OR t.level='preview')) < (SELECT max_trips FROM trip_private.preview_settings) $$;

-- AI: preview trips get the founder-set credit allowance (0 when AI extras are off)
CREATE OR REPLACE FUNCTION trip_private.credits_included(p_trip uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
 SELECT CASE WHEN t.level='preview' THEN CASE WHEN trip_private.feature_on(p_trip,'ai_extras') THEN (SELECT ai_credits FROM trip_private.preview_settings) ELSE 0 END
  WHEN t.unlocked_at IS NULL THEN 0 ELSE (WITH d AS (SELECT (t.end_date - t.start_date + 1) AS n) SELECT CASE WHEN n <= 5 THEN 20 WHEN n <= 10 THEN 35 WHEN n <= 15 THEN 50 ELSE 70 END FROM d) END FROM public.trips t WHERE t.id = p_trip $function$;

-- Inject guards into existing private functions (bodies otherwise unchanged)
DO $do$
DECLARE r record; d text; g text;
 m jsonb := '{"post_photo":"photo_wall","remove_photo":"photo_wall","trip_photos":"photo_wall","set_song_disc":"sing_off","clear_song_discs":"sing_off","set_activity_timer":"host_timer","answer_weekly_question":"qotw","set_weekly_question":"qotw","qotw_action":"qotw","spin_next_game":"spin_wheel","spend_credits":"ai_extras","save_cost_item":"trip_pot","save_cost_item_v2":"trip_pot","resplit_even_costs":"trip_pot","pick_team":"teams","save_teams":"teams","set_team_mode":"teams","shuffle_teams":"teams","mark_bingo":"challenges","post_quest":"challenges","answer_trivia":"challenges","claim_airport":"challenges","at_home_add":"at_home","at_home_plan":"at_home"}';
BEGIN
 FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='trip_private' AND (m ? p.proname OR p.proname IN ('draw_game_card','create_trip','create_at_home','join_trip','use_ai_quota','pick_weekly_prompt','at_home_pick')) LOOP
  d := pg_get_functiondef(r.oid);
  IF m ? r.proname THEN g := format(' PERFORM trip_private.require_feature(p_trip, %L);', m->>r.proname);
  ELSIF r.proname='draw_game_card' THEN g := ' IF p_category=''spicy'' THEN PERFORM trip_private.require_feature(p_trip,''party_cards''); END IF;';
   d := replace(d, 'ORDER BY EXISTS', 'ORDER BY NOT trip_private.in_slice(p_trip, c.id::text), EXISTS');
  ELSIF r.proname IN ('create_trip','create_at_home') THEN g := ' IF auth.uid() IS NOT NULL AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION ''PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.''; END IF;';
   IF r.proname='create_at_home' THEN g := g || ' IF NOT trip_private.is_app_admin() AND NOT coalesce((SELECT (features->>''at_home'')::boolean FROM trip_private.preview_settings),false) THEN RAISE EXCEPTION ''COMING_SOON: At Home is coming soon.''; END IF;'; END IF;
  ELSIF r.proname='join_trip' THEN g := NULL;
   d := replace(d, 'SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;', 'IF t.level=''preview'' AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION ''PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.''; END IF;
 SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;');
  ELSIF r.proname='use_ai_quota' THEN g := NULL;
   d := replace(d, 'ELSE 0 END;', 'ELSE 0 END;
 IF p_trip IS NOT NULL AND (SELECT level FROM public.trips WHERE id=p_trip)=''preview'' THEN lim := LEAST(lim,(SELECT ai_daily FROM trip_private.preview_settings)); IF lim=0 THEN RAISE EXCEPTION ''COMING_SOON: AI ideas are coming soon for preview trips.''; END IF; END IF;');
  ELSIF r.proname='pick_weekly_prompt' THEN g := NULL; d := replace(d, 'ORDER BY (EXISTS', 'ORDER BY NOT trip_private.in_slice(p_trip, md5(x.prompt)), (EXISTS');
  ELSIF r.proname='at_home_pick' THEN g := NULL; d := replace(d, 'ORDER BY (i.id IN', 'ORDER BY NOT trip_private.in_slice(p_trip, i.id::text), (i.id IN');
  END IF;
  IF g IS NOT NULL THEN d := regexp_replace(d, '^(.*?AS \$function\$.*?\mBEGIN\M)', '\1' || g); END IF;
  EXECUTE d;
 END LOOP;
END $do$;

-- Hide data of switched-off features in preview trips
DO $do$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES ('photo_posts','photo_wall'),('song_discs','sing_off'),('cost_items','trip_pot'),('cost_shares','trip_pot'),('cost_log','trip_pot'),('cost_notes','trip_pot'),('weekly_questions','qotw'),('weekly_answers','qotw'),('at_home_activities','at_home'),('trip_day_games','challenges'),('bingo_marks','challenges'),('quest_posts','challenges'),('trip_teams','teams')) v(t,f) LOOP
  EXECUTE format('CREATE POLICY "preview feature gate" ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (trip_private.feature_on(trip_id, %L))', r.t, r.f);
 END LOOP; END $do$;

-- Member read of the switch map; founder settings
CREATE OR REPLACE FUNCTION trip_private.trip_features(p_trip uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE lv text; f jsonb; BEGIN
 IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
 SELECT level INTO lv FROM public.trips WHERE id=p_trip;
 SELECT features INTO f FROM trip_private.preview_settings;
 IF lv='full' THEN SELECT jsonb_object_agg(k, true) INTO f FROM jsonb_object_keys(f) k; END IF;
 RETURN jsonb_build_object('level', lv, 'features', f);
END $$;
CREATE OR REPLACE FUNCTION trip_private.founder_preview() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 RETURN jsonb_build_object(
  'settings', (SELECT to_jsonb(s) FROM trip_private.preview_settings s),
  'trips', coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'level',t.level,'kind',t.kind,'captain',(SELECT coalesce(p.display_name,'Captain') FROM public.trip_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=t.id AND m.role='captain' LIMIT 1)) ORDER BY t.created_at DESC) FROM public.trips t WHERE NOT coalesce(t.is_sandbox,false) OR true),'[]'),
  'log', coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC) FROM (SELECT * FROM trip_private.preview_log ORDER BY created_at DESC LIMIT 50) l),'[]'));
END $$;
CREATE OR REPLACE FUNCTION trip_private.founder_set_preview(p_features jsonb, p_slice int, p_max int, p_daily int, p_credits int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o trip_private.preview_settings%ROWTYPE; k text; BEGIN
 IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 SELECT * INTO o FROM trip_private.preview_settings FOR UPDATE;
 FOR k IN SELECT jsonb_object_keys(p_features) LOOP
  IF NOT o.features ? k OR jsonb_typeof(p_features->k)<>'boolean' THEN RAISE EXCEPTION 'Unknown feature %', k; END IF;
  IF o.features->k IS DISTINCT FROM p_features->k THEN INSERT INTO trip_private.preview_log(actor,kind,target,old_value,new_value) VALUES (auth.uid(),'feature',k,o.features->k,p_features->k); END IF;
 END LOOP;
 IF o.slice_pct<>p_slice THEN INSERT INTO trip_private.preview_log(actor,kind,target,old_value,new_value) VALUES (auth.uid(),'setting','slice_pct',to_jsonb(o.slice_pct),to_jsonb(p_slice)); END IF;
 IF o.max_trips<>p_max THEN INSERT INTO trip_private.preview_log(actor,kind,target,old_value,new_value) VALUES (auth.uid(),'setting','max_trips',to_jsonb(o.max_trips),to_jsonb(p_max)); END IF;
 IF o.ai_daily<>p_daily THEN INSERT INTO trip_private.preview_log(actor,kind,target,old_value,new_value) VALUES (auth.uid(),'setting','ai_daily',to_jsonb(o.ai_daily),to_jsonb(p_daily)); END IF;
 IF o.ai_credits<>p_credits THEN INSERT INTO trip_private.preview_log(actor,kind,target,old_value,new_value) VALUES (auth.uid(),'setting','ai_credits',to_jsonb(o.ai_credits),to_jsonb(p_credits)); END IF;
 UPDATE trip_private.preview_settings SET features=o.features||p_features, slice_pct=p_slice, max_trips=p_max, ai_daily=p_daily, ai_credits=p_credits, updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION trip_private.founder_set_trip_level(p_trip uuid, p_level text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o text; n text; BEGIN
 IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 IF p_level NOT IN ('full','preview') THEN RAISE EXCEPTION 'Bad level'; END IF;
 SELECT level, name INTO o, n FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF o IS NULL THEN RAISE EXCEPTION 'Trip not found'; END IF;
 IF o<>p_level THEN UPDATE public.trips SET level=p_level WHERE id=p_trip;
  INSERT INTO trip_private.preview_log(actor,kind,target,old_value,new_value) VALUES (auth.uid(),'trip_level',n||' ('||p_trip||')',to_jsonb(o),to_jsonb(p_level)); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trip_features(p_trip uuid) RETURNS jsonb LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.trip_features(p_trip) $$;
CREATE OR REPLACE FUNCTION public.founder_preview() RETURNS jsonb LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.founder_preview() $$;
CREATE OR REPLACE FUNCTION public.founder_set_preview(p_features jsonb, p_slice int, p_max int, p_daily int, p_credits int) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.founder_set_preview(p_features,p_slice,p_max,p_daily,p_credits) $$;
CREATE OR REPLACE FUNCTION public.founder_set_trip_level(p_trip uuid, p_level text) RETURNS void LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.founder_set_trip_level(p_trip,p_level) $$;
REVOKE ALL ON FUNCTION public.trip_features(uuid), public.founder_preview(), public.founder_set_preview(jsonb,int,int,int,int), public.founder_set_trip_level(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trip_features(uuid), public.founder_preview(), public.founder_set_preview(jsonb,int,int,int,int), public.founder_set_trip_level(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION trip_private.feature_on(uuid,text), trip_private.require_feature(uuid,text), trip_private.in_slice(uuid,text), trip_private.preview_room_ok(), trip_private.trip_features(uuid), trip_private.founder_preview(), trip_private.founder_set_preview(jsonb,int,int,int,int), trip_private.founder_set_trip_level(uuid,text), trip_private.trip_level_trg() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.feature_on(uuid,text), trip_private.require_feature(uuid,text), trip_private.in_slice(uuid,text), trip_private.preview_room_ok(), trip_private.trip_features(uuid), trip_private.founder_preview(), trip_private.founder_set_preview(jsonb,int,int,int,int), trip_private.founder_set_trip_level(uuid,text) TO authenticated, service_role;