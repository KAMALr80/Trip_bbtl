-- M1-01: archive mode for trips built on the old rule generations (dev-docs/06 Q1).
-- trips.rules_version: 2 = current (default for every trip, old and new, until the cutover),
-- 1 = archived: readable, but players can't change anything. Nothing is archived by this migration;
-- an app admin archives trips at the cutover with trip_private.archive_legacy_trips, which skips the
-- trips named in p_keep (e.g. a group that is mid-trip) and logs every change.
--
-- Enforcement is one trigger on every public table that has a trip_id, so no write path (current or
-- retired RPCs, direct table writes) can miss it. It applies to end-user requests only: cron jobs,
-- migrations and service-role calls have no auth.uid() and pass, so a system job can't abort on an
-- archived trip. App admins also pass (support). DELETE is always allowed: deleting the trip,
-- leaving it, removing a player and moderation keep working.
-- rollback: DROP the triggers and functions below, then ALTER TABLE public.trips DROP COLUMN rules_version;

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS rules_version smallint NOT NULL DEFAULT 2
  CHECK (rules_version IN (1, 2));
COMMENT ON COLUMN public.trips.rules_version IS
  '1 = archived (pre-new-engine trip, read-only for players), 2 = current. See trip_private.archive_legacy_trips.';

CREATE TABLE IF NOT EXISTS trip_private.trip_archive_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id uuid NOT NULL,
  archived boolean NOT NULL,
  changed_by uuid,
  note text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON trip_private.trip_archive_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION trip_private.trip_is_archived(p_trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip AND rules_version = 1)
$$;

CREATE OR REPLACE FUNCTION trip_private.guard_archived_trip() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR trip_private.is_app_admin() THEN RETURN NEW; END IF;
  IF trip_private.trip_is_archived(NEW.trip_id)
     OR (TG_OP = 'UPDATE' AND trip_private.trip_is_archived(OLD.trip_id)) THEN
    RAISE EXCEPTION 'TRIP_ARCHIVED: This trip is archived and can''t be changed.';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION trip_private.guard_archived_trip_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR trip_private.is_app_admin() THEN RETURN NEW; END IF;
  IF NEW.rules_version IS DISTINCT FROM OLD.rules_version THEN
    RAISE EXCEPTION 'Only an app admin can archive or restore a trip';
  END IF;
  IF OLD.rules_version = 1 THEN
    RAISE EXCEPTION 'TRIP_ARCHIVED: This trip is archived and can''t be changed.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trip_private.guard_archived_trip(), trip_private.guard_archived_trip_row() FROM PUBLIC;

DROP TRIGGER IF EXISTS trips_archive_guard ON public.trips;
CREATE TRIGGER trips_archive_guard BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip_row();

-- Tables that stay writable on an archived trip: logging, moderation, feedback, the delete/leave
-- flows, payments and the founder's Test Lab bookkeeping.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb USING (table_schema, table_name)
    WHERE c.table_schema = 'public' AND c.column_name = 'trip_id' AND tb.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('ai_usage', 'bug_reports', 'checkin_responses', 'content_seen',
                               'content_topups', 'content_variants', 'orders', 'photo_removed',
                               'photo_reports', 'trip_deletion_log', 'trip_feedback',
                               'trip_role_changes', 'sandbox_bots', 'sandbox_trips')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_archive_guard', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW '
                   'EXECUTE FUNCTION trip_private.guard_archived_trip()', t || '_archive_guard', t);
  END LOOP;
END $$;

-- Admin actions, logged. Archive every trip created before p_created_before except p_keep.
CREATE OR REPLACE FUNCTION trip_private.archive_legacy_trips(p_created_before timestamptz, p_keep uuid[], p_note text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'App admins only'; END IF;
  IF p_created_before IS NULL THEN RAISE EXCEPTION 'Choose a cutover time'; END IF;
  WITH changed AS (
    UPDATE public.trips SET rules_version = 1
    WHERE rules_version = 2 AND created_at < p_created_before AND id <> ALL (coalesce(p_keep, '{}'))
    RETURNING id
  )
  INSERT INTO trip_private.trip_archive_log (trip_id, archived, changed_by, note)
  SELECT id, true, auth.uid(), p_note FROM changed;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION trip_private.set_trip_archived(p_trip uuid, p_archived boolean, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'App admins only'; END IF;
  UPDATE public.trips SET rules_version = CASE WHEN p_archived THEN 1 ELSE 2 END
  WHERE id = p_trip AND rules_version <> CASE WHEN p_archived THEN 1 ELSE 2 END;
  IF FOUND THEN
    INSERT INTO trip_private.trip_archive_log (trip_id, archived, changed_by, note)
    VALUES (p_trip, p_archived, auth.uid(), p_note);
  END IF;
END $$;
REVOKE ALL ON FUNCTION trip_private.archive_legacy_trips(timestamptz, uuid[], text),
                       trip_private.set_trip_archived(uuid, boolean, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.archive_legacy_trips(p_created_before timestamptz, p_keep uuid[], p_note text)
RETURNS integer LANGUAGE sql SET search_path = public AS $$
  SELECT trip_private.archive_legacy_trips(p_created_before, p_keep, p_note)
$$;
CREATE OR REPLACE FUNCTION public.set_trip_archived(p_trip uuid, p_archived boolean, p_note text)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  SELECT trip_private.set_trip_archived(p_trip, p_archived, p_note)
$$;
REVOKE ALL ON FUNCTION public.archive_legacy_trips(timestamptz, uuid[], text),
                       public.set_trip_archived(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_legacy_trips(timestamptz, uuid[], text),
                          public.set_trip_archived(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.archive_legacy_trips(timestamptz, uuid[], text),
                          trip_private.set_trip_archived(uuid, boolean, text) TO authenticated;
