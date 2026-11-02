-- M6-05 admin area (Q24 default: keep the in-app founder tools): find users and trips, disable or
-- re-enable an account, archive a trip. App admins only (is_app_admin), every action logged.
--  * Disabling bans the account in Supabase Auth (the server function does that with the service
--    role, after checking the caller is an admin) and records it here with the reason.
--  * Archiving uses the existing set_trip_archived (logged in trip_archive_log).
-- rollback: DROP FUNCTION public.admin_find_users(text), public.admin_find_trips(text),
--   public.record_user_block(uuid, uuid, boolean, text) and their bodies; DROP TABLE public.user_blocks,
--   public.admin_actions.

CREATE TABLE public.admin_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('disable_user', 'enable_user')),
  target_user uuid,
  note text CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_actions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_actions TO service_role;

CREATE TABLE public.user_blocks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  disabled boolean NOT NULL,
  note text CHECK (length(note) <= 500),
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.user_blocks TO service_role;

CREATE FUNCTION trip_private.admin_find_users(p_query text)
RETURNS TABLE(user_id uuid, email text, game_name text, created_at timestamptz, last_sign_in_at timestamptz,
              age_range text, trips int, disabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE q text := '%' || replace(replace(btrim(coalesce(p_query, '')), '%', ''), '_', '') || '%';
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, pp.game_name, u.created_at, u.last_sign_in_at,
           trip_private.age_range(trip_private.age_of(u.id)),
           (SELECT count(*)::int FROM public.trip_members m WHERE m.user_id = u.id),
           coalesce(b.disabled, false)
    FROM auth.users u
    LEFT JOIN public.player_profiles pp ON pp.user_id = u.id
    LEFT JOIN public.user_blocks b ON b.user_id = u.id
    WHERE NOT EXISTS (SELECT 1 FROM public.sandbox_bots sb WHERE sb.user_id = u.id)
      AND (u.email ILIKE q OR pp.game_name ILIKE q OR pp.real_name ILIKE q OR u.id::text = btrim(p_query))
    ORDER BY u.created_at DESC
    LIMIT 50;
END
$$;

CREATE FUNCTION trip_private.admin_find_trips(p_query text)
RETURNS TABLE(id uuid, name text, destination text, room text, play_mode text, start_date date, end_date date,
              members int, phase text, is_sandbox boolean, archived boolean, locked_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE q text := '%' || replace(replace(btrim(coalesce(p_query, '')), '%', ''), '_', '') || '%';
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN QUERY
    SELECT t.id, t.name, t.destination, t.room, t.play_mode, t.start_date, t.end_date,
           (SELECT count(*)::int FROM public.trip_members m WHERE m.trip_id = t.id AND m.status = 'approved'),
           (SELECT ph.phase FROM trip_private.trip_phase(t.id, now()) ph),
           t.is_sandbox, t.rules_version = 1, t.locked_at, t.created_at
    FROM public.trips t
    WHERE t.name ILIKE q OR t.destination ILIKE q OR t.join_code = upper(btrim(p_query)) OR t.id::text = btrim(p_query)
    ORDER BY t.created_at DESC
    LIMIT 50;
END
$$;

-- Called by the server function after it banned / unbanned the account in Auth (service role only).
CREATE FUNCTION trip_private.record_user_block(p_admin uuid, p_user uuid, p_disabled boolean, p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = p_admin) THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF EXISTS (SELECT 1 FROM public.app_admins WHERE user_id = p_user) THEN RAISE EXCEPTION 'Admins can''t be disabled here'; END IF;
  INSERT INTO public.user_blocks (user_id, disabled, note, changed_by) VALUES (p_user, p_disabled, left(p_note, 500), p_admin)
  ON CONFLICT (user_id) DO UPDATE SET disabled = excluded.disabled, note = excluded.note, changed_by = excluded.changed_by,
                                      changed_at = now();
  INSERT INTO public.admin_actions (actor, action, target_user, note)
  VALUES (p_admin, CASE WHEN p_disabled THEN 'disable_user' ELSE 'enable_user' END, p_user, left(p_note, 500));
END
$$;

REVOKE ALL ON FUNCTION trip_private.admin_find_users(text), trip_private.admin_find_trips(text),
  trip_private.record_user_block(uuid, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.admin_find_users(text), trip_private.admin_find_trips(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.record_user_block(uuid, uuid, boolean, text) TO service_role;

CREATE FUNCTION public.admin_find_users(p_query text)
RETURNS TABLE(user_id uuid, email text, game_name text, created_at timestamptz, last_sign_in_at timestamptz,
              age_range text, trips int, disabled boolean)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.admin_find_users(p_query) $$;
CREATE FUNCTION public.admin_find_trips(p_query text)
RETURNS TABLE(id uuid, name text, destination text, room text, play_mode text, start_date date, end_date date,
              members int, phase text, is_sandbox boolean, archived boolean, locked_at timestamptz, created_at timestamptz)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.admin_find_trips(p_query) $$;
CREATE FUNCTION public.record_user_block(p_admin uuid, p_user uuid, p_disabled boolean, p_note text) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.record_user_block(p_admin, p_user, p_disabled, p_note) $$;
REVOKE ALL ON FUNCTION public.admin_find_users(text), public.admin_find_trips(text),
  public.record_user_block(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_find_users(text), public.admin_find_trips(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_user_block(uuid, uuid, boolean, text) TO service_role;
