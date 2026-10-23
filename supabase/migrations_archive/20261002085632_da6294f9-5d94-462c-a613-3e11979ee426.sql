ALTER TABLE public.trips ADD COLUMN kind text NOT NULL DEFAULT 'trip' CHECK (kind IN ('trip','at_home')),
  ADD COLUMN at_home_pack text, ADD COLUMN at_home_length text CHECK (at_home_length IS NULL OR at_home_length IN ('weekend','week','two_weeks'));

CREATE TABLE public.at_home_packs (key text PRIMARY KEY, name text NOT NULL, emoji text NOT NULL, overview text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.at_home_packs TO authenticated; GRANT ALL ON public.at_home_packs TO service_role;
ALTER TABLE public.at_home_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read packs" ON public.at_home_packs FOR SELECT TO authenticated USING (true);

CREATE TABLE public.at_home_pack_items (id serial PRIMARY KEY, pack text NOT NULL REFERENCES public.at_home_packs(key), category text NOT NULL, title text NOT NULL, body text NOT NULL, want text, alt text, adult boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.at_home_pack_items TO authenticated; GRANT ALL ON public.at_home_pack_items TO service_role;
ALTER TABLE public.at_home_pack_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read clean pack items" ON public.at_home_pack_items FOR SELECT TO authenticated USING (NOT adult);

CREATE TABLE public.at_home_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, day_date date NOT NULL, kind text NOT NULL CHECK (kind IN ('takeoff','call_night','cook','build','drop','question','passport')), item_id int REFERENCES public.at_home_pack_items(id), extra_item_id int REFERENCES public.at_home_pack_items(id), game_number int REFERENCES public.game_catalog(number), starts_at timestamptz, winner_id uuid, revealed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.at_home_activities TO service_role;
ALTER TABLE public.at_home_activities ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.at_home_activities(trip_id, day_date);

CREATE TABLE public.at_home_answers (activity_id uuid NOT NULL REFERENCES public.at_home_activities(id) ON DELETE CASCADE, user_id uuid NOT NULL, answer text NOT NULL CHECK (length(answer) BETWEEN 1 AND 280), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (activity_id, user_id));
GRANT ALL ON public.at_home_answers TO service_role; ALTER TABLE public.at_home_answers ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.at_home_votes (activity_id uuid NOT NULL REFERENCES public.at_home_activities(id) ON DELETE CASCADE, voter_id uuid NOT NULL, target_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (activity_id, voter_id));
GRANT ALL ON public.at_home_votes TO service_role; ALTER TABLE public.at_home_votes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL, captain_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('trip_unlock','at_home','tier_upgrade')), label text NOT NULL, tier text NOT NULL, list_cents int NOT NULL, discount_cents int NOT NULL DEFAULT 0, discount_source text, amount_due_cents int NOT NULL, status text NOT NULL DEFAULT 'beta_free' CHECK (status IN ('beta_free','paid')), provider_ref text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.orders TO authenticated; GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Captains read own orders" ON public.orders FOR SELECT TO authenticated USING (captain_id = auth.uid());

CREATE TABLE public.reward_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, code text NOT NULL UNIQUE, cents int NOT NULL DEFAULT 200, source_trip uuid REFERENCES public.trips(id) ON DELETE SET NULL, expires_at timestamptz NOT NULL, used_order uuid REFERENCES public.orders(id), used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.reward_codes TO authenticated; GRANT ALL ON public.reward_codes TO service_role;
ALTER TABLE public.reward_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own reward codes" ON public.reward_codes FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.postcard_stickers (user_id uuid NOT NULL, trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE, pack text NOT NULL REFERENCES public.at_home_packs(key), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, trip_id));
GRANT SELECT ON public.postcard_stickers TO authenticated; GRANT ALL ON public.postcard_stickers TO service_role;
ALTER TABLE public.postcard_stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own postcards" ON public.postcard_stickers FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Seed packs
INSERT INTO public.at_home_packs VALUES
 ('thailand','Thailand','🇹🇭','Golden temples, night markets and a whole lot of basil. Thailand is the land of smiles — sweet, salty, sour and spicy all on one plate.', now()),
 ('mexico','Mexico','🇲🇽','Bright colors, big flavors and music that makes you move. Mexico mixes ancient traditions with fiesta energy.', now()),
 ('japan','Japan','🇯🇵','Neon cities, quiet gardens and tiny details done perfectly. Japan is about craft, cozy food and a little kawaii.', now());

INSERT INTO public.at_home_pack_items(pack,category,title,body,want,alt,adult) VALUES
 ('thailand','dish','Pad kra pao','Stir-fry ground chicken with garlic, soy and basil, top with a fried egg. Easy/cheap: instant noodles + basil + egg.','Basil (any kind) and an egg',NULL,false),
 ('thailand','dish','Mango sticky rice','Sweet rice + coconut milk + sliced mango. Easy/cheap: rice pudding cup with mango on top.','A mango or mango cup',NULL,false),
 ('thailand','order_in','Thai takeout night','Everyone orders one Thai dish and shows it on the call. Rate spice levels 1–5 🌶️.',NULL,NULL,false),
 ('thailand','phrase','Sawasdee ka / krap','Hello! Women end with "ka", men with "krap". Bonus: "khob khun" = thank you.',NULL,NULL,false),
 ('thailand','phrase','Mai pen rai','"No worries / it''s all good." Use it once today.',NULL,NULL,false),
 ('thailand','playlist','Bangkok night market','Thai pop, luk thung and chill lounge beats. Everyone adds one song.',NULL,NULL,false),
 ('thailand','dress_up','Floral & bright','Wear your loudest floral or brightest shirt. Elephant pants if you''ve got them.','Your brightest shirt',NULL,false),
 ('thailand','trivia','Thailand mini trivia','Capital? (Bangkok) · Old name? (Siam) · National animal? (Elephant)',NULL,NULL,false),
 ('thailand','movie','Movie pick: The Cave (2019)','The true story of the Thai cave rescue. Or any street-food doc episode set in Bangkok.',NULL,NULL,false),
 ('thailand','snack','Snack swap: Thai iced tea','Black tea + sweetened condensed milk over ice. Everyone grabs one sweet + one salty snack.',NULL,'No-alcohol by default',false),
 ('thailand','snack','Snack swap: Chang toast','Share a Thai lager on the call.',NULL,'Swap for coconut water or Thai iced tea',true),
 ('thailand','build','Paper lotus float','Fold a paper lotus (Loy Krathong style) and float it in a bowl of water.','Paper and a bowl',NULL,false),
 ('thailand','starter','Conversation starter','Street food or fancy restaurant — which one wins forever?',NULL,NULL,false),
 ('thailand','starter','Conversation starter','What would your Thai nickname be and why?',NULL,NULL,false),
 ('thailand','question','Question','If you opened a night-market stall, what would you sell?',NULL,NULL,false),
 ('thailand','question','Question','Which squad member would win a spicy-food challenge?',NULL,NULL,false),
 ('thailand','culture','Wai greeting','Press your palms together and bow slightly — the higher the hands, the more respect.',NULL,NULL,false),
 ('thailand','culture','Muay Thai minute','Try 60 seconds of shadow boxing — the "art of eight limbs".',NULL,NULL,false),
 ('mexico','dish','Tacos al pastor-ish','Pan-fry chicken or pork with chili, garlic and pineapple; serve in tortillas. Easy/cheap: quesadillas.','Tortillas',NULL,false),
 ('mexico','dish','Elote in a cup','Corn + mayo + lime + chili powder + cheese. Easy/cheap: canned corn works.','A can of corn',NULL,false),
 ('mexico','order_in','Taco Tuesday (any day)','Everyone orders tacos or burritos. Vote on best salsa.',NULL,NULL,false),
 ('mexico','phrase','¡Salud!','"Cheers!" Bonus: "¿Qué onda?" = what''s up?',NULL,NULL,false),
 ('mexico','phrase','Mi casa es tu casa','"My house is your house" — say it when someone joins the call.',NULL,NULL,false),
 ('mexico','playlist','Fiesta mix','Mariachi, cumbia and Latin pop. Everyone adds one song.',NULL,NULL,false),
 ('mexico','dress_up','Color clash','Wear the brightest colors you own. Bonus: a flower in your hair.','Something bright',NULL,false),
 ('mexico','trivia','Mexico mini trivia','Capital? (Mexico City) · Chocolate''s origin? (Mexico) · Day of the Dead date? (Nov 1–2)',NULL,NULL,false),
 ('mexico','movie','Movie pick: Coco (2017)','A family, music and Día de Muertos.',NULL,NULL,false),
 ('mexico','snack','Snack swap: agua fresca','Blend fruit + water + a little sugar and lime. Grab chips and salsa.',NULL,'No-alcohol by default',false),
 ('mexico','snack','Snack swap: margarita toast','Classic lime margarita for the toast.',NULL,'Swap for a virgin limeade',true),
 ('mexico','build','Mini piñata','Make a tiny piñata from a paper cup or bag, fill with candy.','A paper bag and some candy',NULL,false),
 ('mexico','starter','Conversation starter','Spicy salsa or mild? Defend your answer.',NULL,NULL,false),
 ('mexico','starter','Conversation starter','Who in the squad would be the life of a fiesta?',NULL,NULL,false),
 ('mexico','question','Question','What would be on your Día de Muertos ofrenda for a fave celebrity?',NULL,NULL,false),
 ('mexico','question','Question','If you had a lucha libre name, what would it be?',NULL,NULL,false),
 ('mexico','culture','Papel picado','Those colorful cut-paper flags mean celebration — fold and snip one.',NULL,NULL,false),
 ('mexico','culture','Cumbia step','Step back, step forward, side to side — 2 minutes of cumbia.',NULL,NULL,false),
 ('japan','dish','Homemade onigiri','Shape warm rice into triangles with a filling (tuna, salmon). Easy/cheap: rice + furikake or salt.','Rice',NULL,false),
 ('japan','dish','Ramen upgrade','Instant ramen + soft egg + green onion + corn.','Instant ramen and an egg',NULL,false),
 ('japan','order_in','Sushi night','Everyone orders sushi or a bento. Rank your rolls.',NULL,NULL,false),
 ('japan','phrase','Itadakimasu','Said before eating — "I humbly receive."',NULL,NULL,false),
 ('japan','phrase','Arigatou gozaimasu','"Thank you very much." Say it to someone today.',NULL,NULL,false),
 ('japan','playlist','Tokyo neon','City pop, J-pop and anime openings. Everyone adds one song.',NULL,NULL,false),
 ('japan','dress_up','Cozy Tokyo street','Oversized hoodie + something cute (a clip, a pin, a plushie).','A hoodie',NULL,false),
 ('japan','trivia','Japan mini trivia','Capital? (Tokyo) · Highest mountain? (Fuji) · Bullet train name? (Shinkansen)',NULL,NULL,false),
 ('japan','movie','Movie pick: Spirited Away (2001)','Studio Ghibli magic. Or a short Japanese food doc.',NULL,NULL,false),
 ('japan','snack','Snack swap: konbini run','Grab one Japanese-style snack (Pocky, mochi, rice crackers) and green tea.',NULL,'No-alcohol by default',false),
 ('japan','snack','Snack swap: sake toast','A small sake or Japanese beer kanpai.',NULL,'Swap for green tea or Calpico',true),
 ('japan','build','Origami crane','Fold one paper crane — legend says 1,000 grants a wish.','A square of paper',NULL,false),
 ('japan','starter','Conversation starter','Capsule hotel or ryokan — which do you book?',NULL,NULL,false),
 ('japan','starter','Conversation starter','What anime character is each squad member?',NULL,NULL,false),
 ('japan','question','Question','Which vending-machine item would you invent?',NULL,NULL,false),
 ('japan','question','Question','Who would win a karaoke battle in the squad?',NULL,NULL,false),
 ('japan','culture','Bowing basics','A small nod for friends, a deeper bow for thanks.',NULL,NULL,false),
 ('japan','culture','Radio taiso','Try 2 minutes of the morning stretch routine Japan does together.',NULL,NULL,false);

-- 12-person cap for At Home and tier tracking
CREATE OR REPLACE FUNCTION trip_private.at_home_cap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (SELECT kind FROM public.trips WHERE id=NEW.trip_id) = 'at_home' AND (SELECT count(*) FROM public.trip_members WHERE trip_id=NEW.trip_id) >= 12 THEN
    RAISE EXCEPTION 'At Home experiences fit up to 12 people';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER at_home_cap BEFORE INSERT ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.at_home_cap();

CREATE OR REPLACE FUNCTION trip_private.at_home_tier() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; n int; cap uuid; BEGIN
  SELECT * INTO t FROM public.trips WHERE id=NEW.trip_id;
  IF t.kind <> 'at_home' OR NEW.status <> 'approved' OR (now() AT TIME ZONE t.home_timezone)::date >= t.start_date THEN RETURN NEW; END IF;
  SELECT count(*) INTO n FROM public.trip_members WHERE trip_id=t.id AND status='approved';
  IF n > 6 AND EXISTS (SELECT 1 FROM public.orders WHERE trip_id=t.id AND kind='at_home' AND tier='1-6')
     AND NOT EXISTS (SELECT 1 FROM public.orders WHERE trip_id=t.id AND tier='7-12') THEN
    SELECT user_id INTO cap FROM public.trip_members WHERE trip_id=t.id AND role='captain' LIMIT 1;
    INSERT INTO public.orders(trip_id,captain_id,kind,label,tier,list_cents,discount_cents,amount_due_cents,status)
    VALUES (t.id, cap, 'tier_upgrade', 'Group grew to 7–12 people', '7-12', 300, 0, 300, 'beta_free');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER at_home_tier AFTER INSERT OR UPDATE OF status ON public.trip_members FOR EACH ROW EXECUTE FUNCTION trip_private.at_home_tier();

-- Plan generation
CREATE OR REPLACE FUNCTION trip_private.at_home_pick(p_trip uuid, p_cat text) RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT i.id FROM public.at_home_pack_items i JOIN public.trips t ON t.id=p_trip AND i.pack=t.at_home_pack
  WHERE i.category=p_cat AND (NOT i.adult OR t.vibe='party')
  ORDER BY (i.id IN (SELECT a.item_id FROM public.at_home_activities a WHERE a.trip_id=p_trip AND a.item_id IS NOT NULL UNION SELECT a.extra_item_id FROM public.at_home_activities a WHERE a.trip_id=p_trip AND a.extra_item_id IS NOT NULL)),
    (i.id IN (SELECT a.item_id FROM public.at_home_activities a JOIN public.trip_members m ON m.trip_id=a.trip_id AND m.role='captain' JOIN public.trip_members me ON me.trip_id=p_trip AND me.role='captain' AND me.user_id=m.user_id WHERE a.trip_id<>p_trip)),
    random() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_add(p_trip uuid, p_day date, p_kind text, p_cat text, p_extra text DEFAULT NULL, p_call boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE tz text := (SELECT home_timezone FROM public.trips WHERE id=p_trip); v_item int; v_extra int; BEGIN
  v_item := CASE WHEN p_cat IS NULL THEN NULL ELSE trip_private.at_home_pick(p_trip, p_cat) END;
  INSERT INTO public.at_home_activities(trip_id,day_date,kind,item_id,starts_at,game_number) VALUES (p_trip,p_day,p_kind,v_item,
    CASE WHEN p_call THEN (p_day + time '19:00') AT TIME ZONE tz END,
    CASE WHEN p_kind='call_night' THEN (SELECT number FROM public.game_catalog ORDER BY random() LIMIT 1) END);
  IF p_extra IS NOT NULL THEN
    v_extra := trip_private.at_home_pick(p_trip, p_extra);
    UPDATE public.at_home_activities SET extra_item_id=v_extra WHERE trip_id=p_trip AND day_date=p_day AND kind=p_kind AND extra_item_id IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION trip_private.plan_at_home(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; len int; d int; v_day date; dow int; wk int; drops int[] := ARRAY[0,0,0]; last_d int := 0; cyc int := 0; cooks int := 0; v_cap int; total int; drop_max int; v_cat text;
  kinds text[] := ARRAY['question','phrase','culture','snack','starter']; BEGIN
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  DELETE FROM public.at_home_activities WHERE trip_id=p_trip;
  len := t.end_date - t.start_date + 1;
  PERFORM trip_private.at_home_add(p_trip, t.start_date, 'takeoff', 'playlist', NULL, true);
  IF t.at_home_length = 'weekend' THEN
    PERFORM trip_private.at_home_add(p_trip, t.start_date, 'call_night', 'trivia', 'dress_up', true);
    PERFORM trip_private.at_home_add(p_trip, t.start_date+1, 'cook', 'dish');
    PERFORM trip_private.at_home_add(p_trip, t.start_date+1, 'question', 'question');
    PERFORM trip_private.at_home_add(p_trip, t.start_date+2, 'build', 'build');
  ELSE
    IF t.at_home_length='week' THEN v_cap := 7; drop_max := 2; ELSE v_cap := 9; drop_max := 1; END IF;
    FOR d IN 1..len-2 LOOP
      v_day := t.start_date + d; dow := extract(isodow FROM v_day)::int; wk := d / 7 + 1;
      total := (SELECT count(*) FROM public.at_home_activities WHERE trip_id=p_trip) + 1;
      IF total >= v_cap THEN EXIT; END IF;
      IF dow = 5 THEN PERFORM trip_private.at_home_add(p_trip, v_day, 'call_night', 'trivia', 'dress_up', true); last_d := d;
      ELSIF dow = 6 THEN
        IF cooks % 2 = 0 THEN v_cat := 'dish'; ELSE v_cat := 'order_in'; END IF;
        PERFORM trip_private.at_home_add(p_trip, v_day, 'cook', v_cat); cooks := cooks + 1;
        PERFORM trip_private.at_home_add(p_trip, v_day, 'question', 'question'); last_d := d;
      ELSIF dow = 7 THEN PERFORM trip_private.at_home_add(p_trip, v_day, 'build', 'build'); last_d := d;
      ELSIF d - last_d >= 2 AND drops[wk] < drop_max THEN
        v_cat := kinds[cyc % 5 + 1];
        IF v_cat = 'question' THEN PERFORM trip_private.at_home_add(p_trip, v_day, 'question', 'question');
        ELSE PERFORM trip_private.at_home_add(p_trip, v_day, 'drop', v_cat); END IF;
        cyc := cyc + 1; drops[wk] := drops[wk] + 1; last_d := d;
      END IF;
    END LOOP;
  END IF;
  PERFORM trip_private.at_home_add(p_trip, t.end_date, 'passport', 'movie', 'trivia', true);
END;
$$;

-- Create an At Home experience
CREATE OR REPLACE FUNCTION trip_private.create_at_home(p_pack text, p_length text, p_start date, p_vibe text, p_tz text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_trip uuid; v_end date; v_name text; attempt int; tz text := coalesce(nullif(trim(p_tz),''),'UTC'); BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF NOT trip_private.has_beta_access() THEN RAISE EXCEPTION 'TripJunkies is invite-only during the private beta'; END IF;
  IF coalesce(trip_private.age_of(auth.uid()),0) < 18 THEN RAISE EXCEPTION 'Captains need to be 18 or older'; END IF;
  PERFORM now() AT TIME ZONE tz;
  SELECT name INTO v_name FROM public.at_home_packs WHERE key=p_pack;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Pick a destination'; END IF;
  IF p_length NOT IN ('weekend','week','two_weeks') THEN RAISE EXCEPTION 'Pick a length'; END IF;
  IF p_vibe NOT IN ('family','chill','party') THEN RAISE EXCEPTION 'Pick a vibe'; END IF;
  IF p_vibe = 'party' AND coalesce(trip_private.age_of(auth.uid()),0) < 21 THEN RAISE EXCEPTION 'Party vibe needs a Captain who is 21+'; END IF;
  IF p_start IS NULL OR p_start < (now() AT TIME ZONE tz)::date OR p_start > (now() AT TIME ZONE tz)::date + 365 THEN RAISE EXCEPTION 'Pick a start date from today on'; END IF;
  IF p_length='weekend' AND extract(isodow FROM p_start) <> 5 THEN RAISE EXCEPTION 'Weekend experiences start on a Friday'; END IF;
  v_end := p_start + CASE p_length WHEN 'weekend' THEN 2 WHEN 'week' THEN 6 ELSE 13 END;
  FOR attempt IN 1..15 LOOP
    BEGIN
      INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,trip_timezone,join_code,kind,at_home_pack,at_home_length,season_scoring,vibe)
      VALUES ('🏠 ' || v_name || ' at Home', v_name || ' (at home)', p_start, v_end, tz, tz, public.new_trip_code(), 'at_home', p_pack, p_length, false, p_vibe) RETURNING id INTO v_trip;
      EXIT;
    EXCEPTION WHEN unique_violation THEN IF attempt = 15 THEN RAISE; END IF;
    END;
  END LOOP;
  INSERT INTO public.trip_members(trip_id,user_id,role,approved_at) VALUES (v_trip,auth.uid(),'captain',now());
  PERFORM trip_private.plan_at_home(v_trip);
  RETURN v_trip;
END $$;

-- Read the plan (released per viewer's own morning)
CREATE OR REPLACE FUNCTION trip_private.at_home_plan(p_trip uuid) RETURNS TABLE(id uuid, day_date date, kind text, released boolean, title text, body text, want text, extra_title text, extra_body text, starts_at timestamptz, game_name text, game_how text, winner_id uuid, revealed boolean, answers integer, answered boolean, voted boolean, today date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; v_today date; adult_ok boolean; BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT * INTO t FROM public.trips WHERE trips.id=p_trip;
  BEGIN v_today := (now() AT TIME ZONE coalesce((SELECT nullif(p.time_zone,'') FROM public.profiles p WHERE p.id=auth.uid()), t.home_timezone))::date;
  EXCEPTION WHEN others THEN v_today := (now() AT TIME ZONE t.home_timezone)::date; END;
  adult_ok := t.vibe='party' AND coalesce(public.adult_badge(p_trip, auth.uid()), false);
  RETURN QUERY SELECT a.id, a.day_date, a.kind, a.day_date <= v_today,
    CASE WHEN a.day_date <= v_today THEN i.title END,
    CASE WHEN a.day_date <= v_today THEN CASE WHEN i.adult AND NOT adult_ok THEN i.alt ELSE i.body END END,
    CASE WHEN a.day_date - 2 <= v_today THEN i.want END,
    CASE WHEN a.day_date <= v_today AND NOT (x.adult AND NOT adult_ok) THEN x.title END,
    CASE WHEN a.day_date <= v_today AND NOT (x.adult AND NOT adult_ok) THEN x.body END,
    a.starts_at, g.name, CASE WHEN a.day_date <= v_today THEN g.how_to_play END, a.winner_id, a.revealed_at IS NOT NULL,
    (SELECT count(*)::int FROM public.at_home_answers s WHERE s.activity_id=a.id),
    EXISTS (SELECT 1 FROM public.at_home_answers s WHERE s.activity_id=a.id AND s.user_id=auth.uid()),
    EXISTS (SELECT 1 FROM public.at_home_votes v WHERE v.activity_id=a.id AND v.voter_id=auth.uid()),
    v_today
  FROM public.at_home_activities a LEFT JOIN public.at_home_pack_items i ON i.id=a.item_id LEFT JOIN public.at_home_pack_items x ON x.id=a.extra_item_id LEFT JOIN public.game_catalog g ON g.number=a.game_number
  WHERE a.trip_id=p_trip ORDER BY a.day_date, coalesce(a.starts_at, a.day_date::timestamptz), a.kind;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_released(p_activity uuid) RETURNS public.at_home_activities LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.at_home_activities; r record; BEGIN
  SELECT * INTO a FROM public.at_home_activities WHERE id=p_activity;
  IF NOT FOUND OR NOT trip_private.is_trip_member(a.trip_id, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT * INTO r FROM trip_private.at_home_plan(a.trip_id) p WHERE p.id=p_activity;
  IF NOT r.released THEN RAISE EXCEPTION 'This one isn''t out yet'; END IF;
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_answer(p_activity uuid, p_answer text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.at_home_activities; BEGIN
  a := trip_private.at_home_released(p_activity);
  IF a.kind <> 'question' OR a.revealed_at IS NOT NULL THEN RAISE EXCEPTION 'Answers are closed'; END IF;
  IF length(trim(coalesce(p_answer,''))) NOT BETWEEN 1 AND 280 THEN RAISE EXCEPTION 'Write a short answer'; END IF;
  INSERT INTO public.at_home_answers(activity_id,user_id,answer) VALUES (p_activity,auth.uid(),trim(p_answer))
  ON CONFLICT (activity_id,user_id) DO UPDATE SET answer=EXCLUDED.answer;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_vote(p_activity uuid, p_idx int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.at_home_activities; v_target uuid; BEGIN
  a := trip_private.at_home_released(p_activity);
  IF a.kind <> 'question' OR a.revealed_at IS NOT NULL THEN RAISE EXCEPTION 'Voting is closed'; END IF;
  SELECT s.user_id INTO v_target FROM (SELECT user_id, row_number() OVER (ORDER BY md5(user_id::text || a.id::text)) rn FROM public.at_home_answers WHERE activity_id=a.id) s WHERE s.rn=p_idx;
  IF v_target IS NULL THEN RAISE EXCEPTION 'Pick an answer'; END IF;
  IF v_target = auth.uid() THEN RAISE EXCEPTION 'You can''t vote for your own answer'; END IF;
  INSERT INTO public.at_home_votes(activity_id,voter_id,target_id) VALUES (a.id,auth.uid(),v_target)
  ON CONFLICT (activity_id,voter_id) DO UPDATE SET target_id=EXCLUDED.target_id;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_question(p_activity uuid) RETURNS TABLE(idx int, answer text, mine boolean, user_id uuid, votes int, my_vote boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.at_home_activities; BEGIN
  a := trip_private.at_home_released(p_activity);
  RETURN QUERY SELECT s.rn::int, s.answer, s.user_id=auth.uid(),
    CASE WHEN a.revealed_at IS NOT NULL THEN s.user_id END,
    CASE WHEN a.revealed_at IS NOT NULL THEN (SELECT count(*)::int FROM public.at_home_votes v WHERE v.activity_id=a.id AND v.target_id=s.user_id) END,
    EXISTS (SELECT 1 FROM public.at_home_votes v WHERE v.activity_id=a.id AND v.voter_id=auth.uid() AND v.target_id=s.user_id)
  FROM (SELECT x.user_id, x.answer, row_number() OVER (ORDER BY md5(x.user_id::text || a.id::text)) rn FROM public.at_home_answers x WHERE x.activity_id=a.id) s ORDER BY s.rn;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_reveal(p_activity uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.at_home_activities; BEGIN
  a := trip_private.at_home_released(p_activity);
  IF NOT trip_private.is_leader(a.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can reveal'; END IF;
  UPDATE public.at_home_activities SET revealed_at=coalesce(revealed_at, now()), updated_at=now() WHERE id=a.id;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_mark_winner(p_activity uuid, p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.at_home_activities; BEGIN
  a := trip_private.at_home_released(p_activity);
  IF NOT trip_private.is_leader(a.trip_id) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can mark a winner'; END IF;
  IF a.kind NOT IN ('call_night','cook','build') THEN RAISE EXCEPTION 'Winners are for game nights and challenges'; END IF;
  IF p_user IS NOT NULL AND NOT trip_private.is_trip_member(a.trip_id, p_user) THEN RAISE EXCEPTION 'Pick someone in the squad'; END IF;
  UPDATE public.at_home_activities SET winner_id=p_user, updated_at=now() WHERE id=a.id;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_move_call(p_activity uuid, p_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.at_home_activities; t public.trips; BEGIN
  SELECT * INTO a FROM public.at_home_activities WHERE id=p_activity;
  IF NOT FOUND OR NOT trip_private.is_captain(a.trip_id) THEN RAISE EXCEPTION 'Only the Captain can move a call'; END IF;
  IF a.starts_at IS NULL THEN RAISE EXCEPTION 'This activity has no call time'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=a.trip_id;
  IF (p_at AT TIME ZONE t.home_timezone)::date NOT BETWEEN t.start_date AND t.end_date THEN RAISE EXCEPTION 'Keep it inside the experience dates'; END IF;
  UPDATE public.at_home_activities SET starts_at=p_at, day_date=(p_at AT TIME ZONE t.home_timezone)::date, updated_at=now() WHERE id=a.id;
END $$;

CREATE OR REPLACE FUNCTION trip_private.at_home_mvp(p_trip uuid) RETURNS TABLE(user_id uuid, points int, wins int, votes int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; v_today date; BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  SELECT p.today INTO v_today FROM trip_private.at_home_plan(p_trip) p LIMIT 1;
  IF t.ended_at IS NULL AND coalesce(v_today, current_date) < t.end_date THEN RETURN; END IF;
  RETURN QUERY WITH w AS (SELECT a.winner_id u, count(*)::int n FROM public.at_home_activities a WHERE a.trip_id=p_trip AND a.winner_id IS NOT NULL GROUP BY 1),
    v AS (SELECT vt.target_id u, count(*)::int n FROM public.at_home_votes vt JOIN public.at_home_activities a ON a.id=vt.activity_id AND a.trip_id=p_trip AND a.revealed_at IS NOT NULL GROUP BY 1)
  SELECT m.user_id, coalesce(w.n,0)*3 + coalesce(v.n,0), coalesce(w.n,0), coalesce(v.n,0)
  FROM public.trip_members m LEFT JOIN w ON w.u=m.user_id LEFT JOIN v ON v.u=m.user_id
  WHERE m.trip_id=p_trip AND m.status='approved' ORDER BY 2 DESC;
END $$;

-- Orders & checkout
CREATE OR REPLACE FUNCTION trip_private.order_quote(p_trip uuid) RETURNS TABLE(kind text, label text, tier text, headcount int, list_cents int, discount_cents int, discount_source text, amount_due_cents int, paid boolean, upgrade_cents int, order_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; ret int := 0; code int := 0; pr record; BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can check out'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip;
  SELECT count(*)::int INTO headcount FROM public.trip_members m WHERE m.trip_id=p_trip AND m.status='approved';
  IF t.kind='at_home' THEN
    kind := 'at_home'; tier := CASE WHEN headcount <= 6 THEN '1-6' ELSE '7-12' END; list_cents := CASE WHEN headcount <= 6 THEN 599 ELSE 899 END;
    label := (SELECT name FROM public.at_home_packs WHERE key=t.at_home_pack) || ' at Home · ' || CASE t.at_home_length WHEN 'weekend' THEN 'Weekend' WHEN 'week' THEN '1 week' ELSE '2 weeks' END;
    IF EXISTS (SELECT 1 FROM public.orders o WHERE o.captain_id=auth.uid() AND o.kind='at_home' AND o.trip_id IS DISTINCT FROM p_trip) THEN ret := 100; END IF;
  ELSE
    SELECT * INTO pr FROM trip_private.trip_price(p_trip, NULL);
    kind := 'trip_unlock'; tier := CASE WHEN pr.addon_cents > 0 THEN 'big_group' ELSE 'base' END; list_cents := pr.total_cents; label := t.name || ' · ' || pr.days || '-day trip';
  END IF;
  SELECT r.cents INTO code FROM public.reward_codes r WHERE r.user_id=auth.uid() AND r.used_at IS NULL AND r.expires_at > now() ORDER BY r.created_at LIMIT 1;
  code := coalesce(code, 0);
  IF code > 0 AND code >= ret THEN discount_cents := least(code, list_cents); discount_source := 'captain_code';
  ELSIF ret > 0 THEN discount_cents := ret; discount_source := 'returning';
  ELSE discount_cents := 0; discount_source := NULL; END IF;
  amount_due_cents := list_cents - discount_cents;
  SELECT o.id INTO order_id FROM public.orders o WHERE o.trip_id=p_trip AND o.kind IN ('at_home','trip_unlock') ORDER BY o.created_at LIMIT 1;
  paid := order_id IS NOT NULL OR t.unlocked_at IS NOT NULL;
  upgrade_cents := CASE WHEN t.kind='at_home' AND EXISTS (SELECT 1 FROM public.orders o WHERE o.trip_id=p_trip AND o.kind='tier_upgrade') THEN 300 ELSE 0 END;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION trip_private.checkout_beta(p_trip uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t public.trips; q record; v_order uuid; v_code uuid; BEGIN
  IF NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Only the Captain can check out'; END IF;
  SELECT * INTO t FROM public.trips WHERE id=p_trip FOR UPDATE;
  SELECT * INTO q FROM trip_private.order_quote(p_trip);
  IF q.order_id IS NOT NULL THEN RETURN q.order_id; END IF;
  IF t.unlocked_at IS NOT NULL THEN RAISE EXCEPTION 'This trip is already unlocked'; END IF;
  IF q.discount_source = 'captain_code' THEN
    SELECT id INTO v_code FROM public.reward_codes WHERE user_id=auth.uid() AND used_at IS NULL AND expires_at > now() ORDER BY created_at LIMIT 1 FOR UPDATE;
  END IF;
  INSERT INTO public.orders(trip_id,captain_id,kind,label,tier,list_cents,discount_cents,discount_source,amount_due_cents,status)
  VALUES (p_trip, auth.uid(), q.kind, q.label, q.tier, q.list_cents, q.discount_cents, q.discount_source, q.amount_due_cents, 'beta_free') RETURNING id INTO v_order;
  IF v_code IS NOT NULL THEN UPDATE public.reward_codes SET used_at=now(), used_order=v_order WHERE id=v_code; END IF;
  -- Beta: the stored order unlocks. Later only a verified payment webhook marks orders paid.
  UPDATE public.trips SET unlocked_at=now(), unlocked_by=auth.uid(), big_group = big_group OR q.tier='big_group' WHERE id=p_trip;
  RETURN v_order;
END $$;

-- End trip: postcards for At Home, Captain reward code for real trips
CREATE OR REPLACE FUNCTION trip_private.end_trip(p_trip uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$ DECLARE tr public.trips; today date; BEGIN
IF NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid() AND role='captain') THEN RAISE EXCEPTION 'Only the Captain can end the trip'; END IF;
SELECT * INTO tr FROM public.trips WHERE id=p_trip FOR UPDATE; today := (now() AT TIME ZONE tr.home_timezone)::date;
IF tr.ended_at IS NOT NULL THEN RETURN; END IF;
IF today < tr.end_date OR today > tr.end_date + 1 THEN RAISE EXCEPTION 'You can end the trip from its last day until a day after'; END IF;
UPDATE public.trips SET ended_at = now() WHERE id=p_trip;
IF tr.kind = 'at_home' THEN
  INSERT INTO public.postcard_stickers(user_id,trip_id,pack) SELECT user_id, p_trip, tr.at_home_pack FROM public.trip_members WHERE trip_id=p_trip AND status='approved' ON CONFLICT DO NOTHING;
ELSIF NOT tr.is_sandbox AND NOT EXISTS (SELECT 1 FROM public.reward_codes WHERE user_id=auth.uid() AND used_at IS NULL AND expires_at > now()) THEN
  INSERT INTO public.reward_codes(user_id,code,cents,source_trip,expires_at) VALUES (auth.uid(), 'CAPT-' || upper(substr(md5(gen_random_uuid()::text),1,6)), 200, p_trip, now() + interval '90 days');
END IF;
END $function$;

-- Test Lab
CREATE OR REPLACE FUNCTION trip_private.lab_at_home(p_pack text, p_length text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_trip uuid; me uuid := auth.uid(); tz text := 'America/Los_Angeles'; today date; v_start date; b record; k int := 0; len int; BEGIN
  PERFORM trip_private.lab_guard(NULL);
  IF p_pack NOT IN ('thailand','mexico','japan') OR p_length NOT IN ('weekend','week','two_weeks') THEN RAISE EXCEPTION 'Pick one of the presets'; END IF;
  IF (SELECT count(*) FROM public.sandbox_bots WHERE trip_id IS NULL) < 3 THEN RAISE EXCEPTION 'Not enough bots ready'; END IF;
  today := (now() AT TIME ZONE tz)::date;
  v_start := CASE WHEN p_length='weekend' THEN today - ((extract(isodow FROM today)::int - 5 + 7) % 7) ELSE today END;
  len := CASE p_length WHEN 'weekend' THEN 3 WHEN 'week' THEN 7 ELSE 14 END;
  IF v_start + len - 1 < today THEN v_start := today + ((5 - extract(isodow FROM today)::int + 7) % 7); END IF;
  INSERT INTO public.trips(name,destination,start_date,end_date,home_timezone,trip_timezone,join_code,is_sandbox,kind,at_home_pack,at_home_length,season_scoring,require_approval,unlocked_at,unlocked_by)
  VALUES ('🧪 At Home · ' || initcap(p_pack) || ' · ' || CASE p_length WHEN 'weekend' THEN 'Weekend' WHEN 'week' THEN '1 week' ELSE '2 weeks' END,
    initcap(p_pack) || ' (at home)', v_start, v_start + len - 1, tz, tz, public.new_trip_code(), true, 'at_home', p_pack, p_length, false, false, now(), me) RETURNING id INTO v_trip;
  INSERT INTO public.sandbox_trips(trip_id,size,days,window_days) VALUES (v_trip,4,len,0);
  INSERT INTO public.trip_members(trip_id,user_id,role,approved_at) VALUES (v_trip,me,'captain',now());
  PERFORM trip_private.lab_card(v_trip, me, 'Founder', 0);
  FOR b IN SELECT user_id, name FROM public.sandbox_bots WHERE trip_id IS NULL ORDER BY created_at, user_id LIMIT 3 LOOP
    k := k + 1;
    UPDATE public.sandbox_bots SET trip_id=v_trip WHERE user_id=b.user_id;
    INSERT INTO public.trip_members(trip_id,user_id,role,approved_at) VALUES (v_trip,b.user_id,'player',now());
    PERFORM trip_private.lab_card(v_trip, b.user_id, b.name, k);
  END LOOP;
  PERFORM trip_private.plan_at_home(v_trip);
  RETURN v_trip;
END $$;

CREATE OR REPLACE FUNCTION trip_private.lab_at_home_bots(p_trip uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a record; b record; n int := 0; BEGIN
  PERFORM trip_private.lab_guard(p_trip);
  FOR a IN SELECT p.id FROM trip_private.at_home_plan(p_trip) p WHERE p.kind='question' AND p.released AND NOT p.revealed LOOP
    FOR b IN SELECT user_id, name FROM public.sandbox_bots WHERE trip_id=p_trip LOOP
      INSERT INTO public.at_home_answers(activity_id,user_id,answer) VALUES (a.id, b.user_id, (ARRAY['Totally the karaoke one 🎤','Mango everything 🥭','A tiny dumpling stand','Me, obviously 😎','Whoever brings snacks'])[1 + floor(random()*5)::int]) ON CONFLICT DO NOTHING;
    END LOOP;
    FOR b IN SELECT user_id FROM public.sandbox_bots WHERE trip_id=p_trip LOOP
      INSERT INTO public.at_home_votes(activity_id,voter_id,target_id)
      SELECT a.id, b.user_id, s.user_id FROM public.at_home_answers s WHERE s.activity_id=a.id AND s.user_id<>b.user_id ORDER BY random() LIMIT 1 ON CONFLICT DO NOTHING;
    END LOOP;
    n := n + 1;
  END LOOP;
  RETURN n || ' question(s) answered and voted by bots';
END $$;

-- Public wrappers
CREATE OR REPLACE FUNCTION public.create_at_home(p_pack text, p_length text, p_start date, p_vibe text, p_tz text) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.create_at_home(p_pack,p_length,p_start,p_vibe,p_tz) $$;
CREATE OR REPLACE FUNCTION public.at_home_plan(p_trip uuid) RETURNS TABLE(id uuid, day_date date, kind text, released boolean, title text, body text, want text, extra_title text, extra_body text, starts_at timestamptz, game_name text, game_how text, winner_id uuid, revealed boolean, answers integer, answered boolean, voted boolean, today date) LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.at_home_plan(p_trip) $$;
CREATE OR REPLACE FUNCTION public.at_home_answer(p_activity uuid, p_answer text) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.at_home_answer(p_activity,p_answer) $$;
CREATE OR REPLACE FUNCTION public.at_home_vote(p_activity uuid, p_idx int) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.at_home_vote(p_activity,p_idx) $$;
CREATE OR REPLACE FUNCTION public.at_home_question(p_activity uuid) RETURNS TABLE(idx int, answer text, mine boolean, user_id uuid, votes int, my_vote boolean) LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.at_home_question(p_activity) $$;
CREATE OR REPLACE FUNCTION public.at_home_reveal(p_activity uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.at_home_reveal(p_activity) $$;
CREATE OR REPLACE FUNCTION public.at_home_mark_winner(p_activity uuid, p_user uuid) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.at_home_mark_winner(p_activity,p_user) $$;
CREATE OR REPLACE FUNCTION public.at_home_move_call(p_activity uuid, p_at timestamptz) RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.at_home_move_call(p_activity,p_at) $$;
CREATE OR REPLACE FUNCTION public.at_home_mvp(p_trip uuid) RETURNS TABLE(user_id uuid, points int, wins int, votes int) LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.at_home_mvp(p_trip) $$;
CREATE OR REPLACE FUNCTION public.order_quote(p_trip uuid) RETURNS TABLE(kind text, label text, tier text, headcount int, list_cents int, discount_cents int, discount_source text, amount_due_cents int, paid boolean, upgrade_cents int, order_id uuid) LANGUAGE sql STABLE SET search_path TO 'public' AS $$ SELECT * FROM trip_private.order_quote(p_trip) $$;
CREATE OR REPLACE FUNCTION public.checkout_beta(p_trip uuid) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.checkout_beta(p_trip) $$;
CREATE OR REPLACE FUNCTION public.lab_at_home(p_pack text, p_length text) RETURNS uuid LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.lab_at_home(p_pack,p_length) $$;
CREATE OR REPLACE FUNCTION public.lab_at_home_bots(p_trip uuid) RETURNS text LANGUAGE sql SET search_path TO 'public' AS $$ SELECT trip_private.lab_at_home_bots(p_trip) $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['trip_private.at_home_cap()','trip_private.at_home_tier()','trip_private.at_home_pick(uuid,text)','trip_private.at_home_add(uuid,date,text,text,text,boolean)','trip_private.plan_at_home(uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || f || ' FROM PUBLIC, anon, authenticated';
  END LOOP;
  FOREACH f IN ARRAY ARRAY['trip_private.create_at_home(text,text,date,text,text)','trip_private.at_home_plan(uuid)','trip_private.at_home_released(uuid)','trip_private.at_home_answer(uuid,text)','trip_private.at_home_vote(uuid,integer)','trip_private.at_home_question(uuid)','trip_private.at_home_reveal(uuid)','trip_private.at_home_mark_winner(uuid,uuid)','trip_private.at_home_move_call(uuid,timestamptz)','trip_private.at_home_mvp(uuid)','trip_private.order_quote(uuid)','trip_private.checkout_beta(uuid)','trip_private.lab_at_home(text,text)','trip_private.lab_at_home_bots(uuid)','trip_private.end_trip(uuid)',
    'public.create_at_home(text,text,date,text,text)','public.at_home_plan(uuid)','public.at_home_answer(uuid,text)','public.at_home_vote(uuid,integer)','public.at_home_question(uuid)','public.at_home_reveal(uuid)','public.at_home_mark_winner(uuid,uuid)','public.at_home_move_call(uuid,timestamptz)','public.at_home_mvp(uuid)','public.order_quote(uuid)','public.checkout_beta(uuid)','public.lab_at_home(text,text)','public.lab_at_home_bots(uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || f || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || f || ' TO authenticated, service_role';
  END LOOP;
END $$;
-- trip_private.at_home_plan is called inside at_home_mvp/at_home_released/lab bots (definer context) as well.
GRANT EXECUTE ON FUNCTION trip_private.at_home_pick(uuid,text), trip_private.at_home_add(uuid,date,text,text,text,boolean), trip_private.plan_at_home(uuid) TO service_role;