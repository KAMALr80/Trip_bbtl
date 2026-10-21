-- Remove only the October 4 featured seed; retain all other cards and trips.
DELETE FROM public.game_cards c WHERE c.trip_id IS NULL AND c.game_number IS NOT NULL AND c.created_at >= '2026-10-04'::timestamptz AND c.created_at < '2026-10-05'::timestamptz AND NOT EXISTS (SELECT 1 FROM public.trip_play_state s WHERE s.draw_card_id=c.id) AND NOT EXISTS (SELECT 1 FROM public.game_night_reactions r WHERE r.card_id=c.id);
ALTER TABLE public.game_cards ADD COLUMN IF NOT EXISTS answer text;
WITH themes(category,ord,topic) AS (
 VALUES
 ('travel',1,'the first street you want to explore in {destination}'),('travel',2,'an unexpected route through the city'),('travel',3,'your ideal window-seat view'),('travel',4,'a neighborhood you would explore on foot'),('travel',5,'your first hour after arrival'),('travel',6,'a local craft you want to learn'),('travel',7,'the best way to spend a free afternoon'),('travel',8,'a souvenir with a story'),('travel',9,'a landmark at sunrise'),('travel',10,'the sounds of a busy market'),('travel',11,'a place in {destination} you would show a friend'),('travel',12,'the one stop you would add to this trip'),
 ('food',1,'a street snack in {destination}'),('food',2,'a family recipe'),('food',3,'the smell of a bakery'),('food',4,'a breakfast worth waking early for'),('food',5,'a dish you learned to make'),('food',6,'a surprising food pairing'),('food',7,'a market ingredient you cannot name'),('food',8,'a dessert you would share'),('food',9,'your comfort meal'),('food',10,'the first bite of a new dish'),('food',11,'a meal you would cook for the squad'),('food',12,'a food stall in {destination}'),
 ('childhood',1,'a childhood road trip'),('childhood',2,'the snack you traded at school'),('childhood',3,'a song from your first vacation'),('childhood',4,'the game you played outside'),('childhood',5,'a family meal you remember'),('childhood',6,'your first postcard'),('childhood',7,'a silly souvenir you kept'),('childhood',8,'the place you dreamed of visiting'),('childhood',9,'a travel mishap you laughed about later'),('childhood',10,'a drawing you were proud of'),('childhood',11,'a friend who taught you a game'),('childhood',12,'a childhood tradition you would bring along'),
 ('deep',1,'a journey that changed your perspective'),('deep',2,'something you learned from a stranger'),('deep',3,'a place that felt like home'),('deep',4,'a skill you want to learn here'),('deep',5,'a tradition you hope to carry forward'),('deep',6,'a memory tied to music'),('deep',7,'the hardest good decision you made on a trip'),('deep',8,'a person who taught you to be curious'),('deep',9,'a small kindness you still remember'),('deep',10,'what belonging means when you travel'),('deep',11,'a moment you surprised yourself'),('deep',12,'a story you wish you had asked someone to tell'),
 ('spicy',1,'the boldest detour you would take'),('spicy',2,'an opinion about tourist traps'),('spicy',3,'the risk of trying something you cannot pronounce'),('spicy',4,'the most overrated travel habit'),('spicy',5,'a fear you would like to outgrow'),('spicy',6,'the one comfort you would leave behind'),('spicy',7,'the hardest lesson from a trip'),('spicy',8,'a truth you rarely tell about yourself')
), games(n,mechanic) AS (VALUES (1,'truths'),(2,'baby'),(3,'song'),(4,'hotseat'),(5,'trivia'),(6,'phrase'),(7,'cook'),(8,'likely'),(9,'gartic'),(10,'camera'),(11,'emoji'),(12,'rather'),(13,'quote'),(14,'never'),(15,'takes')),
written AS (SELECT g.n,t.category,t.ord,CASE g.mechanic
 WHEN 'truths' THEN 'Tell two true memories and one invented memory about '||t.topic||'. Let the crew spot the lie.'
 WHEN 'baby' THEN 'Show a childhood photo if you have one; tell two clues about '||t.topic||'. Who can match the story to the kid? If you have no photo, sketch it.'
 WHEN 'song' THEN 'Play or hum a short clean song that reminds you of '||t.topic||'. Everyone guesses whose pick it was and why.'
 WHEN 'hotseat' THEN 'Hot seat: you have 30 seconds to tell the crew about '||t.topic||'. Then take one follow-up question.'
 WHEN 'trivia' THEN 'Quick trivia: Which member can name three things connected to '||t.topic||' in 20 seconds? Check together; no invented local facts.'
 WHEN 'phrase' THEN 'Teach a short phrase you would use while talking about '||t.topic||'. Everyone tries it aloud; check pronunciation together.'
 WHEN 'cook' THEN 'Cook-off: pitch a clean, practical dish or snack inspired by '||t.topic||'. What are your three ingredients? The crew picks a winner.'
 WHEN 'likely' THEN 'Who’s most likely to make a whole afternoon out of '||t.topic||'? Point together, then let your pick defend themselves.'
 WHEN 'gartic' THEN 'Draw '||t.topic||' without writing words or numbers. The crew has 30 seconds to guess.'
 WHEN 'camera' THEN 'Camera Roll: find a photo that reminds you of '||t.topic||'. Show it only if you want; the crew guesses the story.'
 WHEN 'emoji' THEN 'Describe '||t.topic||' with exactly three emojis. Let the crew decode your story.'
 WHEN 'rather' THEN 'Would you rather explore '||t.topic||' with a local guide or discover it with a friend and no plan? Defend your choice.'
 WHEN 'quote' THEN 'Write a one-line anonymous quote about '||t.topic||'. Shuffle the quotes and guess who said each one.'
 WHEN 'never' THEN 'Never have I ever told the crew a story about '||t.topic||'. If you have, share the short version.'
 WHEN 'takes' THEN 'Hot take: '||t.topic||' deserves a place on every itinerary. Defend or challenge that opinion.' END AS prompt,
CASE WHEN g.mechanic='trivia' THEN 'Three relevant examples; verify together. There is no single factual destination answer.' ELSE NULL END AS answer FROM games g CROSS JOIN themes t)
INSERT INTO public.game_cards(trip_id,game_number,category,prompt,answer) SELECT NULL,n,category,prompt,answer FROM written;
UPDATE public.security_missions SET text='Try a local snack or a non-alcoholic drink within the first hour.' WHERE kind='trip' AND text='Try a local drink or snack within the first hour (non-alcoholic counts).';
UPDATE public.security_missions SET title='Local Story',text='Find the story behind one famous landmark or local invention in {destination} and give a 1-minute presentation.',backstory='Landmarks and inventions can reveal how people built, worked and created together.',keywords=ARRAY['{destination} landmarks','{destination} local inventions','{destination} history'] WHERE kind='checkin' AND title='First Leader' AND trip_id IS NULL;
-- Prevent raw templates from escaping via direct Data API reads. Server-side AI runs under service role.
REVOKE SELECT ON public.game_cards FROM authenticated, anon;
DROP POLICY IF EXISTS "Read seed and member cards" ON public.game_cards;
CREATE POLICY "Read seed and member cards" ON public.game_cards FOR SELECT TO authenticated USING ((trip_id IS NULL AND category<>'spicy') OR (trip_id IS NOT NULL AND trip_private.is_trip_member(trip_id,auth.uid()) AND (category<>'spicy' OR trip_private.is_approved_adult(trip_id,auth.uid()))));
CREATE OR REPLACE FUNCTION trip_private.render_card(p_trip uuid, p_prompt text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE v_destination text; v_city text; BEGIN
 SELECT nullif(btrim(split_part(t.destination,',',1)),''), (SELECT nullif(btrim(d->>'city'),'') FROM public.trip_itineraries i CROSS JOIN LATERAL jsonb_array_elements(i.days::jsonb) d WHERE i.trip_id=p_trip AND nullif(btrim(d->>'city'),'') IS NOT NULL ORDER BY CASE WHEN d->>'date'=to_char(now() AT TIME ZONE coalesce(t.trip_timezone,t.home_timezone),'YYYY-MM-DD') THEN 0 ELSE 1 END, d->>'date' LIMIT 1) INTO v_destination,v_city FROM public.trips t WHERE t.id=p_trip;
 RETURN replace(replace(p_prompt,'{destination}',coalesce(v_destination,v_city,'your destination')),'{city}',coalesce(v_city,v_destination,'your city'));
END $$;
REVOKE ALL ON FUNCTION trip_private.render_card(uuid,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.game_card_view(p_trip uuid, p_category text DEFAULT NULL) RETURNS TABLE(id bigint,trip_id uuid,category text,prompt text,created_at timestamptz,updated_at timestamptz,game_number integer,answer text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id bigint; BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid() AND m.status='approved') THEN RAISE EXCEPTION 'Join this trip first'; END IF;
 IF p_category IS NULL THEN
  SELECT s.draw_card_id INTO v_id FROM public.trip_play_state s WHERE s.trip_id=p_trip;
  RETURN QUERY SELECT c.id,c.trip_id,c.category,trip_private.render_card(p_trip,c.prompt),c.created_at,c.updated_at,c.game_number,c.answer FROM public.game_cards c WHERE c.id=v_id AND (c.category<>'spicy' OR trip_private.is_approved_adult(p_trip,auth.uid()));
 ELSIF p_category IN ('most-likely','would-you-rather','get-to-know') THEN
  RETURN QUERY SELECT c.id,c.trip_id,c.category,trip_private.render_card(p_trip,c.prompt),c.created_at,c.updated_at,c.game_number,c.answer FROM public.game_cards c WHERE c.category=p_category AND (c.trip_id IS NULL OR c.trip_id=p_trip) ORDER BY random() LIMIT 30;
 ELSE RAISE EXCEPTION 'Only the current card or clean vote prompts are available'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.game_card_view(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.game_card_view(uuid,text) TO authenticated;