-- QA-20: signed-in users get only what the app uses.
BEGIN;
\ir ../_helpers.psql
SELECT plan(8);

SELECT tests.create_user('me', 30);
INSERT INTO public.profiles (id) VALUES (tests.user_id('me')) ON CONFLICT DO NOTHING;

SELECT is(
  (SELECT count(*)::int FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
     AND (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
          OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
          OR has_table_privilege('authenticated', c.oid, 'REFERENCES'))),
  0, 'no public table grants TRUNCATE, TRIGGER or REFERENCES to signed-in users');
SELECT ok(NOT has_table_privilege('anon', 'public.points_ledger', 'TRUNCATE'), 'nor to visitors');

CREATE TABLE public.qa_new_table_probe (id int);
SELECT ok(NOT has_table_privilege('authenticated', 'public.qa_new_table_probe', 'TRUNCATE'), 'a table made later doesn''t get them either');
DROP TABLE public.qa_new_table_probe;

SELECT tests.authenticate_as(tests.user_id('me'));
SELECT throws_like($$DELETE FROM public.profiles WHERE id = auth.uid()$$, '%permission denied%', 'a player can''t delete their profile row');
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.profiles WHERE id = tests.user_id('me')), 1, 'it is still there');

INSERT INTO public.ai_usage (id, user_id, kind) VALUES ('00000000-0000-4000-8000-00000000a1a1', tests.user_id('me'), 'names');
SELECT tests.authenticate_as(tests.user_id('me'));
SELECT throws_like($$SELECT public.log_ai_call('00000000-0000-4000-8000-00000000a1a1', 'm', 1, 1, 0)$$, '%permission denied%', 'a player can''t write the cost of their AI call');
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.log_ai_call('00000000-0000-4000-8000-00000000a1a1', 'model-x', 10, 20, 0.5)$$, 'the server can');
RESET ROLE;
SELECT is((SELECT model FROM public.ai_usage WHERE id = '00000000-0000-4000-8000-00000000a1a1'), 'model-x', 'and the cost is recorded');

SELECT * FROM finish();
ROLLBACK;
