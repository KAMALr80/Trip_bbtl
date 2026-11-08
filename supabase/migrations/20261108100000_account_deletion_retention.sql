-- What a deleted account leaves behind (founder decision, 2026-11-08). The personal goes; what the
-- rest of the crew earned or shared stays and shows as "Former player".
--
-- A trigger on auth.users does the work, so it happens in the same transaction as the delete, on
-- every path that removes a user (the app's delete screen, the Test Lab, the dashboard). If any
-- step fails, the account stays and nothing is half gone.
--
-- Removed: player cards, written answers and notes, drafts, bug reports, passport stamps, the
-- waitlist email, this player's own schedule rows where nothing shared hangs off them.
-- Blanked, row kept: proof text and feedback text. Proofs stay because crew votes and
-- photo_moderation cascade from them, and deleting one would change a legal-review record.
-- Kept as is: points_ledger, trip_crowns, season_champions.
-- Never touched here (legal review): account_consents, moderation_log, admin_actions,
-- photo_moderation, teen_accounts.
--
-- Photo files are removed by deleteMyAccount (src/lib/account.functions.ts), because storage can't
-- join a database transaction. So this also takes the photos out of the postcards and the photo
-- wall, where they would show as broken images.
CREATE FUNCTION trip_private.scrub_deleted_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := OLD.id;
  v_proof record;
BEGIN
  -- The delete screen has already left each trip. Other paths may not have. A Captain's row stays,
  -- because removing it would leave the trip with no leader.
  DELETE FROM public.trip_members WHERE user_id = v_user AND role <> 'captain';
  DELETE FROM public.trip_player_cards WHERE user_id = v_user;

  -- A proof still waiting for the crew would expire later and notify a user who no longer exists.
  -- That insert fails its foreign key and stops expire_proofs for every trip. Expire it now, with
  -- the same points rule expire_proofs uses. Only pending points change, so nothing here can refuse
  -- the delete.
  FOR v_proof IN
    UPDATE public.proofs SET crew_status = 'expired'
    WHERE user_id = v_user AND crew_status = 'waiting'
    RETURNING trip_id, source, schedule_id
  LOOP
    IF v_proof.source <> 'surprise_drop' THEN
      UPDATE public.points_ledger SET status = 'rejected', updated_at = now()
      WHERE trip_id = v_proof.trip_id AND user_id = v_user AND source = v_proof.source
        AND source_ref IS NOT DISTINCT FROM v_proof.schedule_id AND status = 'pending';
    END IF;
  END LOOP;

  -- Free text. Nothing references these rows, and answers already on a locked postcard carry no name.
  DELETE FROM public.wrapup_answers WHERE user_id = v_user;
  DELETE FROM public.journal_entries WHERE user_id = v_user;
  DELETE FROM public.window_guide_items WHERE author_id = v_user;
  DELETE FROM public.at_home_answers WHERE user_id = v_user;
  DELETE FROM public.weekly_answers WHERE user_id = v_user;
  DELETE FROM public.cost_notes WHERE user_id = v_user;
  DELETE FROM public.checkin_responses WHERE user_id = v_user;
  DELETE FROM public.trip_drafts WHERE user_id = v_user;
  DELETE FROM public.bug_reports WHERE user_id = v_user;
  UPDATE public.cost_shares SET report_note = NULL WHERE user_id = v_user AND report_note IS NOT NULL;
  UPDATE public.solo_quests SET story = NULL, budget_note = NULL
  WHERE user_id = v_user AND (story IS NOT NULL OR budget_note IS NOT NULL);
  UPDATE public.trip_feedback SET change_text = NULL, squad_message = NULL
  WHERE user_id = v_user AND (change_text IS NOT NULL OR squad_message IS NOT NULL);

  -- proofs_check needs a photo path or a body, so a text-only proof keeps an empty body.
  UPDATE public.proofs
  SET body = CASE WHEN photo_path IS NULL THEN '' END,
      ai_reason = NULL,
      photo_removed_at = CASE WHEN photo_path IS NOT NULL THEN coalesce(photo_removed_at, now()) END
  WHERE user_id = v_user;

  -- This player's own schedule rows. A row with a proof stays: deleting it would cascade to the
  -- proof, its crew votes and photo_moderation. Points are unaffected either way, because
  -- points_ledger has no foreign key to the schedule.
  DELETE FROM public.trip_schedule s
  WHERE s.user_id = v_user
    AND NOT EXISTS (SELECT 1 FROM public.proofs p WHERE p.schedule_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM public.daily_answers d WHERE d.schedule_id = s.id AND d.user_id <> v_user)
    AND NOT EXISTS (SELECT 1 FROM public.journal_entries j WHERE j.schedule_id = s.id AND j.user_id <> v_user);
  UPDATE public.trip_schedule SET tailored_text = NULL WHERE user_id = v_user AND tailored_text IS NOT NULL;

  DELETE FROM public.passport_stamps WHERE user_id = v_user;

  -- The postcard stays for the crew: other photos, nameless answers, the crown with no identity.
  -- This player's photos come out because their files are deleted.
  UPDATE public.trip_postcards pc
  SET photos = (SELECT coalesce(jsonb_agg(x.ph ORDER BY x.ord), '[]')
                FROM jsonb_array_elements(pc.photos) WITH ORDINALITY x(ph, ord)
                WHERE x.ph->>'user_id' IS DISTINCT FROM v_user::text),
      crowns = (SELECT coalesce(jsonb_agg(
                         CASE WHEN x.c->>'user_id' = v_user::text
                              THEN x.c || jsonb_build_object('user_id', NULL, 'name', 'Former player')
                              ELSE x.c END ORDER BY x.ord), '[]')
                FROM jsonb_array_elements(pc.crowns) WITH ORDINALITY x(c, ord))
  WHERE pc.photos @> jsonb_build_array(jsonb_build_object('user_id', v_user))
     OR pc.crowns @> jsonb_build_array(jsonb_build_object('user_id', v_user));

  -- The photo wall hides these the way a Captain's removal does; the game rows stay.
  INSERT INTO public.photo_removed (trip_id, photo_path, removed_by)
  SELECT x.trip_id, x.photo_path, v_user FROM (
    SELECT trip_id, photo_path FROM public.bingo_marks WHERE user_id = v_user AND photo_path IS NOT NULL
    UNION SELECT trip_id, photo_path FROM public.quest_posts WHERE user_id = v_user AND photo_path IS NOT NULL
    UNION SELECT trip_id, photo_path FROM public.photo_posts WHERE user_id = v_user
    UNION SELECT trip_id, photo_path FROM public.airport_claims WHERE user_id = v_user AND photo_path IS NOT NULL
  ) x
  ON CONFLICT (trip_id, photo_path) DO NOTHING;

  -- waitlist.user_id is SET NULL on delete, so the row must go before the user does. It can also
  -- predate the account, so match the email, but only one this user proved they own.
  DELETE FROM public.waitlist w
  WHERE w.user_id = v_user
     OR (OLD.email_confirmed_at IS NOT NULL AND lower(w.email) = lower(OLD.email));

  RETURN OLD;
END
$function$;

REVOKE ALL ON FUNCTION trip_private.scrub_deleted_account() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.scrub_deleted_account() TO supabase_auth_admin;

CREATE TRIGGER scrub_deleted_account BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION trip_private.scrub_deleted_account();

-- A trip that locks after a player deleted their account: the postcard's crown has no name to
-- show and shouldn't keep the id. Only the crowns query changes.
CREATE OR REPLACE FUNCTION trip_private.lock_trip(p_trip uuid, p_force boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.trips; v_end timestamptz; v_photos jsonb; v_answers jsonb; v_crowns jsonb; v_excited jsonb; m record;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip FOR UPDATE;
  IF NOT FOUND OR t.locked_at IS NOT NULL OR t.rules_version <> 2 OR t.room = 'game_night'
     OR t.setup_completed_at IS NULL THEN
    RETURN false;
  END IF;
  SELECT w.ends_at INTO v_end FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'baggage_claim';
  IF NOT coalesce(p_force, false) AND (v_end IS NULL OR now() < v_end) THEN RETURN false; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('proof_id', s.proof_id, 'path', s.photo_path, 'user_id', s.user_id,
                                               'hearts', s.hearts) ORDER BY s.ord), '[]')
  INTO v_photos FROM trip_private.postcard_selection(p_trip) s;

  -- Answers grouped by question, in a shuffled order and with no names (R-605).
  SELECT coalesce(jsonb_agg(jsonb_build_object('key', q.key, 'question', q.question, 'answers', q.answers) ORDER BY q.idx), '[]')
  INTO v_answers
  FROM (SELECT w.idx, w.key, w.question,
               coalesce((SELECT jsonb_agg(a.answer ORDER BY trip_private.schedule_hash(a.user_id::text || p_trip::text || w.key))
                         FROM public.wrapup_answers a WHERE a.trip_id = p_trip AND a.question_key = w.key), '[]') AS answers
        FROM trip_private.wrapup_questions(p_trip) w) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('season', c.season,
                                               'user_id', CASE WHEN u.id IS NOT NULL THEN c.user_id END,
                                               'name', CASE WHEN u.id IS NULL THEN 'Former player'
                                                            ELSE coalesce(pc.game_name, pp.game_name, 'Traveler') END,
                                               'points', c.points, 'solo', c.solo_goal IS NOT NULL)
                            ORDER BY c.season, c.user_id), '[]')
  INTO v_crowns
  FROM public.trip_crowns c
  LEFT JOIN auth.users u ON u.id = c.user_id
  LEFT JOIN public.trip_player_cards pc ON pc.trip_id = c.trip_id AND pc.user_id = c.user_id
  LEFT JOIN public.player_profiles pp ON pp.user_id = c.user_id
  WHERE c.trip_id = p_trip;

  SELECT coalesce(jsonb_agg(btrim(pc.most_excited) ORDER BY trip_private.schedule_hash(pc.user_id::text || p_trip::text)), '[]')
  INTO v_excited
  FROM public.trip_player_cards pc
  JOIN public.trip_members tm ON tm.trip_id = pc.trip_id AND tm.user_id = pc.user_id AND tm.status = 'approved'
  WHERE pc.trip_id = p_trip AND nullif(btrim(pc.most_excited), '') IS NOT NULL;

  INSERT INTO public.trip_postcards (trip_id, photos, answers, crowns, excited)
  VALUES (p_trip, v_photos, v_answers, v_crowns, v_excited)
  ON CONFLICT (trip_id) DO NOTHING;

  UPDATE public.trips SET locked_at = now() WHERE id = p_trip;
  PERFORM trip_private.stamp_trip(p_trip);

  FOR m IN SELECT user_id FROM public.trip_members WHERE trip_id = p_trip AND status = 'approved' LOOP
    PERFORM trip_private.enqueue_notification(m.user_id, p_trip, 'wrapup', 'Your Trip Postcard is ready',
      'It''s in your passport now. Open it to download or share.', '/t/' || p_trip || '/trip', now(), NULL,
      'postcard_ready:' || p_trip || ':' || m.user_id);
  END LOOP;
  RETURN true;
END
$function$;
