-- N-6: a declined join request used to vanish (approve_member deleted the pending row), so the
-- player only saw the private-beta screen with no reason. The decline is now kept for that player
-- alone, shown to them once, and gone when they dismiss it, ask again, or delete their account.
CREATE TABLE trip_private.join_declines (
  trip_id uuid NOT NULL REFERENCES public.trips (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  declined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
CREATE INDEX join_declines_user_id_idx ON trip_private.join_declines (user_id);
ALTER TABLE trip_private.join_declines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE trip_private.join_declines FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE trip_private.join_declines TO service_role;

-- Unchanged except for the two join_declines lines.
CREATE OR REPLACE FUNCTION trip_private.approve_member(p_trip uuid, p_user uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can approve members'; END IF;
 IF p_user=auth.uid() THEN RAISE EXCEPTION 'You can''t approve yourself'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='pending') THEN RAISE EXCEPTION 'That request is no longer waiting'; END IF;
 IF p_approve THEN
  IF coalesce(trip_private.age_of(p_user),0) < 18 AND NOT EXISTS (SELECT 1 FROM public.sandbox_bots WHERE user_id=p_user) THEN
    IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can approve players under 18'; END IF;
    IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND vibe='party') THEN RAISE EXCEPTION 'Party trips aren''t open to players under 18'; END IF;
    IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND season_rule='a2c') THEN
      UPDATE public.trips SET vibe='family', has_minors=true WHERE id=p_trip;
      UPDATE public.trip_adult_settings SET enabled=false WHERE trip_id=p_trip;
    END IF;
  END IF;
  UPDATE public.trip_members SET status='approved', approved_at=now() WHERE trip_id=p_trip AND user_id=p_user;
  DELETE FROM trip_private.trip_removals WHERE trip_id=p_trip AND user_id=p_user;
  DELETE FROM trip_private.join_declines WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.apply_join_baseline(p_trip, p_user);
  INSERT INTO public.beta_access(user_id, source) VALUES (p_user, 'invite') ON CONFLICT DO NOTHING;
 ELSE
  DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user;
  INSERT INTO trip_private.join_declines(trip_id, user_id) VALUES (p_trip, p_user)
  ON CONFLICT (trip_id, user_id) DO UPDATE SET declined_at = now();
 END IF; END $function$;

-- Only my own declines, and only for trips I haven't asked to join again since.
CREATE FUNCTION trip_private.my_join_declines()
 RETURNS TABLE(trip_id uuid, name text, declined_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT d.trip_id, t.name, d.declined_at
  FROM trip_private.join_declines d JOIN public.trips t ON t.id = d.trip_id
  WHERE d.user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id = d.trip_id AND m.user_id = d.user_id)
  ORDER BY d.declined_at DESC
$function$;

CREATE FUNCTION trip_private.dismiss_join_decline(p_trip uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  DELETE FROM trip_private.join_declines WHERE trip_id = p_trip AND user_id = auth.uid()
$function$;

CREATE FUNCTION public.my_join_declines()
 RETURNS TABLE(trip_id uuid, name text, declined_at timestamptz)
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT * FROM trip_private.my_join_declines() $function$;

CREATE FUNCTION public.dismiss_join_decline(p_trip uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT trip_private.dismiss_join_decline(p_trip) $function$;

REVOKE ALL ON FUNCTION trip_private.my_join_declines() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION trip_private.dismiss_join_decline(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_join_declines() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dismiss_join_decline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.my_join_declines() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.dismiss_join_decline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_join_declines() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_join_decline(uuid) TO authenticated, service_role;
