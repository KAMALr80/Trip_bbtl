-- A tiny subset of pgTAP (https://pgtap.org) for running supabase/tests on a plain local Postgres
-- that has no pgTAP extension installed. Same function names, signatures and TAP output for the
-- calls our tests use, so the test files run unchanged under `supabase test db` (real pgTAP) in CI.
--
-- Supported: plan, no_plan, finish, ok, is, isnt, throws_ok, throws_like, lives_ok, diag, pass, fail.
-- Installed into the public schema by scripts/db/test.sh only. Never applied to a real environment.

CREATE OR REPLACE FUNCTION public._tap_state() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass('pg_temp.__tap__') IS NULL THEN
    CREATE TEMP TABLE __tap__ (planned int, run int NOT NULL DEFAULT 0, failed int NOT NULL DEFAULT 0);
    INSERT INTO __tap__ (planned) VALUES (NULL);
    -- Tests switch to the authenticated/anon roles mid-file, like real pgTAP allows.
    GRANT ALL ON TABLE __tap__ TO PUBLIC;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.plan(integer) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public._tap_state();
  UPDATE __tap__ SET planned = $1;
  RETURN '1..' || $1;
END $$;

CREATE OR REPLACE FUNCTION public.no_plan() RETURNS SETOF boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public._tap_state();
  RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.diag(msg text) RETURNS text LANGUAGE sql AS $$
  SELECT '# ' || replace(coalesce(msg, 'NULL'), E'\n', E'\n# ')
$$;

CREATE OR REPLACE FUNCTION public.ok(boolean, text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n int; good boolean := coalesce($1, false);
BEGIN
  PERFORM public._tap_state();
  UPDATE __tap__ SET run = run + 1, failed = failed + CASE WHEN good THEN 0 ELSE 1 END RETURNING run INTO n;
  RETURN CASE WHEN good THEN 'ok ' ELSE 'not ok ' END || n
    || CASE WHEN coalesce($2, '') <> '' THEN ' - ' || $2 ELSE '' END
    || CASE WHEN $1 IS NULL THEN E'\n# (test value was NULL)' ELSE '' END;
END $$;

CREATE OR REPLACE FUNCTION public.ok(boolean) RETURNS text LANGUAGE sql AS $$ SELECT public.ok($1, NULL) $$;
CREATE OR REPLACE FUNCTION public.pass(text) RETURNS text LANGUAGE sql AS $$ SELECT public.ok(true, $1) $$;
CREATE OR REPLACE FUNCTION public.fail(text) RETURNS text LANGUAGE sql AS $$ SELECT public.ok(false, $1) $$;

CREATE OR REPLACE FUNCTION public.is(anyelement, anyelement, text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  r := public.ok($1 IS NOT DISTINCT FROM $2, $3);
  IF $1 IS DISTINCT FROM $2 THEN
    r := r || E'\n' || public.diag(format(E'        have: %s\n        want: %s',
                                           coalesce($1::text, 'NULL'), coalesce($2::text, 'NULL')));
  END IF;
  RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.is(anyelement, anyelement) RETURNS text LANGUAGE sql AS $$ SELECT public.is($1, $2, NULL) $$;

CREATE OR REPLACE FUNCTION public.isnt(anyelement, anyelement, text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  r := public.ok($1 IS DISTINCT FROM $2, $3);
  IF $1 IS NOT DISTINCT FROM $2 THEN
    r := r || E'\n' || public.diag(format('        have: %s, expected anything else', coalesce($1::text, 'NULL')));
  END IF;
  RETURN r;
END $$;

-- throws_ok(sql, errcode, errmsg, description): errcode and errmsg are each optional (NULL = any).
CREATE OR REPLACE FUNCTION public.throws_ok(text, char(5), text, text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE descr text := coalesce($4, 'threw ' || coalesce($2, '') || coalesce(': ' || $3, ''));
BEGIN
  EXECUTE $1;
  RETURN public.ok(false, descr) || E'\n' || public.diag('    no exception thrown');
EXCEPTION WHEN OTHERS THEN
  IF ($2 IS NULL OR SQLSTATE = $2) AND ($3 IS NULL OR SQLERRM = $3) THEN
    RETURN public.ok(true, descr);
  END IF;
  RETURN public.ok(false, descr) || E'\n' || public.diag(format(E'      caught: %s: %s\n      wanted: %s: %s',
    SQLSTATE, SQLERRM, coalesce($2, '*****'), coalesce($3, '(any message)')));
END $$;

-- pgTAP's 3-argument form: a 5-character second argument is an errcode and the third is then the
-- expected error MESSAGE (not a description); otherwise they are (errmsg, description). To check
-- only an errcode with a description, use the 4-argument form: throws_ok(sql, code, NULL, descr).
CREATE OR REPLACE FUNCTION public.throws_ok(text, text, text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN octet_length($2) = 5 THEN public.throws_ok($1, $2::char(5), $3, NULL)
              ELSE public.throws_ok($1, NULL, $2, $3) END
$$;
CREATE OR REPLACE FUNCTION public.throws_ok(text, text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN octet_length($2) = 5 THEN public.throws_ok($1, $2::char(5), NULL, NULL)
              ELSE public.throws_ok($1, NULL, $2, NULL) END
$$;
CREATE OR REPLACE FUNCTION public.throws_ok(text) RETURNS text LANGUAGE sql AS $$
  SELECT public.throws_ok($1, NULL::char(5), NULL, NULL)
$$;

CREATE OR REPLACE FUNCTION public.throws_like(text, text, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE $1;
  RETURN public.ok(false, $3) || E'\n' || public.diag('    no exception thrown');
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE $2 THEN RETURN public.ok(true, $3); END IF;
  RETURN public.ok(false, $3) || E'\n' || public.diag(format(E'   error message: %s\n   doesn''t match: %s', SQLERRM, $2));
END $$;

CREATE OR REPLACE FUNCTION public.lives_ok(text, text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE $1;
  RETURN public.ok(true, $2);
EXCEPTION WHEN OTHERS THEN
  RETURN public.ok(false, $2) || E'\n' || public.diag(format('        died: %s: %s', SQLSTATE, SQLERRM));
END $$;
CREATE OR REPLACE FUNCTION public.lives_ok(text) RETURNS text LANGUAGE sql AS $$ SELECT public.lives_ok($1, NULL) $$;

CREATE OR REPLACE FUNCTION public.finish() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
  PERFORM public._tap_state();
  SELECT * INTO s FROM __tap__;
  IF s.planned IS NULL THEN
    RETURN NEXT '1..' || s.run;
  ELSIF s.planned <> s.run THEN
    RETURN NEXT public.diag(format('Looks like you planned %s tests but ran %s', s.planned, s.run));
  END IF;
  IF s.failed > 0 THEN
    RETURN NEXT public.diag(format('Looks like you failed %s test%s of %s', s.failed,
                                   CASE WHEN s.failed = 1 THEN '' ELSE 's' END, s.run));
  END IF;
  RETURN;
END $$;

-- Only the test functions above: a blanket grant on public would undo the app's own REVOKEs.
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('_tap_state', 'diag', 'fail', 'finish', 'is', 'isnt', 'lives_ok', 'no_plan',
                               'ok', 'pass', 'plan', 'throws_like', 'throws_ok')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', f);
  END LOOP;
END $$;
