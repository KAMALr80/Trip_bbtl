
ALTER TABLE public.bug_reports ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'bug';

CREATE TABLE public.culture_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  track text NOT NULL CHECK (track IN ('home','travel')),
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  country text NOT NULL, region text, city text,
  start_date date NOT NULL DEFAULT current_date,
  days int NOT NULL CHECK (days BETWEEN 1 AND 12),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','squad','public')),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 1500),
  started_at timestamptz, finished_at timestamptz, unlisted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.culture_experiences TO authenticated;
GRANT ALL ON public.culture_experiences TO service_role;
ALTER TABLE public.culture_experiences ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.culture_exp_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.culture_experiences(id) ON DELETE CASCADE,
  day_number int NOT NULL CHECK (day_number BETWEEN 1 AND 12),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  what_to_do text NOT NULL CHECK (char_length(what_to_do) <= 600),
  backstory text NOT NULL DEFAULT '' CHECK (char_length(backstory) <= 600),
  keywords text[] NOT NULL DEFAULT '{}',
  points int NOT NULL DEFAULT 10 CHECK (points BETWEEN 0 AND 50),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('pool','ai','manual')),
  done_at timestamptz, note text CHECK (note IS NULL OR char_length(note) <= 500),
  photos text[] NOT NULL DEFAULT '{}', with_users uuid[] NOT NULL DEFAULT '{}',
  review_stars int CHECK (review_stars IS NULL OR review_stars BETWEEN 1 AND 5),
  review_text text CHECK (review_text IS NULL OR char_length(review_text) <= 240),
  place text CHECK (place IS NULL OR char_length(place) <= 120),
  fact text CHECK (fact IS NULL OR char_length(fact) <= 200),
  ref_url text CHECK (ref_url IS NULL OR (char_length(ref_url) <= 500 AND ref_url ~ '^https://')),
  confirmed_by uuid, confirmed_at timestamptz,
  UNIQUE (experience_id, day_number)
);
GRANT SELECT ON public.culture_exp_days TO authenticated;
GRANT ALL ON public.culture_exp_days TO service_role;
ALTER TABLE public.culture_exp_days ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.culture_exp_likes (experience_id uuid NOT NULL REFERENCES public.culture_experiences(id) ON DELETE CASCADE, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (experience_id, user_id));
GRANT SELECT ON public.culture_exp_likes TO authenticated;
GRANT ALL ON public.culture_exp_likes TO service_role;
ALTER TABLE public.culture_exp_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own likes" ON public.culture_exp_likes FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.culture_exp_hidden (experience_id uuid NOT NULL REFERENCES public.culture_experiences(id) ON DELETE CASCADE, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (experience_id, user_id));
GRANT SELECT ON public.culture_exp_hidden TO authenticated;
GRANT ALL ON public.culture_exp_hidden TO service_role;
ALTER TABLE public.culture_exp_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own hidden" ON public.culture_exp_hidden FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION trip_private.can_view_culture(p_exp uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.culture_experiences e WHERE e.id=p_exp AND (
    e.creator_id=auth.uid()
    OR trip_private.is_app_admin()
    OR (e.visibility='squad' AND e.trip_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=e.trip_id AND m.user_id=auth.uid() AND m.status='approved'))
    OR (e.visibility='public' AND e.finished_at IS NOT NULL AND e.unlisted_at IS NULL AND trip_private.has_beta_access())
  )) $$;
REVOKE EXECUTE ON FUNCTION trip_private.can_view_culture(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.can_view_culture(uuid) TO authenticated, service_role;

CREATE POLICY "viewable experiences" ON public.culture_experiences FOR SELECT TO authenticated USING (trip_private.can_view_culture(id));
CREATE POLICY "viewable days" ON public.culture_exp_days FOR SELECT TO authenticated USING (trip_private.can_view_culture(experience_id));

CREATE OR REPLACE FUNCTION trip_private.culture_action(p_action text, p_exp uuid, p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid(); e public.culture_experiences; d jsonb; n int; v_id uuid; v_day public.culture_exp_days; v_photos text[]; v_with uuid[];
BEGIN
  IF uid IS NULL OR NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF p_action='create' THEN
    IF (SELECT count(*) FROM public.culture_experiences WHERE creator_id=uid AND created_at > now()-interval '1 day') >= 10 THEN RAISE EXCEPTION 'Daily limit reached'; END IF;
    IF p->>'track' NOT IN ('home','travel') THEN RAISE EXCEPTION 'Pick a track'; END IF;
    IF coalesce(p->>'country','')='' THEN RAISE EXCEPTION 'Pick a place'; END IF;
    IF nullif(p->>'trip_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=(p->>'trip_id')::uuid AND user_id=uid AND status='approved') THEN RAISE EXCEPTION 'Join this squad first'; END IF;
    INSERT INTO public.culture_experiences(creator_id,track,trip_id,title,country,region,city,start_date,days)
    VALUES (uid, p->>'track', nullif(p->>'trip_id','')::uuid, left(trim(p->>'title'),120), upper(p->>'country'), nullif(left(p->>'region',80),''), nullif(left(p->>'city',80),''), coalesce(nullif(p->>'start_date','')::date, current_date), greatest(1,least(12,coalesce((p->>'days')::int,3))))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id);
  END IF;

  SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Experience not found'; END IF;

  IF p_action='save_days' THEN
    IF e.creator_id<>uid THEN RAISE EXCEPTION 'Only the creator can edit'; END IF;
    IF e.finished_at IS NOT NULL THEN RAISE EXCEPTION 'This experience is finished'; END IF;
    IF jsonb_array_length(p->'days') > e.days THEN RAISE EXCEPTION 'Too many days'; END IF;
    FOR d IN SELECT * FROM jsonb_array_elements(p->'days') LOOP
      n := (d->>'day_number')::int;
      IF n < 1 OR n > e.days THEN RAISE EXCEPTION 'Bad day'; END IF;
      INSERT INTO public.culture_exp_days(experience_id,day_number,title,what_to_do,backstory,keywords,points,source)
      VALUES (e.id, n, left(trim(d->>'title'),120), left(coalesce(d->>'what_to_do',''),600), left(coalesce(d->>'backstory',''),600),
        (SELECT coalesce(array_agg(left(k,60)),'{}') FROM (SELECT jsonb_array_elements_text(coalesce(d->'keywords','[]'::jsonb)) k LIMIT 4) x),
        greatest(0,least(50,coalesce((d->>'points')::int,10))), CASE WHEN d->>'source' IN ('pool','ai','manual') THEN d->>'source' ELSE 'manual' END)
      ON CONFLICT (experience_id, day_number) DO UPDATE SET title=excluded.title, what_to_do=excluded.what_to_do, backstory=excluded.backstory, keywords=excluded.keywords, points=excluded.points, source=excluded.source;
    END LOOP;
    UPDATE public.culture_experiences SET updated_at=now() WHERE id=e.id;
    RETURN '{}'::jsonb;
  ELSIF p_action='start' THEN
    IF e.creator_id<>uid THEN RAISE EXCEPTION 'Only the creator'; END IF;
    UPDATE public.culture_experiences SET started_at=coalesce(started_at,now()), updated_at=now() WHERE id=e.id; RETURN '{}'::jsonb;
  ELSIF p_action='log_day' THEN
    IF e.creator_id<>uid THEN RAISE EXCEPTION 'Only the creator can log days'; END IF;
    IF e.finished_at IS NOT NULL THEN RAISE EXCEPTION 'This experience is finished'; END IF;
    SELECT coalesce(array_agg(x),'{}') INTO v_photos FROM (SELECT jsonb_array_elements_text(coalesce(p->'photos','[]'::jsonb)) x LIMIT 3) s;
    IF EXISTS (SELECT 1 FROM unnest(v_photos) ph WHERE split_part(ph,'/',1)<>e.id::text OR split_part(ph,'/',2)<>uid::text) THEN RAISE EXCEPTION 'Bad photo'; END IF;
    SELECT coalesce(array_agg(x::uuid),'{}') INTO v_with FROM (SELECT jsonb_array_elements_text(coalesce(p->'with_users','[]'::jsonb)) x LIMIT 12) s;
    IF EXISTS (SELECT 1 FROM unnest(v_with) w WHERE e.trip_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=e.trip_id AND m.user_id=w AND m.status='approved')) THEN RAISE EXCEPTION 'Only squadmates can be tagged'; END IF;
    UPDATE public.culture_exp_days SET done_at=coalesce(done_at,now()), note=nullif(left(p->>'note',500),''), photos=v_photos, with_users=v_with,
      review_stars=nullif(p->>'review_stars','')::int, review_text=nullif(left(p->>'review_text',240),''), place=nullif(left(p->>'place',120),''),
      fact=nullif(left(p->>'fact',200),''), ref_url=CASE WHEN p->>'ref_url' ~ '^https://' THEN left(p->>'ref_url',500) END
    WHERE experience_id=e.id AND day_number=(p->>'day_number')::int RETURNING * INTO v_day;
    IF NOT FOUND THEN RAISE EXCEPTION 'Day not found'; END IF;
    RETURN '{}'::jsonb;
  ELSIF p_action='confirm_day' THEN
    SELECT * INTO v_day FROM public.culture_exp_days WHERE experience_id=e.id AND day_number=(p->>'day_number')::int FOR UPDATE;
    IF NOT FOUND OR v_day.done_at IS NULL THEN RAISE EXCEPTION 'Log this day first'; END IF;
    IF NOT (e.creator_id=uid OR (e.trip_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=e.trip_id AND m.user_id=uid AND m.status='approved'))) THEN RAISE EXCEPTION 'Only you or your squad can confirm'; END IF;
    IF e.creator_id<>uid AND e.track<>'travel' THEN RAISE EXCEPTION 'Only travel cards take squad confirms'; END IF;
    UPDATE public.culture_exp_days SET confirmed_by=uid, confirmed_at=now() WHERE id=v_day.id; RETURN '{}'::jsonb;
  ELSIF p_action='set_summary' THEN
    IF e.creator_id<>uid THEN RAISE EXCEPTION 'Only the creator'; END IF;
    UPDATE public.culture_experiences SET summary=nullif(left(p->>'summary',1500),''), updated_at=now() WHERE id=e.id; RETURN '{}'::jsonb;
  ELSIF p_action='finish' THEN
    IF e.creator_id<>uid THEN RAISE EXCEPTION 'Only the creator'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.culture_exp_days WHERE experience_id=e.id AND done_at IS NOT NULL) THEN RAISE EXCEPTION 'Do at least one day first'; END IF;
    UPDATE public.culture_experiences SET finished_at=coalesce(finished_at,now()), updated_at=now() WHERE id=e.id; RETURN '{}'::jsonb;
  ELSIF p_action='visibility' THEN
    IF e.creator_id<>uid THEN RAISE EXCEPTION 'Only the creator'; END IF;
    IF p->>'visibility' NOT IN ('private','squad','public') THEN RAISE EXCEPTION 'Bad choice'; END IF;
    IF p->>'visibility'='squad' AND e.trip_id IS NULL THEN RAISE EXCEPTION 'Link a trip to share with a squad'; END IF;
    IF p->>'visibility'='public' AND coalesce(trip_private.age_of(uid),0) < 18 THEN RAISE EXCEPTION 'Sharing with all TripJunkies is for 18+'; END IF;
    UPDATE public.culture_experiences SET visibility=p->>'visibility', updated_at=now() WHERE id=e.id; RETURN '{}'::jsonb;
  ELSIF p_action IN ('like','unlike') THEN
    IF NOT trip_private.can_view_culture(e.id) OR e.finished_at IS NULL OR e.visibility='private' THEN RAISE EXCEPTION 'Not shared'; END IF;
    IF e.creator_id=uid THEN RAISE EXCEPTION 'No self-likes'; END IF;
    IF p_action='like' THEN INSERT INTO public.culture_exp_likes(experience_id,user_id) VALUES (e.id,uid) ON CONFLICT DO NOTHING;
    ELSE DELETE FROM public.culture_exp_likes WHERE experience_id=e.id AND user_id=uid; END IF;
    RETURN jsonb_build_object('likes',(SELECT count(*) FROM public.culture_exp_likes WHERE experience_id=e.id));
  ELSIF p_action='hide' THEN
    INSERT INTO public.culture_exp_hidden(experience_id,user_id) VALUES (e.id,uid) ON CONFLICT DO NOTHING; RETURN '{}'::jsonb;
  ELSIF p_action='report' THEN
    IF NOT trip_private.can_view_culture(e.id) THEN RAISE EXCEPTION 'Not found'; END IF;
    IF (SELECT count(*) FROM public.bug_reports WHERE user_id=uid AND kind='experience_report' AND created_at>now()-interval '1 day')>=10 THEN RAISE EXCEPTION 'Daily limit reached'; END IF;
    INSERT INTO public.bug_reports(user_id,page,description,kind) VALUES (uid,'experience:'||e.id,left(coalesce(nullif(p->>'reason',''),'Reported experience'),1000),'experience_report');
    INSERT INTO public.culture_exp_hidden(experience_id,user_id) VALUES (e.id,uid) ON CONFLICT DO NOTHING; RETURN '{}'::jsonb;
  ELSIF p_action='unlist' THEN
    IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
    UPDATE public.culture_experiences SET unlisted_at=CASE WHEN unlisted_at IS NULL THEN now() END WHERE id=e.id; RETURN '{}'::jsonb;
  ELSIF p_action='delete' THEN
    IF e.creator_id<>uid THEN RAISE EXCEPTION 'Only the creator'; END IF;
    DELETE FROM public.culture_experiences WHERE id=e.id; RETURN '{}'::jsonb;
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $$;
REVOKE EXECUTE ON FUNCTION trip_private.culture_action(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_action(text,uuid,jsonb) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.culture_action(p_action text, p_exp uuid DEFAULT NULL, p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.culture_action(p_action,p_exp,p) $$;
REVOKE EXECUTE ON FUNCTION public.culture_action(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.culture_action(text,uuid,jsonb) TO authenticated;

-- Shared feed (creator game name + avatar only; city level; likes server-counted; hidden removed per viewer)
CREATE OR REPLACE FUNCTION trip_private.culture_shared(p_scope text) RETURNS TABLE(id uuid, track text, title text, country text, region text, city text, days int, summary text, visibility text, creator_name text, avatar_style text, avatar_seed text, likes int, liked boolean, mine boolean, finished_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.id, e.track, e.title, e.country, e.region, e.city, e.days, e.summary, e.visibility,
    coalesce(pp.game_name,'Traveler'), coalesce(pp.avatar_style,'buddy'), coalesce(pp.avatar_seed,''),
    (SELECT count(*)::int FROM public.culture_exp_likes l WHERE l.experience_id=e.id),
    EXISTS (SELECT 1 FROM public.culture_exp_likes l WHERE l.experience_id=e.id AND l.user_id=auth.uid()),
    e.creator_id=auth.uid(), e.finished_at
  FROM public.culture_experiences e LEFT JOIN public.player_profiles pp ON pp.user_id=e.creator_id
  WHERE auth.uid() IS NOT NULL AND e.finished_at IS NOT NULL AND e.unlisted_at IS NULL AND e.visibility<>'private'
    AND trip_private.can_view_culture(e.id)
    AND (p_scope='all' OR (p_scope='public' AND e.visibility='public') OR (p_scope='squad' AND e.visibility='squad'))
    AND NOT EXISTS (SELECT 1 FROM public.culture_exp_hidden h WHERE h.experience_id=e.id AND h.user_id=auth.uid())
  ORDER BY e.finished_at DESC LIMIT 100 $$;
REVOKE EXECUTE ON FUNCTION trip_private.culture_shared(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_shared(text) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.culture_shared(p_scope text DEFAULT 'all') RETURNS TABLE(id uuid, track text, title text, country text, region text, city text, days int, summary text, visibility text, creator_name text, avatar_style text, avatar_seed text, likes int, liked boolean, mine boolean, finished_at timestamptz) LANGUAGE sql SET search_path=public AS $$ SELECT * FROM trip_private.culture_shared(p_scope) $$;
REVOKE EXECUTE ON FUNCTION public.culture_shared(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.culture_shared(text) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.culture_badges(p_user uuid) RETURNS TABLE(track text, earned_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT e.track, min(e.finished_at) FROM public.culture_experiences e WHERE e.creator_id=p_user AND p_user=auth.uid() AND e.finished_at IS NOT NULL GROUP BY e.track $$;
REVOKE EXECUTE ON FUNCTION trip_private.culture_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_badges(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.culture_badges() RETURNS TABLE(track text, earned_at timestamptz) LANGUAGE sql SET search_path=public AS $$ SELECT * FROM trip_private.culture_badges(auth.uid()) $$;
REVOKE EXECUTE ON FUNCTION public.culture_badges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.culture_badges() TO authenticated;

-- Photos: private bucket culture-photos, path {experience_id}/{user_id}/file
CREATE POLICY "culture photos read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='culture-photos' AND split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' AND trip_private.can_view_culture(split_part(name,'/',1)::uuid));
CREATE POLICY "culture photos upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='culture-photos' AND split_part(name,'/',2)=auth.uid()::text AND lower(name) ~ '\.(jpe?g|png|webp)$' AND split_part(name,'/',1) ~ '^[0-9a-f-]{36}$' AND EXISTS (SELECT 1 FROM public.culture_experiences e WHERE e.id=split_part(name,'/',1)::uuid AND e.creator_id=auth.uid() AND e.finished_at IS NULL));
CREATE POLICY "culture photos delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='culture-photos' AND split_part(name,'/',2)=auth.uid()::text);
