DO $do$ DECLARE d text; BEGIN
d := pg_get_functiondef('trip_private.lab_as(uuid,text)'::regprocedure);
d := replace(d, '''photos''', '''photo_wall''');
d := replace(d, 'SELECT min(week_number) INTO wk FROM public.weekly_questions WHERE trip_id=p_trip AND drops_at <= now() AND revealed_at IS NULL', 'SELECT max(week_number) INTO wk FROM public.weekly_questions WHERE trip_id=p_trip AND drops_at <= now() AND revealed_at IS NULL');
EXECUTE d;
END $do$;