DO $migration$ DECLARE definition text; BEGIN
 definition := pg_get_functiondef('trip_private.ensure_season_quests(uuid,uuid)'::regprocedure);
 IF position('v_points:=greatest(0,least(v_points,v_budget))' in definition)=0 THEN RAISE EXCEPTION 'Unexpected quest allocation implementation'; END IF;
 definition := replace(definition,'v_points:=greatest(0,least(v_points,v_budget))','v_points:=greatest(1,least(v_points,v_budget))');
 definition := replace(definition,'v_budget:=greatest(0,least(12,greatest(10,v_count))-v_legacy);','v_budget:=greatest(0,least(12,greatest(10,v_count))-v_legacy-(SELECT coalesce(sum(points),0)::int FROM public.season_quests WHERE trip_id=p_trip AND user_id=p_user AND quest_kind=''preflight''));');
 definition := replace(definition,'IF t.kind IS DISTINCT FROM ''at_home''','IF t.kind NOT IN (''at_home'',''cultural_inspiration'')');
 EXECUTE definition;
END $migration$;