-- M1-08 step 1 (dev-docs/05 §1, step 3 "stop the writes"): the app can no longer call the public
-- wrappers of retired features. Only functions the app no longer references are listed (see the
-- "callable but not referenced in src/" list in docs/inventory/db-inventory.md), so no screen breaks.
-- Tables stay in place. Kept SECURITY DEFINER callers (Test Lab bots, At Home) run as the owner
-- and are not affected; service_role keeps access for exports and support.
--
-- Next steps, each in its own release: move the tables to legacy_archive (after the functions that
-- still name them, such as delete_trip and trip_photos, stop doing so), then DROP.
-- rollback: GRANT EXECUTE ON FUNCTION public.<name>(...) TO anon, authenticated; for each name below.

CREATE TABLE IF NOT EXISTS trip_private.retired_wrappers (
  name text PRIMARY KEY,
  feature text NOT NULL,          -- dev-docs/05 §2 item, e.g. L4
  revoked_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON trip_private.retired_wrappers FROM PUBLIC, anon, authenticated;

INSERT INTO trip_private.retired_wrappers (name, feature) VALUES
  -- L1 old game night (spin wheel, turns, cards, host-run nights, season quests on game nights)
  ('advance_play_phase', 'L1'), ('apply_reschedule', 'L1'), ('confirm_game_nights', 'L1'), ('crown_now', 'L1'),
  ('draw_game_card', 'L1'), ('game_card_view', 'L1'), ('next_game_turn', 'L1'), ('night_checkin_tasks', 'L1'),
  ('night_flow_action', 'L1'), ('night_format_action', 'L1'), ('post_game_night_poll', 'L1'),
  ('reschedule_preview', 'L1'), ('respin_game', 'L1'), ('resolve_age_guesses', 'L1'), ('save_game_scores', 'L1'),
  ('season_quest_action', 'L1'), ('season_quest_approve_all', 'L1'), ('season_quest_current', 'L1'),
  ('season_quest_review', 'L1'), ('set_first_game', 'L1'), ('set_game_days', 'L1'), ('set_game_night_host', 'L1'),
  ('skip_card', 'L1'), ('spin_next_game', 'L1'), ('start_game_turns', 'L1'), ('week_game_action', 'L1'),
  -- L2 host passes, L3 skip passes
  ('captain_pass_limit', 'L2'), ('skip_limit', 'L3'), ('use_skip', 'L3'),
  -- L4 Question of the Week
  ('answer_weekly_question', 'L4'), ('qotw_action', 'L4'), ('qotw_answers', 'L4'),
  ('reveal_weekly_question', 'L4'), ('set_weekly_question', 'L4'), ('vote_weekly_answer', 'L4'),
  -- L5 Quick Vote / live votes
  ('cast_live_vote', 'L5'), ('close_live_vote', 'L5'), ('post_live_vote', 'L5'), ('reveal_live_vote', 'L5'),
  ('quick_vote_action', 'L5'), ('quick_vote_totals', 'L5'),
  -- L7 Junkie Rank (levels are now counted from passport countries in the app)
  ('junkie_rank', 'L7'), ('traveler_level', 'L7'),
  -- L9 teams
  ('pick_team', 'L9'), ('save_teams', 'L9'), ('set_team_mode', 'L9'), ('set_team_room', 'L9'),
  ('shuffle_teams', 'L9'), ('team_capacities', 'L9'),
  -- L10 party cards and 21+ approvals
  ('adult_badge', 'L10'), ('approve_adult_player', 'L10'), ('set_adult_cards', 'L10'), ('use_item_alternative', 'L10'),
  -- L11 Early Check-In presentations, L12 Secret Missions
  ('present_checkin', 'L11'), ('reveal_mission', 'L12'), ('vote_mission', 'L12'),
  -- L13 trip-day games (bingo, quests, trivia, day votes, Trip Season games)
  ('answer_trivia', 'L13'), ('cast_day_vote', 'L13'), ('day_vote_results', 'L13'), ('edit_trip_day', 'L13'),
  ('game_day_status', 'L13'), ('post_quest', 'L13'), ('quest_review', 'L13'), ('release_trip_day', 'L13'),
  ('season_game_reveal', 'L13'), ('season_game_submit', 'L13'), ('set_bingo_needs_photo', 'L13'),
  ('thumb_quest', 'L13'), ('trip_season', 'L13'),
  -- L14 public Game Rooms
  ('decide_room_request', 'L14'), ('game_rooms', 'L14'), ('next_room_turn', 'L14'), ('request_room', 'L14'),
  ('room_requests_for', 'L14'), ('set_room_listing', 'L14')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE f regprocedure; missing text;
BEGIN
  SELECT string_agg(r.name, ', ') INTO missing FROM trip_private.retired_wrappers r
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.name);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Retired wrappers not found in public: %', missing; END IF;
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN trip_private.retired_wrappers r ON r.name = p.proname
           WHERE p.pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
