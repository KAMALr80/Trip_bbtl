-- Release hardening. Forward-only: no table or row is removed, and no existing behaviour for a
-- signed-in player changes.
--  * B-27: files whose trip, card or experience is gone are listed for deletion by a service-only
--    function. It covers every way a trip can disappear (delete, a Captain alone leaving, an account
--    deletion), keeps files another row still points at, and holds no state, so a failed run is simply
--    repeated by the next one.
--  * B-29: AI quota. ai_gate takes a lock, so the check and the insert that counts the call happen
--    one at a time. App-paid calls reserve their row BEFORE calling the model, so a burst can't pass
--    the daily caps.
--  * B-30: a send that died mid-way is retried at most up to the attempt limit, and not at all once
--    the player has left the trip.
-- rollback: restore ai_gate and claim_notifications from the baseline and 20261101; drop
--   public.orphan_files, trip_private.orphan_files and public.ai_reserve_server.

-- ---------------------------------------------------------------- orphaned files (B-27)
CREATE FUNCTION trip_private.orphan_files(p_limit int DEFAULT 1000)
RETURNS TABLE(bucket text, path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND CASE
      WHEN o.bucket_id IN ('trip-photos', 'player-avatars', 'quest-proofs', 'window-guide')
        THEN NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.id::text = split_part(o.name, '/', 1))
      WHEN o.bucket_id = 'inspiration-photos'
        THEN NOT EXISTS (SELECT 1 FROM public.cultural_inspirations c WHERE c.id::text = split_part(o.name, '/', 1))
      WHEN o.bucket_id = 'culture-photos'
        THEN NOT EXISTS (SELECT 1 FROM public.culture_experiences e WHERE e.id::text = split_part(o.name, '/', 1))
      ELSE false
    END
    -- An older profile photo can live in a trip's folder and be copied to the player's other cards.
    AND NOT EXISTS (SELECT 1 FROM public.player_profiles p WHERE p.avatar_path = o.name)
    AND NOT EXISTS (SELECT 1 FROM public.trip_player_cards c WHERE c.avatar_path = o.name)
  ORDER BY o.created_at
  LIMIT greatest(1, least(coalesce(p_limit, 1000), 5000))
$$;
REVOKE ALL ON FUNCTION trip_private.orphan_files(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.orphan_files(int) TO service_role;

CREATE FUNCTION public.orphan_files(p_limit int DEFAULT 1000) RETURNS TABLE(bucket text, path text)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.orphan_files(p_limit) $$;
REVOKE ALL ON FUNCTION public.orphan_files(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_files(int) TO service_role;

-- ---------------------------------------------------------------- AI quota (B-29)
-- VOLATILE, not STABLE: after waiting for the lock it has to count what the last caller just wrote.
CREATE OR REPLACE FUNCTION trip_private.ai_gate(p_kind text, p_trip uuid, p_user uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE s record; n int;
BEGIN
  SELECT ai_enabled, ai_daily_global_cap, ai_daily_user_cap INTO s FROM public.app_settings LIMIT 1;
  IF s IS NULL THEN RETURN; END IF;
  IF NOT s.ai_enabled THEN RAISE EXCEPTION 'AI_PAUSED: AI ideas are taking a break — pre-written content keeps playing.'; END IF;
  -- Held to the end of the caller's transaction, which also writes the ai_usage row this counts.
  PERFORM pg_advisory_xact_lock(hashtextextended('trip_private.ai_gate', 0));
  SELECT count(*) INTO n FROM public.ai_usage WHERE created_at >= date_trunc('day', now());
  IF n >= s.ai_daily_global_cap THEN RAISE EXCEPTION 'AI_DAILY_CAP: AI ideas are taking a break — pre-written content keeps playing.'; END IF;
  IF p_user IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.ai_usage WHERE user_id = p_user AND created_at >= date_trunc('day', now());
    IF n >= s.ai_daily_user_cap THEN RAISE EXCEPTION 'AI_USER_CAP: AI ideas are taking a break — pre-written content keeps playing.'; END IF;
  END IF;
END $$;

-- App-paid AI: reserves the call and returns its row, or NULL when the kill switch or a cap says no.
CREATE FUNCTION public.ai_reserve_server(p_kind text, p_trip uuid, p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM trip_private.ai_gate(p_kind, p_trip, p_user);
  INSERT INTO public.ai_usage (user_id, trip_id, kind) VALUES (p_user, p_trip, p_kind) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN raise_exception THEN RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.ai_reserve_server(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reserve_server(text, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------- notifications (B-30)
CREATE OR REPLACE FUNCTION trip_private.claim_notifications(p_limit integer DEFAULT 200, p_user uuid DEFAULT NULL::uuid)
RETURNS TABLE(id uuid, user_id uuid, type text, title text, body text, deep_link text, attempts integer,
              push boolean, email boolean, email_address text, subscriptions jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.notification_queue q SET status = 'skipped'
  FROM public.notification_prefs p
  WHERE p.user_id = q.user_id AND p.type = q.type AND NOT (p.push OR p.email)
    AND q.status = 'queued' AND q.send_after <= now();
  -- A send that died mid-way (no finish_notifications): give up at the attempt limit, and drop it if
  -- the player has left the trip since. Anything else is claimed again below, so delivery is
  -- at-least-once; the push Topic and the notification tag collapse a repeat on the device.
  UPDATE public.notification_queue q
  SET status = CASE WHEN q.attempts >= 5 THEN 'failed' ELSE 'skipped' END,
      last_error = CASE WHEN q.attempts >= 5 THEN 'gave up: the sender stopped mid-way too many times'
                        ELSE 'no longer in this trip' END
  WHERE q.status = 'sending' AND q.claimed_at < now() - interval '10 minutes'
    AND (q.attempts >= 5 OR (q.trip_id IS NOT NULL AND NOT trip_private.is_trip_member(q.trip_id, q.user_id)));
  RETURN QUERY
  WITH due AS (
    SELECT q.id FROM public.notification_queue q
    WHERE (q.status = 'queued' AND q.send_after <= now()
           OR q.status = 'sending' AND q.claimed_at < now() - interval '10 minutes')
      AND (p_user IS NULL OR q.user_id = p_user)
    ORDER BY q.send_after LIMIT greatest(1, least(p_limit, 1000))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.notification_queue q SET status = 'sending', claimed_at = now(), attempts = q.attempts + 1
    FROM due WHERE q.id = due.id
    RETURNING q.*
  )
  SELECT c.id, c.user_id, c.type, c.title, c.body, c.deep_link, c.attempts,
         coalesce(p.push, true), coalesce(p.email, false), u.email::text,
         coalesce((SELECT jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                   FROM public.push_subscriptions s WHERE s.user_id = c.user_id), '[]'::jsonb)
  FROM claimed c
  LEFT JOIN public.notification_prefs p ON p.user_id = c.user_id AND p.type = c.type
  LEFT JOIN auth.users u ON u.id = c.user_id;
END
$$;
