-- M3-16: retire the older scoring now that the points ledger is the only source (dev-docs/05 L21).
-- The app no longer calls these; their public wrappers lose client EXECUTE and are recorded in
-- trip_private.retired_wrappers (10_retired_wrappers.test.sql). The service role keeps access for
-- exports and support. The old crowning job stops: crowns come from live_and_crowns_due (M3-11).
-- Their tables (season_champions, sealed_quests, mission_claims, …) stay readable for archived
-- trips until they move to legacy_archive with the rest of 05 §1.
-- rollback: re-GRANT EXECUTE on each listed wrapper TO authenticated; DELETE the rows with
--   feature LIKE 'M3-16%' from trip_private.retired_wrappers; re-schedule 'crown-due-seasons'
--   ('*/15 * * * *', 'SELECT trip_private.crown_due();').

INSERT INTO trip_private.retired_wrappers (name, feature) VALUES
  ('season_points', 'M3-16 · L21 old season scoring'),
  ('trip_season', 'M3-16 · L21 old season scoring'),
  ('trip_season_score', 'M3-16 · L21 old season scoring'),
  ('game_board', 'M3-16 · L21 old season scoring'),
  ('finalize_season', 'M3-16 · L21 old crowning'),
  ('mission_bonus', 'M3-16 · L21 old season scoring'),
  ('set_stamp_values', 'M3-16 · L21 old stamp values'),
  ('sealed_quest_action', 'M3-16 · sealed quests moved to the schedule (M3-05)'),
  ('sealed_quest_state', 'M3-16 · sealed quests moved to the schedule (M3-05)'),
  ('sealed_proof_feed', 'M3-16 · sealed quests moved to the schedule (M3-05)'),
  ('a2c_quest_insights', 'M3-16 · sealed quests moved to the schedule (M3-05)'),
  ('season_game_decline', 'M3-16 · sealed quests moved to the schedule (M3-05)'),
  ('mission_action', 'M3-16 · missions moved to the schedule (M3-08)'),
  ('mission_window', 'M3-16 · missions moved to the schedule (M3-08)')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN trip_private.retired_wrappers r ON r.name = p.proname
    WHERE p.pronamespace = 'public'::regnamespace AND r.feature LIKE 'M3-16%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

SELECT cron.unschedule('crown-due-seasons');
