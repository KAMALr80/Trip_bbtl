CREATE TABLE public.trip_deletion_notes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, trip_name text NOT NULL, captain_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.trip_deletion_notes TO authenticated;
GRANT ALL ON public.trip_deletion_notes TO service_role;
ALTER TABLE public.trip_deletion_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own deleted trip notes" ON public.trip_deletion_notes FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE TABLE public.trip_deletion_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL, trip_name text NOT NULL, captain_id uuid NOT NULL, member_count integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.trip_deletion_log TO service_role;
ALTER TABLE public.trip_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.at_home_song_winners (activity_id uuid PRIMARY KEY REFERENCES public.at_home_activities(id) ON DELETE CASCADE, user_id uuid NOT NULL, picked_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.at_home_song_winners TO authenticated;
GRANT ALL ON public.at_home_song_winners TO service_role;
ALTER TABLE public.at_home_song_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved members see winning disc" ON public.at_home_song_winners FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.at_home_activities a WHERE a.id=activity_id AND trip_private.is_trip_member(a.trip_id, auth.uid())));

ALTER TABLE public.app_settings ADD COLUMN founder_intro text NOT NULL DEFAULT 'I’m Tymeka “Ty” Smith, an Army veteran and forever trip junkie. I built TripJunkies so every squad feels closer before takeoff.';
ALTER TABLE public.app_settings ADD COLUMN welcome_faq jsonb NOT NULL DEFAULT '[{"q":"How does it work?","a":"Game nights before departure, challenges during the trip, and a recap after."},{"q":"What does it cost?","a":"Beta passes are $0 today, with no card needed. Your Captain sees the trip price before unlocking."},{"q":"How do invites work?","a":"Your Captain sends a personal link or a join code. You choose when to join."},{"q":"What does a Captain do?","a":"The Captain sets up the trip, invites the squad and keeps everything moving."},{"q":"How do game nights work?","a":"Join the call, play together and vote in the app when the night is live."}]'::jsonb;

CREATE OR REPLACE FUNCTION trip_private.delete_trip(p_trip uuid, p_name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$ DECLARE t public.trips; n integer; BEGIN
 SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT FOUND OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Captain only'; END IF;
 IF p_name IS DISTINCT FROM t.name THEN RAISE EXCEPTION 'Trip name does not match'; END IF;
 SELECT count(*) INTO n FROM public.trip_members WHERE trip_id=p_trip;
 INSERT INTO public.trip_deletion_notes(user_id,trip_name,captain_id) SELECT user_id,t.name,auth.uid() FROM public.trip_members WHERE trip_id=p_trip AND user_id<>auth.uid();
 INSERT INTO public.trip_deletion_log(trip_id,trip_name,captain_id,member_count) VALUES(p_trip,t.name,auth.uid(),n);
 DELETE FROM public.trips WHERE id=p_trip;
END $fn$;
CREATE OR REPLACE FUNCTION public.delete_trip(p_trip uuid, p_name text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $fn$ SELECT trip_private.delete_trip(p_trip,p_name) $fn$;
REVOKE ALL ON FUNCTION trip_private.delete_trip(uuid,text), public.delete_trip(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.delete_trip(uuid,text), public.delete_trip(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.pick_at_home_song(p_activity uuid,p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$ DECLARE a public.at_home_activities; BEGIN
 a:=trip_private.at_home_released(p_activity);
 IF a.kind NOT IN ('call_night','cook','build','passport') THEN RAISE EXCEPTION 'Pick a disc on an activity day'; END IF;
 IF NOT (trip_private.is_leader(a.trip_id) OR EXISTS (SELECT 1 FROM public.game_nights WHERE trip_id=a.trip_id AND host_id=auth.uid() AND starts_at::date=a.day_date)) THEN RAISE EXCEPTION 'Captain or host only'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.song_discs WHERE trip_id=a.trip_id AND user_id=p_user) THEN RAISE EXCEPTION 'That disc is no longer here'; END IF;
 INSERT INTO public.at_home_song_winners(activity_id,user_id,picked_by) VALUES(p_activity,p_user,auth.uid()) ON CONFLICT(activity_id) DO UPDATE SET user_id=excluded.user_id,picked_by=excluded.picked_by,updated_at=now();
END $fn$;
CREATE OR REPLACE FUNCTION public.pick_at_home_song(p_activity uuid,p_user uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $fn$ SELECT trip_private.pick_at_home_song(p_activity,p_user) $fn$;
REVOKE ALL ON FUNCTION trip_private.pick_at_home_song(uuid,uuid), public.pick_at_home_song(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.pick_at_home_song(uuid,uuid), public.pick_at_home_song(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.welcome_copy() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$ SELECT jsonb_build_object('founder_intro',founder_intro,'faq',welcome_faq) FROM public.app_settings WHERE id=true $fn$;
CREATE OR REPLACE FUNCTION trip_private.set_welcome_copy(p_intro text,p_faq jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$ BEGIN
 IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
 IF length(trim(p_intro)) NOT BETWEEN 10 AND 600 OR jsonb_typeof(p_faq)<>'array' OR jsonb_array_length(p_faq) NOT BETWEEN 5 AND 6 OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_faq) x WHERE length(trim(x->>'q')) NOT BETWEEN 4 AND 120 OR length(trim(x->>'a')) NOT BETWEEN 5 AND 500) THEN RAISE EXCEPTION 'Add a founder note and five or six questions with answers'; END IF;
 UPDATE public.app_settings SET founder_intro=trim(p_intro),welcome_faq=p_faq,updated_at=now() WHERE id=true;
END $fn$;
CREATE OR REPLACE FUNCTION public.set_welcome_copy(p_intro text,p_faq jsonb) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path TO 'public' AS $fn$ SELECT trip_private.set_welcome_copy(p_intro,p_faq) $fn$;
REVOKE ALL ON FUNCTION public.welcome_copy(),trip_private.set_welcome_copy(text,jsonb),public.set_welcome_copy(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.welcome_copy() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION trip_private.set_welcome_copy(text,jsonb),public.set_welcome_copy(text,jsonb) TO authenticated;