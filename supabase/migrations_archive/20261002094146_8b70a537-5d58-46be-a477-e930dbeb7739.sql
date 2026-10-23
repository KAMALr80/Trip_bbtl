ALTER TABLE public.bug_reports
  ADD COLUMN status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','looking','fixed','wont_fix','need_info')),
  ADD COLUMN founder_note text,
  ADD COLUMN issue_id uuid,
  ADD COLUMN app_version text,
  ADD COLUMN status_changed_at timestamptz,
  ADD COLUMN update_seen_at timestamptz;

CREATE TABLE public.bug_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','looking','fixed','wont_fix','need_info')),
  founder_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bug_issues TO authenticated;
GRANT ALL ON public.bug_issues TO service_role;
ALTER TABLE public.bug_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Founder reads issues" ON public.bug_issues FOR SELECT TO authenticated USING (trip_private.is_app_admin());
ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_issue_fk FOREIGN KEY (issue_id) REFERENCES public.bug_issues(id) ON DELETE SET NULL;

CREATE TABLE public.checkin_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  context text NOT NULL CHECK (context IN ('game_night','trip_day')),
  context_key text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, trip_id, context, context_key)
);
GRANT SELECT ON public.checkin_responses TO authenticated;
GRANT ALL ON public.checkin_responses TO service_role;
ALTER TABLE public.checkin_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Founder or owner reads check-ins" ON public.checkin_responses FOR SELECT TO authenticated USING (user_id = auth.uid() OR trip_private.is_app_admin());

-- founder sees all screenshots
CREATE POLICY "Founder views bug screenshots" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bug-screenshots' AND trip_private.is_app_admin());

CREATE OR REPLACE FUNCTION public.founder_bug_reports()
RETURNS TABLE(id uuid, created_at timestamptz, page text, description text, screenshot_path text, user_agent text, app_version text, trip_id uuid, trip_name text, reporter text, status text, founder_note text, issue_id uuid, issue_title text, issue_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  RETURN QUERY SELECT r.id, r.created_at, r.page, r.description, r.screenshot_path, r.user_agent, r.app_version, r.trip_id, t.name,
    coalesce(nullif(pp.game_name,''), nullif(p.display_name,''), 'Player'), r.status, r.founder_note, r.issue_id, i.title,
    (SELECT count(DISTINCT r2.user_id)::int FROM bug_reports r2 WHERE r2.issue_id = r.issue_id)
  FROM bug_reports r LEFT JOIN trips t ON t.id = r.trip_id LEFT JOIN profiles p ON p.id = r.user_id
  LEFT JOIN player_profiles pp ON pp.user_id = r.user_id LEFT JOIN bug_issues i ON i.id = r.issue_id
  WHERE r.trip_id IS NULL OR NOT coalesce(t.is_sandbox, false)
  ORDER BY r.created_at DESC LIMIT 500;
END $$;

CREATE OR REPLACE FUNCTION public.founder_update_report(p_report uuid, p_status text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_issue uuid;
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  SELECT issue_id INTO v_issue FROM bug_reports WHERE id = p_report;
  IF v_issue IS NOT NULL THEN
    UPDATE bug_issues SET status = p_status, founder_note = left(p_note, 500), updated_at = now() WHERE id = v_issue;
    UPDATE bug_reports SET status_changed_at = CASE WHEN status IS DISTINCT FROM p_status THEN now() ELSE status_changed_at END,
      update_seen_at = CASE WHEN status IS DISTINCT FROM p_status THEN NULL ELSE update_seen_at END,
      status = p_status, founder_note = left(p_note, 500) WHERE issue_id = v_issue;
  ELSE
    UPDATE bug_reports SET status_changed_at = CASE WHEN status IS DISTINCT FROM p_status THEN now() ELSE status_changed_at END,
      update_seen_at = CASE WHEN status IS DISTINCT FROM p_status THEN NULL ELSE update_seen_at END,
      status = p_status, founder_note = left(p_note, 500) WHERE id = p_report;
  END IF;
END $$;

-- link report to an existing issue (p_issue) or create a new one (p_title); null both to unlink
CREATE OR REPLACE FUNCTION public.founder_link_report(p_report uuid, p_issue uuid, p_title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_issue uuid := p_issue; v_status text; v_note text;
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  IF v_issue IS NULL AND nullif(trim(p_title),'') IS NOT NULL THEN
    SELECT status, founder_note INTO v_status, v_note FROM bug_reports WHERE id = p_report;
    INSERT INTO bug_issues(title, status, founder_note) VALUES (left(trim(p_title),140), coalesce(v_status,'new'), v_note) RETURNING id INTO v_issue;
  END IF;
  IF v_issue IS NOT NULL THEN
    SELECT status, founder_note INTO v_status, v_note FROM bug_issues WHERE id = v_issue;
    UPDATE bug_reports SET issue_id = v_issue,
      status_changed_at = CASE WHEN status IS DISTINCT FROM v_status THEN now() ELSE status_changed_at END,
      update_seen_at = CASE WHEN status IS DISTINCT FROM v_status THEN NULL ELSE update_seen_at END,
      status = v_status, founder_note = v_note WHERE id = p_report;
  ELSE
    UPDATE bug_reports SET issue_id = NULL WHERE id = p_report;
  END IF;
  RETURN v_issue;
END $$;

CREATE OR REPLACE FUNCTION public.founder_open_summary()
RETURNS TABLE(issue_id uuid, title text, page text, status text, people integer, reports integer, last_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  RETURN QUERY SELECT r.issue_id, coalesce(i.title, left(min(r.description), 80)), min(r.page), min(r.status),
    count(DISTINCT r.user_id)::int, count(*)::int, max(r.created_at)
  FROM bug_reports r LEFT JOIN bug_issues i ON i.id = r.issue_id LEFT JOIN trips t ON t.id = r.trip_id
  WHERE r.status IN ('new','looking','need_info') AND NOT coalesce(t.is_sandbox,false)
  GROUP BY r.issue_id, i.title, CASE WHEN r.issue_id IS NULL THEN r.id END
  ORDER BY count(DISTINCT r.user_id) DESC, max(r.created_at) DESC;
END $$;

CREATE OR REPLACE FUNCTION public.founder_checkins()
RETURNS TABLE(id uuid, created_at timestamptz, trip_name text, reporter text, context text, context_key text, answers jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
  RETURN QUERY SELECT c.id, c.created_at, t.name, coalesce(nullif(pp.game_name,''), nullif(p.display_name,''), 'Player'), c.context, c.context_key, c.answers
  FROM checkin_responses c JOIN trips t ON t.id = c.trip_id LEFT JOIN profiles p ON p.id = c.user_id LEFT JOIN player_profiles pp ON pp.user_id = c.user_id
  WHERE NOT t.is_sandbox ORDER BY c.created_at DESC LIMIT 300;
END $$;

CREATE OR REPLACE FUNCTION public.my_bug_updates()
RETURNS TABLE(id uuid, page text, status text, founder_note text, status_changed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, page, status, founder_note, status_changed_at FROM bug_reports
  WHERE user_id = auth.uid() AND status IN ('fixed','need_info') AND update_seen_at IS NULL AND status_changed_at IS NOT NULL
  ORDER BY status_changed_at DESC LIMIT 5;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_bug_update(p_report uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE bug_reports SET update_seen_at = now() WHERE id = p_report AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.submit_checkin(p_trip uuid, p_context text, p_key text, p_answers jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = p_trip AND user_id = auth.uid() AND status = 'approved') THEN RAISE EXCEPTION 'Not a member of this trip'; END IF;
  IF p_context NOT IN ('game_night','trip_day') OR length(p_key) > 40 OR length(p_answers::text) > 3000 THEN RAISE EXCEPTION 'Invalid check-in'; END IF;
  INSERT INTO checkin_responses(user_id, trip_id, context, context_key, answers) VALUES (auth.uid(), p_trip, p_context, p_key, p_answers)
  ON CONFLICT (user_id, trip_id, context, context_key) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.founder_bug_reports(), public.founder_update_report(uuid,text,text), public.founder_link_report(uuid,uuid,text), public.founder_open_summary(), public.founder_checkins(), public.my_bug_updates(), public.dismiss_bug_update(uuid), public.submit_checkin(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.founder_bug_reports(), public.founder_update_report(uuid,text,text), public.founder_link_report(uuid,uuid,text), public.founder_open_summary(), public.founder_checkins(), public.my_bug_updates(), public.dismiss_bug_update(uuid), public.submit_checkin(uuid,text,text,jsonb) TO authenticated;

-- reporters can't change status themselves: existing insert policy must keep defaults
CREATE OR REPLACE FUNCTION trip_private.bug_report_defaults() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.status := 'new'; NEW.founder_note := NULL; NEW.issue_id := NULL; NEW.status_changed_at := NULL; NEW.update_seen_at := NULL; NEW.app_version := left(NEW.app_version, 40); RETURN NEW; END $$;
CREATE TRIGGER bug_report_defaults BEFORE INSERT ON public.bug_reports FOR EACH ROW EXECUTE FUNCTION trip_private.bug_report_defaults();