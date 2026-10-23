ALTER FUNCTION public.founder_bug_reports() SET SCHEMA trip_private;
ALTER FUNCTION public.founder_update_report(uuid,text,text) SET SCHEMA trip_private;
ALTER FUNCTION public.founder_link_report(uuid,uuid,text) SET SCHEMA trip_private;
ALTER FUNCTION public.founder_open_summary() SET SCHEMA trip_private;
ALTER FUNCTION public.founder_checkins() SET SCHEMA trip_private;
ALTER FUNCTION public.my_bug_updates() SET SCHEMA trip_private;
ALTER FUNCTION public.dismiss_bug_update(uuid) SET SCHEMA trip_private;
ALTER FUNCTION public.submit_checkin(uuid,text,text,jsonb) SET SCHEMA trip_private;

CREATE FUNCTION public.founder_bug_reports() RETURNS TABLE(id uuid, created_at timestamptz, page text, description text, screenshot_path text, user_agent text, app_version text, trip_id uuid, trip_name text, reporter text, status text, founder_note text, issue_id uuid, issue_title text, issue_count integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT * FROM trip_private.founder_bug_reports() $$;
CREATE FUNCTION public.founder_update_report(p_report uuid, p_status text, p_note text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.founder_update_report(p_report, p_status, p_note) $$;
CREATE FUNCTION public.founder_link_report(p_report uuid, p_issue uuid, p_title text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.founder_link_report(p_report, p_issue, p_title) $$;
CREATE FUNCTION public.founder_open_summary() RETURNS TABLE(issue_id uuid, title text, page text, status text, people integer, reports integer, last_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT * FROM trip_private.founder_open_summary() $$;
CREATE FUNCTION public.founder_checkins() RETURNS TABLE(id uuid, created_at timestamptz, trip_name text, reporter text, context text, context_key text, answers jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT * FROM trip_private.founder_checkins() $$;
CREATE FUNCTION public.my_bug_updates() RETURNS TABLE(id uuid, page text, status text, founder_note text, status_changed_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT * FROM trip_private.my_bug_updates() $$;
CREATE FUNCTION public.dismiss_bug_update(p_report uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.dismiss_bug_update(p_report) $$;
CREATE FUNCTION public.submit_checkin(p_trip uuid, p_context text, p_key text, p_answers jsonb) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.submit_checkin(p_trip, p_context, p_key, p_answers) $$;

REVOKE ALL ON FUNCTION public.founder_bug_reports(), public.founder_update_report(uuid,text,text), public.founder_link_report(uuid,uuid,text), public.founder_open_summary(), public.founder_checkins(), public.my_bug_updates(), public.dismiss_bug_update(uuid), public.submit_checkin(uuid,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.founder_bug_reports(), public.founder_update_report(uuid,text,text), public.founder_link_report(uuid,uuid,text), public.founder_open_summary(), public.founder_checkins(), public.my_bug_updates(), public.dismiss_bug_update(uuid), public.submit_checkin(uuid,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION trip_private.founder_bug_reports(), trip_private.founder_update_report(uuid,text,text), trip_private.founder_link_report(uuid,uuid,text), trip_private.founder_open_summary(), trip_private.founder_checkins(), trip_private.my_bug_updates(), trip_private.dismiss_bug_update(uuid), trip_private.submit_checkin(uuid,text,text,jsonb) TO authenticated;