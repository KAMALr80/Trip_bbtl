DO $$ DECLARE d text; BEGIN
 d := pg_get_functiondef('trip_private.lab_r17(uuid,text)'::regprocedure);
 d := replace(d, '''Neon'',''pink''', '''Neon'',''blue''');
 EXECUTE d; END $$;