DO $$ DECLARE d text; BEGIN
 d := pg_get_functiondef('trip_private.lab_r17(uuid,text)'::regprocedure);
 d := replace(d, 'trip_private.unlock_trip(p_trip)', 'trip_private.unlock_trip(p_trip, 4)');
 d := replace(d, 'refused ✓; ''; END;', 'refused ✓; ''; WHEN others THEN res:=res||''error ''||SQLERRM||''; ''; END;');
 d := replace(d, 'EXCEPTION WHEN others THEN res:=res||''dates', 'EXCEPTION WHEN raise_exception THEN res:=res||''dates');
 d := regexp_replace(d, 'EXCEPTION WHEN others THEN res:=res\|\|''([a-z0-9+ ]+): refused', 'EXCEPTION WHEN raise_exception THEN res:=res||''\1: refused', 'g');
 EXECUTE d;
END $$;