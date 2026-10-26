CREATE OR REPLACE FUNCTION trip_private.home_day_view(p_trip uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE result jsonb; t public.trips; BEGIN
 IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Join this experience first'; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.kind NOT IN ('at_home','cultural_inspiration') THEN RAISE EXCEPTION 'Not a home experience'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'day',s.day_date,'startsAt',s.starts_at,'place',s.place,'step',s.step,'presenter',s.presenter_id,'revealed',s.revealed_at IS NOT NULL,'title',CASE WHEN now()>=s.starts_at THEN i.title END,'body',CASE WHEN now()>=s.starts_at THEN i.body END,'mine',coalesce((SELECT jsonb_build_object('completed',r.completed_at IS NOT NULL,'presented',r.presented_at IS NOT NULL,'voted',r.voted_at IS NOT NULL,'choice',r.choice) FROM public.home_day_results r WHERE r.session_id=s.id AND r.user_id=auth.uid()),'{}'::jsonb),'counts',CASE WHEN s.revealed_at IS NOT NULL THEN (SELECT jsonb_build_array(count(*) FILTER(WHERE choice=0),count(*) FILTER(WHERE choice=1)) FROM public.home_day_results r WHERE r.session_id=s.id) ELSE NULL END) ORDER BY s.day_date),'[]'::jsonb) INTO result
 FROM public.home_day_sessions s JOIN public.at_home_pack_items i ON i.id=s.card_id WHERE s.trip_id=p_trip;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION trip_private.plan_game_nights(p_trip uuid, p_plan text, p_weekday integer, p_time time without time zone, p_start date, p_every integer)
 RETURNS TABLE(week_number integer, starts_at timestamptz, kept boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; tz text; v_today date; v_next timestamptz; v_last date; v_from date; v_final date; v_cap int; v_kept int; i int; d date; v_dates date[] := '{}'; BEGIN
 IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only trip leaders can plan game nights'; END IF;
 IF p_plan NOT IN ('recommended','short','custom') OR p_weekday IS NULL OR p_weekday NOT BETWEEN 0 AND 6 OR p_time IS NULL THEN RAISE EXCEPTION 'Pick a game plan, day and time'; END IF;
 p_every := CASE WHEN p_plan='custom' AND p_every=2 THEN 2 ELSE 1 END;
 SELECT * INTO t FROM public.trips WHERE id=p_trip; tz := t.home_timezone; v_today := (now() AT TIME ZONE tz)::date;
 SELECT min(n.starts_at) INTO v_next FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at > now() AND NOT n.skipped;
 RETURN QUERY SELECT n.week_number,n.starts_at,true FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at<=now() OR n.skipped OR n.starts_at=v_next) ORDER BY n.week_number;
 SELECT count(*), max((n.starts_at AT TIME ZONE tz)::date), coalesce(max(n.week_number),0) INTO v_kept,v_last,i FROM public.game_nights n WHERE n.trip_id=p_trip AND (n.starts_at<=now() OR n.skipped OR n.starts_at=v_next);
 v_from := greatest(coalesce(p_start,t.game_start,greatest(v_today,t.start_date-84)),v_today);
 IF v_from>t.start_date-2 THEN RAISE EXCEPTION 'Choose a start date before departure'; END IF;
 v_cap := 12-v_kept;
 IF p_plan='short' THEN v_cap := least(v_cap,4); END IF;
 v_final := t.start_date-1;
 d := v_from+((p_weekday-extract(dow FROM v_from)::int+7)%7);
 WHILE d<v_final AND cardinality(v_dates)<greatest(v_cap-1,0) LOOP
   IF v_last IS NULL OR d>v_last THEN v_dates:=array_append(v_dates,d); END IF;
   d:=d+7*p_every;
 END LOOP;
 IF v_cap>0 AND (v_last IS NULL OR v_final>v_last) AND NOT v_final=ANY(v_dates) THEN v_dates:=array_append(v_dates,v_final); END IF;
 FOREACH d IN ARRAY v_dates LOOP
   IF ((d+p_time) AT TIME ZONE tz)>now() THEN i:=i+1; week_number:=i; starts_at:=(d+p_time) AT TIME ZONE tz; kept:=false; RETURN NEXT; END IF;
 END LOOP;
END $$;