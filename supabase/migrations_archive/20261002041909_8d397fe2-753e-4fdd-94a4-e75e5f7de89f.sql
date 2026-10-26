DO $do$ DECLARE d text; BEGIN
d := pg_get_functiondef('trip_private.lab_as(uuid,text)'::regprocedure);
d := replace(d, $a$AND phase='vote'$a$, $a$AND phase='voting'$a$);
EXECUTE d; END $do$;