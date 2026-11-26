-- QA security audit: privileged logic lives in trip_private behind invoker wrappers (AGENTS.md). A few
-- older public functions are SECURITY DEFINER and guard themselves; this pins that list, so a new
-- public definer function (callable by every signed-in user through the default privileges) can't
-- slip in unreviewed. Signed-out visitors may run none of them.
BEGIN;
\ir ../_helpers.psql
SELECT plan(2);

SELECT is(
  (SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), '{}')
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')),
  ARRAY['create_culture_play_mode', 'guide_propose', 'guide_publish', 'guide_review', 'seat_status',
        'set_price_rule', 'unlock_extra_seats']::text[],
  'only the reviewed public SECURITY DEFINER functions are open to signed-in users'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')),
  0,
  'signed-out visitors can run no public SECURITY DEFINER function'
);

SELECT * FROM finish();
ROLLBACK;
