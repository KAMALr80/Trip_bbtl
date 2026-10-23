REVOKE INSERT, UPDATE, DELETE ON public.player_birthdays FROM authenticated;
DROP POLICY IF EXISTS "Owner creates birthday" ON public.player_birthdays;
DROP POLICY IF EXISTS "Owner edits birthday" ON public.player_birthdays;
DROP POLICY IF EXISTS "Owner removes birthday" ON public.player_birthdays;

CREATE OR REPLACE FUNCTION trip_private.request_room(p_trip uuid, p_interest text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t trips%ROWTYPE; v_age int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  v_age := trip_private.age_of(auth.uid());
  IF v_age IS NULL THEN RAISE EXCEPTION 'Add your date of birth first'; END IF;
  IF v_age < 21 THEN RAISE EXCEPTION 'Game Room requests are for players 21 and older'; END IF;
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
    IF coalesce(trip_private.age_of(r.user_id),0) < 21 THEN RAISE EXCEPTION 'This request can''t be approved'; END IF;
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

CREATE OR REPLACE FUNCTION trip_private.mix_ai_quota(p_trip uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_used int; v_remaining int; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT trip_private.has_beta_access() OR trip_private.age_of(auth.uid()) < 18 THEN RAISE EXCEPTION 'Sign in with an eligible account first'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=auth.uid() FOR UPDATE;
  SELECT count(*)::int INTO v_used FROM public.ai_usage WHERE user_id=auth.uid() AND kind='arcade_mix' AND created_at >= date_trunc('day', now());
  IF v_used >= 10 THEN RAISE EXCEPTION 'That is today''s AI limit. Come back tomorrow.'; END IF;
  IF v_used >= 3 THEN
    IF p_trip IS NULL OR NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'After three free mixes, choose a trip with AI credits.'; END IF;
    PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
    SELECT remaining INTO v_remaining FROM trip_private.credit_status(p_trip);
    IF coalesce(v_remaining,0) < 1 THEN RAISE EXCEPTION 'OUT_OF_CREDITS: This trip has no AI credits left.'; END IF;
  END IF;
  INSERT INTO public.ai_usage(user_id,trip_id,kind,credits) VALUES(auth.uid(),CASE WHEN v_used >= 3 THEN p_trip ELSE NULL END,'arcade_mix',CASE WHEN v_used >= 3 THEN 1 ELSE 0 END) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION trip_private.mix_ai_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.mix_ai_quota(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.mix_ai_quota(p_trip uuid) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT trip_private.mix_ai_quota(p_trip) $$;
REVOKE ALL ON FUNCTION public.mix_ai_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mix_ai_quota(uuid) TO authenticated;