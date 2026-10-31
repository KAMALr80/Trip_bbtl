-- M3-12 Window Seat journal + shared guide (R-351 – R-355) and M3-13 the solo at-home showcase page
-- (R-365).
--  * Journal: one evening prompt a day with 2 others to swap to; typed or dictated (the OS keyboard
--    mic); 2 points once per day (ws_journal).
--  * Guide: the trip's journal entries and approved quest photos, one page per trip (a crew of up to
--    4 shares one). It can be published as a read-only link. The public page hides names and photos
--    unless each player opts in, and never shows photos of a trip with minors.
--  * Solo at-home rooms (Explore / Show Your Culture, "Just me") get a showcase note each experience
--    day; the same page is their finale showcase page (R-365), crowned by the solo goal (M3-11).
-- rollback: DROP FUNCTION public.journal_options(uuid), public.write_journal(uuid, text, int),
--   public.set_guide_prefs(uuid, boolean, boolean), public.publish_guide(uuid, boolean), public.trip_guide(uuid),
--   public.public_guide(text) and their trip_private bodies; ALTER FUNCTION trip_private.desired_schedule_core(uuid)
--   RENAME TO desired_schedule (after dropping the wrapper); DROP TABLE public.guide_prefs, public.trip_guides,
--   public.journal_entries; DELETE FROM public.content_items WHERE source = 'starter' AND source_ref LIKE 'showcase-note-%'.

-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  schedule_id uuid NOT NULL REFERENCES public.trip_schedule(id) ON DELETE CASCADE,
  day date NOT NULL,
  prompt text NOT NULL CHECK (length(prompt) <= 300),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, user_id)
);
CREATE INDEX journal_entries_trip_idx ON public.journal_entries (trip_id, day);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own journal" ON public.journal_entries FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.journal_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
CREATE TRIGGER journal_entries_archive_guard BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

CREATE TABLE public.trip_guides (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  published_at timestamptz,             -- NULL = not shared; the link stops working when unpublished
  published_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trip_guides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read the guide state" ON public.trip_guides FOR SELECT TO authenticated
  USING (trip_private.is_trip_member(trip_id, auth.uid()));
REVOKE ALL ON public.trip_guides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trip_guides TO authenticated;
GRANT ALL ON public.trip_guides TO service_role;
CREATE TRIGGER trip_guides_archive_guard BEFORE INSERT OR UPDATE ON public.trip_guides
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- What each player lets the public page show (R-355 acceptance): off until they opt in.
CREATE TABLE public.guide_prefs (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  show_name boolean NOT NULL DEFAULT false,
  share_photos boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);
ALTER TABLE public.guide_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players read their own guide choices" ON public.guide_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.guide_prefs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.guide_prefs TO authenticated;
GRANT ALL ON public.guide_prefs TO service_role;
CREATE TRIGGER guide_prefs_archive_guard BEFORE INSERT OR UPDATE ON public.guide_prefs
  FOR EACH ROW EXECUTE FUNCTION trip_private.guard_archived_trip();

-- ---------------------------------------------------------------------------------------------
-- Showcase notes for solo at-home rooms (R-365), in the content library.
INSERT INTO public.content_items (kind, rooms, modes, title, body, source, source_ref, reviewed) VALUES
  ('journal_prompt', '{explore_culture,show_culture}', '{at_home}', 'Today''s showcase note', 'What did you make, cook, learn or try from {culture} today? What would you show a friend first?', 'starter', 'showcase-note-01', true),
  ('journal_prompt', '{explore_culture,show_culture}', '{at_home}', 'One surprise', 'What surprised you about {culture} today, and why?', 'starter', 'showcase-note-02', true),
  ('journal_prompt', '{explore_culture,show_culture}', '{at_home}', 'Teach it back', 'Explain one thing you learned today about {culture} in three sentences, as if teaching it.', 'starter', 'showcase-note-03', true),
  ('journal_prompt', '{explore_culture,show_culture}', '{at_home}', 'Five senses', 'Describe today''s {culture} moment with one line for each sense you used.', 'starter', 'showcase-note-04', true),
  ('journal_prompt', '{explore_culture,show_culture}', '{at_home}', 'Next time', 'What would you do differently next time, and what will you try tomorrow?', 'starter', 'showcase-note-05', true),
  ('journal_prompt', '{explore_culture,show_culture}', '{at_home}', 'Who to thank', 'Who or what helped you today (a recipe, a song, a person)? Say thank you here.', 'starter', 'showcase-note-06', true)
ON CONFLICT (source, source_ref) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- Schedule: solo at-home rooms get a showcase note each experience day (2 pts, like the journal).
ALTER FUNCTION trip_private.desired_schedule(uuid) RENAME TO desired_schedule_core;
CREATE FUNCTION trip_private.desired_schedule(p_trip uuid)
RETURNS TABLE(kind text, slot text, user_id uuid, day date, opens_at timestamptz, closes_at timestamptz,
              ref_id uuid, variant text, points int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.trips; ssn record;
BEGIN
  RETURN QUERY SELECT * FROM trip_private.desired_schedule_core(p_trip);
  SELECT * INTO t FROM public.trips WHERE id = p_trip;
  IF NOT FOUND OR t.play_mode <> 'solo' OR t.room NOT IN ('explore_culture', 'show_culture') THEN RETURN; END IF;
  SELECT * INTO ssn FROM trip_private.trip_phase_windows(p_trip) w WHERE w.phase = 'trip_season';
  IF NOT (ssn.ends_at > ssn.starts_at) THEN RETURN; END IF;
  RETURN QUERY
    SELECT 'journal_prompt'::text, d::date::text, m.user_id, d::date,
           greatest((d::date + time '08:00') AT TIME ZONE ssn.tz, ssn.starts_at),
           (d::date + 1 + time '12:00') AT TIME ZONE ssn.tz, NULL::uuid, 'showcase'::text, 2
    FROM generate_series((ssn.starts_at AT TIME ZONE ssn.tz)::date, (ssn.ends_at AT TIME ZONE ssn.tz)::date - 1, interval '1 day') d
    CROSS JOIN public.trip_members m
    WHERE m.trip_id = p_trip AND m.status = 'approved';
END
$$;
REVOKE ALL ON FUNCTION trip_private.desired_schedule(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION trip_private.desired_schedule_core(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- Journal.

-- The dealt prompt plus two others to swap to (R-351), stable per item.
CREATE FUNCTION trip_private.journal_options(p_item uuid) RETURNS TABLE(idx int, prompt text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.trip_schedule; t public.trips;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  IF NOT FOUND OR s.kind <> 'journal_prompt' OR s.user_id IS DISTINCT FROM auth.uid()
     OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'That isn''t your journal';
  END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'Tonight''s prompt isn''t out yet'; END IF;
  SELECT * INTO t FROM public.trips WHERE id = s.trip_id;
  RETURN QUERY
    SELECT 0, s.tailored_text WHERE s.tailored_text IS NOT NULL
    UNION ALL
    SELECT (row_number() OVER (ORDER BY trip_private.schedule_hash(p_item::text || c.id::text)))::int,
           trip_private.tailor_text(c.body, t)
    FROM public.content_items c
    WHERE c.kind = 'journal_prompt' AND trip_private.content_fits(c, t) AND c.id IS DISTINCT FROM s.content_item_id
    ORDER BY 1
    LIMIT 3;
END
$$;

-- Write (or edit, until it closes) tonight's entry; 2 points the first time (R-351).
CREATE FUNCTION trip_private.write_journal(p_item uuid, p_body text, p_choice int) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s public.trip_schedule; v_prompt text; v_id uuid; v_season text;
BEGIN
  SELECT * INTO s FROM public.trip_schedule WHERE id = p_item;
  IF NOT FOUND OR s.kind <> 'journal_prompt' OR s.user_id IS DISTINCT FROM auth.uid()
     OR NOT trip_private.is_trip_member(s.trip_id, auth.uid()) THEN
    RAISE EXCEPTION 'That isn''t your journal';
  END IF;
  IF now() < s.opens_at THEN RAISE EXCEPTION 'Tonight''s prompt isn''t out yet'; END IF;
  IF s.closes_at IS NOT NULL AND now() >= s.closes_at THEN RAISE EXCEPTION 'This day''s journal has closed'; END IF;
  p_body := btrim(p_body);
  IF coalesce(p_body, '') = '' THEN RAISE EXCEPTION 'Write a line or two first'; END IF;
  IF length(p_body) > 2000 THEN RAISE EXCEPTION 'Keep it under 2,000 characters'; END IF;
  IF NOT trip_private.content_text_safe(p_body) THEN RAISE EXCEPTION 'Please reword that'; END IF;
  SELECT o.prompt INTO v_prompt FROM trip_private.journal_options(p_item) o WHERE o.idx = coalesce(p_choice, 0);
  IF v_prompt IS NULL THEN RAISE EXCEPTION 'Pick one of the prompts'; END IF;
  INSERT INTO public.journal_entries (trip_id, user_id, schedule_id, day, prompt, body)
  VALUES (s.trip_id, auth.uid(), p_item, s.day, v_prompt, p_body)
  ON CONFLICT (schedule_id, user_id) DO UPDATE SET prompt = excluded.prompt, body = excluded.body, updated_at = now()
  RETURNING id INTO v_id;
  SELECT CASE phase WHEN 'preflight' THEN 'preflight' ELSE 'trip_season' END INTO v_season
  FROM trip_private.trip_phase(s.trip_id, now());
  IF s.points IS NOT NULL THEN
    PERFORM trip_private.award_points(s.trip_id, auth.uid(), coalesce(v_season, 'trip_season'), 'ws_journal', s.id, s.points,
                                      'approved', now(), auth.uid());
  END IF;
  RETURN v_id;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Guide.

CREATE FUNCTION trip_private.set_guide_prefs(p_trip uuid, p_show_name boolean, p_share_photos boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  INSERT INTO public.guide_prefs (trip_id, user_id, show_name, share_photos)
  VALUES (p_trip, auth.uid(), coalesce(p_show_name, false), coalesce(p_share_photos, false))
  ON CONFLICT (trip_id, user_id) DO UPDATE SET show_name = excluded.show_name, share_photos = excluded.share_photos, updated_at = now();
END
$$;

-- Share the guide as a read-only link, or stop sharing it. Leaders; on a solo trip that's the player.
CREATE FUNCTION trip_private.publish_guide(p_trip uuid, p_publish boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_token text;
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'The Captain or Co-Captain shares the guide'; END IF;
  INSERT INTO public.trip_guides (trip_id, published_at, published_by)
  VALUES (p_trip, CASE WHEN p_publish THEN now() END, auth.uid())
  ON CONFLICT (trip_id) DO UPDATE
    SET published_at = CASE WHEN p_publish THEN coalesce(public.trip_guides.published_at, now()) END,
        published_by = auth.uid(), updated_at = now()
  RETURNING token INTO v_token;
  RETURN CASE WHEN p_publish THEN v_token END;
END
$$;

-- The guide's items: journal entries, then approved quest photos (Window Seat quests, Home Missions
-- and drops), oldest first. p_public applies the public page's rules.
CREATE FUNCTION trip_private.guide_items(p_trip uuid, p_public boolean)
RETURNS TABLE(day date, kind text, user_id uuid, author text, prompt text, body text, photo_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH t AS (SELECT * FROM public.trips WHERE id = p_trip),
  names AS (
    SELECT m.user_id, coalesce(c.game_name, pp.game_name, 'Traveler') AS name,
           coalesce(g.show_name, false) AS show_name, coalesce(g.share_photos, false) AS share_photos
    FROM public.trip_members m
    LEFT JOIN public.trip_player_cards c ON c.trip_id = m.trip_id AND c.user_id = m.user_id
    LEFT JOIN public.player_profiles pp ON pp.user_id = m.user_id
    LEFT JOIN public.guide_prefs g ON g.trip_id = m.trip_id AND g.user_id = m.user_id
    WHERE m.trip_id = p_trip AND m.status = 'approved'
  )
  SELECT j.day, 'journal', CASE WHEN p_public THEN NULL ELSE j.user_id END,
         CASE WHEN NOT p_public OR n.show_name THEN n.name END, j.prompt, j.body, NULL::text
  FROM public.journal_entries j JOIN names n ON n.user_id = j.user_id
  WHERE j.trip_id = p_trip
  UNION ALL
  SELECT s.day, 'photo', CASE WHEN p_public THEN NULL ELSE p.user_id END,
         CASE WHEN NOT p_public OR n.show_name THEN n.name END, NULL, p.body, p.photo_path
  FROM public.proofs p
  JOIN public.trip_schedule s ON s.id = p.schedule_id
  JOIN names n ON n.user_id = p.user_id
  CROSS JOIN t
  WHERE p.trip_id = p_trip AND p.photo_path IS NOT NULL AND p.crew_status IN ('approved', 'not_needed')
    AND s.kind IN ('ws_quest', 'home_mission', 'airport_mission', 'surprise_drop', 'trip_quest')
    AND (NOT p_public OR (n.share_photos AND NOT t.has_minors))
  ORDER BY 1, 2 DESC
$$;
REVOKE ALL ON FUNCTION trip_private.guide_items(uuid, boolean) FROM PUBLIC;

-- The guide inside the app (members): everything, with names.
CREATE FUNCTION trip_private.trip_guide(p_trip uuid)
RETURNS TABLE(day date, kind text, user_id uuid, author text, prompt text, body text, photo_path text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  RETURN QUERY SELECT * FROM trip_private.guide_items(p_trip, false);
END
$$;

-- The public page (no sign-in): only a published guide; names and photos per each player's choice.
-- Photo paths are signed by the server route, never by the visitor.
CREATE FUNCTION trip_private.public_guide(p_token text)
RETURNS TABLE(title text, place text, start_date date, end_date date, room text,
              day date, kind text, author text, prompt text, body text, photo_path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.name, coalesce(t.cultures[1], t.destination), t.start_date, t.end_date, t.room,
         i.day, i.kind, i.author, i.prompt, i.body, i.photo_path
  FROM public.trip_guides g
  JOIN public.trips t ON t.id = g.trip_id
  CROSS JOIN LATERAL trip_private.guide_items(t.id, true) i
  WHERE g.token = p_token AND g.published_at IS NOT NULL AND t.rules_version = 2
$$;

-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION trip_private.journal_options(uuid), trip_private.write_journal(uuid, text, int),
  trip_private.set_guide_prefs(uuid, boolean, boolean), trip_private.publish_guide(uuid, boolean),
  trip_private.trip_guide(uuid), trip_private.public_guide(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trip_private.journal_options(uuid), trip_private.write_journal(uuid, text, int),
  trip_private.set_guide_prefs(uuid, boolean, boolean), trip_private.publish_guide(uuid, boolean),
  trip_private.trip_guide(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION trip_private.public_guide(text), trip_private.guide_items(uuid, boolean) TO service_role;

CREATE FUNCTION public.journal_options(p_item uuid) RETURNS TABLE(idx int, prompt text)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.journal_options(p_item) $$;
CREATE FUNCTION public.write_journal(p_item uuid, p_body text, p_choice int DEFAULT 0) RETURNS uuid
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.write_journal(p_item, p_body, p_choice) $$;
CREATE FUNCTION public.set_guide_prefs(p_trip uuid, p_show_name boolean, p_share_photos boolean) RETURNS void
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.set_guide_prefs(p_trip, p_show_name, p_share_photos) $$;
CREATE FUNCTION public.publish_guide(p_trip uuid, p_publish boolean) RETURNS text
LANGUAGE sql SET search_path = '' AS $$ SELECT trip_private.publish_guide(p_trip, p_publish) $$;
CREATE FUNCTION public.trip_guide(p_trip uuid)
RETURNS TABLE(day date, kind text, user_id uuid, author text, prompt text, body text, photo_path text)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.trip_guide(p_trip) $$;
-- Called by the server route with the service role only (it signs the photo links).
CREATE FUNCTION public.public_guide(p_token text)
RETURNS TABLE(title text, place text, start_date date, end_date date, room text,
              day date, kind text, author text, prompt text, body text, photo_path text)
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT * FROM trip_private.public_guide(p_token) $$;
REVOKE ALL ON FUNCTION public.journal_options(uuid), public.write_journal(uuid, text, int),
  public.set_guide_prefs(uuid, boolean, boolean), public.publish_guide(uuid, boolean), public.trip_guide(uuid),
  public.public_guide(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journal_options(uuid), public.write_journal(uuid, text, int),
  public.set_guide_prefs(uuid, boolean, boolean), public.publish_guide(uuid, boolean), public.trip_guide(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_guide(text) TO service_role;
