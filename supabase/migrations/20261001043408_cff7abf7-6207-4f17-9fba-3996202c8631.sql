CREATE TABLE public.trips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100), destination text NOT NULL CHECK (length(trim(destination)) BETWEEN 1 AND 120), start_date date NOT NULL, end_date date NOT NULL, home_timezone text NOT NULL CHECK (length(home_timezone) BETWEEN 1 AND 100), join_code text NOT NULL UNIQUE CHECK (join_code ~ '^[A-Z]{6}$'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (end_date >= start_date)
);
GRANT SELECT ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.trip_members (
 trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, user_id uuid NOT NULL, role text NOT NULL DEFAULT 'player' CHECK (role IN ('captain','co_captain','player')), joined_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (trip_id, user_id)
);
GRANT SELECT ON public.trip_members TO authenticated;
GRANT ALL ON public.trip_members TO service_role;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX one_captain_per_trip ON public.trip_members(trip_id) WHERE role = 'captain';
CREATE UNIQUE INDEX one_co_captain_per_trip ON public.trip_members(trip_id) WHERE role = 'co_captain';
CREATE INDEX trip_members_user_idx ON public.trip_members(user_id);
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = p_trip AND user_id = p_user) $$;
REVOKE ALL ON FUNCTION public.is_trip_member(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_trip_member(uuid,uuid) TO authenticated;
CREATE POLICY "Members view their trips" ON public.trips FOR SELECT TO authenticated USING (public.is_trip_member(id, auth.uid()));
CREATE POLICY "Members view their squad" ON public.trip_members FOR SELECT TO authenticated USING (public.is_trip_member(trip_id, auth.uid()));
CREATE OR REPLACE FUNCTION public.set_trip_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER set_trip_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE TRIGGER set_trip_member_updated_at BEFORE UPDATE ON public.trip_members FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE OR REPLACE FUNCTION public.new_trip_code() RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$ DECLARE bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex'); alphabet text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; code text := ''; i integer; BEGIN FOR i IN 0..5 LOOP code := code || substr(alphabet, get_byte(bytes, i) % 26 + 1, 1); END LOOP; RETURN code; END $$;
REVOKE ALL ON FUNCTION public.new_trip_code() FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.create_trip(p_name text, p_destination text, p_start_date date, p_end_date date, p_home_timezone text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE trip_id uuid; attempt int; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100 OR length(trim(coalesce(p_destination,''))) NOT BETWEEN 1 AND 120 OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date OR length(trim(coalesce(p_home_timezone,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Check your trip details'; END IF;
 FOR attempt IN 1..15 LOOP
  BEGIN
   INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,join_code) VALUES (trim(p_name),trim(p_destination),p_start_date,p_end_date,trim(p_home_timezone),public.new_trip_code()) RETURNING id INTO trip_id;
   EXIT;
  EXCEPTION WHEN unique_violation THEN IF attempt = 15 THEN RAISE; END IF;
  END;
 END LOOP;
 INSERT INTO public.trip_members(trip_id,user_id,role) VALUES(trip_id,auth.uid(),'captain');
 RETURN trip_id;
END $$;
REVOKE ALL ON FUNCTION public.create_trip(text,text,date,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_trip(text,text,date,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.join_trip(p_code text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE t public.trips%ROWTYPE; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 SELECT * INTO t FROM public.trips WHERE join_code = upper(trim(coalesce(p_code,''))) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'That invite code was not found'; END IF;
 IF EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id = t.id AND user_id = auth.uid()) THEN RETURN t.id; END IF;
 IF (SELECT count(*) FROM public.trip_members WHERE trip_id = t.id) >= 30 THEN RAISE EXCEPTION 'This trip is full'; END IF;
 INSERT INTO public.trip_members(trip_id,user_id) VALUES(t.id,auth.uid());
 RETURN t.id;
END $$;
REVOKE ALL ON FUNCTION public.join_trip(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_trip(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.edit_trip(p_trip uuid,p_name text,p_destination text,p_start_date date,p_end_date date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role IN ('captain','co_captain')) THEN RAISE EXCEPTION 'Only trip leaders can edit details'; END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100 OR length(trim(coalesce(p_destination,''))) NOT BETWEEN 1 AND 120 OR p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN RAISE EXCEPTION 'Check your trip details'; END IF;
 UPDATE public.trips SET name=trim(p_name),destination=trim(p_destination),start_date=p_start_date,end_date=p_end_date WHERE id=p_trip;
END $$;
REVOKE ALL ON FUNCTION public.edit_trip(uuid,text,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_trip(uuid,text,text,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.manage_trip_member(p_trip uuid,p_user uuid,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE actor_role text; target_role text; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT role INTO actor_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid();
 SELECT role INTO target_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user;
 IF actor_role NOT IN ('captain','co_captain') OR target_role IS NULL OR p_user=auth.uid() THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF target_role='captain' THEN RAISE EXCEPTION 'The Captain cannot be removed or replaced here'; END IF;
 IF p_action='promote' THEN
  IF target_role='co_captain' THEN RETURN; END IF;
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND role='co_captain';
  UPDATE public.trip_members SET role='co_captain' WHERE trip_id=p_trip AND user_id=p_user;
 ELSIF p_action='remove' THEN
  DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=p_user;
 ELSIF p_action='pass_crown' AND actor_role='captain' THEN
  UPDATE public.trip_members SET role='player' WHERE trip_id=p_trip AND user_id=auth.uid();
  UPDATE public.trip_members SET role='captain' WHERE trip_id=p_trip AND user_id=p_user;
 ELSE RAISE EXCEPTION 'Not allowed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.manage_trip_member(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_trip_member(uuid,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.reset_trip_code(p_trip uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE new_code text; attempt int; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role IN ('captain','co_captain')) THEN RAISE EXCEPTION 'Only trip leaders can reset the invite'; END IF;
 FOR attempt IN 1..15 LOOP
  BEGIN
   new_code := public.new_trip_code();
   UPDATE public.trips SET join_code=new_code WHERE id=p_trip AND join_code<>new_code;
   IF FOUND THEN RETURN new_code; END IF;
  EXCEPTION WHEN unique_violation THEN IF attempt=15 THEN RAISE; END IF;
  END;
 END LOOP;
 RAISE EXCEPTION 'Could not reset the code';
END $$;
REVOKE ALL ON FUNCTION public.reset_trip_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_trip_code(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.leave_trip(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE member_role text; BEGIN
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT role INTO member_role FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid();
 IF member_role IS NULL THEN RAISE EXCEPTION 'Not a member'; END IF;
 IF member_role='captain' AND (SELECT count(*) FROM public.trip_members WHERE trip_id=p_trip)>1 THEN RAISE EXCEPTION 'Pass the crown before leaving'; END IF;
 IF member_role='captain' THEN DELETE FROM public.trips WHERE id=p_trip;
 ELSE DELETE FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid(); END IF;
END $$;
REVOKE ALL ON FUNCTION public.leave_trip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_trip(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.trip_roster(p_trip uuid) RETURNS TABLE(user_id uuid, role text, display_name text, avatar_url text, joined_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF NOT public.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not a member'; END IF;
 RETURN QUERY SELECT m.user_id,m.role,coalesce(p.display_name,'Squad member'),p.avatar_url,m.joined_at FROM public.trip_members m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE m.trip_id=p_trip ORDER BY CASE m.role WHEN 'captain' THEN 0 WHEN 'co_captain' THEN 1 ELSE 2 END,m.joined_at;
END $$;
REVOKE ALL ON FUNCTION public.trip_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trip_roster(uuid) TO authenticated;