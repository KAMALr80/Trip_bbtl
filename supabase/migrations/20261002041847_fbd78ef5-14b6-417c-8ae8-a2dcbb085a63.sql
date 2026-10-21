DO $do$ DECLARE d text; BEGIN
d := pg_get_functiondef('trip_private.lab_shift(uuid,text,integer)'::regprocedure);
d := replace(d, $a$  ELSIF p_target IN ('day','rest','surprise') THEN$a$, $a$  ELSIF p_target = 'qotw' THEN
    SELECT drops_at INTO ts FROM public.weekly_questions WHERE trip_id=p_trip AND week_number < 1000 ORDER BY week_number LIMIT 1;
    IF ts IS NULL THEN SELECT drops_at INTO ts FROM public.weekly_questions WHERE trip_id=p_trip ORDER BY drops_at LIMIT 1; END IF;
    IF ts IS NULL THEN RAISE EXCEPTION 'This sandbox has no Question of the Week (1-night season)'; END IF;
    off := (now() - interval '1 hour') - ts;
  ELSIF p_target IN ('day','rest','surprise') THEN$a$);
EXECUTE d;
d := pg_get_functiondef('trip_private.lab_as(uuid,text)'::regprocedure);
d := replace(d, 'SELECT max(week_number) INTO wk FROM public.weekly_questions WHERE trip_id=p_trip AND drops_at <= now() AND revealed_at IS NULL', 'SELECT max(q.week_number) INTO wk FROM public.weekly_questions q LEFT JOIN public.game_nights g ON g.trip_id=q.trip_id AND g.week_number=q.week_number WHERE q.trip_id=p_trip AND q.drops_at <= now() AND q.revealed_at IS NULL AND (g.starts_at IS NULL OR g.starts_at > now())');
d := replace(d, 'No open Question of the Week right now — time travel to a week after a question drops', 'No open Question of the Week right now — use Time travel › QOTW open');
EXECUTE d;
END $do$;