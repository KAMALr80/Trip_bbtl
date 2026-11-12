-- Fixes from the authorization review (docs/audit/AUTHORIZATION_REVIEW.md). Forward-only: no table or
-- row is removed.
--  * B-22: a push subscription must point at a browser push service. The sender POSTs to this URL,
--    so any https URL made the app send requests wherever a player chose, and one player could add
--    unlimited addresses.
--  * B-25: Storyteller counts every contributor to a Window Seat guide (Q13), and the guide is built
--    from journal entries and photos (R-355). A player who only sent photos wasn't counted.
--  * Indexes for foreign keys that trip deletion, sign-out reminders and game cards look up.
-- rollback: restore the two functions from 20261101 / 20261102; drop the indexes and
--   trip_private.push_endpoint_ok.

-- ---------------------------------------------------------------- push subscriptions (B-22)
CREATE FUNCTION trip_private.push_endpoint_ok(p_endpoint text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(p_endpoint ~ ('^https://('
    || 'fcm\.googleapis\.com|android\.googleapis\.com'                   -- Chrome, Android, Samsung, Opera
    || '|([a-z0-9-]+\.)*push\.services\.mozilla\.com'                    -- Firefox
    || '|([a-z0-9-]+\.)*push\.apple\.com'                                -- Safari
    || '|[a-z0-9-]+\.notify\.windows\.com'                               -- Edge
    || ')/'), false)
$$;
REVOKE ALL ON FUNCTION trip_private.push_endpoint_ok(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION trip_private.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF NOT trip_private.push_endpoint_ok(p_endpoint) THEN
    RAISE EXCEPTION 'This browser''s notifications aren''t supported';
  END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, updated_at = now();
  -- Ten browsers per player, newest kept: every reminder is sent to each of them.
  DELETE FROM public.push_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.endpoint <> p_endpoint
    AND s.id NOT IN (SELECT k.id FROM public.push_subscriptions k WHERE k.user_id = auth.uid()
                     ORDER BY k.endpoint = p_endpoint DESC, k.updated_at DESC, k.created_at DESC, k.id LIMIT 10);
END
$$;

-- ---------------------------------------------------------------- Storyteller (B-25)
CREATE OR REPLACE FUNCTION trip_private.refresh_passport(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_countries int; lv record; b record;
BEGIN
  SELECT count(DISTINCT lower(s.country))::int INTO v_countries
  FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
  WHERE s.user_id = p_user AND s.kind IN ('international', 'road_trip') AND NOT t.is_sandbox;
  SELECT * INTO lv FROM trip_private.level_for(v_countries);
  INSERT INTO public.passport_progress (user_id, countries, level, stars)
  VALUES (p_user, v_countries, lv.level, lv.stars)
  ON CONFLICT (user_id) DO UPDATE SET countries = excluded.countries, level = excluded.level, stars = excluded.stars,
                                      updated_at = now();

  FOR b IN
    SELECT 'us_explorer' AS badge, count(DISTINCT lower(s.state))::int AS n
    FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
    WHERE s.user_id = p_user AND s.kind IN ('international', 'road_trip') AND s.country = 'United States'
      AND nullif(btrim(s.state), '') IS NOT NULL AND NOT t.is_sandbox
    UNION ALL
    SELECT 'culture_collector', count(DISTINCT lower(s.culture))::int
    FROM public.passport_stamps s JOIN public.trips t ON t.id = s.trip_id
    WHERE s.user_id = p_user AND s.kind = 'postcard' AND nullif(btrim(s.culture), '') IS NOT NULL AND NOT t.is_sandbox
    UNION ALL
    -- Every contributor to a finished Window Seat guide counts it (Q13): a journal entry, or an
    -- approved photo of the kinds guide_items shows. The photo still counts after the Day 7 purge
    -- removes its file (photo_removed_at), so an old guide doesn't drop out of the count.
    SELECT 'storyteller', count(DISTINCT t.id)::int
    FROM public.trips t
    WHERE t.room = 'window_seat' AND t.locked_at IS NOT NULL AND NOT t.is_sandbox
      AND (EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.trip_id = t.id AND j.user_id = p_user)
           OR EXISTS (SELECT 1 FROM public.proofs p JOIN public.trip_schedule s ON s.id = p.schedule_id
                      WHERE p.trip_id = t.id AND p.user_id = p_user AND p.photo_path IS NOT NULL
                        AND p.crew_status IN ('approved', 'not_needed')
                        AND s.kind IN ('ws_quest', 'home_mission', 'airport_mission', 'surprise_drop', 'trip_quest')))
  LOOP
    IF trip_private.badge_tier(b.badge, b.n) > 0 THEN
      INSERT INTO public.user_badges (user_id, badge, tier, progress)
      VALUES (p_user, b.badge, trip_private.badge_tier(b.badge, b.n), b.n)
      ON CONFLICT (user_id, badge) DO UPDATE
        SET progress = greatest(public.user_badges.progress, excluded.progress),
            earned_at = CASE WHEN excluded.tier > public.user_badges.tier THEN now() ELSE public.user_badges.earned_at END,
            seen_at = CASE WHEN excluded.tier > public.user_badges.tier THEN NULL ELSE public.user_badges.seen_at END,
            tier = greatest(public.user_badges.tier, excluded.tier);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------- indexes (B-26)
CREATE INDEX IF NOT EXISTS game_cards_trip_idx ON public.game_cards (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS passport_stamps_trip_idx ON public.passport_stamps (trip_id);
CREATE INDEX IF NOT EXISTS photo_moderation_trip_idx ON public.photo_moderation (trip_id);
CREATE INDEX IF NOT EXISTS moderation_log_moderation_idx ON public.moderation_log (moderation_id);
CREATE INDEX IF NOT EXISTS notification_queue_user_idx ON public.notification_queue (user_id);
CREATE INDEX IF NOT EXISTS trip_invites_trip_idx ON public.trip_invites (trip_id);
CREATE INDEX IF NOT EXISTS cultural_inspirations_trip_idx ON public.cultural_inspirations (trip_id);
CREATE INDEX IF NOT EXISTS culture_experiences_trip_idx ON public.culture_experiences (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS live_sessions_call_night_idx ON public.live_sessions (call_night_id) WHERE call_night_id IS NOT NULL;
