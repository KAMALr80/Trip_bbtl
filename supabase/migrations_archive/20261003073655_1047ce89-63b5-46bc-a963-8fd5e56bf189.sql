
-- 1. Leaderboard privacy is per person only
DROP FUNCTION IF EXISTS public.set_leaderboard_public(uuid, boolean);
DROP FUNCTION IF EXISTS trip_private.set_leaderboard_public(uuid, boolean);

CREATE OR REPLACE FUNCTION trip_private.game_rooms()
 RETURNS TABLE(trip_id uuid, nickname text, country text, region text, city text, nights_played integer, ended boolean, crowns jsonb, leaders jsonb, is_member boolean, requested boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RETURN; END IF;
  RETURN QUERY
  SELECT t.id, t.room_nickname, t.room_country, t.room_region, t.room_city,
    (SELECT count(*)::int FROM game_nights gn WHERE gn.trip_id=t.id AND NOT gn.skipped AND gn.starts_at <= now()),
    (t.ended_at IS NOT NULL OR t.end_date < current_date),
    coalesce((SELECT jsonb_agg(sc.season) FROM season_champions sc WHERE sc.trip_id=t.id), '[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score, 'stamp', x.stamp) ORDER BY x.score DESC) FROM (
       SELECT CASE WHEN coalesce(pp.public_leaderboard,true) THEN coalesce(nullif(pc.game_name,''),'Player') ELSE 'Traveler' END AS name, b.score,
       CASE WHEN coalesce(pp.public_leaderboard,true) THEN
         (SELECT jsonb_build_object('country',s.country,'state',s.state,'city',s.city,'date',s.stamped_on,'trip',s.trip_name,'squad',s.squad_count,'count',(SELECT count(*) FROM passport_stamps sx WHERE sx.user_id=s.user_id AND sx.trip_id=t.id)) FROM passport_stamps s WHERE s.user_id=b.user_id AND s.trip_id=t.id ORDER BY s.stamped_on DESC LIMIT 1)
       ELSE NULL END AS stamp
       FROM trip_private.game_board(t.id) b
       JOIN trip_members m ON m.trip_id=t.id AND m.user_id=b.user_id AND m.status='approved'
       LEFT JOIN trip_player_cards pc ON pc.trip_id=t.id AND pc.user_id=b.user_id
       LEFT JOIN player_profiles pp ON pp.user_id=b.user_id
       WHERE coalesce(trip_private.age_of(b.user_id),0) >= 18
       ORDER BY b.score DESC LIMIT CASE WHEN (t.ended_at IS NOT NULL OR t.end_date < current_date) THEN 3 ELSE 5 END) x), '[]'::jsonb),
    EXISTS (SELECT 1 FROM trip_members m WHERE m.trip_id=t.id AND m.user_id=auth.uid() AND m.status='approved'),
    EXISTS (SELECT 1 FROM room_requests r WHERE r.trip_id=t.id AND r.user_id=auth.uid() AND r.status='pending' AND r.expires_at > now())
  FROM trips t WHERE t.room_listed AND NOT t.is_sandbox AND t.room_nickname IS NOT NULL AND t.room_country IS NOT NULL
  ORDER BY t.created_at;
END $function$;

-- 2 + 4. Scores: approved members only; host can't mark own win
CREATE OR REPLACE FUNCTION trip_private.save_game_scores(p_trip uuid, p_week integer, p_rows jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_host uuid; BEGIN
IF NOT trip_private.can_run_night(p_trip, p_week) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can score'; END IF;
SELECT host_id INTO v_host FROM public.game_nights WHERE trip_id=p_trip AND week_number=p_week;
IF NOT FOUND THEN RAISE EXCEPTION 'No game night that week'; END IF;
IF NOT trip_private.night_open(p_trip, p_week) THEN RAISE EXCEPTION 'Scores only count while the game night is live'; END IF;
IF jsonb_typeof(p_rows)<>'array' THEN RAISE EXCEPTION 'Bad scores'; END IF;
IF v_host = auth.uid() AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE (r->>'user_id')::uuid=auth.uid() AND coalesce((r->>'won')::boolean,false))
   AND NOT EXISTS (SELECT 1 FROM public.game_scores s WHERE s.trip_id=p_trip AND s.week_number=p_week AND s.user_id=auth.uid() AND s.won) THEN
  RAISE EXCEPTION 'Hosts can''t mark their own win — ask another leader to do it';
END IF;
INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won,correct_guesses)
SELECT p_trip, p_week, (r->>'user_id')::uuid, coalesce((r->>'here')::boolean,false), coalesce((r->>'won')::boolean,false), nullif(r->>'correct_guesses','')::int
FROM jsonb_array_elements(p_rows) r WHERE EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=(r->>'user_id')::uuid AND m.status='approved')
ON CONFLICT (trip_id,week_number,user_id) DO UPDATE SET here=EXCLUDED.here,
  won=CASE WHEN v_host=auth.uid() AND EXCLUDED.user_id=auth.uid() THEN public.game_scores.won ELSE EXCLUDED.won END,
  correct_guesses=EXCLUDED.correct_guesses; END $function$;

-- 3. Costs + time zone: Captain only (a Co-Captain who took over is the Captain)
CREATE OR REPLACE FUNCTION trip_private.set_trip_timezone(p_trip uuid, p_tz text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN
 IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can change the trip time zone'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN RAISE EXCEPTION 'Pick a valid time zone'; END IF;
 UPDATE public.trips SET trip_timezone = p_tz WHERE id = p_trip; END $function$;

CREATE OR REPLACE FUNCTION trip_private.save_cost_item(p_trip uuid, p_item uuid, p_title text, p_category text, p_total_cents bigint, p_split text, p_shares jsonb, p_due date)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_n int; v_base bigint; v_rem bigint; v_sum bigint; r record; i int := 0;
BEGIN PERFORM trip_private.require_feature(p_trip, 'trip_pot');
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can edit trip costs'; END IF;
  IF EXISTS (SELECT 1 FROM public.trips WHERE id=p_trip AND ended_at IS NOT NULL) THEN RAISE EXCEPTION 'This trip has ended'; END IF;
  IF p_total_cents IS NULL OR p_total_cents <= 0 THEN RAISE EXCEPTION 'Enter a total above zero'; END IF;
  IF p_item IS NULL THEN
    INSERT INTO public.cost_items(trip_id,title,category,total_cents,split,due_date) VALUES (p_trip,trim(p_title),p_category,p_total_cents,p_split,p_due) RETURNING id INTO v_id;
  ELSE
    UPDATE public.cost_items SET title=trim(p_title),category=p_category,total_cents=p_total_cents,split=p_split,due_date=p_due WHERE id=p_item AND trip_id=p_trip RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Cost item not found'; END IF;
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS _shares(user_id uuid PRIMARY KEY, share_cents bigint) ON COMMIT DROP;
  DELETE FROM _shares;
  IF p_split = 'even' THEN
    SELECT count(*) INTO v_n FROM public.trip_members WHERE status='approved' AND trip_id=p_trip;
    v_base := p_total_cents / v_n; v_rem := p_total_cents - v_base * v_n;
    FOR r IN SELECT user_id FROM public.trip_members WHERE status='approved' AND trip_id=p_trip ORDER BY joined_at, user_id LOOP
      INSERT INTO _shares VALUES (r.user_id, v_base + CASE WHEN i < v_rem THEN 1 ELSE 0 END); i := i + 1;
    END LOOP;
  ELSE
    INSERT INTO _shares SELECT (e->>'user_id')::uuid, (e->>'share_cents')::bigint FROM jsonb_array_elements(coalesce(p_shares,'[]'::jsonb)) e WHERE coalesce((e->>'share_cents')::bigint,0) > 0;
    IF EXISTS (SELECT 1 FROM _shares s WHERE NOT trip_private.is_trip_member(p_trip, s.user_id)) THEN RAISE EXCEPTION 'Everyone in a split must be in this trip'; END IF;
    SELECT coalesce(sum(share_cents),0) INTO v_sum FROM _shares;
    IF v_sum <> p_total_cents THEN RAISE EXCEPTION 'Custom shares must add up to the total'; END IF;
  END IF;
  DELETE FROM public.cost_shares c WHERE c.item_id=v_id AND NOT EXISTS (SELECT 1 FROM _shares s WHERE s.user_id=c.user_id);
  INSERT INTO public.cost_shares(item_id,trip_id,user_id,share_cents) SELECT v_id,p_trip,s.user_id,s.share_cents FROM _shares s
    ON CONFLICT (item_id,user_id) DO UPDATE SET share_cents=EXCLUDED.share_cents;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.delete_cost_item(p_item uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip uuid; v_title text; v_total bigint; BEGIN
  SELECT trip_id, title, total_cents INTO v_trip, v_title, v_total FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_captain(v_trip) THEN RAISE EXCEPTION 'Only the Captain can delete trip costs'; END IF;
  DELETE FROM public.cost_items WHERE id=p_item;
  PERFORM trip_private.log_cost(v_trip, p_item, NULL, 'deleted cost', v_total, v_title);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.confirm_cost_payment(p_item uuid, p_user uuid, p_paid_cents bigint)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip uuid; v_old bigint; BEGIN
  SELECT trip_id INTO v_trip FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_captain(v_trip) THEN RAISE EXCEPTION 'Only the Captain can confirm payments'; END IF;
  IF p_paid_cents IS NULL OR p_paid_cents < 0 THEN RAISE EXCEPTION 'Enter a paid amount'; END IF;
  SELECT paid_cents INTO v_old FROM public.cost_shares WHERE item_id=p_item AND user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'That player isn''t in this cost'; END IF;
  UPDATE public.cost_shares SET paid_cents=p_paid_cents, reported_cents=NULL, report_note=NULL, reported_at=NULL WHERE item_id=p_item AND user_id=p_user;
  PERFORM trip_private.log_cost(v_trip, p_item, p_user, 'set paid', p_paid_cents, 'was '||v_old);
END $function$;

CREATE OR REPLACE FUNCTION trip_private.undo_cost_payment(p_item uuid, p_user uuid, p_amount_cents bigint, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_trip uuid; s public.cost_shares; v bigint; BEGIN
  SELECT trip_id INTO v_trip FROM public.cost_items WHERE id=p_item;
  IF v_trip IS NULL OR NOT trip_private.is_captain(v_trip) THEN RAISE EXCEPTION 'Only the Captain can undo payments'; END IF;
  IF nullif(trim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Add a short reason'; END IF;
  SELECT * INTO s FROM public.cost_shares WHERE item_id=p_item AND user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'That player isn''t in this cost'; END IF;
  v := least(coalesce(p_amount_cents, s.paid_cents), s.paid_cents);
  IF v <= 0 THEN RAISE EXCEPTION 'There is no confirmed payment to undo'; END IF;
  UPDATE public.cost_shares SET paid_cents=paid_cents - v WHERE item_id=p_item AND user_id=p_user;
  INSERT INTO public.cost_notes(trip_id,user_id,message) VALUES (v_trip, p_user,
    'Your '||to_char(v/100.0,'FM$999,999,990.00')||' payment couldn''t be confirmed — check with your Captain.');
  PERFORM trip_private.log_cost(v_trip, p_item, p_user, 'undid payment', v, left(trim(p_reason),200));
END $function$;

-- 4. Vote options: approved members only
CREATE OR REPLACE FUNCTION trip_private.post_live_vote(p_trip uuid, p_kind text, p_prompt text, p_options jsonb, p_week integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_week integer := coalesce(p_week, trip_private.current_week(p_trip)); v_opts jsonb; v_id uuid; BEGIN
IF NOT trip_private.can_run_night(p_trip, v_week) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can post a vote'; END IF;
IF v_week IS NOT NULL AND EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=p_trip AND week_number=v_week) AND NOT trip_private.night_open(p_trip, v_week) THEN RAISE EXCEPTION 'Votes open only while the game night is live'; END IF;
IF length(trim(coalesce(p_prompt,''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Add a prompt'; END IF;
IF p_kind IN ('most_likely','best_answer') THEN
  SELECT jsonb_agg(jsonb_build_object('label', coalesce(c.game_name, nullif(p.display_name,''), 'Player'), 'user_id', m.user_id) ORDER BY m.joined_at) INTO v_opts FROM public.trip_members m LEFT JOIN public.trip_player_cards c ON c.trip_id=m.trip_id AND c.user_id=m.user_id LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=p_trip AND m.status='approved';
  IF coalesce(jsonb_array_length(v_opts),0) < 2 THEN RAISE EXCEPTION 'You need at least 2 members to vote'; END IF;
ELSIF p_kind IN ('would_you_rather','custom') THEN
  IF jsonb_typeof(p_options)<>'array' OR (p_kind='would_you_rather' AND jsonb_array_length(p_options)<>2) OR jsonb_array_length(p_options) NOT BETWEEN 2 AND 4 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_options) o(v) WHERE length(trim(v)) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Add 2 to 4 short options'; END IF;
  SELECT jsonb_agg(jsonb_build_object('label', trim(v))) INTO v_opts FROM jsonb_array_elements_text(p_options) o(v);
ELSE RAISE EXCEPTION 'Unknown vote type'; END IF;
INSERT INTO public.live_votes(trip_id,kind,prompt,options,week_number,created_by) VALUES (p_trip,p_kind,trim(p_prompt),v_opts,v_week,auth.uid()) RETURNING id INTO v_id; RETURN v_id; END $function$;

CREATE OR REPLACE FUNCTION trip_private.cast_day_vote(p_trip uuid, p_date date, p_kind text, p_choice uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN PERFORM trip_private.play_day(p_trip,p_date);
IF p_kind NOT IN ('photo','mvp') THEN RAISE EXCEPTION 'Unknown vote'; END IF;
IF p_choice=auth.uid() THEN RAISE EXCEPTION 'No voting for yourself'; END IF;
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_choice AND status='approved') THEN RAISE EXCEPTION 'Pick someone in this trip'; END IF;
IF p_kind='photo' AND NOT EXISTS (SELECT 1 FROM public.photo_posts WHERE trip_id=p_trip AND day_date=p_date AND user_id=p_choice) THEN RAISE EXCEPTION 'They haven''t posted a photo'; END IF;
INSERT INTO public.day_votes(trip_id,day_date,kind,voter_id,choice_id) VALUES (p_trip,p_date,p_kind,auth.uid(),p_choice) ON CONFLICT (trip_id,day_date,kind,voter_id) DO UPDATE SET choice_id=excluded.choice_id; END $function$;

-- 5. No reveal with zero ballots; leaders can close as "No votes"
CREATE OR REPLACE FUNCTION trip_private.reveal_live_vote(p_vote uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v public.live_votes; v_counts jsonb; v_max integer; v_finale boolean; BEGIN
SELECT * INTO v FROM public.live_votes WHERE id=p_vote FOR UPDATE;
IF v.id IS NULL OR NOT trip_private.can_run_night(v.trip_id,v.week_number) THEN RAISE EXCEPTION 'Only the host, Captain or Co-Captain can reveal'; END IF;
IF v.status='revealed' THEN RETURN; END IF;
IF NOT EXISTS (SELECT 1 FROM public.live_vote_ballots b WHERE b.vote_id=p_vote) THEN RAISE EXCEPTION 'Waiting for votes — at least one vote is needed before the reveal'; END IF;
SELECT jsonb_agg((SELECT count(*) FROM public.live_vote_ballots b WHERE b.vote_id=p_vote AND b.option_index=i) ORDER BY i) INTO v_counts FROM generate_series(0,jsonb_array_length(v.options)-1) i;
UPDATE public.live_votes SET status='revealed',results=v_counts,revealed_at=now() WHERE id=p_vote;
SELECT EXISTS(SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=v.trip_id AND f.week_number=v.week_number AND f.phase='finale') INTO v_finale;
IF (v.kind='best_answer' OR (v.kind='most_likely' AND v_finale)) AND v.week_number IS NOT NULL AND trip_private.night_open(v.trip_id, v.week_number) THEN
 SELECT max(x::int) INTO v_max FROM jsonb_array_elements_text(v_counts) x;
 IF v_max>0 THEN
 INSERT INTO public.game_scores(trip_id,week_number,user_id,here,won) SELECT v.trip_id,v.week_number,(v.options->(i::int-1)->>'user_id')::uuid,true,true FROM jsonb_array_elements_text(v_counts) WITH ORDINALITY t(c,i) WHERE c::int=v_max ON CONFLICT(trip_id,week_number,user_id) DO UPDATE SET won=true,here=true;
 END IF;
END IF; END $function$;

CREATE OR REPLACE FUNCTION trip_private.close_live_vote(p_vote uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v public.live_votes; BEGIN
SELECT * INTO v FROM public.live_votes WHERE id=p_vote FOR UPDATE;
IF v.id IS NULL OR NOT trip_private.is_leader(v.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can close a vote'; END IF;
IF v.status='revealed' THEN RETURN; END IF;
IF EXISTS (SELECT 1 FROM public.live_vote_ballots b WHERE b.vote_id=p_vote) THEN RAISE EXCEPTION 'Votes are in — reveal it instead'; END IF;
UPDATE public.live_votes SET status='revealed', results=(SELECT jsonb_agg(0) FROM generate_series(1,jsonb_array_length(v.options))), revealed_at=now() WHERE id=p_vote;
END $function$;
CREATE OR REPLACE FUNCTION public.close_live_vote(p_vote uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.close_live_vote(p_vote) $$;
REVOKE ALL ON FUNCTION trip_private.close_live_vote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.close_live_vote(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_live_vote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_live_vote(uuid) TO authenticated, service_role;

-- 8. Leaving records a removal; the code then only gets you back as a waiting member
CREATE OR REPLACE FUNCTION trip_private.leave_trip(p_trip uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE member_role text; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT role INTO member_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid();
 IF member_role IS NULL THEN RAISE EXCEPTION 'Not a member'; END IF;
 IF member_role='captain' AND (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip AND status='approved')>1 THEN RAISE EXCEPTION 'Pass the crown before leaving'; END IF;
 IF member_role='captain' THEN DELETE FROM public.trips WHERE id=p_trip;
 ELSE
  DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid();
  INSERT INTO trip_private.trip_removals(trip_id,user_id) VALUES (p_trip,auth.uid()) ON CONFLICT DO NOTHING;
  PERFORM trip_private.log_role(p_trip, auth.uid(), NULL, member_role, 'left trip');
 END IF;
END $function$;

CREATE OR REPLACE FUNCTION trip_private.join_trip(p_code text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.trips%ROWTYPE; inv public.trip_invites%ROWTYPE; v_count integer; v_code text := upper(trim(coalesce(p_code,''))); v_age int; v_status text; via_invite boolean := false; was_removed boolean := false; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  PERFORM trip_private.code_rate_check();
  v_age := trip_private.age_of(auth.uid());
  IF v_age IS NULL THEN RAISE EXCEPTION 'Add your date of birth first'; END IF;
  IF length(v_code) = 10 THEN
    SELECT * INTO inv FROM public.trip_invites WHERE token=v_code FOR UPDATE;
    IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
    SELECT * INTO t FROM public.trips WHERE id=inv.trip_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
    IF inv.used_at IS NOT NULL OR inv.cancelled_at IS NOT NULL OR inv.expires_at <= now() THEN RAISE EXCEPTION 'This invite link has expired or was already used. Ask your Captain for a new one.'; END IF;
    via_invite := true;
  ELSE
    SELECT * INTO t FROM public.trips WHERE join_code = v_code FOR UPDATE;
    IF NOT FOUND THEN INSERT INTO trip_private.code_attempts(user_id) VALUES (auth.uid()); RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
    IF NOT t.join_code_enabled THEN RAISE EXCEPTION 'This trip''s join code is turned off. Ask your Captain for a personal invite link.'; END IF;
    was_removed := EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid());
  END IF;
  IF v_age < 18 AND NOT (via_invite AND inv.teen AND inv.guardian_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'Under 18? Ask your trip''s Captain for a teen invite link.'; END IF;
  IF v_age < 18 AND (t.vibe='party') THEN RAISE EXCEPTION 'This trip isn''t open to players under 18'; END IF;
  IF t.level='preview' AND NOT trip_private.preview_room_ok() THEN RAISE EXCEPTION 'PREVIEW_LIMIT: Preview testers can be in one trip at a time for now.'; END IF;
  SELECT count(*) INTO v_count FROM public.trip_members WHERE trip_id = t.id;
  IF v_count >= 30 THEN RAISE EXCEPTION 'This trip is full (30 players max)'; END IF;
  IF v_count >= 20 AND NOT t.big_group THEN RAISE EXCEPTION 'This trip is at 20 players. The Captain can unlock the Big Group add-on for up to 30.'; END IF;
  v_status := CASE WHEN t.require_approval OR v_age < 21 OR was_removed THEN 'pending' ELSE 'approved' END;
  IF via_invite THEN
    UPDATE public.trip_invites SET used_by=auth.uid(), used_at=now() WHERE id=inv.id;
    DELETE FROM trip_private.trip_removals WHERE trip_id=t.id AND user_id=auth.uid();
  END IF;
  INSERT INTO public.trip_members(trip_id,user_id,status,approved_at) VALUES(t.id,auth.uid(),v_status,CASE WHEN v_status='approved' THEN now() END);
  IF v_status = 'approved' THEN
    PERFORM trip_private.apply_join_baseline(t.id, auth.uid());
    INSERT INTO public.beta_access(user_id, source) VALUES (auth.uid(), 'invite') ON CONFLICT DO NOTHING;
  END IF;
  RETURN t.id;
END $function$;

-- Approval by the Captain clears a past removal
CREATE OR REPLACE FUNCTION trip_private.approve_member(p_trip uuid, p_user uuid, p_approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can approve members'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user AND status='pending') THEN RAISE EXCEPTION 'That request is no longer waiting'; END IF;
 IF p_approve THEN
  UPDATE public.trip_members SET status='approved', approved_at=now() WHERE trip_id=p_trip AND user_id=p_user;
  DELETE FROM trip_private.trip_removals WHERE trip_id=p_trip AND user_id=p_user;
  PERFORM trip_private.apply_join_baseline(p_trip, p_user);
  INSERT INTO public.beta_access(user_id, source) VALUES (p_user, 'invite') ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user; END IF; END $function$;

-- 8 + 9. Read-only peeks: waiting members (teaser) and former members (final preview)
CREATE OR REPLACE FUNCTION trip_private.trip_peek(p_trip uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE t public.trips; v_kind text; BEGIN
 IF auth.uid() IS NULL THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND status='pending') THEN v_kind := 'waiting';
 ELSIF EXISTS (SELECT 1 FROM trip_private.trip_removals WHERE trip_id=p_trip AND user_id=auth.uid()) AND NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid()) THEN v_kind := 'former';
 ELSE RETURN NULL; END IF;
 SELECT * INTO t FROM public.trips WHERE id=p_trip;
 IF t.id IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('kind', v_kind, 'trip_id', t.id, 'name', t.name, 'destination', t.destination, 'start_date', t.start_date, 'end_date', t.end_date,
  'ended', (t.ended_at IS NOT NULL OR t.end_date < current_date),
  'squad', (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip AND status='approved'),
  'nights_played', (SELECT count(*) FROM public.game_nights gn WHERE gn.trip_id=p_trip AND NOT gn.skipped AND gn.starts_at <= now()),
  'top', coalesce((SELECT jsonb_agg(jsonb_build_object('name', x.name, 'score', x.score) ORDER BY x.score DESC) FROM (
     SELECT CASE WHEN coalesce(trip_private.age_of(b.user_id),0) >= 18 THEN coalesce(nullif(pc.game_name,''),'Player') ELSE 'Traveler' END name, b.score
     FROM trip_private.game_board(p_trip) b JOIN public.trip_members m ON m.trip_id=p_trip AND m.user_id=b.user_id AND m.status='approved'
     LEFT JOIN public.trip_player_cards pc ON pc.trip_id=p_trip AND pc.user_id=b.user_id
     WHERE t.season_scoring ORDER BY b.score DESC LIMIT 3) x), '[]'::jsonb));
END $function$;
CREATE OR REPLACE FUNCTION public.trip_peek(p_trip uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT trip_private.trip_peek(p_trip) $$;

CREATE OR REPLACE FUNCTION trip_private.my_past_trips()
 RETURNS TABLE(trip_id uuid, name text, start_date date, end_date date)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT t.id, t.name, t.start_date, t.end_date FROM trip_private.trip_removals r JOIN public.trips t ON t.id=r.trip_id
  WHERE r.user_id=auth.uid() AND NOT t.is_sandbox AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=r.trip_id AND m.user_id=auth.uid()) ORDER BY t.start_date DESC $function$;
CREATE OR REPLACE FUNCTION public.my_past_trips() RETURNS TABLE(trip_id uuid, name text, start_date date, end_date date) LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.my_past_trips() $$;

REVOKE ALL ON FUNCTION trip_private.trip_peek(uuid), trip_private.my_past_trips(), public.trip_peek(uuid), public.my_past_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.trip_peek(uuid), trip_private.my_past_trips(), public.trip_peek(uuid), public.my_past_trips() TO authenticated, service_role;
