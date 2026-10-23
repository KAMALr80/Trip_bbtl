ALTER TABLE public.security_missions DROP CONSTRAINT security_missions_kind_check;
ALTER TABLE public.security_missions ADD CONSTRAINT security_missions_kind_check CHECK (kind IN ('trip','home','checkin'));
ALTER TABLE public.security_missions ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS backstory text, ADD COLUMN IF NOT EXISTS keywords text[];
ALTER TABLE public.mission_claims ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'takeoff', ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS backstory text, ADD COLUMN IF NOT EXISTS keywords text[];
ALTER TABLE public.mission_claims ADD CONSTRAINT mission_claims_phase_check CHECK (phase IN ('takeoff','checkin'));
ALTER TABLE public.mission_claims DROP CONSTRAINT mission_claims_points_check;
ALTER TABLE public.mission_claims ADD CONSTRAINT mission_claims_points_check CHECK (points IN (2,3,4));
ALTER TABLE public.mission_claims DROP CONSTRAINT mission_claims_trip_id_user_id_slot_key;
ALTER TABLE public.mission_claims ADD CONSTRAINT mission_claims_trip_user_phase_slot_key UNIQUE (trip_id,user_id,phase,slot);

CREATE OR REPLACE FUNCTION trip_private.mission_bonus(p_trip uuid)
 RETURNS TABLE(user_id uuid, points integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT x.user_id, sum(x.p)::int FROM (
    SELECT c.user_id, least(CASE WHEN c.phase='checkin' THEN 10 ELSE 12 END, sum(c.points)) p
    FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.status='released' GROUP BY c.user_id, c.phase) x
  GROUP BY x.user_id
$$;

DROP FUNCTION IF EXISTS public.mission_action(uuid,text,integer,uuid,boolean);
DROP FUNCTION IF EXISTS trip_private.mission_action(uuid,text,integer,uuid,boolean);
CREATE FUNCTION trip_private.mission_action(p_trip uuid, p_action text, p_slot integer, p_claim uuid, p_layover boolean, p_phase text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_kind text; v_t public.trips; v_m public.security_missions; v_c public.mission_claims; v_id uuid; v_phase text := coalesce(p_phase,'takeoff'); v_open boolean;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=v_uid AND status='approved') THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF v_phase NOT IN ('takeoff','checkin') THEN RAISE EXCEPTION 'Unknown mission type'; END IF;
  SELECT * INTO v_t FROM public.trips WHERE id=p_trip;
  v_open := CASE WHEN v_t.kind IN ('at_home','cultural_inspiration') THEN current_date <= v_t.end_date ELSE current_date <= v_t.start_date - 1 END;
  IF p_action = 'reveal' THEN
    IF v_phase='checkin' THEN
      IF NOT v_open THEN RAISE EXCEPTION 'Early Check-In has closed'; END IF;
      IF p_slot IS NULL OR p_slot < 1 OR p_slot > 3 THEN RAISE EXCEPTION 'Pick a task slot'; END IF;
    ELSE
      IF p_slot IS NULL OR p_slot < 1 OR p_slot > 5 THEN RAISE EXCEPTION 'Pick a mission slot'; END IF;
      IF p_slot > 3 AND NOT coalesce(p_layover,false) THEN RAISE EXCEPTION 'Missions 4 and 5 are for layovers'; END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND phase=v_phase AND slot=p_slot) THEN RAISE EXCEPTION 'Already revealed'; END IF;
    IF p_slot > 1 AND NOT EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND phase=v_phase AND slot=p_slot-1 AND status<>'revealed') THEN RAISE EXCEPTION 'Finish the one before this first'; END IF;
    v_kind := CASE WHEN v_phase='checkin' THEN 'checkin' WHEN v_t.kind IN ('at_home','cultural_inspiration') THEN 'home' ELSE 'trip' END;
    SELECT * INTO v_m FROM public.security_missions m
      WHERE m.kind=v_kind AND (m.trip_id IS NULL OR m.trip_id=p_trip)
        AND NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.user_id=v_uid AND c.mission_id=m.id)
        AND (v_phase<>'checkin' OR NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.phase='checkin' AND c.mission_id=m.id AND c.user_id<>v_uid)
             OR NOT EXISTS (SELECT 1 FROM public.security_missions m2 WHERE m2.kind='checkin' AND (m2.trip_id IS NULL OR m2.trip_id=p_trip) AND NOT EXISTS (SELECT 1 FROM public.mission_claims c2 WHERE c2.trip_id=p_trip AND c2.phase='checkin' AND c2.mission_id=m2.id)))
      ORDER BY md5(m.id::text || v_uid::text || p_trip::text) LIMIT 1;
    IF v_m.id IS NULL THEN RAISE EXCEPTION 'No more tasks — ask your Captain for more'; END IF;
    INSERT INTO public.mission_claims(trip_id,user_id,slot,mission_id,category,mission_text,points,phase,title,backstory,keywords)
      VALUES (p_trip,v_uid,p_slot,v_m.id,v_m.category,
        replace(v_m.text,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        CASE WHEN v_phase='checkin' THEN CASE WHEN p_slot=1 THEN 4 ELSE 3 END WHEN p_slot<=3 THEN 2 ELSE 3 END, v_phase,
        replace(v_m.title,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        replace(v_m.backstory,'{destination}',coalesce(nullif(v_t.destination,''),'your destination')),
        (SELECT array_agg(replace(k,'{destination}',coalesce(nullif(v_t.destination,''),'your destination'))) FROM unnest(v_m.keywords) k))
      RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO v_c FROM public.mission_claims WHERE id=p_claim AND trip_id=p_trip FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF p_action IN ('complete','skip') THEN
    IF v_c.user_id <> v_uid THEN RAISE EXCEPTION 'Not your mission'; END IF;
    IF v_c.status <> 'revealed' THEN RAISE EXCEPTION 'Already answered'; END IF;
    IF v_c.phase='checkin' AND p_action='complete' AND NOT v_open THEN RAISE EXCEPTION 'Early Check-In has closed'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='complete' THEN 'pending' ELSE 'skipped' END, updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  ELSIF p_action IN ('verify','decline') THEN
    IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can verify'; END IF;
    IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;
    IF v_c.user_id = v_uid THEN RAISE EXCEPTION 'Add a Co-Captain to verify your own missions'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='verify' THEN 'released' ELSE 'declined' END, verified_by=v_uid, decided_at=now(), updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $function$;
CREATE FUNCTION public.mission_action(p_trip uuid, p_action text, p_slot integer DEFAULT NULL, p_claim uuid DEFAULT NULL, p_layover boolean DEFAULT false, p_phase text DEFAULT 'takeoff')
 RETURNS uuid LANGUAGE sql SET search_path TO 'public'
AS $$ SELECT trip_private.mission_action(p_trip,p_action,p_slot,p_claim,p_layover,p_phase) $$;
REVOKE ALL ON FUNCTION trip_private.mission_action(uuid,text,integer,uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.mission_action(uuid,text,integer,uuid,boolean,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mission_action(uuid,text,integer,uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mission_action(uuid,text,integer,uuid,boolean,text) TO authenticated, service_role;

CREATE FUNCTION trip_private.add_checkin_tasks(p_trip uuid, p_tasks jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_n int;
BEGIN
  IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can add tasks'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_usage WHERE trip_id=p_trip AND user_id=auth.uid() AND kind='mission_topup' AND created_at > now() - interval '10 minutes') THEN RAISE EXCEPTION 'Spend credits first'; END IF;
  INSERT INTO public.security_missions(kind,category,title,text,backstory,keywords,trip_id)
    SELECT 'checkin', left(coalesce(nullif(trim(e->>'category'),''),'Fresh for your trip'),40), left(trim(e->>'title'),80), left(trim(e->>'what'),240), left(trim(coalesce(e->>'backstory','')),400),
      (SELECT array_agg(left(trim(k),60)) FROM (SELECT jsonb_array_elements_text(coalesce(e->'keywords','[]'::jsonb)) k LIMIT 4) kk), p_trip
    FROM (SELECT e FROM jsonb_array_elements(p_tasks) e LIMIT 10) s
    WHERE length(trim(coalesce(e->>'title',''))) > 2 AND length(trim(coalesce(e->>'what',''))) > 10
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n;
END $function$;
CREATE FUNCTION public.add_checkin_tasks(p_trip uuid, p_tasks jsonb) RETURNS integer LANGUAGE sql SET search_path TO 'public'
AS $$ SELECT trip_private.add_checkin_tasks(p_trip,p_tasks) $$;
REVOKE ALL ON FUNCTION trip_private.add_checkin_tasks(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.add_checkin_tasks(uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_checkin_tasks(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_checkin_tasks(uuid,jsonb) TO authenticated, service_role;

INSERT INTO public.security_missions(kind,category,title,text,backstory,keywords) VALUES
('checkin','Food','Cook One Signature Dish','Cook one signature dish from {destination} and bring a bite (or a photo) to the next group call.','Every place has a dish locals argue about. Cooking it teaches you more than reading about it ever could.',ARRAY['signature dish {destination}','easy {destination} recipe','{destination} home cooking']),
('checkin','Food','Street Food Ranking','Pick 5 street foods from {destination} and rank them from must-try to maybe-later. Defend your number one in 1 minute.','Street food is where a lot of everyday life happens. Your ranking becomes the squad snack plan.',ARRAY['{destination} street food','best street snacks {destination}','{destination} night market food']),
('checkin','Food','Breakfast Like A Local','Find out what a typical breakfast in {destination} looks like and make your version of it.','Breakfast says a lot about how people start their day, from quick bites to slow family meals.',ARRAY['typical breakfast {destination}','{destination} breakfast recipe','morning food {destination}']),
('checkin','Food','Spice Detective','Name 3 spices, herbs or sauces that define {destination} cooking. Bring one to smell or taste on the call.','A few flavors can make a whole cuisine recognizable. Learn them and menus get way easier.',ARRAY['{destination} spices','{destination} cooking ingredients','{destination} sauces']),
('checkin','Food','Dessert Challenge','Make or buy one dessert or sweet snack from {destination} and give the group a 30-second taste review.','Sweets often tie to holidays and family moments, so each one comes with a story.',ARRAY['{destination} dessert','traditional sweets {destination}','{destination} dessert recipe']),
('checkin','Food','Menu Translator','Learn how to order 3 dishes in the local language of {destination}. Act out ordering for the group.','Ordering in the local language, even badly, usually gets a smile and sometimes a better recommendation.',ARRAY['how to order food {destination}','{destination} menu words','{destination} restaurant phrases']),
('checkin','Music','Playlist Captain','Build a 5-song playlist of artists from {destination}, old and new. Play 20 seconds of your favorite on the call.','Music is a shortcut into a culture: what people dance to, cry to and sing at parties.',ARRAY['popular music {destination}','classic {destination} songs','{destination} artists']),
('checkin','Music','Name That Instrument','Find a traditional instrument from {destination}. Show a clip or picture and explain how it is played.','Traditional instruments carry sounds you will hear at festivals, ceremonies and street performances.',ARRAY['traditional instruments {destination}','{destination} folk music','{destination} instrument history']),
('checkin','Music','Sing The Chorus','Learn the chorus of a well-known song from {destination} and perform it for the group. Lyrics on screen allowed.','Knowing one song locals love is an instant icebreaker anywhere.',ARRAY['famous songs {destination}','{destination} sing along songs','{destination} song lyrics']),
('checkin','Music','Music Through Time','Find one song from {destination} from each of 3 different decades and explain how the sound changed.','Pop music tracks how a place changed, from radio to clubs to streaming.',ARRAY['{destination} music history','{destination} pop music decades','{destination} music genres']),
('checkin','Music','Festival Scout','Find a music festival or live music spot in {destination} and pitch it to the squad in 1 minute.','Live music is where visitors and locals end up in the same crowd.',ARRAY['music festivals {destination}','live music {destination}','{destination} concert venues']),
('checkin','Dance','Learn Eight Counts','Learn 8 counts of a dance from {destination} from a video and teach it to the group on the call.','Dance is history you can move to. Even a few steps make you feel part of it.',ARRAY['{destination} traditional dance','{destination} dance tutorial','{destination} dance steps']),
('checkin','Dance','Dance Origins','Pick one dance style linked to {destination} and explain where it came from in 1 minute.','Many dances started at harvests, celebrations or neighborhood parties and spread from there.',ARRAY['{destination} dance history','origin of {destination} dance','{destination} dance styles']),
('checkin','Dance','Costume Check','Find what people traditionally wear for a dance or festival in {destination}. Recreate one piece with what you have at home.','Festival outfits carry colors and patterns that often mean something specific.',ARRAY['{destination} traditional clothing','{destination} festival outfits','{destination} costume']),
('checkin','Art','Sketch A Landmark','Sketch one famous landmark in {destination} in 10 minutes. Show it and let the squad guess what it is.','Drawing something makes you notice details you would walk right past.',ARRAY['famous landmarks {destination}','{destination} architecture','{destination} landmark history']),
('checkin','Art','Pattern Maker','Find a traditional pattern, textile or craft from {destination} and recreate it on paper.','Patterns often signal region, family or occasion, and markets are full of them.',ARRAY['{destination} traditional patterns','{destination} textiles','{destination} crafts']),
('checkin','Art','Artist Spotlight','Pick one artist, painter or designer from {destination}. Show 2 works and explain why they matter.','Every place has artists who shaped how it sees itself.',ARRAY['famous artists {destination}','{destination} art history','{destination} painters']),
('checkin','Art','Gallery Pitch','Find one museum or gallery in {destination} and pitch the single thing in it you most want to see.','A clear target makes a museum visit fun instead of tiring.',ARRAY['best museums {destination}','{destination} galleries','{destination} museum highlights']),
('checkin','Art','Make A Postcard','Design a postcard for {destination} with one image and a 5-word slogan. Present it to the squad.','Postcards turn a place into one picture. Choosing yours forces you to pick what matters.',ARRAY['{destination} postcard','iconic images {destination}','{destination} travel poster']),
('checkin','Sports','Sport Explainer','Explain the most popular sport in {destination} in 60 seconds, including one rule most visitors do not know.','Sports talk is one of the easiest ways to bond with locals.',ARRAY['popular sport {destination}','{destination} sports culture','{destination} sport rules']),
('checkin','Sports','Team Colors','Pick a team from {destination}, learn its colors and one chant or nickname, and show it to the group.','Wearing the right colors or knowing a nickname can start a whole conversation.',ARRAY['{destination} sports teams','{destination} team nickname','{destination} fan chants']),
('checkin','Sports','Traditional Sport','Find a traditional sport or martial art from {destination} and demo one safe move or rule.','Traditional sports often come from old training, festivals or village games.',ARRAY['traditional sport {destination}','{destination} martial arts','{destination} sport history']),
('checkin','Sports','Sports Legend','Present one sports legend from {destination} in 1 minute: who, what they did, and why people still care.','Sports heroes often stand for something bigger than the game.',ARRAY['famous athletes {destination}','{destination} sports legend','{destination} sports history']),
('checkin','Language','Five Phrases','Learn 5 phrases in the local language of {destination}: hello, thank you, please, sorry, and how much. Say them on the call.','A few polite words go a long way and show respect.',ARRAY['basic phrases {destination}','{destination} language for travelers','how to say thank you {destination}']),
('checkin','Language','Count To Ten','Learn to count to 10 in the local language of {destination} and race the squad to say it fastest.','Numbers help with prices, buses and room numbers, and they are fun to race.',ARRAY['count to ten {destination} language','{destination} numbers','{destination} language basics']),
('checkin','Language','Untranslatable Word','Find one word or saying from {destination} with no perfect English match and explain it.','Some words capture a feeling only one culture named. They are great conversation starters.',ARRAY['untranslatable words {destination}','{destination} sayings','{destination} proverbs']),
('checkin','Language','Slang Lesson','Find 3 friendly slang words used in {destination} and use them in a sentence on the call.','Slang shows how people actually talk, not how textbooks say they do.',ARRAY['{destination} slang','common slang {destination}','{destination} casual phrases']),
('checkin','Language','Tongue Twister','Learn a short tongue twister from {destination} and challenge the squad to say it.','Tongue twisters are a playful way to hear the sounds of a language.',ARRAY['{destination} tongue twister','{destination} pronunciation','{destination} language sounds']),
('checkin','History','First Leader','Find out who the first president, ruler or national leader of {destination} was and give a 1-minute presentation.','Founding figures show up on money, streets and statues. You will spot them everywhere.',ARRAY['first leader of {destination}','{destination} founding history','{destination} national history']),
('checkin','History','Timeline In Five','Make a 5-point timeline of big moments in the history of {destination}. Present it in 90 seconds.','A quick timeline makes every museum, monument and old street make more sense.',ARRAY['{destination} history timeline','{destination} historic events','short history of {destination}']),
('checkin','History','Oldest Building','Find the oldest building or site still standing in {destination} and share its story in 1 minute.','Old buildings are the places that survived everything else. They hold great stories.',ARRAY['oldest building {destination}','historic sites {destination}','{destination} ancient history']),
('checkin','History','How It Got Its Name','Find out how {destination} got its name and explain it to the group.','Place names often hide old languages, legends or geography.',ARRAY['origin of the name {destination}','{destination} name meaning','{destination} etymology']),
('checkin','History','Hidden Hero','Find one lesser-known person from the history of {destination}, an inventor, explorer or artist, and pitch why they deserve more fame.','Big names get the statues, but hidden heroes make the best stories.',ARRAY['famous people from {destination}','{destination} inventors','{destination} history heroes']),
('checkin','History','Old Map Challenge','Find an old map of {destination} and point out 2 things that changed compared to today.','Maps show how cities grew, coasts shifted and borders moved.',ARRAY['old map {destination}','historic map {destination}','{destination} then and now']),
('checkin','Money','First Bank','Find out when the first bank opened in {destination} and what people used before it. Present in 1 minute.','How a place handled money tells you a lot about its trade and growth.',ARRAY['first bank {destination}','{destination} banking history','{destination} money history']),
('checkin','Money','Currency Close-Up','Pick one banknote or coin from {destination} and explain who or what is on it.','Money is a pocket museum: faces and symbols a place chose to celebrate.',ARRAY['{destination} currency','{destination} banknotes','who is on {destination} money']),
('checkin','Money','Price Check','Find the typical price of 5 everyday things in {destination}: coffee, bus ride, street snack, water, and a souvenir. Quiz the squad.','Knowing prices helps you budget and spot a fair deal.',ARRAY['cost of living {destination}','{destination} prices for travelers','{destination} budget tips']),
('checkin','Money','Famous Export','Find what {destination} is known for making or selling to the world and bring an example if you can.','Exports shape jobs, cities and even what is on the dinner table.',ARRAY['{destination} main exports','what is {destination} famous for','{destination} economy']),
('checkin','Money','Market Day','Find the biggest or oldest market in {destination} and pitch what the squad should look for there.','Markets are where trade, food and gossip have mixed for centuries.',ARRAY['famous markets {destination}','{destination} market history','{destination} shopping']),
('checkin','Money','Tipping Rules','Find out how tipping and paying work in {destination}: cash or card, tip or no tip. Teach the squad in 1 minute.','Getting this right avoids awkward moments and shows respect.',ARRAY['tipping in {destination}','paying in {destination}','{destination} money etiquette']),
('checkin','Work And Life','A Day In The Life','Find out what a normal workday looks like in {destination}: start time, lunch, commute. Compare it to yours.','Daily rhythms explain why shops close, when streets get busy and when people eat.',ARRAY['daily life {destination}','work culture {destination}','{destination} lifestyle']),
('checkin','Work And Life','Homes Around Town','Find what a typical home looks like in {destination} and share one surprising detail.','Homes show climate, family size and history all at once.',ARRAY['typical house {destination}','{destination} architecture homes','{destination} housing']),
('checkin','Work And Life','School Days','Find out what school is like for kids in {destination}: uniforms, lunch, hours. Share one fun fact.','School life shapes a whole culture, from friendships to food.',ARRAY['school in {destination}','{destination} education','{destination} school uniforms']),
('checkin','Work And Life','Getting Around','Find out how locals get around {destination}: trains, scooters, boats, walking. Teach the squad the best way to ride.','Transport is where you meet everyday life up close.',ARRAY['how to get around {destination}','{destination} public transport','{destination} transport tips']),
('checkin','Work And Life','Iconic Job','Pick one job that is iconic in {destination}, like a market seller or boat driver, and present what their day looks like.','Some jobs are part of the identity of a place and keep old skills alive.',ARRAY['traditional jobs {destination}','{destination} crafts and trades','{destination} workers']),
('checkin','Traditions','Holiday Host','Pick one holiday or festival in {destination} and explain how people celebrate it in 1 minute.','Festivals are when a place shows its colors, food and music all at once.',ARRAY['festivals in {destination}','{destination} holidays','{destination} celebrations']),
('checkin','Traditions','Lucky Or Not','Find 3 lucky or unlucky numbers, colors or habits in {destination} and quiz the squad.','Small beliefs about luck show up in addresses, gifts and prices.',ARRAY['lucky numbers {destination}','{destination} superstitions','{destination} lucky colors']),
('checkin','Traditions','Gift Etiquette','Find out what makes a good gift in {destination} and what to avoid. Wrap something small the local way.','Gift rules can be surprisingly specific, and getting them right is a nice touch.',ARRAY['gift giving {destination}','{destination} gift etiquette','{destination} customs']),
('checkin','Traditions','Wedding Wonders','Find one fun wedding tradition from {destination} and act it out with a squad volunteer.','Weddings pack music, food and family customs into one day.',ARRAY['wedding traditions {destination}','{destination} wedding customs','{destination} celebrations']),
('checkin','Traditions','New Year Ways','Find out how {destination} celebrates the new year and share one tradition the squad could try.','New year customs are about hope and fresh starts, everywhere in their own way.',ARRAY['new year {destination}','{destination} new year traditions','{destination} celebrations']),
('checkin','Traditions','Birthday Style','Find how birthdays are celebrated in {destination}: songs, food, rituals. Sing or show one for the group.','Birthdays are a small window into family life.',ARRAY['birthday traditions {destination}','{destination} birthday song','{destination} family customs']),
('checkin','Etiquette','Do And Do Not','Find 3 dos and 3 do nots for visitors in {destination}. Present them as a quick quiz.','Little manners matter. Knowing them makes locals more relaxed around you.',ARRAY['{destination} etiquette','dos and donts {destination}','{destination} travel manners']),
('checkin','Etiquette','The Greeting','Learn how people greet each other in {destination}: bow, handshake, kiss, or nod. Demo it on the call.','A greeting is the first thing you do with anyone. Getting it right sets the tone.',ARRAY['how to greet in {destination}','{destination} greetings','{destination} body language']),
('checkin','Etiquette','Table Manners','Find 3 table manners in {destination}: how to hold utensils, share dishes, or say you are full. Show them.','Meals are where visitors make the most etiquette mistakes. Easy to fix.',ARRAY['table manners {destination}','{destination} dining etiquette','{destination} eating customs']),
('checkin','Etiquette','Gesture Guide','Find 2 hand gestures that mean something different in {destination} than at home. Teach the squad.','A friendly gesture at home can mean something else abroad.',ARRAY['hand gestures {destination}','{destination} body language','gestures to avoid {destination}']),
('checkin','Etiquette','Dress Code','Find what to wear for different places in {destination}: temples, beaches, restaurants. Make a mini packing list.','Dressing right shows respect and saves you from being turned away.',ARRAY['what to wear {destination}','{destination} dress code','{destination} packing tips']),
('checkin','Local Games','Teach A Local Game','Find a game people play in {destination}, card, board, street or party game, and teach the squad how to play.','Games cross language barriers fast. Knowing one gets you invited in.',ARRAY['traditional games {destination}','{destination} board games','{destination} street games']),
('checkin','Local Games','Childhood Classic','Find a game kids in {destination} grow up playing and play one round with someone at home.','Childhood games are a shared memory for a whole country.',ARRAY['childhood games {destination}','{destination} kids games','{destination} playground games']),
('checkin','Local Games','Puzzle Time','Find a riddle or brain teaser from {destination} and stump the squad with it.','Riddles show what a culture finds clever and funny.',ARRAY['{destination} riddles','{destination} brain teasers','{destination} folk puzzles']),
('checkin','Geography','Map Master','Draw a rough map of {destination} from memory, then compare it to a real one. Show both.','Knowing the layout helps you plan routes and understand regions.',ARRAY['map of {destination}','{destination} regions','{destination} geography']),
('checkin','Geography','Weather Report','Give a 30-second weather report for {destination} during the trip dates, plus one packing tip.','Climate shapes food, clothing, architecture and daily schedules.',ARRAY['{destination} weather','best time to visit {destination}','{destination} climate']),
('checkin','Geography','Natural Wonder','Find one natural wonder near {destination}, a beach, mountain, river or park, and pitch a squad day trip.','Natural places are often where locals go to unwind.',ARRAY['natural wonders {destination}','{destination} nature spots','{destination} day trips']),
('checkin','Geography','Animal Ambassador','Find an animal that is a symbol of {destination} and explain why in 1 minute.','National animals often show up in legends, logos and sports teams.',ARRAY['national animal {destination}','{destination} wildlife','{destination} symbols']),
('checkin','Geography','Neighbors','Name the places that border {destination} and one thing it shares with each.','Neighbors share food, words and history, and you will notice it.',ARRAY['{destination} neighboring countries','{destination} borders','{destination} region']),
('checkin','Landmarks','Landmark Story','Pick one landmark in {destination} and tell its backstory in 1 minute, including one surprising fact.','Landmarks become way more interesting once you know their story.',ARRAY['famous landmarks {destination}','{destination} landmark history','{destination} monuments']),
('checkin','Landmarks','Photo Spot Scout','Find 3 great photo spots in {destination} and share the best time of day for each.','A little scouting means better photos and less waiting.',ARRAY['best photo spots {destination}','{destination} viewpoints','{destination} sunset spots']),
('checkin','Landmarks','Hidden Gem','Find one hidden gem in {destination} most tourists miss and pitch it to the squad.','The best memories often come from places not on the top-ten lists.',ARRAY['hidden gems {destination}','off the beaten path {destination}','{destination} local secrets']),
('checkin','Landmarks','Build It','Build a mini model of a landmark in {destination} with things from home (cups, books, blocks). Show it on the call.','Rebuilding something makes you understand how it is shaped.',ARRAY['{destination} landmark architecture','{destination} famous buildings','{destination} landmark design']),
('checkin','Landmarks','Then And Now','Find an old photo of a famous spot in {destination} and a new one. Point out 3 changes.','Comparing photos shows how fast or slow a place changes.',ARRAY['{destination} old photos','{destination} then and now','{destination} history photos']),
('checkin','Food','Fruit Tasting','Find 3 fruits common in {destination}. Taste any you can find and describe the others like a food critic.','Local fruit markets are colorful and full of things you may never have tried.',ARRAY['fruits of {destination}','{destination} tropical fruit','{destination} fruit market']),
('checkin','Food','Drink Discovery','Find a popular non-alcoholic drink from {destination}, tea, juice, coffee or soda, and make or buy it.','Everyday drinks are part of daily rituals, from morning coffee to afternoon tea.',ARRAY['popular drinks {destination}','{destination} tea culture','{destination} coffee']),
('checkin','Music','Lullaby Or Folk Song','Find a folk song or lullaby from {destination} and share its meaning.','Folk songs are passed down for generations and often tell a story.',ARRAY['{destination} folk songs','{destination} lullaby','{destination} traditional music']),
('checkin','Art','Movie Night Pick','Pick one movie or show made in {destination} and pitch it for a squad watch night in 1 minute.','Films show how a place sees itself, its humor and its everyday life.',ARRAY['best movies from {destination}','{destination} films','{destination} TV shows']),
('checkin','Art','Book Or Legend','Find a famous story, legend or book from {destination} and retell it in 90 seconds.','Legends explain names, mountains and festivals. They make sightseeing come alive.',ARRAY['{destination} legends','{destination} folk tales','famous books {destination}']),
('checkin','Language','Write Your Name','Learn to write your name or hello in the script or style used in {destination}. Show it on camera.','Seeing the script up close makes signs and menus less mysterious.',ARRAY['{destination} writing system','write name in {destination} language','{destination} alphabet']),
('checkin','Work And Life','Weekend Plans','Find what locals in {destination} love doing on weekends and pick one for the squad.','Weekend habits show what people value: family, outdoors, food or nightlife.',ARRAY['weekend in {destination}','what locals do {destination}','{destination} leisure']),
('checkin','Work And Life','Coffee Break Culture','Find out how people take breaks in {destination}: coffee, tea, snacks or naps. Recreate it at home.','Break rituals tell you how a culture balances work and rest.',ARRAY['{destination} break culture','{destination} cafe culture','{destination} daily routine']),
('checkin','Traditions','Craft Along','Find a traditional craft from {destination}, folding, weaving, carving, painting, and make a simple version.','Crafts keep old skills alive and make great souvenirs.',ARRAY['traditional crafts {destination}','{destination} DIY craft','{destination} handicrafts']),
('checkin','Traditions','Family Table','Find how families share meals in {destination}: who eats first, shared plates or not. Explain it to the squad.','Shared meals are at the heart of family life almost everywhere.',ARRAY['family meals {destination}','{destination} food culture','{destination} family traditions']),
('checkin','Etiquette','Queue And Crowds','Find how lines, crowds and personal space work in {destination}. Teach the squad one tip.','Small habits like queuing or giving space make city life smoother.',ARRAY['{destination} personal space','{destination} public etiquette','{destination} travel tips']),
('checkin','Geography','City Districts','Pick 3 neighborhoods in {destination} and give each a one-line vibe description.','Neighborhoods often feel like different worlds inside one city.',ARRAY['best neighborhoods {destination}','{destination} districts','where to go in {destination}']),
('checkin','Sports','Squad Workout','Find a local fitness habit in {destination}, like morning exercise in parks or a sport class, and lead the squad in 1 minute of it.','Watching how people stay active is a fun window into daily life.',ARRAY['{destination} fitness culture','{destination} morning exercise','{destination} outdoor sports']),
('checkin','Money','Souvenir Strategy','Find 3 souvenirs that are truly made in {destination} and how to spot real ones.','Buying real local goods supports makers and brings home a real story.',ARRAY['authentic souvenirs {destination}','{destination} local products','what to buy in {destination}']),
('checkin','History','Invention Hunt','Find one invention, food or idea that came from {destination} and present it in 1 minute.','You probably already use something that started there without knowing it.',ARRAY['inventions from {destination}','{destination} contributions','famous firsts {destination}'])
ON CONFLICT DO NOTHING;