ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS time_zone text, ADD COLUMN IF NOT EXISTS time_zone_manual boolean NOT NULL DEFAULT false;

CREATE TABLE public.content_seen (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('card','qotw','bingo','quest','mission')),
  item_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, kind, item_key)
);
GRANT ALL ON public.content_seen TO service_role;
ALTER TABLE public.content_seen ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.content_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('qotw','bingo','quest','mission')),
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, kind, text)
);
GRANT ALL ON public.content_variants TO service_role;
ALTER TABLE public.content_variants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.content_topups (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  kind text NOT NULL,
  last_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, kind)
);
GRANT ALL ON public.content_topups TO service_role;
ALTER TABLE public.content_topups ENABLE ROW LEVEL SECURITY;

-- Anonymous: no user or trip column, aggregated by item only.
CREATE TABLE public.content_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('card','qotw','bingo','quest','mission')),
  item_key text NOT NULL,
  item_text text NOT NULL,
  vote smallint NOT NULL CHECK (vote IN (-1,1)),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.content_feedback TO service_role;
ALTER TABLE public.content_feedback ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION trip_private.captain_trip_ids(p_trip uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT o.trip_id FROM public.trip_members c JOIN public.trip_members o ON o.user_id=c.user_id AND o.role='captain' AND o.trip_id<>p_trip
  WHERE c.trip_id=p_trip AND c.role='captain'
$$;
REVOKE EXECUTE ON FUNCTION trip_private.captain_trip_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.captain_trip_ids(uuid) TO service_role;

CREATE OR REPLACE FUNCTION trip_private.draw_game_card(p_trip uuid, p_category text)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v_id bigint; v_game integer; v_category text; BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF p_category='spicy' AND NOT trip_private.is_approved_adult(p_trip,auth.uid()) THEN RAISE EXCEPTION '21+ approval required'; END IF;
IF p_category IN ('travel','food','childhood','deep','spicy') THEN
 SELECT n.game_number,f.category INTO v_game,v_category FROM public.game_night_flow f JOIN public.game_nights n ON n.trip_id=f.trip_id AND n.week_number=f.week_number WHERE f.trip_id=p_trip AND f.phase='cards' AND n.starts_at<=clock_timestamp()+interval '12 hours' AND n.starts_at>=clock_timestamp()-interval '12 hours' ORDER BY n.starts_at DESC LIMIT 1;
 IF v_game IS NULL OR v_category IS DISTINCT FROM p_category THEN RAISE EXCEPTION 'Draw from tonight''s category during card rounds'; END IF;
 -- Unseen game cards first, then unseen same-category backups, then anything; random within each group.
 SELECT c.id INTO v_id FROM public.game_cards c
  WHERE (c.category=p_category AND c.game_number=v_game AND (c.trip_id IS NULL OR c.trip_id=p_trip))
     OR (c.game_number IS NULL AND c.trip_id IS NULL AND c.category IN (p_category, CASE WHEN p_category='spicy' THEN 'spicy' ELSE 'get-to-know' END))
  ORDER BY EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='card' AND s.item_key=c.id::text),
           (c.game_number IS NULL),
           EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id IN (SELECT trip_private.captain_trip_ids(p_trip)) AND s.kind='card' AND s.item_key=c.id::text),
           random() LIMIT 1;
ELSE
 SELECT c.id INTO v_id FROM public.game_cards c WHERE c.category=p_category AND c.game_number IS NULL AND (c.trip_id IS NULL OR c.trip_id=p_trip)
  ORDER BY EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='card' AND s.item_key=c.id::text),
           EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id IN (SELECT trip_private.captain_trip_ids(p_trip)) AND s.kind='card' AND s.item_key=c.id::text),
           random() LIMIT 1;
END IF;
IF v_id IS NULL THEN RAISE EXCEPTION 'No cards in this category'; END IF;
INSERT INTO public.content_seen(trip_id,kind,item_key) VALUES (p_trip,'card',v_id::text) ON CONFLICT DO NOTHING;
INSERT INTO public.trip_play_state(trip_id,draw_card_id,draw_category,draw_at) VALUES(p_trip,v_id,p_category,clock_timestamp()) ON CONFLICT(trip_id) DO UPDATE SET draw_card_id=EXCLUDED.draw_card_id,draw_category=EXCLUDED.draw_category,draw_at=EXCLUDED.draw_at;
RETURN v_id; END $function$;

CREATE OR REPLACE FUNCTION trip_private.pick_weekly_prompt(p_trip uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE v text; v_spicy_ok boolean; BEGIN
v_spicy_ok := (SELECT vibe FROM public.trips WHERE id=p_trip)='party'
  AND NOT EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.status='approved' AND coalesce(trip_private.age_of(m.user_id),0) < 21);
SELECT x.prompt INTO v FROM (
  SELECT p.prompt FROM public.weekly_question_pool p WHERE NOT p.spicy OR v_spicy_ok
  UNION SELECT cv.text FROM public.content_variants cv WHERE cv.trip_id=p_trip AND cv.kind='qotw'
) x
ORDER BY (EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id=p_trip AND s.kind='qotw' AND s.item_key=md5(x.prompt))
          OR x.prompt IN (SELECT prompt FROM public.weekly_questions WHERE trip_id=p_trip)),
         EXISTS(SELECT 1 FROM public.content_seen s WHERE s.trip_id IN (SELECT trip_private.captain_trip_ids(p_trip)) AND s.kind='qotw' AND s.item_key=md5(x.prompt)),
         random() LIMIT 1;
IF v IS NOT NULL THEN INSERT INTO public.content_seen(trip_id,kind,item_key) VALUES (p_trip,'qotw',md5(v)) ON CONFLICT DO NOTHING; END IF;
RETURN v; END $function$;

-- Backfill: prompts and cards already used count as seen.
INSERT INTO public.content_seen(trip_id,kind,item_key) SELECT DISTINCT trip_id,'qotw',md5(prompt) FROM public.weekly_questions WHERE source<>'custom' AND prompt IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.content_seen(trip_id,kind,item_key) SELECT trip_id,'card',draw_card_id::text FROM public.trip_play_state WHERE draw_card_id IS NOT NULL ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION trip_private.rate_content(p_trip uuid, p_kind text, p_key text, p_text text, p_vote integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
IF NOT trip_private.is_trip_member(p_trip,auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
IF p_vote NOT IN (-1,1) OR p_kind NOT IN ('card','qotw','bingo','quest','mission') THEN RAISE EXCEPTION 'Invalid rating'; END IF;
INSERT INTO public.content_feedback(kind,item_key,item_text,vote) VALUES (p_kind,left(p_key,64),left(p_text,300),p_vote);
END $$;
REVOKE EXECUTE ON FUNCTION trip_private.rate_content(uuid,text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.rate_content(uuid,text,text,text,integer) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.rate_content(p_trip uuid, p_kind text, p_key text, p_text text, p_vote integer) RETURNS void
LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.rate_content(p_trip,p_kind,p_key,p_text,p_vote) $$;
REVOKE EXECUTE ON FUNCTION public.rate_content(uuid,text,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_content(uuid,text,text,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION trip_private.content_feedback_summary() RETURNS TABLE(kind text, item_text text, ups integer, downs integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN
IF NOT trip_private.is_app_admin() THEN RAISE EXCEPTION 'Founder only'; END IF;
RETURN QUERY SELECT f.kind, max(f.item_text), count(*) FILTER (WHERE f.vote=1)::int, count(*) FILTER (WHERE f.vote=-1)::int
  FROM public.content_feedback f GROUP BY f.kind, f.item_key ORDER BY count(*) DESC LIMIT 200;
END $$;
REVOKE EXECUTE ON FUNCTION trip_private.content_feedback_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.content_feedback_summary() TO authenticated;
CREATE OR REPLACE FUNCTION public.content_feedback_summary() RETURNS TABLE(kind text, item_text text, ups integer, downs integer)
LANGUAGE sql SET search_path TO 'public' AS $$ SELECT * FROM trip_private.content_feedback_summary() $$;
REVOKE EXECUTE ON FUNCTION public.content_feedback_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_feedback_summary() TO authenticated;