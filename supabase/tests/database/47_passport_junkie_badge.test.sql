-- Founder review: junkie_rank's Passport Junkie badge follows the deck (R-703): 10 stamped
-- countries, read from the same server count as the passport level (passport_progress). It calls
-- trip_private.junkie_rank: the public wrapper is service_role only since the least-privilege pass.
BEGIN;
\ir ../_helpers.psql
SELECT plan(3);

SELECT tests.create_user('nine', 30);
SELECT tests.create_user('ten', 30);
INSERT INTO public.passport_progress (user_id, countries, level, stars)
VALUES (tests.user_id('nine'), 9, 'globetrotter', 0),
       (tests.user_id('ten'), 10, 'passport_junkie', 0);

SELECT tests.authenticate_as(tests.user_id('nine'));
SELECT is((SELECT passport_junkie FROM trip_private.junkie_rank(tests.user_id('nine'))), false,
          '9 countries is not a Passport Junkie yet');
SELECT tests.clear_authentication();

SELECT tests.authenticate_as(tests.user_id('ten'));
SELECT is((SELECT passport_junkie FROM trip_private.junkie_rank(tests.user_id('ten'))), true,
          '10 countries makes a Passport Junkie (R-703)');
SELECT tests.clear_authentication();

-- Someone with no passport yet.
SELECT tests.create_user('new', 30);
SELECT tests.authenticate_as(tests.user_id('new'));
SELECT is((SELECT passport_junkie FROM trip_private.junkie_rank(tests.user_id('new'))), false,
          'no stamps, no badge');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
