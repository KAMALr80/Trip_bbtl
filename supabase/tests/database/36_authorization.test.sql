-- The authorization review (docs/audit/AUTHORIZATION_REVIEW.md) as a standing test. Every public
-- function that takes a trip is called, with real IDs, by a signed-out visitor, an outsider, a pending
-- player and a crew member; every trip table is read and written directly. Each call runs in its own
-- subtransaction and is undone. A NEW function that lets one of these actors through fails this test
-- until someone reviews it and adds it to the list here: that's the point.
BEGIN;
\ir ../_helpers.psql
SELECT plan(25);

SELECT tests.create_user(h, 30) FROM unnest(ARRAY['owner', 'cocap', 'crew', 'crew2', 'pending', 'outsider']) h;

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO PUBLIC;
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM ids WHERE k = p $$;

-- Trip B: the victim's, in Pre-Flight with a call night in an hour. Trip C: the attacker's own.
INSERT INTO ids SELECT 'trip', tests.create_trip(tests.user_id('owner'), 3, 6, 'a2c', 'UTC', 'Europe/Lisbon');
UPDATE public.trips SET preflight_days = 5 WHERE id = pg_temp.id('trip');
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('crew'));
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('crew2'));
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('cocap'), 'co_captain');
SELECT tests.add_member(pg_temp.id('trip'), tests.user_id('pending'), 'player', 'pending');
INSERT INTO public.call_nights (trip_id, starts_at) VALUES (pg_temp.id('trip'), now() + interval '1 hour');
INSERT INTO ids SELECT 'night', id FROM public.call_nights WHERE trip_id = pg_temp.id('trip');
INSERT INTO ids SELECT 'own', tests.create_trip(tests.user_id('outsider'), 3, 6, 'a2c', 'UTC', 'Europe/Lisbon');

UPDATE public.trip_schedule SET revealed_at = now() WHERE trip_id = pg_temp.id('trip') AND kind = 'sealed_quest';
INSERT INTO ids SELECT 'item', id FROM public.trip_schedule
WHERE trip_id = pg_temp.id('trip') AND kind = 'sealed_quest' AND user_id = tests.user_id('crew') LIMIT 1;
SELECT tests.authenticate_as(tests.user_id('crew'));
INSERT INTO ids SELECT 'proof', public.submit_proof(pg_temp.id('item'), NULL, 'done');
INSERT INTO ids SELECT 'live', public.open_live(pg_temp.id('trip'), pg_temp.id('night'));
SELECT tests.clear_authentication();
INSERT INTO public.journal_entries (trip_id, user_id, schedule_id, day, prompt, body)
VALUES (pg_temp.id('trip'), tests.user_id('crew'), pg_temp.id('item'), current_date, 'p', 'private journal');
INSERT INTO public.notification_queue (user_id, type, title, body, send_after, dedupe_key)
VALUES (tests.user_id('crew'), 'crew_check', 't', 'private', now(), 'authz-test');
INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
VALUES (tests.user_id('crew'), 'https://fcm.googleapis.com/fcm/send/crew', repeat('k', 88), repeat('a', 22));
INSERT INTO storage.objects (bucket_id, name, owner)
SELECT b.id, pg_temp.id('trip') || '/' || tests.user_id('crew') || '/' || pg_temp.id('item') || '/a.jpg', tests.user_id('crew')
FROM storage.buckets b;
WITH e AS (INSERT INTO public.culture_experiences (creator_id, track, title, country, days, trip_id)
           VALUES (tests.user_id('owner'), 'home', 'Exp', 'Japan', 3, pg_temp.id('trip')) RETURNING id)
INSERT INTO ids SELECT 'exp', id FROM e;

CREATE TEMP TABLE results (kind text, name text, actor text, ok boolean, detail text);

-- An SQL literal for one argument, from its name and type.
CREATE FUNCTION pg_temp.val(p_arg text, p_own boolean) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE n text := split_part(p_arg, ' ', 1); t text := substr(p_arg, length(split_part(p_arg, ' ', 1)) + 2);
BEGIN
  IF t = '' THEN t := n; n := ''; END IF;
  IF t = 'uuid' THEN
    RETURN quote_literal(CASE
      WHEN n = 'p_trip' THEN (CASE WHEN p_own THEN pg_temp.id('own') ELSE pg_temp.id('trip') END)::text
      WHEN n IN ('p_item', 'p_schedule') THEN pg_temp.id('item')::text
      WHEN n IN ('p_user', 'p_to', 'p_nominee', 'p_presenter', 'p_in', 'p_out', 'p_target') THEN tests.user_id('crew')::text
      WHEN n = 'p_proof' THEN pg_temp.id('proof')::text
      WHEN n = 'p_session' THEN pg_temp.id('live')::text
      WHEN n IN ('p_exp', 'p_preview') THEN pg_temp.id('exp')::text
      WHEN n = 'p_call_night' THEN pg_temp.id('night')::text
      ELSE gen_random_uuid()::text END) || '::uuid';
  ELSIF t = 'uuid[]' THEN RETURN 'ARRAY[' || quote_literal(pg_temp.id('trip')::text) || '::uuid]';
  ELSIF t = 'text' THEN RETURN quote_literal(CASE n
      WHEN 'p_name' THEN 'Test Trip' WHEN 'p_season' THEN 'preflight' WHEN 'p_mode' THEN 'crew' WHEN 'p_vibe' THEN 'chill'
      WHEN 'p_room' THEN 'trip' WHEN 'p_tz' THEN 'UTC' WHEN 'p_home_timezone' THEN 'UTC' WHEN 'p_role' THEN 'player'
      WHEN 'p_phase' THEN 'takeoff' WHEN 'p_status' THEN 'approved' WHEN 'p_destination' THEN 'Lisbon'
      WHEN 'p_country' THEN 'Japan' WHEN 'p_format' THEN 'trivia' ELSE 'x' END);
  ELSIF t = 'text[]' THEN RETURN '''{}''::text[]';
  ELSIF t = 'boolean' THEN RETURN 'true';
  ELSIF t IN ('integer', 'bigint', 'smallint') THEN RETURN '1';
  ELSIF t = 'numeric' THEN RETURN '1::numeric';
  ELSIF t = 'date' THEN RETURN '(current_date + 10)';
  ELSIF t = 'timestamp with time zone' THEN RETURN '(now() + interval ''10 days'')';
  ELSIF t = 'time without time zone' THEN RETURN '''12:00''::time';
  ELSIF t = 'jsonb' THEN RETURN '''{}''::jsonb';
  ELSE RETURN 'NULL::' || t;
  END IF;
END $$;

CREATE FUNCTION pg_temp.act(p_actor text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_actor = 'anon' THEN PERFORM tests.authenticate_as_anon();
  ELSE PERFORM tests.authenticate_as(tests.user_id(split_part(p_actor, '+', 1))); END IF;
END $$;

-- Calls every matching public function as this actor. 'outsider+own' passes the attacker's own trip
-- with the victim's other IDs.
CREATE FUNCTION pg_temp.try_rpcs(p_actor text, p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; args text; res text; st text; msg text; own boolean := p_actor LIKE '%+own';
BEGIN
  FOR f IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ia
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype <> 'trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND (pg_get_function_identity_arguments(p.oid) ~ p_pattern OR p.proname ~ p_pattern)
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE') OR has_function_privilege('anon', p.oid, 'EXECUTE'))
  LOOP
    SELECT string_agg(pg_temp.val(x, own), ', ' ORDER BY ord) INTO args
    FROM unnest(CASE WHEN f.ia = '' THEN '{}'::text[] ELSE string_to_array(f.ia, ', ') END) WITH ORDINALITY u(x, ord);
    BEGIN
      PERFORM pg_temp.act(p_actor);
      EXECUTE format('SELECT left(coalesce(jsonb_agg(to_jsonb(r))::text, ''[]''), 200) FROM public.%I(%s) r', f.proname, coalesce(args, '')) INTO res;
      RAISE EXCEPTION USING ERRCODE = 'ZZ999', MESSAGE = coalesce(res, 'null');
    EXCEPTION
      WHEN SQLSTATE 'ZZ999' THEN
        GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
        INSERT INTO results VALUES ('rpc', f.proname, p_actor, true, msg);
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, msg = MESSAGE_TEXT;
        INSERT INTO results VALUES ('rpc', f.proname, p_actor, false, st || ': ' || msg);
    END;
  END LOOP;
END $$;

-- Reads and writes every public table with a trip_id directly.
CREATE FUNCTION pg_temp.try_tables(p_actor text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t record; op text; col text; n bigint; sql text; w text; msg text; st text; has_user boolean;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'trip_id' AND NOT a.attisdropped
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
  LOOP
    w := format('trip_id = %L', pg_temp.id('trip'));
    has_user := EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = t.oid AND attname = 'user_id' AND NOT attisdropped);
    FOREACH op IN ARRAY ARRAY['select', 'update', 'delete', 'insert'] LOOP
      BEGIN
        IF op = 'select' THEN sql := format('SELECT count(*) FROM public.%I WHERE %s', t.relname, w);
        ELSIF op = 'delete' THEN sql := format('WITH d AS (DELETE FROM public.%I WHERE %s RETURNING 1) SELECT count(*) FROM d', t.relname, w);
        ELSIF op = 'update' THEN
          SELECT a.attname INTO col FROM pg_attribute a
          WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' AND a.attidentity = ''
            AND has_column_privilege('authenticated', t.oid, a.attnum, 'UPDATE')
          ORDER BY a.attnum LIMIT 1;
          IF col IS NULL THEN CONTINUE; END IF;
          sql := format('WITH u AS (UPDATE public.%I SET %I = %I WHERE %s RETURNING 1) SELECT count(*) FROM u', t.relname, col, col, w);
        ELSE
          sql := format('WITH i AS (INSERT INTO public.%I (trip_id%s) VALUES (%L%s) RETURNING 1) SELECT count(*) FROM i',
                        t.relname, CASE WHEN has_user THEN ', user_id' END, pg_temp.id('trip'),
                        CASE WHEN has_user THEN format(', %L', tests.user_id(p_actor)) END);
        END IF;
        PERFORM pg_temp.act(p_actor);
        EXECUTE sql INTO n;
        RAISE EXCEPTION USING ERRCODE = 'ZZ999', MESSAGE = n::text;
      EXCEPTION
        WHEN SQLSTATE 'ZZ999' THEN
          GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
          INSERT INTO results VALUES ('table:' || op, t.relname, p_actor, msg::bigint > 0, msg);
        WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, msg = MESSAGE_TEXT;
          INSERT INTO results VALUES ('table:' || op, t.relname, p_actor, false, st || ': ' || msg);
      END;
    END LOOP;
  END LOOP;
END $$;

SELECT pg_temp.try_rpcs(a, '\mp_trip uuid\M') FROM unnest(ARRAY['anon', 'outsider', 'outsider+own', 'pending', 'crew', 'cocap', 'owner']) a;
SELECT pg_temp.try_tables(a) FROM unnest(ARRAY['outsider', 'pending']) a;

CREATE FUNCTION pg_temp.passed(p_actor text, p_allowed text[]) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(DISTINCT name, ', ' ORDER BY name) FROM results
  WHERE kind = 'rpc' AND actor = p_actor AND ok AND name <> ALL (p_allowed)
$$;

-- ---------------------------------------------------------------- the RPC matrix (scenarios 1, 2, 3, 6, 7, 9, 10)
SELECT ok((SELECT count(*) > 100 FROM results WHERE kind = 'rpc' AND actor = 'outsider'), 'the matrix really covers the trip functions');
SELECT is(pg_temp.passed('anon', '{}'), NULL, 'a signed-out visitor gets into no trip function');
-- dismiss_join_decline (N-6) deletes only the caller's own decline notice, so anyone may call it.
SELECT is(pg_temp.passed('outsider', ARRAY['captain_status', 'dismiss_join_decline', 'games_live', 'is_trip_member', 'member_stamp_badges', 'mix_ai_quota',
            'my_preview_shared', 'my_trip_feedback_done', 'pending_count', 'player_card_read', 'player_profile', 'seat_status',
            'trip_peek', 'trip_pot', 'trip_squad_messages']),
          NULL, 'an outsider gets into no other trip function');
SELECT is((SELECT string_agg(name || '=' || detail, ', ') FROM results
           WHERE kind = 'rpc' AND actor = 'outsider' AND ok AND name <> 'mix_ai_quota' AND detail NOT IN ('[]', '[null]', '[false]', '[0]')),
          NULL, 'and those few return nothing about the trip');
SELECT is((SELECT string_agg(name, ', ') FROM results r JOIN pg_proc p ON p.proname = r.name
           WHERE r.kind = 'rpc' AND r.actor = 'outsider+own' AND r.ok
             AND pg_get_function_identity_arguments(p.oid) ~ 'uuid.*uuid'
             AND r.name <> ALL (ARRAY['is_trip_member', 'my_preview_shared', 'player_card_read', 'player_profile'])),
          NULL, 'the attacker''s own trip doesn''t unlock the victim''s items, proofs or players');
SELECT is((SELECT string_agg(name || '=' || detail, ', ') FROM results
           WHERE kind = 'rpc' AND actor = 'outsider+own' AND ok AND name IN ('is_trip_member', 'my_preview_shared', 'player_card_read', 'player_profile')
             AND detail NOT IN ('[]', '[null]', '[false]')),
          NULL, 'and shows nothing about them');
SELECT is(pg_temp.passed('pending', ARRAY['captain_status', 'dismiss_join_decline', 'games_live', 'is_trip_member', 'leave_trip', 'member_stamp_badges', 'mix_ai_quota',
            'my_preview_shared', 'my_trip_feedback_done', 'pending_count', 'player_card_read', 'player_profile', 'seat_status',
            'set_trip_hidden', 'trip_peek', 'trip_pot', 'trip_squad_messages']),
          NULL, 'a pending player can only leave or hide the trip');
SELECT is(pg_temp.passed('crew', ARRAY['ai_credit_status', 'dismiss_join_decline', 'at_home_mvp', 'at_home_plan', 'captain_status', 'crew_check', 'games_live',
            'home_day_scores', 'is_trip_member', 'leave_trip', 'member_stamp_badges', 'mix_ai_quota', 'my_credits', 'my_preview_shared',
            'my_schedule', 'my_trip_feedback_done', 'open_live', 'pending_count', 'player_card_read', 'player_profile', 'postcard_info',
            'preview_ten_day_drops', 'season_info', 'season_timing', 'seat_status', 'set_guide_prefs', 'set_song_disc', 'set_trip_hidden',
            'solo_goal', 'trip_guide', 'trip_peek', 'trip_phase', 'trip_photos', 'trip_pot', 'trip_price', 'trip_roster',
            'trip_season_started', 'trip_squad_messages', 'trip_standings', 'weekly_question_status', 'wrapup_board']),
          NULL, 'a crew member runs only member-level functions');
SELECT is((SELECT string_agg(name, ', ' ORDER BY name) FROM results c
           WHERE c.kind = 'rpc' AND c.actor = 'cocap' AND NOT c.ok
             AND EXISTS (SELECT 1 FROM results o WHERE o.kind = 'rpc' AND o.actor = 'owner' AND o.ok AND o.name = c.name)
             AND c.name = ANY (ARRAY['delete_trip', 'step_down', 'create_teen_invite', 'member_age_ranges'])),
          'create_teen_invite, delete_trip, member_age_ranges, step_down',
          'the Co-Captain can''t do the Captain-only things (R-208)');

-- ---------------------------------------------------------------- direct table access (scenarios 1, 2, 3, 6)
SELECT is((SELECT string_agg(DISTINCT name, ', ') FROM results WHERE kind = 'table:select' AND ok), NULL,
          'an outsider or pending player reads no trip table');
SELECT is((SELECT string_agg(DISTINCT name, ', ') FROM results WHERE kind IN ('table:update', 'table:delete') AND ok), NULL,
          'and changes or deletes nothing in one');
SELECT is((SELECT string_agg(DISTINCT name, ', ') FROM results WHERE kind = 'table:insert' AND ok), NULL,
          'and adds nothing to one');

SELECT tests.authenticate_as(tests.user_id('outsider'));
SELECT is((SELECT count(*)::int FROM storage.objects WHERE name LIKE pg_temp.id('trip') || '/%'), 0, 'an outsider sees no file of the trip, in any bucket');

-- ---------------------------------------------------------------- another player in the same trip (scenarios 4, 5)
SELECT tests.authenticate_as(tests.user_id('crew2'));
SELECT is((SELECT count(*)::int FROM public.journal_entries WHERE user_id = tests.user_id('crew')), 0, 'a crew mate can''t read someone''s journal directly');
SELECT is((SELECT count(*)::int FROM public.proofs WHERE user_id = tests.user_id('crew')), 0, 'or their proof rows');
SELECT is((SELECT count(*)::int FROM public.push_subscriptions WHERE user_id = tests.user_id('crew'))
          + (SELECT count(*)::int FROM public.player_private WHERE user_id = tests.user_id('crew')), 0, 'or their push addresses and private details');
SELECT throws_ok($$SELECT * FROM public.notification_queue$$, '42501', NULL, 'or anyone''s queued reminders');

-- ---------------------------------------------------------------- forged roles and IDs (scenario 12)
SELECT tests.authenticate_as(tests.user_id('outsider'));
SELECT throws_ok($$INSERT INTO public.trip_members (trip_id, user_id, role, status) VALUES (pg_temp.id('trip'), auth.uid(), 'captain', 'approved')$$,
                 '42501', NULL, 'nobody writes themselves in as Captain');
SELECT tests.authenticate_as(tests.user_id('crew'));
UPDATE public.trip_members SET role = 'captain' WHERE trip_id = pg_temp.id('trip') AND user_id = auth.uid();
SELECT tests.clear_authentication();
SELECT is((SELECT role FROM public.trip_members WHERE trip_id = pg_temp.id('trip') AND user_id = tests.user_id('crew')), 'player',
          'and a crew member can''t promote themselves');
SELECT is((SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'trip_private' AND p.proname IN ('award_points', 'refresh_passport', 'stamp_trip', 'lock_trip', 'crown_season', 'expire_proofs', 'set_proof_ai')
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')), NULL,
          'points, stamps, badges and crowns can''t be granted from a client');

-- ---------------------------------------------------------------- the Captain isn't an admin (scenario 8)
SELECT pg_temp.try_rpcs('owner', '^(admin_|founder_|lab_|moderat|set_ai_guard|set_public_launch|set_price_rule|set_trip_archived|archive_legacy_trips|create_beta_codes|list_beta_codes|revoke_beta_code|list_waitlist)');
SELECT is((SELECT string_agg(DISTINCT name, ', ') FROM results WHERE actor = 'owner' AND ok AND name ~ '^(admin_|founder_|lab_|moderat|set_ai_guard|set_public_launch|set_price_rule|set_trip_archived|archive_legacy_trips|create_beta_codes|list_beta_codes|revoke_beta_code|list_waitlist)'),
          NULL, 'a Captain can''t run a founder or admin function');

-- ---------------------------------------------------------------- revoked membership, same session (scenario 11)
SELECT tests.authenticate_as(tests.user_id('owner'));
SELECT public.manage_trip_member(pg_temp.id('trip'), tests.user_id('crew'), 'remove');
SELECT public.manage_trip_member(pg_temp.id('trip'), tests.user_id('cocap'), 'demote');
SELECT tests.authenticate_as(tests.user_id('crew'));
SELECT throws_like($$SELECT * FROM public.my_schedule(pg_temp.id('trip'))$$, 'Join this trip first', 'a removed player''s old request is refused');
SELECT is((SELECT count(*)::int FROM public.trips WHERE id = pg_temp.id('trip')), 0, 'and they no longer see the trip');
SELECT tests.authenticate_as(tests.user_id('cocap'));
SELECT throws_like($$SELECT public.set_trip_vibe(pg_temp.id('trip'), 'chill')$$, '%Captain or Co-Captain%', 'a demoted Co-Captain loses leader powers at once');
SELECT tests.clear_authentication();

-- ---------------------------------------------------------------- 21+ cards stay behind the checked functions
SELECT tests.authenticate_as(tests.user_id('crew2'));
SELECT throws_ok($$SELECT * FROM public.game_cards$$, '42501', NULL, 'nobody reads game cards directly, so 21+ cards stay behind the checked functions');
SELECT tests.clear_authentication();

SELECT * FROM finish();
ROLLBACK;
