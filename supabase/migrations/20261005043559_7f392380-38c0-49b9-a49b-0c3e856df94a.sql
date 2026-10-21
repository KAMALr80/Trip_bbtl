CREATE OR REPLACE FUNCTION trip_private.ensure_season_quests(p_trip uuid, p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN IF auth.uid() IS DISTINCT FROM p_user OR NOT trip_private.is_trip_member(p_trip,p_user) THEN RAISE EXCEPTION 'Only approved members can see quests'; END IF; END $$;
CREATE OR REPLACE FUNCTION trip_private.ensure_sealed(p_trip uuid, p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; d record; v_card public.security_missions; v_dest text; v_show date;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_user OR NOT trip_private.is_trip_member(p_trip,p_user) THEN RAISE EXCEPTION 'Only approved members can see quests'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF NOT FOUND OR t.kind NOT IN ('trip','at_home') THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(p_trip::text||p_user::text||'sealed'));
 v_dest := coalesce(nullif(btrim(regexp_replace(coalesce(t.destination,''), '\s*\((sandbox|at home)\)\s*$', '', 'i')),''), nullif(initcap(replace(t.at_home_pack,'_',' ')),''), 'your destination');
 FOR d IN SELECT * FROM trip_private.sealed_drops(p_trip) s WHERE s.drop_at <= now() LOOP
  IF EXISTS (SELECT 1 FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.kind='sealed' AND q.drop_no=d.drop_no) THEN CONTINUE; END IF;
  SELECT * INTO v_card FROM public.security_missions sm WHERE sm.kind='checkin' AND sm.trip_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
   AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
   ORDER BY md5(sm.id::text||p_trip::text||p_user::text||d.drop_no::text) LIMIT 1;
  IF NOT FOUND THEN EXIT; END IF;
  INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords)
  VALUES (p_trip,p_user,'sealed',d.drop_no,d.drop_at,d.value,replace(coalesce(v_card.title,'Discover the destination'),'{destination}',v_dest),replace(coalesce(v_card.text,''),'{destination}',v_dest),replace(coalesce(v_card.backstory,''),'{destination}',v_dest),ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(coalesce(v_card.keywords,'{}')) k)) ON CONFLICT DO NOTHING;
 END LOOP;
 v_show := CASE WHEN t.kind='trip' THEN coalesce(t.game_start,(t.created_at AT TIME ZONE t.home_timezone)::date) ELSE t.start_date END;
 IF (now() AT TIME ZONE t.home_timezone)::date >= v_show AND NOT EXISTS (SELECT 1 FROM public.sealed_quests q WHERE q.trip_id=p_trip AND q.user_id=p_user AND q.kind='showcase') THEN
  SELECT * INTO v_card FROM public.security_missions sm WHERE sm.kind='home' AND sm.trip_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.sealed_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
   AND NOT EXISTS (SELECT 1 FROM public.season_quests x WHERE x.trip_id=p_trip AND x.user_id=p_user AND (lower(btrim(x.title))=lower(btrim(replace(sm.title,'{destination}',v_dest))) OR lower(btrim(x.mission_text))=lower(btrim(replace(sm.text,'{destination}',v_dest)))))
   ORDER BY md5(sm.id::text||p_trip::text||p_user::text||'showcase') LIMIT 1;
  IF FOUND THEN INSERT INTO public.sealed_quests(trip_id,user_id,kind,drop_no,drop_at,value,title,mission_text,backstory,keywords)
   VALUES (p_trip,p_user,'showcase',0,now(),20,replace(coalesce(v_card.title,'Your Showcase'),'{destination}',v_dest),replace(coalesce(v_card.text,''),'{destination}',v_dest),replace(coalesce(v_card.backstory,''),'{destination}',v_dest),ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(coalesce(v_card.keywords,'{}')) k)) ON CONFLICT DO NOTHING; END IF;
 END IF;
END $$;
DELETE FROM public.season_quests WHERE trip_id='a73066f5-6a98-4123-948b-5b0b5d67247a' AND user_id='fd99920f-d997-4397-b80c-9495587aa10b' AND id='4a902c1d-040c-4159-8133-deec5bd052f5' AND created_at >= '2026-10-05 04:21:00+00' AND created_at < '2026-10-05 04:22:00+00';
DELETE FROM public.sealed_quests WHERE trip_id='a73066f5-6a98-4123-948b-5b0b5d67247a' AND user_id='fd99920f-d997-4397-b80c-9495587aa10b' AND id='2e3f52d8-f3b2-4b69-b1bf-0cb32f407201' AND created_at >= '2026-10-05 04:21:00+00' AND created_at < '2026-10-05 04:22:00+00';