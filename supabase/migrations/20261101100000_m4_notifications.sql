-- M4-07 – M4-09: reminders as web push, with email as backup (R-812, deck slide 18).
--
-- - push_subscriptions: one row per browser that turned reminders on (Web Push endpoint + keys).
-- - notification_prefs: per player and reminder type, push and email on/off (R-812 "mute any type").
-- - profiles.quiet_start / quiet_end: quiet hours in the player's own zone (profiles.time_zone).
-- - notification_queue: what to send when. Planned from trip_schedule (re-planned whenever the
--   schedule changes), plus events: a proof waiting for your 👍, your proof expired, Game Night is
--   live. Server only: clients never read or write it.
-- - The sender is the Worker route /api/public/notify, called every minute by pg_cron with its cron
--   key. It claims due rows (claim_notifications), sends, and reports back (finish_notifications).
--
-- rollback: SELECT cron.unschedule('send-notifications'); DROP TABLE public.notification_queue,
--   public.notification_prefs, public.push_subscriptions; ALTER TABLE public.profiles DROP COLUMN
--   quiet_start, DROP COLUMN quiet_end; DROP the functions below; DELETE FROM trip_private.cron_keys
--   WHERE name = 'notify';

-- ---------------------------------------------------------------------------------------------
-- Reminder types (M4-09). The label is what Me → Notifications shows.
CREATE FUNCTION trip_private.notification_types()
RETURNS TABLE(type text, label text, sort int) LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  VALUES ('daily', 'Daily Discovery each morning', 1),
         ('sealed_drop', 'A sealed quest drops', 2),
         ('sealed_prep', 'A sealed quest is due tomorrow', 3),
         ('night_soon', 'Call night in an hour', 4),
         ('night_live', 'Game Night is live', 5),
         ('preflight_closing', 'Pre-Flight closes tonight', 6),
         ('missions_open', 'Airport Missions are open', 7),
         ('drop_open', 'A Surprise Drop is open', 8),
         ('drop_ending', 'A Surprise Drop ends soon', 9),
         ('crowning_24h', 'Crowning night tomorrow', 10),
         ('crew_check', 'A crew proof needs your 👍', 11),
         ('proof_expired', 'Your proof ran out of time', 12),
         ('test', 'Test notification', 99)
$$;

-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 40 AND 200),
  auth text NOT NULL CHECK (length(auth) BETWEEN 10 AND 100),
  user_agent text CHECK (length(user_agent) <= 400),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own subscriptions" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, user_id, endpoint, user_agent, created_at, updated_at) ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

CREATE TABLE public.notification_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  push boolean NOT NULL DEFAULT true,
  email boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type)
);
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own notification settings" ON public.notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE ALL ON public.notification_prefs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN quiet_start time NOT NULL DEFAULT '22:00',
  ADD COLUMN quiet_end time NOT NULL DEFAULT '08:00';

CREATE TABLE public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL CHECK (length(title) <= 120),
  body text NOT NULL CHECK (length(body) <= 500),
  deep_link text NOT NULL DEFAULT '/home' CHECK (deep_link ~ '^/' AND length(deep_link) <= 300),
  send_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'skipped', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  channel text CHECK (channel IN ('push', 'email')),
  last_error text CHECK (length(last_error) <= 300),
  claimed_at timestamptz,
  sent_at timestamptz,
  -- One per (type, what it's about, player): re-planning moves it instead of adding another.
  dedupe_key text NOT NULL UNIQUE,
  planned boolean NOT NULL DEFAULT false,   -- true: from the schedule (re-planned); false: an event
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_queue_due_idx ON public.notification_queue (send_after) WHERE status = 'queued';
CREATE INDEX notification_queue_trip_idx ON public.notification_queue (trip_id) WHERE status = 'queued';
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_queue TO service_role;
CREATE TRIGGER notification_queue_archive_guard BEFORE INSERT OR UPDATE ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- ---------------------------------------------------------------------------------------------
-- Quiet hours (R-812). A time inside the player's quiet hours moves to when they end, unless the
-- thing it's about would be over by then: then it goes out just before the quiet hours started,
-- but never before p_earliest (a reminder that carries content, like the daily tip, never goes out
-- before its item opens). NULL: there is no good time, so it isn't sent.
CREATE FUNCTION trip_private.quiet_shift(p_at timestamptz, p_zone text, p_start time, p_end time,
                                         p_deadline timestamptz, p_earliest timestamptz DEFAULT NULL)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_zone text := coalesce(nullif(p_zone, ''), 'UTC');
  v_local timestamp := p_at AT TIME ZONE v_zone;
  v_t time := v_local::time;
  v_quiet boolean;
  v_start timestamp;
  v_end timestamp;
BEGIN
  IF p_start = p_end THEN RETURN p_at; END IF;   -- no quiet hours
  v_quiet := CASE WHEN p_start < p_end THEN v_t >= p_start AND v_t < p_end
                  ELSE v_t >= p_start OR v_t < p_end END;
  IF NOT v_quiet THEN RETURN p_at; END IF;
  -- The quiet window this time is in, as local timestamps.
  IF p_start < p_end OR v_t >= p_start THEN v_start := v_local::date + p_start;
  ELSE v_start := (v_local::date - 1) + p_start; END IF;
  v_end := CASE WHEN p_end > p_start THEN v_start::date + p_end ELSE (v_start::date + 1) + p_end END;
  IF p_deadline IS NOT NULL AND (v_end AT TIME ZONE v_zone) >= p_deadline THEN
    IF p_earliest IS NOT NULL AND (v_start AT TIME ZONE v_zone) - interval '5 minutes' < p_earliest THEN
      RETURN NULL;
    END IF;
    RETURN least(p_at, (v_start AT TIME ZONE v_zone) - interval '5 minutes');
  END IF;
  RETURN v_end AT TIME ZONE v_zone;
END
$$;

-- Queue (or move) one notification. Muted on both channels: nothing is queued. Returns the row id.
CREATE FUNCTION trip_private.enqueue_notification(
  p_user uuid, p_trip uuid, p_type text, p_title text, p_body text, p_link text,
  p_at timestamptz, p_deadline timestamptz, p_dedupe text, p_planned boolean DEFAULT false,
  p_earliest timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  pr public.profiles;
  v_push boolean := true;
  v_email boolean := false;
  v_at timestamptz;
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trip_private.notification_types() n WHERE n.type = p_type) THEN
    RAISE EXCEPTION 'Unknown notification type %', p_type;
  END IF;
  SELECT n.push, n.email INTO v_push, v_email FROM public.notification_prefs n
  WHERE n.user_id = p_user AND n.type = p_type;
  v_push := coalesce(v_push, true);
  v_email := coalesce(v_email, false);
  IF NOT (v_push OR v_email) THEN
    DELETE FROM public.notification_queue WHERE dedupe_key = p_dedupe AND status = 'queued';
    RETURN NULL;
  END IF;
  SELECT * INTO pr FROM public.profiles WHERE id = p_user;
  v_at := CASE WHEN p_type = 'test' THEN p_at
               ELSE trip_private.quiet_shift(p_at, pr.time_zone, coalesce(pr.quiet_start, '22:00'),
                                             coalesce(pr.quiet_end, '08:00'), p_deadline, p_earliest) END;
  IF v_at IS NULL THEN
    DELETE FROM public.notification_queue WHERE dedupe_key = p_dedupe AND status = 'queued';
    RETURN NULL;
  END IF;
  INSERT INTO public.notification_queue AS q (user_id, trip_id, type, title, body, deep_link, send_after, dedupe_key, planned)
  VALUES (p_user, p_trip, p_type, left(p_title, 120), left(coalesce(p_body, ''), 500), coalesce(p_link, '/home'),
          v_at, p_dedupe, p_planned)
  ON CONFLICT (dedupe_key) DO UPDATE
    SET title = excluded.title, body = excluded.body, deep_link = excluded.deep_link, send_after = excluded.send_after
    WHERE q.status = 'queued'
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- What the schedule asks for (M4-09), one row per player and reminder. Per-player items go to that
-- player; crew items to every approved member. Only reminders still in the future.
CREATE FUNCTION trip_private.desired_notifications(p_trip uuid)
RETURNS TABLE(user_id uuid, type text, title text, body text, deep_link text, at timestamptz,
              deadline timestamptz, earliest timestamptz, dedupe text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH t AS (SELECT * FROM public.trips WHERE id = p_trip AND rules_version = 2 AND setup_completed_at IS NOT NULL),
  m AS (SELECT tm.user_id, coalesce(nullif(p.time_zone, ''), (SELECT home_timezone FROM t)) AS tz
        FROM public.trip_members tm LEFT JOIN public.profiles p ON p.id = tm.user_id
        WHERE tm.trip_id = p_trip AND tm.status = 'approved'),
  s AS (SELECT sc.*, m.user_id AS member, m.tz
        FROM public.trip_schedule sc JOIN m ON sc.user_id IS NULL OR sc.user_id = m.user_id
        WHERE sc.trip_id = p_trip AND EXISTS (SELECT 1 FROM t)),
  r AS (
    -- Each morning: the tip itself (R-313), at 8 AM in the player's zone or when it opens if later.
    SELECT member, 'daily' AS type, 'Daily Discovery' AS title,
           left(coalesce(s.tailored_text, 'Today''s Daily Discovery is here.'), 200) AS body, '/home' AS link,
           greatest(s.opens_at, (((s.opens_at AT TIME ZONE s.tz)::date + time '08:00') AT TIME ZONE s.tz)) AS at,
           s.closes_at AS deadline, s.opens_at AS earliest, s.id AS ref
    FROM s WHERE s.kind = 'daily_discovery'
    UNION ALL
    SELECT member, 'sealed_drop', 'A sealed quest just dropped', 'Open it within 3 hours for +5 bonus points.',
           '/play', s.opens_at, s.opens_at + interval '3 hours', s.opens_at, s.id
    FROM s WHERE s.kind = 'sealed_quest'
    UNION ALL
    SELECT member, 'sealed_prep', 'Your sealed quest is due tomorrow', 'Get it done before the call night.',
           '/play', s.closes_at - interval '24 hours', s.closes_at, NULL::timestamptz, s.id
    FROM s WHERE s.kind = 'sealed_quest' AND s.closes_at IS NOT NULL
    UNION ALL
    SELECT member, 'night_soon', 'Call night in an hour', 'Join the call from Play when it starts.',
           '/play', s.opens_at - interval '1 hour', s.opens_at, NULL::timestamptz, s.id
    FROM s WHERE s.kind = 'call_night'
    UNION ALL
    SELECT member, 'preflight_closing', 'Pre-Flight closes tonight', 'Last chance for Pre-Flight points.',
           '/play', s.closes_at - interval '5 hours', s.closes_at, NULL::timestamptz, s.id
    FROM s WHERE s.kind = 'phase' AND s.slot = 'preflight' AND s.closes_at IS NOT NULL
    UNION ALL
    SELECT member, 'missions_open', 'Airport Missions are open', 'Three missions for travel day, 4 points each.',
           '/play', min(s.opens_at), max(s.closes_at), min(s.opens_at), NULL::uuid
    FROM s WHERE s.kind IN ('airport_mission', 'home_mission') GROUP BY member
    UNION ALL
    SELECT member, 'drop_open', 'A Surprise Drop is open', 'Play it on Play before it ends.',
           '/play', s.opens_at, s.closes_at, s.opens_at, s.id
    FROM s WHERE s.kind = 'surprise_drop'
    UNION ALL
    SELECT member, 'drop_ending', 'A Surprise Drop ends in 3 hours', 'Send your proofs before it closes.',
           '/play', s.closes_at - interval '3 hours', s.closes_at, NULL::timestamptz, s.id
    FROM s WHERE s.kind = 'surprise_drop' AND s.closes_at IS NOT NULL
    UNION ALL
    SELECT member, 'crowning_24h', 'Crowning night is tomorrow',
           coalesce('See you at ' || nullif((SELECT crowning_place FROM t), ''), 'Who takes the crown?'),
           '/play', s.opens_at - interval '24 hours', s.opens_at, NULL::timestamptz, s.id
    FROM s WHERE s.kind = 'crowning'
  )
  SELECT r.member, r.type, r.title, r.body, r.link, r.at, r.deadline, r.earliest,
         r.type || ':' || p_trip || ':' || coalesce(r.ref::text, '') || ':' || r.member
  FROM r WHERE r.at > now()
$$;

-- Re-plan a trip's reminders: add and move what the schedule asks for, drop queued ones it no
-- longer does. Events (crew check, expiry, Game Night live) are left alone.
CREATE FUNCTION trip_private.plan_notifications(p_trip uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d record; v_keep text[] := '{}'; n int := 0;
BEGIN
  FOR d IN SELECT * FROM trip_private.desired_notifications(p_trip) LOOP
    v_keep := v_keep || d.dedupe;
    PERFORM trip_private.enqueue_notification(d.user_id, p_trip, d.type, d.title, d.body, d.deep_link,
                                              d.at, d.deadline, d.dedupe, true, d.earliest);
    n := n + 1;
  END LOOP;
  DELETE FROM public.notification_queue q
  WHERE q.trip_id = p_trip AND q.planned AND q.status = 'queued' AND NOT (q.dedupe_key = ANY (v_keep));
  RETURN n;
END
$$;

-- The schedule changed (plan_trip, Captain edits, call nights, crowning): re-plan those trips.
CREATE FUNCTION trip_private.schedule_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_trip uuid;
BEGIN
  FOR v_trip IN SELECT DISTINCT trip_id FROM changed LOOP
    IF EXISTS (SELECT 1 FROM public.trips WHERE id = v_trip) THEN
      PERFORM trip_private.plan_notifications(v_trip);
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;
CREATE TRIGGER trip_schedule_notify_ins AFTER INSERT ON public.trip_schedule
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION trip_private.schedule_changed();
CREATE TRIGGER trip_schedule_notify_upd AFTER UPDATE ON public.trip_schedule
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION trip_private.schedule_changed();
CREATE TRIGGER trip_schedule_notify_del AFTER DELETE ON public.trip_schedule
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION trip_private.schedule_changed();

-- A member joined, left or was approved: their reminders change too.
CREATE FUNCTION trip_private.members_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_trip uuid;
BEGIN
  FOR v_trip IN SELECT DISTINCT trip_id FROM changed LOOP
    IF EXISTS (SELECT 1 FROM public.trips WHERE id = v_trip) THEN
      PERFORM trip_private.plan_notifications(v_trip);
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.notification_queue q USING changed c
    WHERE q.trip_id = c.trip_id AND q.user_id = c.user_id AND q.status = 'queued';
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER trip_members_notify_ins AFTER INSERT ON public.trip_members
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION trip_private.members_changed();
CREATE TRIGGER trip_members_notify_upd AFTER UPDATE ON public.trip_members
  REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION trip_private.members_changed();
CREATE TRIGGER trip_members_notify_del AFTER DELETE ON public.trip_members
  REFERENCING OLD TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION trip_private.members_changed();

-- ---------------------------------------------------------------------------------------------
-- Events. Crew Check (R-412): a new proof waiting → the rest of the crew, batched to at most two a
-- day per player (morning and afternoon slots share one notification each).
CREATE FUNCTION trip_private.proof_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m record; v_tz text; v_local timestamp; v_slot text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.crew_status = 'waiting' THEN
    FOR m IN SELECT tm.user_id, coalesce(nullif(p.time_zone, ''), t.home_timezone) AS tz
             FROM public.trip_members tm JOIN public.trips t ON t.id = tm.trip_id
             LEFT JOIN public.profiles p ON p.id = tm.user_id
             WHERE tm.trip_id = NEW.trip_id AND tm.status = 'approved' AND tm.user_id <> NEW.user_id LOOP
      v_local := now() AT TIME ZONE m.tz;
      v_slot := v_local::date || CASE WHEN v_local::time < time '14:00' THEN 'am' ELSE 'pm' END;
      PERFORM trip_private.enqueue_notification(m.user_id, NEW.trip_id, 'crew_check', 'Crew Check',
        'A crew proof is waiting for your 👍', '/play', now(), NEW.expires_at,
        'crew_check:' || NEW.trip_id || ':' || v_slot || ':' || m.user_id);
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND NEW.crew_status = 'expired' AND OLD.crew_status IS DISTINCT FROM 'expired' THEN
    PERFORM trip_private.enqueue_notification(NEW.user_id, NEW.trip_id, 'proof_expired', 'Your proof ran out of time',
      'Nobody gave it a 👍 within 24 hours, so it didn''t count.', '/play', now(), NULL,
      'proof_expired:' || NEW.id);
  END IF;
  RETURN NULL;
END
$$;
CREATE TRIGGER proofs_notify AFTER INSERT OR UPDATE OF crew_status ON public.proofs
  FOR EACH ROW EXECUTE FUNCTION trip_private.proof_notify();

-- Game Night Live opened (R-405): everyone in the trip, now.
CREATE FUNCTION trip_private.live_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE m record;
BEGIN
  FOR m IN SELECT user_id FROM public.trip_members
           WHERE trip_id = NEW.trip_id AND status = 'approved' AND user_id IS DISTINCT FROM NEW.opened_by LOOP
    PERFORM trip_private.enqueue_notification(m.user_id, NEW.trip_id, 'night_live',
      CASE WHEN NEW.is_crowning THEN 'Crowning night is live' ELSE 'Game Night is live' END,
      'Join from Play to vote.', '/play', now(), NEW.auto_close_at, 'night_live:' || NEW.id || ':' || m.user_id);
  END LOOP;
  RETURN NULL;
END
$$;
CREATE TRIGGER live_sessions_notify AFTER INSERT ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION trip_private.live_notify();

-- ---------------------------------------------------------------------------------------------
-- Player-facing functions (identity-checked; invoker wrappers below).
CREATE FUNCTION trip_private.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, updated_at = now();
END
$$;

CREATE FUNCTION trip_private.delete_push_subscription(p_endpoint text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid()
$$;

CREATE FUNCTION trip_private.set_notification_pref(p_type text, p_push boolean, p_email boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_trip uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_type = 'test' OR NOT EXISTS (SELECT 1 FROM trip_private.notification_types() n WHERE n.type = p_type) THEN
    RAISE EXCEPTION 'Unknown reminder type';
  END IF;
  INSERT INTO public.notification_prefs (user_id, type, push, email)
  VALUES (auth.uid(), p_type, coalesce(p_push, true), coalesce(p_email, false))
  ON CONFLICT (user_id, type) DO UPDATE SET push = excluded.push, email = excluded.email, updated_at = now();
  -- Muting drops what is queued; turning it back on re-plans this player's trips.
  IF NOT (coalesce(p_push, true) OR coalesce(p_email, false)) THEN
    DELETE FROM public.notification_queue WHERE user_id = auth.uid() AND type = p_type AND status = 'queued';
  ELSE
    FOR v_trip IN SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid() AND status = 'approved' LOOP
      PERFORM trip_private.plan_notifications(v_trip);
    END LOOP;
  END IF;
END
$$;

CREATE FUNCTION trip_private.set_quiet_hours(p_start time, p_end time) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_trip uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  UPDATE public.profiles SET quiet_start = coalesce(p_start, '22:00'), quiet_end = coalesce(p_end, '08:00')
  WHERE id = auth.uid();
  FOR v_trip IN SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid() AND status = 'approved' LOOP
    PERFORM trip_private.plan_notifications(v_trip);
  END LOOP;
END
$$;

-- My settings: every type with its push/email switches (defaults where unset) and my quiet hours.
CREATE FUNCTION trip_private.my_notification_settings()
RETURNS TABLE(type text, label text, push boolean, email boolean, quiet_start time, quiet_end time)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT n.type, n.label, coalesce(p.push, true), coalesce(p.email, false), pr.quiet_start, pr.quiet_end
  FROM trip_private.notification_types() n
  LEFT JOIN public.notification_prefs p ON p.user_id = auth.uid() AND p.type = n.type
  LEFT JOIN public.profiles pr ON pr.id = auth.uid()
  WHERE n.type <> 'test' AND auth.uid() IS NOT NULL
  ORDER BY n.sort
$$;

-- "Send me a test": queued for right now, past quiet hours; the sender runs it straight away.
CREATE FUNCTION trip_private.queue_test_notification() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Turn on notifications on this phone first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notification_queue WHERE user_id = auth.uid() AND type = 'test'
             AND created_at > now() - interval '1 minute') THEN
    RAISE EXCEPTION 'One test a minute, please';
  END IF;
  RETURN trip_private.enqueue_notification(auth.uid(), NULL, 'test', 'TripJunkies', 'Reminders are on. See you on the trip!',
    '/me', now(), NULL, 'test:' || auth.uid() || ':' || extract(epoch FROM now())::bigint);
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Sender side (service role only, called by /api/public/notify).
-- Claims due rows, oldest first. A row stuck in 'sending' (a crashed run) is taken again after
-- 10 minutes. Muted on both channels since it was queued: skipped here.
CREATE FUNCTION trip_private.claim_notifications(p_limit int DEFAULT 200, p_user uuid DEFAULT NULL)
RETURNS TABLE(id uuid, user_id uuid, type text, title text, body text, deep_link text, attempts int,
              push boolean, email boolean, email_address text, subscriptions jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.notification_queue q SET status = 'skipped'
  FROM public.notification_prefs p
  WHERE p.user_id = q.user_id AND p.type = q.type AND NOT (p.push OR p.email)
    AND q.status = 'queued' AND q.send_after <= now();
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

-- Results: [{id, outcome: sent|retry|skipped|failed, channel, error, gone: [endpoints]}]. skipped:
-- nothing to send it to (no subscription, no email). A retry waits
-- 1, 2, 4, 8 minutes; after 5 attempts it is failed.
CREATE FUNCTION trip_private.finish_notifications(p_results jsonb) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb; n int := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) LOOP
    DELETE FROM public.push_subscriptions WHERE endpoint IN (SELECT jsonb_array_elements_text(coalesce(r->'gone', '[]'::jsonb)));
    UPDATE public.notification_queue q SET
      status = CASE r->>'outcome' WHEN 'sent' THEN 'sent'
                                  WHEN 'skipped' THEN 'skipped'
                                  WHEN 'retry' THEN CASE WHEN q.attempts >= 5 THEN 'failed' ELSE 'queued' END
                                  ELSE 'failed' END,
      send_after = CASE WHEN r->>'outcome' = 'retry' THEN now() + make_interval(mins => power(2, q.attempts - 1)::int)
                        ELSE q.send_after END,
      channel = coalesce(r->>'channel', q.channel),
      last_error = left(r->>'error', 300),
      sent_at = CASE WHEN r->>'outcome' = 'sent' THEN now() END
    WHERE q.id = (r->>'id')::uuid AND q.status = 'sending';
    n := n + 1;
  END LOOP;
  RETURN n;
END
$$;

-- Sent and failed rows older than 30 days are cleared by the existing nightly cleanup below.
CREATE FUNCTION trip_private.prune_notifications() RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  WITH d AS (DELETE FROM public.notification_queue
             WHERE status IN ('sent', 'skipped', 'failed') AND created_at < now() - interval '30 days' RETURNING 1)
  SELECT count(*)::int FROM d
$$;

REVOKE ALL ON FUNCTION trip_private.notification_types(), trip_private.quiet_shift(timestamptz, text, time, time, timestamptz, timestamptz),
  trip_private.enqueue_notification(uuid, uuid, text, text, text, text, timestamptz, timestamptz, text, boolean, timestamptz),
  trip_private.desired_notifications(uuid), trip_private.plan_notifications(uuid), trip_private.schedule_changed(),
  trip_private.members_changed(), trip_private.proof_notify(), trip_private.live_notify(),
  trip_private.save_push_subscription(text, text, text, text), trip_private.delete_push_subscription(text),
  trip_private.set_notification_pref(text, boolean, boolean), trip_private.set_quiet_hours(time, time),
  trip_private.my_notification_settings(), trip_private.queue_test_notification(),
  trip_private.claim_notifications(int, uuid), trip_private.finish_notifications(jsonb), trip_private.prune_notifications()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.save_push_subscription(text, text, text, text),
  trip_private.delete_push_subscription(text), trip_private.set_notification_pref(text, boolean, boolean),
  trip_private.set_quiet_hours(time, time), trip_private.my_notification_settings(), trip_private.queue_test_notification()
  TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.claim_notifications(int, uuid), trip_private.finish_notifications(jsonb),
  trip_private.queue_test_notification() TO service_role;

CREATE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  SELECT trip_private.save_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent) $$;
CREATE FUNCTION public.delete_push_subscription(p_endpoint text) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.delete_push_subscription(p_endpoint) $$;
CREATE FUNCTION public.set_notification_pref(p_type text, p_push boolean, p_email boolean) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_notification_pref(p_type, p_push, p_email) $$;
CREATE FUNCTION public.set_quiet_hours(p_start time, p_end time) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_quiet_hours(p_start, p_end) $$;
CREATE FUNCTION public.my_notification_settings()
RETURNS TABLE(type text, label text, push boolean, email boolean, quiet_start time, quiet_end time)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.my_notification_settings() $$;
CREATE FUNCTION public.queue_test_notification() RETURNS uuid
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.queue_test_notification() $$;
CREATE FUNCTION public.claim_notifications(p_limit int DEFAULT 200, p_user uuid DEFAULT NULL)
RETURNS TABLE(id uuid, user_id uuid, type text, title text, body text, deep_link text, attempts int,
              push boolean, email boolean, email_address text, subscriptions jsonb)
LANGUAGE sql SET search_path = '' AS $$ SELECT * FROM trip_private.claim_notifications(p_limit, p_user) $$;
CREATE FUNCTION public.finish_notifications(p_results jsonb) RETURNS int
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.finish_notifications(p_results) $$;
REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text),
  public.set_notification_pref(text, boolean, boolean), public.set_quiet_hours(time, time),
  public.my_notification_settings(), public.queue_test_notification(), public.claim_notifications(int, uuid),
  public.finish_notifications(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text),
  public.set_notification_pref(text, boolean, boolean), public.set_quiet_hours(time, time),
  public.my_notification_settings(), public.queue_test_notification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notifications(int, uuid), public.finish_notifications(jsonb) TO service_role;

-- ---------------------------------------------------------------------------------------------
-- The sender's cron key (new for each database) and the every-minute job. scripts/deploy.sh puts the
-- Worker's URL in trip_private.cron_endpoints ('notify') after a deploy; until then nothing runs.
INSERT INTO trip_private.cron_keys (name, key)
VALUES ('notify', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;
SELECT cron.schedule('send-notifications', '* * * * *', '
  SELECT net.http_post(
    url := e.url,
    headers := jsonb_build_object(
      ''Content-Type'', ''application/json'',
      ''Authorization'', ''Bearer '' || k.key
    ),
    body := ''{}''::jsonb
  )
  FROM trip_private.cron_endpoints e
  JOIN trip_private.cron_keys k ON k.name = e.name
  WHERE e.name = ''notify''
    AND EXISTS (SELECT 1 FROM public.notification_queue q WHERE q.status = ''queued'' AND q.send_after <= now());
');
SELECT cron.schedule('prune-notifications', '41 3 * * *', 'SELECT trip_private.prune_notifications();');

-- Plan reminders for trips that already have a schedule.
SELECT trip_private.plan_notifications(id) FROM public.trips WHERE rules_version = 2 AND setup_completed_at IS NOT NULL;
