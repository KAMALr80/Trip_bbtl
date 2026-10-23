DO $$ DECLARE d text; BEGIN
 d := pg_get_functiondef('trip_private.take_over_captain(uuid)'::regprocedure);
 d := replace(d, 'UPDATE public.trip_members SET role=''co_captain'' WHERE trip_id=p_trip AND user_id=cap;', 'UPDATE public.trip_members SET role=''player'' WHERE trip_id=p_trip AND user_id=auth.uid(); UPDATE public.trip_members SET role=''co_captain'' WHERE trip_id=p_trip AND user_id=cap;');
 EXECUTE d;
 d := pg_get_functiondef('trip_private.reclaim_captain(uuid)'::regprocedure);
 d := replace(d, 'UPDATE public.trip_members SET role=''player'' WHERE trip_id=p_trip AND role=''co_captain'' AND user_id<>cap;', 'UPDATE public.trip_members SET role=''player'' WHERE trip_id=p_trip AND (role=''co_captain'' OR user_id=auth.uid());');
 EXECUTE d;
END $$;