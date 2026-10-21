ALTER TABLE public.culture_experiences ADD COLUMN IF NOT EXISTS a2e_kind text, ADD COLUMN IF NOT EXISTS culture_layer text, ADD COLUMN IF NOT EXISTS repeat_layer boolean NOT NULL DEFAULT false;
ALTER TABLE public.culture_experiences ADD CONSTRAINT culture_a2e_kind_check CHECK (a2e_kind IS NULL OR a2e_kind IN ('explore','show','inspire'));
ALTER TABLE public.culture_experiences ADD CONSTRAINT culture_a2e_layer_check CHECK (culture_layer IS NULL OR culture_layer IN ('food','music','language','traditions','history','fashion','games','everyday','mixed'));
ALTER TABLE public.culture_experiences DROP CONSTRAINT culture_experiences_days_check;
ALTER TABLE public.culture_experiences ADD CONSTRAINT culture_experiences_days_check CHECK (days BETWEEN 1 AND 12 OR (a2e_kind='inspire' AND play_mode='solo' AND days>12 AND days<=3650));
ALTER TABLE public.culture_exp_days DROP CONSTRAINT culture_exp_days_day_number_check;
ALTER TABLE public.culture_exp_days ADD CONSTRAINT culture_exp_days_day_number_check CHECK (day_number BETWEEN 1 AND 3650);
CREATE TABLE public.culture_layer_stamps (experience_id uuid PRIMARY KEY REFERENCES public.culture_experiences(id) ON DELETE CASCADE, creator_id uuid NOT NULL, country text NOT NULL, culture_layer text NOT NULL, earned_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.culture_layer_stamps TO authenticated;
GRANT ALL ON public.culture_layer_stamps TO service_role;
ALTER TABLE public.culture_layer_stamps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator sees completed layers" ON public.culture_layer_stamps FOR SELECT TO authenticated USING (creator_id=auth.uid());
CREATE TRIGGER culture_layer_stamps_updated BEFORE UPDATE ON public.culture_layer_stamps FOR EACH ROW EXECUTE FUNCTION public.set_trip_updated_at();
CREATE UNIQUE INDEX culture_layer_unique_stamp ON public.culture_layer_stamps(creator_id,country,culture_layer);
CREATE OR REPLACE FUNCTION trip_private.create_culture_a2e(p_kind text,p_mode text,p_title text,p_country text,p_region text,p_city text,p_start date,p_days int,p_layer text,p_vibe text,p_types text[],p_prep int,p_finale text,p_place text,p_repeat boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_exp uuid; v_trip uuid; v_dest text; v_end date; v_tz text; v_code text; v_age int; v_mid date; v_final timestamptz; i int;
BEGIN
 IF auth.uid() IS NULL OR NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'Sign in to the private beta first'; END IF;
 v_age:=coalesce(trip_private.age_of(auth.uid()),0);
 IF v_age<13 THEN RAISE EXCEPTION 'Players must be at least 13'; END IF;
 IF p_kind NOT IN ('explore','show','inspire') OR (p_kind='inspire' AND p_mode NOT IN ('solo','group')) OR (p_kind='explore' AND p_mode IS DISTINCT FROM 'group') OR (p_kind='show' AND p_mode NOT IN ('solo','group')) THEN RAISE EXCEPTION 'Choose a valid way to play'; END IF;
 IF p_kind='inspire' AND p_layer IS NOT NULL OR p_kind<>'inspire' AND (p_layer NOT IN ('food','music','language','traditions','history','fashion','games','everyday','mixed') OR (p_layer='mixed' AND p_kind<>'explore')) THEN RAISE EXCEPTION 'Choose a culture layer'; END IF;
 IF upper(coalesce(p_country,'')) !~ '^[A-Z]{2}$' OR length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Choose a country and a name'; END IF;
 IF p_start IS NULL OR p_start<current_date OR p_start>current_date+365 OR p_days<1 OR p_days>3650 OR p_start+p_days-1>date '9999-12-31' THEN RAISE EXCEPTION 'Check the dates'; END IF;
 IF p_kind<>'inspire' AND p_days NOT BETWEEN 2 AND 7 THEN RAISE EXCEPTION 'From Home runs for 2–7 days'; END IF;
 IF p_prep NOT BETWEEN 0 AND 10 THEN RAISE EXCEPTION 'Choose up to ten prep days'; END IF;
 IF p_kind<>'inspire' AND p_prep<>0 THEN RAISE EXCEPTION 'Preparation is for Window Seat'; END IF;
 IF p_vibe NOT IN ('family','chill','party') OR (v_age<18 AND p_vibe<>'family') OR (v_age<21 AND p_vibe='party') THEN RAISE EXCEPTION 'Pick an age-appropriate vibe'; END IF;
 IF cardinality(coalesce(p_types,'{}'))>2 OR (SELECT count(DISTINCT x) FROM unnest(coalesce(p_types,'{}')) x)<>cardinality(coalesce(p_types,'{}')) OR EXISTS (SELECT 1 FROM unnest(coalesce(p_types,'{}')) x WHERE x NOT IN ('foodie','explorer','culture','chill','photographer','night_owl','shopper')) OR ('night_owl'=ANY(coalesce(p_types,'{}')) AND v_age<21) THEN RAISE EXCEPTION 'Pick up to two age-appropriate traveler types'; END IF;
 IF p_mode='group' AND v_age<21 THEN RAISE EXCEPTION 'Captains must be 21 or older'; END IF;
 IF p_mode='group' AND p_kind<>'inspire' AND (p_finale NOT IN ('two_nights','finale_only') OR (p_finale='two_nights' AND p_days<4) OR length(trim(coalesce(p_place,''))) NOT BETWEEN 2 AND 120) THEN RAISE EXCEPTION 'Choose an in-person finale place and format'; END IF;
 IF p_kind='show' AND NOT p_repeat AND EXISTS (SELECT 1 FROM public.culture_layer_stamps WHERE creator_id=auth.uid() AND country=upper(p_country) AND culture_layer=p_layer) THEN RAISE EXCEPTION 'You finished this layer. Choose Do it again to replay it.'; END IF;
 IF (SELECT count(*) FROM public.culture_experiences WHERE creator_id=auth.uid() AND created_at>now()-interval '1 day')>=10 THEN RAISE EXCEPTION 'Daily limit reached'; END IF;
 SELECT coalesce(nullif(time_zone,''),'UTC') INTO v_tz FROM public.profiles WHERE id=auth.uid(); v_tz:=coalesce(v_tz,'UTC');
 v_end:=p_start+p_days-1; v_dest:=coalesce(nullif(trim(p_city),''),nullif(trim(p_region),''),upper(p_country));
 IF p_mode='group' THEN
  FOR i IN 1..15 LOOP
   BEGIN
    v_code:=public.new_trip_code();
    INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,trip_timezone,join_code,kind,season_rule,season_scoring,vibe,finale_format,finale_place,finale_at,game_start)
    VALUES (left(trim(p_title),100),v_dest,p_start,v_end,v_tz,v_tz,v_code,CASE WHEN p_kind='inspire' THEN 'trip' ELSE 'at_home' END,'a2c',p_kind='inspire',p_vibe,CASE WHEN p_kind='inspire' THEN NULL WHEN p_finale='two_nights' THEN 'two_nights' ELSE 'finale' END,CASE WHEN p_kind='inspire' THEN NULL ELSE trim(p_place) END,CASE WHEN p_kind='inspire' THEN NULL ELSE (v_end+time '19:00') AT TIME ZONE v_tz END,greatest(current_date,p_start-7)) RETURNING id INTO v_trip;
    EXIT;
   EXCEPTION WHEN unique_violation THEN IF i=15 THEN RAISE; END IF;
   END;
  END LOOP;
  INSERT INTO public.trip_members(trip_id,user_id,role,status,approved_at) VALUES(v_trip,auth.uid(),'captain','approved',now());
  IF p_kind<>'inspire' THEN
   v_final:=(v_end+time '19:00') AT TIME ZONE v_tz;
   IF p_finale='two_nights' THEN v_mid:=p_start+(p_days/2)-1; INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_trip,1,(v_mid+time '19:00') AT TIME ZONE v_tz,auth.uid()); END IF;
   INSERT INTO public.game_nights(trip_id,week_number,starts_at,host_id) VALUES(v_trip,CASE WHEN p_finale='two_nights' THEN 2 ELSE 1 END,v_final,auth.uid());
  END IF;
 END IF;
 INSERT INTO public.culture_experiences(creator_id,track,trip_id,title,country,region,city,start_date,days,play_mode,vibe,traveler_types,prep_days,finale_format,a2e_kind,culture_layer,repeat_layer)
 VALUES(auth.uid(),CASE WHEN p_kind='inspire' THEN 'travel' ELSE 'home' END,v_trip,trim(p_title),upper(p_country),nullif(trim(p_region),''),nullif(trim(p_city),''),p_start,p_days,p_mode,p_vibe,CASE WHEN p_mode='solo' THEN coalesce(p_types,'{}') ELSE '{}' END,CASE WHEN p_kind='inspire' THEN p_prep ELSE NULL END,CASE WHEN p_mode='group' AND p_kind<>'inspire' THEN p_finale END,p_kind,p_layer,p_repeat) RETURNING id INTO v_exp;
 RETURN v_exp;
END $$;
REVOKE ALL ON FUNCTION trip_private.create_culture_a2e(text,text,text,text,text,text,date,int,text,text,text[],int,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.create_culture_a2e(text,text,text,text,text,text,date,int,text,text,text[],int,text,text,boolean) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.create_culture_a2e(p_kind text,p_mode text,p_title text,p_country text,p_region text,p_city text,p_start date,p_days int,p_layer text,p_vibe text,p_types text[],p_prep int,p_finale text,p_place text,p_repeat boolean DEFAULT false) RETURNS uuid LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.create_culture_a2e(p_kind,p_mode,p_title,p_country,p_region,p_city,p_start,p_days,p_layer,p_vibe,p_types,p_prep,p_finale,p_place,p_repeat) $$;
REVOKE ALL ON FUNCTION public.create_culture_a2e(text,text,text,text,text,text,date,int,text,text,text[],int,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_culture_a2e(text,text,text,text,text,text,date,int,text,text,text[],int,text,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION trip_private.culture_a2e_action(p_exp uuid,p_action text,p_cards jsonb DEFAULT '[]'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.culture_experiences; d jsonb; n int; v_saved int:=0;
BEGIN
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
 IF NOT FOUND OR e.creator_id IS DISTINCT FROM auth.uid() OR e.a2e_kind IS NULL THEN RAISE EXCEPTION 'Not your new experience'; END IF;
 IF p_action='save_days' THEN
  IF e.started_at IS NOT NULL THEN RAISE EXCEPTION 'Already started'; END IF;
  IF jsonb_typeof(p_cards)<>'array' OR jsonb_array_length(p_cards)>31 THEN RAISE EXCEPTION 'Save up to 31 days at a time'; END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(p_cards) LOOP
   n:=(d->>'day_number')::int;
   IF n NOT BETWEEN 1 AND e.days OR length(trim(coalesce(d->>'title',''))) NOT BETWEEN 1 AND 120 OR length(trim(coalesce(d->>'what_to_do',''))) NOT BETWEEN 1 AND 600 THEN RAISE EXCEPTION 'Check the day card'; END IF;
   INSERT INTO public.culture_exp_days(experience_id,day_number,title,what_to_do,backstory,keywords,points,source)
   VALUES(e.id,n,trim(d->>'title'),trim(d->>'what_to_do'),left(coalesce(d->>'backstory',''),600),ARRAY(SELECT left(x,60) FROM jsonb_array_elements_text(coalesce(d->'keywords','[]'::jsonb)) x LIMIT 4),greatest(0,least(50,coalesce((d->>'points')::int,10))),CASE WHEN d->>'source' IN ('pool','manual','ai') THEN d->>'source' ELSE 'pool' END)
   ON CONFLICT (experience_id,day_number) DO UPDATE SET title=excluded.title,what_to_do=excluded.what_to_do,backstory=excluded.backstory,keywords=excluded.keywords,points=excluded.points,source=excluded.source;
   v_saved:=v_saved+1;
  END LOOP;
  RETURN jsonb_build_object('saved',v_saved);
 ELSIF p_action='finish' THEN
  IF e.finished_at IS NOT NULL THEN RETURN '{}'::jsonb; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.culture_exp_days WHERE experience_id=p_exp AND done_at IS NOT NULL) THEN RAISE EXCEPTION 'Do at least one day first'; END IF;
  UPDATE public.culture_experiences SET finished_at=now(),updated_at=now() WHERE id=p_exp AND creator_id=auth.uid() AND finished_at IS NULL;
  IF e.a2e_kind='show' AND NOT EXISTS(SELECT 1 FROM public.culture_layer_stamps WHERE creator_id=auth.uid() AND country=e.country AND culture_layer=e.culture_layer) THEN
   INSERT INTO public.culture_layer_stamps(experience_id,creator_id,country,culture_layer) VALUES(e.id,auth.uid(),e.country,e.culture_layer) ON CONFLICT DO NOTHING;
  END IF;
  RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'Unknown action';
END $$;
REVOKE ALL ON FUNCTION trip_private.culture_a2e_action(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION trip_private.culture_a2e_action(uuid,text,jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.culture_a2e_action(p_exp uuid,p_action text,p_cards jsonb DEFAULT '[]'::jsonb) RETURNS jsonb LANGUAGE sql SET search_path=public AS $$ SELECT trip_private.culture_a2e_action(p_exp,p_action,p_cards) $$;
REVOKE ALL ON FUNCTION public.culture_a2e_action(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.culture_a2e_action(uuid,text,jsonb) TO authenticated;