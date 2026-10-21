ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS room_listed boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS room_nickname text, ADD COLUMN IF NOT EXISTS room_country text, ADD COLUMN IF NOT EXISTS room_region text, ADD COLUMN IF NOT EXISTS room_city text;

CREATE TABLE public.room_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  interest text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','blocked')),
  expires_at timestamptz NOT NULL,
  decided_by uuid, decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_requests_trip_idx ON public.room_requests(trip_id, status);
CREATE INDEX room_requests_user_idx ON public.room_requests(user_id, created_at);
GRANT SELECT ON public.room_requests TO authenticated;
GRANT ALL ON public.room_requests TO service_role;
ALTER TABLE public.room_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Requesters read own requests" ON public.room_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Leaders read their room requests" ON public.room_requests FOR SELECT TO authenticated USING (trip_private.is_leader(trip_id));
CREATE TRIGGER room_requests_updated BEFORE UPDATE ON public.room_requests FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();

CREATE TABLE public.room_blocks (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, blocked_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
GRANT SELECT ON public.room_blocks TO authenticated;
GRANT ALL ON public.room_blocks TO service_role;
ALTER TABLE public.room_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leaders read room blocks" ON public.room_blocks FOR SELECT TO authenticated USING (trip_private.is_leader(trip_id));

CREATE OR REPLACE FUNCTION trip_private.set_room_listing(p_trip uuid, p_listed boolean, p_nickname text, p_country text, p_region text, p_city text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can list this squad'; END IF;
  IF EXISTS (SELECT 1 FROM trips WHERE id=p_trip AND is_sandbox) AND p_listed THEN RAISE EXCEPTION 'Test Lab trips can''t be listed'; END IF;
  IF p_listed AND (length(trim(coalesce(p_nickname,''))) < 2 OR p_country IS NULL) THEN RAISE EXCEPTION 'Add a room nickname and country first'; END IF;
  IF length(coalesce(p_nickname,'')) > 40 OR (p_country IS NOT NULL AND p_country !~ '^[A-Z]{2}$') THEN RAISE EXCEPTION 'Check the nickname and place'; END IF;
  UPDATE trips SET room_listed=p_listed, room_nickname=nullif(trim(p_nickname),''), room_country=p_country,
    room_region=nullif(trim(coalesce(p_region,'')),''), room_city=nullif(trim(coalesce(p_city,'')),'') WHERE id=p_trip;
END $$;

CREATE OR REPLACE FUNCTION trip_private.game_rooms()
RETURNS TABLE(trip_id uuid, nickname text, country text, region text, city text, nights_played integer, ended boolean, crowns jsonb, leaders jsonb, is_member boolean, requested boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id, t.room_nickname, t.room_country, t.room_region, t.room_city,
    (SELECT count(*)::int FROM game_nights gn WHERE gn.trip_id=t.id AND NOT gn.skipped AND gn.starts_at <= now()),
    (t.ended_at IS NOT NULL OR t.end_date < current_date),
    coalesce((SELECT jsonb_agg(sc.season) FROM season_champions sc WHERE sc.trip_id=t.id), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score) ORDER BY x.score DESC) FROM (
       SELECT coalesce(nullif(pc.game_name,''),'Player') AS name, b.score FROM trip_private.game_board(t.id) b
       JOIN trip_members m ON m.trip_id=t.id AND m.user_id=b.user_id AND m.status='approved'
       LEFT JOIN trip_player_cards pc ON pc.trip_id=t.id AND pc.user_id=b.user_id
       ORDER BY b.score DESC LIMIT CASE WHEN (t.ended_at IS NOT NULL OR t.end_date < current_date) THEN 3 ELSE 5 END) x), '[]'::jsonb),
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id=t.id AND m.user_id=auth.uid() AND m.status='approved'),
    EXISTS (SELECT 1 FROM room_requests r WHERE r.trip_id=t.id AND r.user_id=auth.uid() AND r.status='pending' AND r.expires_at > now())
  FROM trips t WHERE t.room_listed AND NOT t.is_sandbox AND t.room_nickname IS NOT NULL AND t.room_country IS NOT NULL
  ORDER BY t.created_at;
END $$;

CREATE OR REPLACE FUNCTION trip_private.request_room(p_trip uuid, p_interest text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t trips%ROWTYPE; v_age int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  v_age := trip_private.age_of(auth.uid());
  IF v_age IS NULL THEN RAISE EXCEPTION 'Add your date of birth first'; END IF;
  IF v_age < 18 THEN RAISE EXCEPTION 'Requests to join are for players 18 and older'; END IF;
  SELECT * INTO t FROM trips WHERE id=p_trip AND room_listed AND NOT is_sandbox;
  IF NOT FOUND THEN RAISE EXCEPTION 'This room isn''t taking requests'; END IF;
  IF t.ended_at IS NOT NULL OR t.end_date < current_date THEN RAISE EXCEPTION 'This trip has ended'; END IF;
  IF EXISTS (SELECT 1 FROM trip_members WHERE trip_id=p_trip AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You''re already in this room'; END IF;
  IF EXISTS (SELECT 1 FROM room_blocks WHERE trip_id=p_trip AND user_id=auth.uid()) THEN RAISE EXCEPTION 'This room isn''t taking requests'; END IF;
  IF EXISTS (SELECT 1 FROM room_requests WHERE trip_id=p_trip AND user_id=auth.uid() AND created_at > now() - interval '7 days') THEN RAISE EXCEPTION 'You can ask this room once every 7 days'; END IF;
  IF (SELECT count(*) FROM room_requests WHERE user_id=auth.uid() AND status='pending' AND expires_at > now()) >= 3 THEN RAISE EXCEPTION 'You have 3 open requests. Wait for an answer first.'; END IF;
  INSERT INTO room_requests(trip_id, user_id, interest, expires_at)
  VALUES (p_trip, auth.uid(), left(nullif(trim(coalesce(p_interest,'')),''), 80), least(now() + interval '3 days', (t.end_date + 1)::timestamptz));
END $$;

CREATE OR REPLACE FUNCTION trip_private.room_requests_for(p_trip uuid)
RETURNS TABLE(id uuid, name text, home_city text, interest text, level integer, stamps integer, founding boolean, created_at timestamptz, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RETURN; END IF;
  RETURN QUERY SELECT r.id, coalesce(nullif(pp.game_name,''), nullif(pr.display_name,''), 'Traveler'), pp.hometown, r.interest,
    (SELECT count(DISTINCT m.trip_id)::int FROM trip_members m JOIN trips tt ON tt.id=m.trip_id AND NOT tt.is_sandbox AND tt.kind <> 'at_home' WHERE m.user_id=r.user_id AND m.status='approved'),
    (SELECT count(*)::int FROM passport_stamps ps WHERE ps.user_id=r.user_id),
    coalesce(trip_private.founding_member(r.user_id), false), r.created_at, r.expires_at
  FROM room_requests r LEFT JOIN player_profiles pp ON pp.user_id=r.user_id LEFT JOIN profiles pr ON pr.id=r.user_id
  WHERE r.trip_id=p_trip AND r.status='pending' AND r.expires_at > now() ORDER BY r.created_at;
END $$;

CREATE OR REPLACE FUNCTION trip_private.decide_room_request(p_request uuid, p_action text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r room_requests%ROWTYPE; t trips%ROWTYPE; v_count int;
BEGIN
  SELECT * INTO r FROM room_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR NOT trip_private.is_leader(r.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can answer requests'; END IF;
  IF p_action NOT IN ('approve','decline','block','report') THEN RAISE EXCEPTION 'Unknown action'; END IF;
  IF p_action = 'report' THEN
    INSERT INTO bug_reports(user_id, trip_id, page, description, app_version)
    VALUES (auth.uid(), r.trip_id, 'Game Rooms · join request', 'Safety report about a join request ' || r.id || coalesce(': ' || left(p_note, 500), ''), 'rooms');
    RETURN;
  END IF;
  IF r.status <> 'pending' OR r.expires_at <= now() THEN RAISE EXCEPTION 'This request is no longer waiting'; END IF;
  IF p_action = 'approve' THEN
    SELECT * INTO t FROM trips WHERE id=r.trip_id FOR UPDATE;
    IF coalesce(trip_private.age_of(r.user_id),0) < 18 THEN RAISE EXCEPTION 'This request can''t be approved'; END IF;
    SELECT count(*) INTO v_count FROM trip_members WHERE trip_id=t.id;
    IF v_count >= 30 OR (v_count >= 20 AND NOT t.big_group) THEN RAISE EXCEPTION 'This trip is full'; END IF;
    INSERT INTO trip_members(trip_id,user_id,status,approved_at) VALUES (t.id, r.user_id, 'approved', now()) ON CONFLICT DO NOTHING;
    PERFORM trip_private.apply_join_baseline(t.id, r.user_id);
    INSERT INTO beta_access(user_id, source) VALUES (r.user_id, 'invite') ON CONFLICT DO NOTHING;
    UPDATE room_requests SET status='approved', decided_by=auth.uid(), decided_at=now() WHERE id=r.id;
  ELSIF p_action = 'block' THEN
    INSERT INTO room_blocks(trip_id,user_id,blocked_by) VALUES (r.trip_id, r.user_id, auth.uid()) ON CONFLICT DO NOTHING;
    UPDATE room_requests SET status='blocked', decided_by=auth.uid(), decided_at=now() WHERE id=r.id;
  ELSE
    UPDATE room_requests SET status='declined', decided_by=auth.uid(), decided_at=now() WHERE id=r.id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION trip_private.set_room_listing(uuid,boolean,text,text,text,text), trip_private.game_rooms(), trip_private.request_room(uuid,text), trip_private.room_requests_for(uuid), trip_private.decide_room_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_room_listing(uuid,boolean,text,text,text,text), trip_private.game_rooms(), trip_private.request_room(uuid,text), trip_private.room_requests_for(uuid), trip_private.decide_room_request(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_room_listing(p_trip uuid, p_listed boolean, p_nickname text, p_country text, p_region text, p_city text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.set_room_listing(p_trip,p_listed,p_nickname,p_country,p_region,p_city) $$;
CREATE OR REPLACE FUNCTION public.game_rooms() RETURNS TABLE(trip_id uuid, nickname text, country text, region text, city text, nights_played integer, ended boolean, crowns jsonb, leaders jsonb, is_member boolean, requested boolean) LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT * FROM trip_private.game_rooms() $$;
CREATE OR REPLACE FUNCTION public.request_room(p_trip uuid, p_interest text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.request_room(p_trip,p_interest) $$;
CREATE OR REPLACE FUNCTION public.room_requests_for(p_trip uuid) RETURNS TABLE(id uuid, name text, home_city text, interest text, level integer, stamps integer, founding boolean, created_at timestamptz, expires_at timestamptz) LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT * FROM trip_private.room_requests_for(p_trip) $$;
CREATE OR REPLACE FUNCTION public.decide_room_request(p_request uuid, p_action text, p_note text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.decide_room_request(p_request,p_action,p_note) $$;
REVOKE ALL ON FUNCTION public.set_room_listing(uuid,boolean,text,text,text,text), public.game_rooms(), public.request_room(uuid,text), public.room_requests_for(uuid), public.decide_room_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_room_listing(uuid,boolean,text,text,text,text), public.game_rooms(), public.request_room(uuid,text), public.room_requests_for(uuid), public.decide_room_request(uuid,text,text) TO authenticated;