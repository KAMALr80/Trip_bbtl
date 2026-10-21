ALTER TABLE public.culture_experiences
  ADD COLUMN IF NOT EXISTS play_mode text NOT NULL DEFAULT 'group' CHECK (play_mode IN ('group','solo')),
  ADD COLUMN IF NOT EXISTS traveler_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vibe text CHECK (vibe IS NULL OR vibe IN ('family','chill','party'));

ALTER TABLE public.security_missions ADD COLUMN IF NOT EXISTS traveler_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.security_missions DROP CONSTRAINT IF EXISTS security_missions_kind_check;
ALTER TABLE public.security_missions ADD CONSTRAINT security_missions_kind_check CHECK (kind IN ('trip','home','checkin','solo'));

INSERT INTO public.security_missions(kind,category,title,text,backstory,keywords,presentation_tag,insight,budget_note,traveler_tags) VALUES
('solo','food','The breakfast nobody photographs','Find the most ordinary breakfast people in {destination} actually eat on a weekday. Photograph your plate and write what surprised you.','Tourist menus show the festive dishes; everyday breakfasts tell you how a city starts work.',ARRAY['typical weekday breakfast {destination}','street breakfast {destination}'],'solo_guide','Breakfast habits follow work hours, climate and what grows nearby — it is economics on a plate.','Under $5 at most stalls','{foodie,explorer}'),
('solo','language','Three words that open doors','Learn three polite phrases in the local language and use each one for real today. Write down the reaction each one got.','A greeting in someone''s own language changes the tone of almost any exchange.',ARRAY['basic phrases {destination}','polite greetings {destination} language'],'solo_guide','Politeness words reveal what a culture values most — respect for age, time or hospitality.','Free','{culture,explorer,chill}'),
('solo','language','The sign you couldn''t read','Photograph a public sign you can''t read, then work out what it says. Write the translation and why it''s there.','Signs are free lessons in grammar, rules and humor.',ARRAY['common signs {destination}','{destination} script basics'],'solo_guide','Public signs show what a city worries about — from queues to quiet hours.','Free','{explorer,photographer,culture}'),
('solo','language','Name it like a local','Find out what locals call one food, place or object differently from the official name. Photograph it and tell the story behind the nickname.','Nicknames carry history that guidebooks leave out.',ARRAY['local slang {destination}','nickname {destination} landmark'],'solo_guide','Nicknames often come from old trades, jokes or events that the official name erased.','Free','{culture,foodie,explorer}'),
('solo','history','A wall that remembers','Find a building, plaque or street name in {destination} tied to a historical event. Photograph it and write the event in two sentences.','Cities keep their memory in stone, paint and street names.',ARRAY['historic plaque {destination}','street names history {destination}'],'solo_guide','Street names change when history changes — renaming is how a country rewrites its story.','Free','{culture,explorer,photographer}'),
('solo','money','What a dollar buys here','Spend the local equivalent of about one US dollar on the best thing you can find. Photograph it and compare it with home.','Small purchases explain prices, wages and daily life faster than any chart.',ARRAY['cost of living {destination}','cheap local snacks {destination}'],'solo_guide','Economists use cheap everyday items to compare what money is really worth between countries.','About $1','{shopper,foodie,explorer}'),
('solo','business','The tiny business that works','Spot a one-person business — a stall, cart or repair stand. Photograph the setup (not the person unless they agree) and figure out how it makes money.','Small vendors run on clever, low-cost systems.',ARRAY['street vendors {destination}','informal economy {destination}'],'solo_guide','Street trade is a huge share of jobs in many economies — tiny margins, fast turnover.','Free','{shopper,explorer,foodie}'),
('solo','materials','Made from what''s around','Find a craft or everyday object made from a local material (wood, clay, fiber, stone). Photograph it and explain why that material.','Crafts grow from what the land provides.',ARRAY['traditional crafts {destination}','local materials {destination} craft'],'solo_guide','Materials follow geography: bamboo in humid places, stone where wood is scarce.','Free to look, souvenirs under $15','{shopper,culture,photographer}'),
('solo','music','The sound of the street','Record 10 seconds of a public sound unique to {destination} (no faces, no conversations) and photograph where you heard it. Describe what it is.','Every city has a soundtrack — bells, calls, engines, birds.',ARRAY['traditional music {destination}','city sounds {destination}'],'solo_guide','Sounds are cultural signals: calls to market, temple bells and traffic rules you can hear.','Free','{explorer,chill,photographer}'),
('solo','music','A song from here','Find one song by an artist from this country, listen to it somewhere meaningful and photograph that spot. Write what the lyrics or rhythm are about.','Music is a shortcut to how people feel about home.',ARRAY['famous musicians {destination}','popular songs {destination}'],'solo_guide','Popular music often carries regional instruments and rhythms into modern charts.','Free','{chill,culture,night_owl}'),
('solo','film','Scene from a film','Find a place in {destination} that appears in, or feels like, a well-known film or show from or about this country. Recreate the shot and say which scene.','Film shapes how the world imagines a place — sometimes accurately, sometimes not.',ARRAY['films set in {destination}','famous directors {destination}'],'solo_guide','Film tourism can transform a neighborhood''s economy within a few years.','Free','{photographer,culture,explorer}'),
('solo','sports','The local game','Find out which sport or game people here really play or watch. Watch a few minutes (in person or on a screen in a café) and photograph the setting.','Sports reveal community, rivalry and pride.',ARRAY['popular sports {destination}','traditional games {destination}'],'solo_guide','Many traditional games began as training for work, hunting or festivals.','Free','{explorer,night_owl,chill}'),
('solo','traditions','The everyday ritual','Notice a small ritual locals repeat — an offering, a gesture, how they greet or pay. Photograph the objects involved (not people without asking) and explain it respectfully.','Daily rituals are quiet cultural facts hiding in plain sight.',ARRAY['customs {destination}','etiquette {destination}'],'solo_guide','Rituals often blend old beliefs with modern life, and their meaning shifts across generations.','Free','{culture,chill}'),
('solo','etiquette','The rule nobody told you','Find one etiquette rule visitors often miss here — shoes, queues, tipping, chopsticks, hands. Show where you saw it and how you followed it.','Knowing the unwritten rules is the fastest way to be welcomed.',ARRAY['etiquette tips {destination}','cultural do and dont {destination}'],'solo_guide','Etiquette usually protects something practical — hygiene, time or respect for elders.','Free','{culture,explorer,chill}'),
('solo','geography','Why the city sits here','Find a viewpoint, river or hill and work out why {destination} grew right there. Photograph the view and explain the reason.','Cities are where trade, water and defense meet.',ARRAY['history of {destination} founding','geography {destination}'],'solo_guide','Most old cities sit on a river crossing, a harbor or a trade route.','Free','{explorer,photographer,chill}'),
('solo','landmarks','The landmark from the side','Visit a world-famous landmark in today''s city and photograph it from an angle nobody uses. Write one detail most visitors walk past.','The famous view hides the interesting details.',ARRAY['{destination} landmark history','hidden details {destination} landmark'],'solo_guide','Builders hid symbols, repairs and signatures that tell the landmark''s real story.','Free unless the site charges entry','{photographer,culture,explorer}'),
('solo','details','Look down','Spend 20 minutes noticing only what''s underfoot — tiles, drains, paving, markings. Photograph the best one and explain it.','Overlooked details show how a city is built and maintained.',ARRAY['manhole covers {destination}','street tiles {destination}'],'solo_guide','Utility covers and paving patterns are often designed with local symbols.','Free','{photographer,explorer,chill}'),
('solo','food','The market color test','Walk a fresh market and photograph one fruit, spice or vegetable you''ve never seen. Find out its name and how locals use it.','Markets are living encyclopedias of a region''s food.',ARRAY['local fruits {destination}','market guide {destination}'],'solo_guide','Market produce maps the climate — what grows here and what is imported.','Under $5','{foodie,shopper,photographer}'),
('solo','food','The dish with a story','Order one dish tied to a legend, festival or historical figure. Photograph it and tell its origin story.','Many famous dishes were born from war, poverty or royalty.',ARRAY['dish origin story {destination}','traditional dishes {destination}'],'solo_guide','Recipes travel with migrants and traders — a dish''s ingredients trace an old route.','Under $10','{foodie,culture}'),
('solo','food','Sweet test','Try a local dessert or sweet snack and photograph it. Describe the main ingredient and why it''s popular here.','Desserts reveal what a region grows and celebrates.',ARRAY['traditional desserts {destination}','street sweets {destination}'],'solo_guide','Sugar, rice, coconut or honey in desserts often reflect old plantation and trade history.','Under $5','{foodie,chill,shopper}'),
('solo','shopping','The souvenir that''s actually used','Find something locals buy for daily use (not a tourist souvenir) for under $15. Photograph it and explain what it''s for.','Everyday objects say more about a place than fridge magnets.',ARRAY['everyday items {destination}','local shopping {destination}'],'solo_guide','Daily-use objects show climate, cooking habits and design traditions.','Under $15','{shopper,explorer}'),
('solo','shopping','Bargain or fixed?','Find out whether bargaining is expected where you shop. Photograph the market or shop and write how prices work there.','Price customs differ by country, city and even street.',ARRAY['bargaining etiquette {destination}','markets {destination}'],'solo_guide','Bargaining is common where prices are not printed and sellers know their regulars.','Free','{shopper,culture}'),
('solo','nature','Green corner','Find a park, garden or tree that matters to locals. Photograph it and write why people value it.','Green spaces often hold community history.',ARRAY['parks {destination}','sacred trees {destination}'],'solo_guide','Many old trees and gardens are protected because of a story, belief or historic event.','Free','{chill,photographer,explorer}'),
('solo','night','The city after dark','Explore a lively, safe area after sunset — a night market, lit square or riverside. Photograph the light and describe how the place changes at night.','Many cities live a second life after dark.',ARRAY['night market {destination}','evening walk {destination}'],'solo_guide','Night markets often began where heat made daytime trading hard.','Free to wander, snacks under $5','{night_owl,photographer,foodie}'),
('solo','night','Late-night snack science','Try a snack people here eat late at night and photograph it. Find out why it became the late-night choice.','Late-night food is comfort food, and it tells you what a city craves.',ARRAY['late night food {destination}','night snacks {destination}'],'solo_guide','Late-night dishes are usually cheap, fast and filling — built for shift workers.','Under $5','{night_owl,foodie}'),
('solo','work','How people get around','Ride or observe one local way of getting around (boat, tuk-tuk, tram, scooter taxi). Photograph it and explain how fares work.','Transport shows how a city moves and earns.',ARRAY['public transport {destination}','local transport history {destination}'],'solo_guide','Transport choices follow geography, income and city planning decisions.','Under $5','{explorer,chill}'),
('solo','art','Street art meaning','Find a mural, carving or public artwork and photograph it. Find out who made it or what it represents.','Public art is the city talking to itself.',ARRAY['street art {destination}','public art {destination}'],'solo_guide','Murals often mark protests, celebrations or neighborhood identity.','Free','{photographer,culture,explorer}'),
('solo','science','Built for the weather','Spot one design built for the local climate — shutters, roofs, stilts, shade cloths. Photograph it and explain how it works.','Architecture solves climate problems with simple physics.',ARRAY['traditional architecture {destination}','climate design {destination}'],'solo_guide','Steep roofs shed rain, thick walls store cool air and stilts beat floods — physics in brick.','Free','{explorer,photographer,culture}'),
('solo','chill','Sit where locals sit','Find a bench, café or step where locals pause. Stay 15 minutes, photograph the view and write three things you noticed.','Slowing down is how you see a city''s rhythm.',ARRAY['local cafés {destination}','people-watching spots {destination}'],'solo_guide','City rhythm — lunch hours, rest times, rush hours — follows climate and work culture.','Free or one drink under $5','{chill,photographer}'),
('solo','postcard','Your one-photo guide','Take the one photo you''d send a friend to explain {destination}. Write a three-line caption: what, why, and a tip.','Choosing one image forces you to decide what matters most.',ARRAY['{destination} travel tips','{destination} hidden gems'],'solo_guide','Postcards were the first viral travel media — one picture shaped a city''s image for decades.','Free','{photographer,explorer,chill,culture,foodie,shopper,night_owl}')
ON CONFLICT DO NOTHING;

CREATE TABLE public.solo_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES public.culture_experiences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  day_number integer NOT NULL,
  title text NOT NULL, mission_text text NOT NULL, backstory text, keywords text[] NOT NULL DEFAULT '{}', insight text, lens text, budget_note text,
  opened_at timestamptz, finished_at timestamptz, photo_path text, story text, speed_bonus boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (experience_id, day_number)
);
GRANT SELECT ON public.solo_quests TO authenticated;
GRANT ALL ON public.solo_quests TO service_role;
ALTER TABLE public.solo_quests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their solo quests" ON public.solo_quests FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION trip_private.set_culture_mode(p_exp uuid, p_mode text, p_types text[], p_vibe text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.culture_experiences; a int := coalesce(trip_private.age_of(auth.uid()),0); v_types text[];
BEGIN
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp FOR UPDATE;
 IF NOT FOUND OR e.creator_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your experience'; END IF;
 IF e.started_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.solo_quests q WHERE q.experience_id=p_exp) THEN RAISE EXCEPTION 'This experience has already started'; END IF;
 IF p_mode NOT IN ('group','solo') THEN RAISE EXCEPTION 'Choose Solo or With others'; END IF;
 IF p_vibe IS NOT NULL AND p_vibe NOT IN ('family','chill','party') THEN RAISE EXCEPTION 'Pick a vibe'; END IF;
 IF p_vibe='party' AND a<21 THEN RAISE EXCEPTION 'Party vibe is 21+'; END IF;
 IF a<18 AND p_vibe IS DISTINCT FROM 'family' AND p_vibe IS NOT NULL THEN RAISE EXCEPTION 'Players under 18 use Family content'; END IF;
 v_types := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_types,'{}')) x);
 IF cardinality(v_types) > 2 THEN RAISE EXCEPTION 'Pick up to 2 traveler types'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(v_types) x WHERE x NOT IN ('foodie','explorer','culture','chill','photographer','night_owl','shopper')) THEN RAISE EXCEPTION 'Unknown traveler type'; END IF;
 IF 'night_owl' = ANY(v_types) AND a<21 THEN RAISE EXCEPTION 'Night owl is 21+'; END IF;
 UPDATE public.culture_experiences SET play_mode=p_mode, traveler_types=CASE WHEN p_mode='solo' THEN v_types ELSE '{}' END, vibe=coalesce(p_vibe, CASE WHEN a<18 THEN 'family' ELSE 'chill' END),
   trip_id=CASE WHEN p_mode='solo' THEN NULL ELSE trip_id END, visibility=CASE WHEN p_mode='solo' AND visibility='squad' THEN 'private' ELSE visibility END
 WHERE id=p_exp;
END $$;

CREATE OR REPLACE FUNCTION trip_private.solo_today(p_user uuid) RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 SELECT (now() AT TIME ZONE coalesce((SELECT nullif(time_zone,'') FROM public.profiles WHERE id=p_user),'UTC'))::date $$;

CREATE OR REPLACE FUNCTION trip_private.solo_ensure(p_exp uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.culture_experiences; d int; c record; v_dest text; a int;
BEGIN
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp;
 IF e.play_mode<>'solo' THEN RETURN; END IF;
 a := coalesce(trip_private.age_of(e.creator_id),0);
 v_dest := coalesce(nullif(e.city,''), nullif(e.region,''), e.country);
 FOR d IN 1..e.days LOOP
   IF EXISTS (SELECT 1 FROM public.solo_quests WHERE experience_id=p_exp AND day_number=d) THEN CONTINUE; END IF;
   SELECT sm.* INTO c FROM public.security_missions sm
    WHERE sm.trip_id IS NULL AND sm.kind='solo' AND sm.presentation_tag='solo_guide' AND length(btrim(sm.insight))>12 AND sm.budget_note IS NOT NULL
      AND (a>=21 OR NOT ('night_owl' = ALL(sm.traveler_tags)))
      AND NOT (a<18 AND (sm.text||' '||sm.title) ~* '(stranger|passer|(photo|photograph|film|record|video|selfie)\w*\s+(with\s+|of\s+)?(a\s+|an\s+|the\s+)?(local|people|person|someone|vendor|crowd)|after dark|late at night)')
      AND NOT EXISTS (SELECT 1 FROM public.solo_quests q WHERE q.user_id=e.creator_id AND lower(q.title)=lower(replace(sm.title,'{destination}',v_dest)))
    ORDER BY (sm.traveler_tags && e.traveler_types) DESC, (sm.category IN (SELECT lens FROM public.solo_quests WHERE experience_id=p_exp)) ASC, md5(sm.id::text||p_exp::text||d::text)
    LIMIT 1;
   IF NOT FOUND THEN
     SELECT sm.* INTO c FROM public.security_missions sm WHERE sm.trip_id IS NULL AND sm.kind='solo' AND (a>=21 OR NOT ('night_owl' = ALL(sm.traveler_tags)))
       AND NOT EXISTS (SELECT 1 FROM public.solo_quests q WHERE q.experience_id=p_exp AND lower(q.title) LIKE lower(replace(sm.title,'{destination}',v_dest))||'%')
       ORDER BY md5(sm.id::text||p_exp::text||d::text) LIMIT 1;
     IF NOT FOUND THEN CONTINUE; END IF;
   END IF;
   INSERT INTO public.solo_quests(experience_id,user_id,day_number,title,mission_text,backstory,keywords,insight,lens,budget_note)
   VALUES (p_exp,e.creator_id,d,replace(c.title,'{destination}',v_dest),replace(c.text,'{destination}',v_dest),replace(c.backstory,'{destination}',v_dest),
     ARRAY(SELECT replace(k,'{destination}',v_dest) FROM unnest(c.keywords) k),replace(c.insight,'{destination}',v_dest),c.category,c.budget_note)
   ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION trip_private.solo_score(p_exp uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
 WITH e AS (SELECT * FROM public.culture_experiences WHERE id=p_exp),
 q AS (SELECT count(*) n, count(*) FILTER (WHERE finished_at IS NOT NULL) done, count(*) FILTER (WHERE speed_bonus) speed,
        count(*) FILTER (WHERE lens='language') lang, count(*) FILTER (WHERE lens='language' AND finished_at IS NOT NULL) lang_done FROM public.solo_quests WHERE experience_id=p_exp),
 c AS (SELECT coalesce(sum(points),0) avail, coalesce(sum(points) FILTER (WHERE done_at IS NOT NULL),0) got FROM public.culture_exp_days WHERE experience_id=p_exp)
 SELECT jsonb_build_object(
  'points', (q.done*10 + q.speed*5 + c.got)::int,
  'available', ((SELECT days FROM e)*15 + c.avail)::int,
  'quests_done', q.done, 'quests', (SELECT days FROM e), 'speed', q.speed, 'lang', q.lang, 'lang_done', q.lang_done)
 FROM q, c $$;

CREATE OR REPLACE FUNCTION trip_private.solo_fare(p_points int, p_available int) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
 SELECT CASE WHEN p_available<=0 THEN 'Standby' WHEN p_points >= ceil(p_available*0.85) THEN 'First Class' WHEN p_points >= ceil(p_available*0.65) THEN 'Business' WHEN p_points >= ceil(p_available*0.40) THEN 'Economy' ELSE 'Standby' END $$;

CREATE OR REPLACE FUNCTION trip_private.solo_action(p_action text, p_exp uuid, p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.culture_experiences; s jsonb; v_today date; v_day int; q public.solo_quests; v_path text; v_story text; v_streak int := 0; d int; v_best int; v_pts int; v_av int;
BEGIN
 SELECT * INTO e FROM public.culture_experiences WHERE id=p_exp;
 IF NOT FOUND OR e.creator_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your experience'; END IF;
 IF e.play_mode<>'solo' THEN RAISE EXCEPTION 'This experience is played with others'; END IF;
 v_today := trip_private.solo_today(auth.uid());
 v_day := (v_today - e.start_date) + 1;
 IF p_action='open' THEN
   SELECT * INTO q FROM public.solo_quests WHERE experience_id=p_exp AND day_number=(p->>'day')::int FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'No quest for that day'; END IF;
   IF q.day_number > v_day THEN RAISE EXCEPTION 'This quest is still sealed until its trip day'; END IF;
   IF e.finished_at IS NOT NULL THEN RAISE EXCEPTION 'This experience is finished'; END IF;
   UPDATE public.solo_quests SET opened_at=coalesce(opened_at,now()), updated_at=now() WHERE id=q.id;
 ELSIF p_action='finish' THEN
   SELECT * INTO q FROM public.solo_quests WHERE experience_id=p_exp AND day_number=(p->>'day')::int FOR UPDATE;
   IF NOT FOUND OR q.opened_at IS NULL THEN RAISE EXCEPTION 'Open the quest first'; END IF;
   IF q.finished_at IS NOT NULL THEN RAISE EXCEPTION 'Already counted'; END IF;
   IF e.finished_at IS NOT NULL THEN RAISE EXCEPTION 'This experience is finished'; END IF;
   v_path := p->>'photo'; v_story := btrim(coalesce(p->>'story',''));
   IF v_path IS NULL OR split_part(v_path,'/',1)<>p_exp::text OR split_part(v_path,'/',2)<>auth.uid()::text
      OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='culture-photos' AND o.name=v_path) THEN RAISE EXCEPTION 'Add your photo first'; END IF;
   IF length(v_story) NOT BETWEEN 10 AND 600 THEN RAISE EXCEPTION 'Write a short story for your guide page (10–600 characters)'; END IF;
   UPDATE public.solo_quests SET finished_at=now(), photo_path=v_path, story=v_story, speed_bonus=(now() <= opened_at + interval '3 hours'), updated_at=now() WHERE id=q.id;
 ELSIF p_action<>'state' THEN RAISE EXCEPTION 'Unknown action';
 END IF;
 PERFORM trip_private.solo_ensure(p_exp);
 s := trip_private.solo_score(p_exp);
 v_pts := (s->>'points')::int; v_av := (s->>'available')::int;
 FOR d IN REVERSE least(v_day, e.days)..1 LOOP
   IF EXISTS (SELECT 1 FROM public.solo_quests x WHERE x.experience_id=p_exp AND x.day_number=d AND x.finished_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.culture_exp_days x WHERE x.experience_id=p_exp AND x.day_number=d AND x.done_at IS NOT NULL) THEN v_streak := v_streak+1;
   ELSIF d < v_day THEN EXIT; END IF;
 END LOOP;
 SELECT max((trip_private.solo_score(o.id)->>'points')::int) INTO v_best FROM public.culture_experiences o WHERE o.creator_id=auth.uid() AND o.play_mode='solo' AND o.id<>p_exp;
 RETURN jsonb_build_object(
  'today_day', v_day, 'days', e.days, 'start_date', e.start_date, 'points', v_pts, 'available', v_av,
  'fare', trip_private.solo_fare(v_pts, v_av),
  'targets', jsonb_build_object('Economy', ceil(v_av*0.40)::int, 'Business', ceil(v_av*0.65)::int, 'First Class', ceil(v_av*0.85)::int),
  'streak', v_streak, 'personal_best', v_best,
  'stamps', jsonb_build_object('speed_runner', (s->>'speed')::int >= 3, 'clean_sweep', (s->>'quests_done')::int >= e.days AND e.days>0,
     'local_tongue', (s->>'lang')::int > 0 AND (s->>'lang')::int = (s->>'lang_done')::int, 'destination', e.finished_at IS NOT NULL),
  'quests', (SELECT coalesce(jsonb_agg(jsonb_build_object('day', x.day_number, 'sealed', x.opened_at IS NULL, 'arrived', x.day_number <= v_day,
     'title', CASE WHEN x.opened_at IS NOT NULL THEN x.title END, 'text', CASE WHEN x.opened_at IS NOT NULL THEN x.mission_text END,
     'backstory', CASE WHEN x.opened_at IS NOT NULL THEN x.backstory END, 'keywords', CASE WHEN x.opened_at IS NOT NULL THEN to_jsonb(x.keywords) END,
     'insight', CASE WHEN x.opened_at IS NOT NULL THEN x.insight END, 'budget', CASE WHEN x.opened_at IS NOT NULL THEN x.budget_note END,
     'opened_at', x.opened_at, 'finished_at', x.finished_at, 'speed_bonus', x.speed_bonus, 'photo', x.photo_path, 'story', x.story) ORDER BY x.day_number),'[]'::jsonb)
     FROM public.solo_quests x WHERE x.experience_id=p_exp));
END $$;

REVOKE ALL ON FUNCTION trip_private.set_culture_mode(uuid,text,text[],text), trip_private.solo_action(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.set_culture_mode(uuid,text,text[],text), trip_private.solo_action(text,uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION trip_private.solo_ensure(uuid), trip_private.solo_score(uuid), trip_private.solo_today(uuid), trip_private.solo_fare(int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.solo_ensure(uuid), trip_private.solo_score(uuid), trip_private.solo_today(uuid), trip_private.solo_fare(int,int) TO service_role;

CREATE OR REPLACE FUNCTION public.set_culture_mode(p_exp uuid, p_mode text, p_types text[], p_vibe text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.set_culture_mode(p_exp,p_mode,p_types,p_vibe) $$;
CREATE OR REPLACE FUNCTION public.solo_action(p_action text, p_exp uuid, p jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.solo_action(p_action,p_exp,p) $$;
REVOKE ALL ON FUNCTION public.set_culture_mode(uuid,text,text[],text), public.solo_action(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_culture_mode(uuid,text,text[],text), public.solo_action(text,uuid,jsonb) TO authenticated;

-- Solo experiences can never be linked to a trip (so never on a group leaderboard or crowned)
CREATE OR REPLACE FUNCTION trip_private.solo_no_trip() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NEW.play_mode='solo' THEN NEW.trip_id := NULL; IF NEW.visibility='squad' THEN NEW.visibility := 'private'; END IF; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS solo_no_trip ON public.culture_experiences;
CREATE TRIGGER solo_no_trip BEFORE INSERT OR UPDATE ON public.culture_experiences FOR EACH ROW EXECUTE FUNCTION trip_private.solo_no_trip();

-- Junkie Rank: finished solo experiences add a fare-class bonus
CREATE OR REPLACE FUNCTION trip_private.junkie_rank(p_user uuid)
 RETURNS TABLE(tier text, points integer, next_tier text, next_at integer, tier_at integer, passport_junkie boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_pts int; v_best int; v_intl int;
BEGIN
  IF p_user IS NULL OR (p_user <> auth.uid() AND NOT EXISTS (SELECT 1 FROM public.trip_members a JOIN public.trip_members b ON b.trip_id=a.trip_id AND b.status='approved' WHERE a.user_id=auth.uid() AND a.status='approved' AND b.user_id=p_user)) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  WITH real AS (
    SELECT t.id, m.role FROM public.trips t JOIN public.trip_members m ON m.trip_id=t.id AND m.user_id=p_user AND m.status='approved'
    WHERE t.kind='trip' AND NOT t.is_sandbox AND (t.ended_at IS NOT NULL OR current_date > t.end_date)
      AND (SELECT count(*) FROM public.trip_members x WHERE x.trip_id=t.id AND x.status='approved') >= 3),
  home_all AS (
    SELECT t.id, row_number() OVER (PARTITION BY date_trunc('month', t.end_date) ORDER BY t.end_date, t.id) rn
    FROM public.trips t JOIN public.trip_members m ON m.trip_id=t.id AND m.user_id=p_user AND m.status='approved'
    WHERE t.kind='at_home' AND NOT t.is_sandbox AND (t.ended_at IS NOT NULL OR current_date > t.end_date)),
  home AS (SELECT id FROM home_all WHERE rn <= 4)
  SELECT
    (SELECT count(*) FROM real)*100 + (SELECT count(*) FROM real WHERE role='captain')*25
    + (SELECT count(*) FROM public.season_champions c WHERE c.user_id=p_user AND c.trip_id IN (SELECT id FROM real))*50
    + (SELECT count(*) FROM home)*40
    + (SELECT count(*) FROM public.season_champions c WHERE c.user_id=p_user AND c.trip_id IN (SELECT id FROM home))*20
    + (SELECT count(*) FROM public.culture_experiences e WHERE e.creator_id=p_user AND e.finished_at IS NOT NULL AND (e.trip_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.trips s WHERE s.id=e.trip_id AND s.is_sandbox)))*40
    + coalesce((SELECT sum(CASE trip_private.solo_fare((x.sc->>'points')::int,(x.sc->>'available')::int) WHEN 'First Class' THEN 30 WHEN 'Business' THEN 20 WHEN 'Economy' THEN 10 ELSE 0 END)
        FROM (SELECT trip_private.solo_score(e.id) sc FROM public.culture_experiences e WHERE e.creator_id=p_user AND e.play_mode='solo' AND e.finished_at IS NOT NULL) x),0)
    + (SELECT count(*) FROM public.mission_claims c JOIN public.trips s ON s.id=c.trip_id AND NOT s.is_sandbox WHERE c.user_id=p_user AND c.status='released')*5
  INTO v_pts;
  INSERT INTO public.junkie_ranks(user_id,best_points) VALUES (p_user, v_pts)
    ON CONFLICT (user_id) DO UPDATE SET best_points=greatest(public.junkie_ranks.best_points, excluded.best_points), updated_at=now()
    RETURNING best_points INTO v_best;
  PERFORM trip_private.sync_passport(p_user);
  SELECT count(*) INTO v_intl FROM public.passport_stamps s JOIN public.trips t ON t.id=s.trip_id AND t.kind='trip' AND NOT t.is_sandbox AND t.unlocked_at IS NOT NULL AND (t.ended_at IS NOT NULL OR current_date > t.end_date) AND (SELECT count(*) FROM public.trip_members x WHERE x.trip_id=t.id AND x.status='approved') >= 3 WHERE s.user_id=p_user AND s.kind='international';
  RETURN QUERY SELECT
    CASE WHEN v_best>=3000 THEN 'World Class 👑' WHEN v_best>=1500 THEN 'Jet Setter' WHEN v_best>=750 THEN 'First Class' WHEN v_best>=250 THEN 'Frequent Flyer' ELSE 'Carry-On' END,
    v_pts,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 'World Class 👑' WHEN v_best>=750 THEN 'Jet Setter' WHEN v_best>=250 THEN 'First Class' ELSE 'Frequent Flyer' END,
    CASE WHEN v_best>=3000 THEN NULL WHEN v_best>=1500 THEN 3000 WHEN v_best>=750 THEN 1500 WHEN v_best>=250 THEN 750 ELSE 250 END,
    CASE WHEN v_best>=3000 THEN 3000 WHEN v_best>=1500 THEN 1500 WHEN v_best>=750 THEN 750 WHEN v_best>=250 THEN 250 ELSE 0 END,
    v_intl >= 5;
END $function$;