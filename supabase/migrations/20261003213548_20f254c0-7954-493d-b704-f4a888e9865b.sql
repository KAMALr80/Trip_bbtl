CREATE TABLE public.security_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('trip','home')),
  category text NOT NULL,
  text text NOT NULL,
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, text, trip_id)
);
GRANT SELECT ON public.security_missions TO authenticated;
GRANT ALL ON public.security_missions TO service_role;
ALTER TABLE public.security_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read missions" ON public.security_missions FOR SELECT TO authenticated USING (trip_id IS NULL OR trip_private.is_trip_member(trip_id, auth.uid()));

CREATE TABLE public.mission_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  slot int NOT NULL CHECK (slot BETWEEN 1 AND 5),
  mission_id uuid REFERENCES public.security_missions(id) ON DELETE SET NULL,
  category text NOT NULL,
  mission_text text NOT NULL,
  points int NOT NULL CHECK (points IN (2,3)),
  status text NOT NULL DEFAULT 'revealed' CHECK (status IN ('revealed','pending','released','declined','skipped')),
  verified_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id, slot)
);
GRANT SELECT ON public.mission_claims TO authenticated;
GRANT ALL ON public.mission_claims TO service_role;
ALTER TABLE public.mission_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or leader reads claims" ON public.mission_claims FOR SELECT TO authenticated USING (user_id = auth.uid() OR trip_private.is_leader(trip_id));

CREATE OR REPLACE FUNCTION trip_private.mission_bonus(p_trip uuid) RETURNS TABLE(user_id uuid, points int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.user_id, least(12, sum(c.points))::int FROM public.mission_claims c WHERE c.trip_id = p_trip AND c.status = 'released' GROUP BY c.user_id
$$;

CREATE OR REPLACE FUNCTION trip_private.mission_action(p_trip uuid, p_action text, p_slot int, p_claim uuid, p_layover boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_kind text; v_m public.security_missions; v_c public.mission_claims; v_id uuid; v_has_co boolean;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=v_uid AND status='approved') THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF p_action = 'reveal' THEN
    IF p_slot IS NULL OR p_slot < 1 OR p_slot > 5 THEN RAISE EXCEPTION 'Pick a mission slot'; END IF;
    IF p_slot > 3 AND NOT coalesce(p_layover,false) THEN RAISE EXCEPTION 'Missions 4 and 5 are for layovers'; END IF;
    IF EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND slot=p_slot) THEN RAISE EXCEPTION 'Mission already revealed'; END IF;
    IF p_slot > 1 AND NOT EXISTS (SELECT 1 FROM public.mission_claims WHERE trip_id=p_trip AND user_id=v_uid AND slot=p_slot-1 AND status<>'revealed') THEN RAISE EXCEPTION 'Finish the mission before this one'; END IF;
    SELECT CASE WHEN kind IN ('at_home','cultural_inspiration') THEN 'home' ELSE 'trip' END INTO v_kind FROM public.trips WHERE id=p_trip;
    SELECT * INTO v_m FROM public.security_missions m
      WHERE m.kind=v_kind AND (m.trip_id IS NULL OR m.trip_id=p_trip)
        AND NOT EXISTS (SELECT 1 FROM public.mission_claims c WHERE c.trip_id=p_trip AND c.user_id=v_uid AND c.mission_id=m.id)
      ORDER BY md5(m.id::text || v_uid::text || p_trip::text) LIMIT 1;
    IF v_m.id IS NULL THEN RAISE EXCEPTION 'No more missions — try More missions'; END IF;
    INSERT INTO public.mission_claims(trip_id,user_id,slot,mission_id,category,mission_text,points)
      VALUES (p_trip,v_uid,p_slot,v_m.id,v_m.category,v_m.text,CASE WHEN p_slot<=3 THEN 2 ELSE 3 END) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT * INTO v_c FROM public.mission_claims WHERE id=p_claim AND trip_id=p_trip FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Mission not found'; END IF;
  IF p_action IN ('complete','skip') THEN
    IF v_c.user_id <> v_uid THEN RAISE EXCEPTION 'Not your mission'; END IF;
    IF v_c.status <> 'revealed' THEN RAISE EXCEPTION 'Already answered'; END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='complete' THEN 'pending' ELSE 'skipped' END, updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  ELSIF p_action IN ('verify','decline') THEN
    IF NOT trip_private.is_leader(p_trip) THEN RAISE EXCEPTION 'Only the Captain or Co-Captain can verify'; END IF;
    IF v_c.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;
    IF v_c.user_id = v_uid THEN
      SELECT EXISTS (SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND role='co_captain' AND status='approved' AND user_id<>v_uid) INTO v_has_co;
      IF v_has_co OR NOT trip_private.is_captain(p_trip) THEN RAISE EXCEPTION 'Another leader must verify your own mission'; END IF;
    END IF;
    UPDATE public.mission_claims SET status = CASE WHEN p_action='verify' THEN 'released' ELSE 'declined' END, verified_by=v_uid, decided_at=now(), updated_at=now() WHERE id=v_c.id;
    RETURN v_c.id;
  END IF;
  RAISE EXCEPTION 'Unknown action';
END $$;

-- AI top-up: only after this user spent mission_topup credits in the last 10 minutes.
CREATE OR REPLACE FUNCTION trip_private.add_trip_missions(p_trip uuid, p_texts text[]) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind text; v_n int;
BEGIN
  IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ai_usage WHERE trip_id=p_trip AND user_id=auth.uid() AND kind='mission_topup' AND created_at > now() - interval '10 minutes') THEN RAISE EXCEPTION 'Spend credits first'; END IF;
  SELECT CASE WHEN kind IN ('at_home','cultural_inspiration') THEN 'home' ELSE 'trip' END INTO v_kind FROM public.trips WHERE id=p_trip;
  INSERT INTO public.security_missions(kind,category,text,trip_id)
    SELECT v_kind, 'Fresh for your trip', left(trim(t),200), p_trip FROM unnest(p_texts[1:10]) t WHERE length(trim(t)) > 5
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT; RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.mission_action(p_trip uuid, p_action text, p_slot int DEFAULT NULL, p_claim uuid DEFAULT NULL, p_layover boolean DEFAULT false) RETURNS uuid LANGUAGE sql SET search_path = public AS $$ SELECT trip_private.mission_action(p_trip,p_action,p_slot,p_claim,p_layover) $$;
CREATE OR REPLACE FUNCTION public.mission_bonus(p_trip uuid) RETURNS TABLE(user_id uuid, points int) LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN IF NOT trip_private.is_trip_member(p_trip, auth.uid()) THEN RAISE EXCEPTION 'Join this trip first'; END IF; RETURN QUERY SELECT * FROM trip_private.mission_bonus(p_trip); END $$;
CREATE OR REPLACE FUNCTION public.add_trip_missions(p_trip uuid, p_texts text[]) RETURNS int LANGUAGE sql SET search_path = public AS $$ SELECT trip_private.add_trip_missions(p_trip,p_texts) $$;
REVOKE ALL ON FUNCTION trip_private.mission_action(uuid,text,int,uuid,boolean), trip_private.mission_bonus(uuid), trip_private.add_trip_missions(uuid,text[]), public.mission_action(uuid,text,int,uuid,boolean), public.mission_bonus(uuid), public.add_trip_missions(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION trip_private.mission_action(uuid,text,int,uuid,boolean), trip_private.mission_bonus(uuid), trip_private.add_trip_missions(uuid,text[]), public.mission_action(uuid,text,int,uuid,boolean), public.mission_bonus(uuid), public.add_trip_missions(uuid,text[]) TO authenticated;

-- Season score: released mission bonus (max 12) added before the 0–100 clamp.
CREATE OR REPLACE FUNCTION trip_private.game_board(p_trip uuid)
 RETURNS TABLE(user_id uuid, stamps integer, mx integer, pen integer, attended integer, score integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH pen AS (SELECT hp.user_id, sum(hp.stamps)::int n FROM public.host_penalties hp JOIN public.game_nights gn ON gn.trip_id=hp.trip_id AND gn.week_number=hp.week_number AND NOT gn.skipped
   WHERE hp.trip_id=p_trip AND NOT EXISTS (SELECT 1 FROM public.skip_passes sp WHERE sp.trip_id=p_trip AND sp.user_id=hp.user_id AND sp.kind='captain' AND sp.ref=hp.week_number::text) GROUP BY hp.user_id),
att AS (SELECT s.user_id, count(*)::int n FROM public.game_scores s JOIN public.game_nights gn ON gn.trip_id=s.trip_id AND gn.week_number=s.week_number AND NOT gn.skipped AND gn.starts_at <= now() WHERE s.trip_id=p_trip AND s.here GROUP BY s.user_id),
bon AS (SELECT * FROM trip_private.mission_bonus(p_trip))
SELECT g.user_id, g.stamps, g.mx, coalesce(pen.n,0), coalesce(att.n,0),
  least(100, greatest(0, (CASE WHEN g.mx>0 THEN round(g.stamps*100.0/g.mx) ELSE 0 END)::int - coalesce(pen.n,0) + coalesce(bon.points,0)))::int
FROM trip_private.game_stamps(p_trip) g LEFT JOIN pen ON pen.user_id=g.user_id LEFT JOIN att ON att.user_id=g.user_id LEFT JOIN bon ON bon.user_id=g.user_id $function$;

CREATE OR REPLACE FUNCTION trip_private.credit_cost(p_action text) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE p_action WHEN 'custom_game' THEN 3 WHEN 'regen_set' THEN 5 WHEN 'dest_activities' THEN 3 WHEN 'team_challenges' THEN 3 WHEN 'athome_pack' THEN 5 WHEN 'itinerary_extra' THEN 2 WHEN 'inspiration_guide' THEN 2 WHEN 'mission_topup' THEN 2 ELSE NULL END $$;

INSERT INTO public.security_missions(kind,category,text) VALUES
('trip','Before You Leave','Wear the most colorful socks you own on travel day.'),
('trip','Before You Leave','Pick a squad theme song and play it as you head out the door.'),
('trip','Before You Leave','Pack one tiny surprise snack to share with the squad later.'),
('trip','Before You Leave','Wear a really big (soft, packable) hat for the ride.'),
('trip','Before You Leave','Snap a "goodbye house" selfie at your front door.'),
('trip','Before You Leave','Learn three words in the destination''s language before you go.'),
('trip','Before You Leave','Write a one-line trip prediction and reveal it on arrival.'),
('trip','Before You Leave','Match one clothing color with at least one squad member.'),
('trip','The Ride To The Airport','Get your driver to share their best travel tip.'),
('trip','The Ride To The Airport','Spot three planes in the sky before you reach the terminal.'),
('trip','The Ride To The Airport','Lead the car in a 30-second sing-along.'),
('trip','The Ride To The Airport','Rate the ride playlist out of 10 — with reasons.'),
('trip','The Ride To The Airport','Name every country you can see on license plates or signs.'),
('trip','The Ride To The Airport','Take a "we''re off!" photo with your luggage at the curb.'),
('trip','The Ride To The Airport','Tell the squad your most embarrassing travel moment.'),
('trip','Check-in And Security Line','Compliment a staff member''s great service — genuinely.'),
('trip','Check-in And Security Line','Say "thank you" in three languages to people who helped you today.'),
('trip','Check-in And Security Line','Guess your bag''s weight before it hits the scale.'),
('trip','Check-in And Security Line','Find someone in your squad with the same shoe brand.'),
('trip','Check-in And Security Line','Pack your tray with zero fumbles — calm, quick, done.'),
('trip','Check-in And Security Line','Smile and wish the next traveler a good trip.'),
('trip','Check-in And Security Line','Spot a destination on the departures board you''ve never heard of.'),
('trip','Check-in And Security Line','Be the squad member who gets their shoes back on first.'),
('trip','Check-in And Security Line','Count the destinations on the departures board starting with your letter.'),
('trip','Check-in And Security Line','Hum a travel song quietly until a squad member names it.'),
('trip','Check-in And Security Line','Make up a secret squad handshake to do once you''re through.'),
('trip','Check-in And Security Line','Find the airport''s mascot, art piece or big sign and pose with it.'),
('trip','At The Gate','Strike a superhero boarding pose with your squad.'),
('trip','At The Gate','Find a snack you''ve never tried and share a bite.'),
('trip','At The Gate','Ask a friendly traveler where they''re headed and why.'),
('trip','At The Gate','Spell your name with letters from airline logos you can see.'),
('trip','At The Gate','Do a 60-second stretch routine with the squad.'),
('trip','At The Gate','Take a squad photo with a plane in the window.'),
('trip','At The Gate','Guess your flight''s exact boarding time — closest wins bragging rights.'),
('trip','At The Gate','Teach the squad one word in the destination''s language.'),
('trip','At The Gate','Write a postcard-style text to someone back home.'),
('trip','At The Gate','Find the most interesting sign at the gate and read it like a movie trailer.'),
('trip','At The Gate','Trade a travel tip with someone happy to chat.'),
('trip','At The Gate','Plan your first meal at the destination with the squad.'),
('trip','At The Gate','Do a slow-motion walk to the window like a movie hero.'),
('trip','At The Gate','Name the plane at your gate and announce it to the squad.'),
('trip','Boarding And In The Air','Thank the crew by name when you board.'),
('trip','Boarding And In The Air','Draw a tiny portrait of a squad member on a napkin.'),
('trip','Boarding And In The Air','Spot a cloud that looks like an animal and photograph it.'),
('trip','Boarding And In The Air','Watch a movie in a genre you never pick.'),
('trip','Boarding And In The Air','Learn a fun fact about the destination from the in-flight magazine.'),
('trip','Boarding And In The Air','Write a three-line poem about the view.'),
('trip','Boarding And In The Air','Ask the crew for their favorite city — politely, at a quiet moment.'),
('trip','Boarding And In The Air','Snap a window-seat photo of the sky.'),
('trip','Boarding And In The Air','Make a list of five things you want to do on this trip.'),
('trip','Boarding And In The Air','Say "please" and "thank you" in the destination''s language to the crew.'),
('trip','Boarding And In The Air','Guess the flight time to the minute before takeoff.'),
('trip','Boarding And In The Air','Try the meal or snack option you''d usually skip.'),
('trip','Boarding And In The Air','Pass a secret note to a squad member with a compliment.'),
('trip','Layover','Find the best-rated coffee or tea in the terminal.'),
('trip','Layover','Take a photo with a sign showing a country you''re not visiting.'),
('trip','Layover','Buy a tiny local treat from the layover city.'),
('trip','Layover','Walk 2,000 steps through the terminal.'),
('trip','Layover','Learn how to say "hello" in the layover country''s language.'),
('trip','Layover','Find the airport''s quietest seat and have a 5-minute calm break.'),
('trip','Layover','Ask a friendly local about their favorite food spot.'),
('trip','Layover','Spot five different airline logos.'),
('trip','Layover','Do a squad photo pretending you live in this airport.'),
('trip','Layover','Find a piece of art in the terminal and give it a funny title.'),
('trip','Layover','Write the best airport review of all time — in one sentence.'),
('trip','Layover','Find a currency you''ve never seen and learn its name.'),
('trip','Arrival','Say hello in the local language to someone happy to chat.'),
('trip','Arrival','Take a "we made it!" squad jump photo.'),
('trip','Arrival','Ask a friendly local for their favorite food spot.'),
('trip','Arrival','Find the first welcome sign and pose with it.'),
('trip','Arrival','Try a local drink or snack within the first hour (non-alcoholic counts).'),
('trip','Arrival','Spot something you''ve never seen back home.'),
('trip','Arrival','Learn how to say "thank you" from a local.'),
('trip','Arrival','Give your driver a sincere thank-you in the local language.'),
('trip','Arrival','Pick a squad nickname for the city.'),
('trip','Arrival','Record a 10-second "first impressions" voice note.'),
('trip','Arrival','Find the funniest translated sign you can and share it.'),
('trip','Arrival','Ask permission and take a photo with a friendly local or staff member.'),
('trip','Arrival','Smell the air and describe it in three words.'),
('trip','Arrival','Pick the squad''s first "photo of the trip."'),
('trip','Arrival','Find a street, shop or sign with your name or initial in it.'),
('trip','Arrival','Wave to a passing tour bus or tram with the squad.'),
('home','Get Ready At Home','Dress up as a pilot using things from your closet.'),
('home','Get Ready At Home','Make boarding passes for everyone at home.'),
('home','Get Ready At Home','Set up chairs like airplane rows and seat your passengers.'),
('home','Get Ready At Home','Give a safety demo using a seatbelt made from a scarf.'),
('home','Get Ready At Home','Pack a tiny "carry-on" with three things that represent you.'),
('home','Get Ready At Home','Make a passport for a pet or stuffed animal.'),
('home','Get Ready At Home','Announce "boarding now" like a gate agent.'),
('home','Get Ready At Home','Design a squad airline logo on paper.'),
('home','Get Ready At Home','Serve snacks from a pretend drinks cart.'),
('home','Get Ready At Home','Make a departures board with your dream destinations.'),
('home','Get Ready At Home','Take a boarding-pose photo at your front door.'),
('home','Get Ready At Home','Build a "security scanner" arch out of a doorframe and streamers.'),
('home','Get Ready At Home','Do the pilot''s welcome speech in your best captain voice.'),
('home','Get Ready At Home','Make window-seat views by drawing clouds on paper.'),
('home','Get Ready At Home','Wear the biggest hat you own for a full hour.'),
('home','Culture At Home','Greet someone in the destination''s language.'),
('home','Culture At Home','Cook or order a dish from the destination.'),
('home','Culture At Home','Wear a color or item that''s special in the culture.'),
('home','Culture At Home','Learn three words in the language and teach them to someone.'),
('home','Culture At Home','Play a song from the destination and dance for 30 seconds.'),
('home','Culture At Home','Find the destination on a map and trace a route from home.'),
('home','Culture At Home','Learn one fun fact about the culture and share it.'),
('home','Culture At Home','Try a snack from the culture you''ve never had.'),
('home','Culture At Home','Draw the destination''s flag from memory.'),
('home','Culture At Home','Learn how to count to five in the language.'),
('home','Culture At Home','Watch a short video tour of the destination with someone.'),
('home','Culture At Home','Make a postcard from the destination and "mail" it to a family member.'),
('home','Culture At Home','Learn a traditional greeting gesture respectfully.'),
('home','Culture At Home','Find a story or legend from the culture and retell it.'),
('home','Culture At Home','Set the table the way it''s done in the culture.'),
('home','Culture At Home','Ask an older relative what they know about the place.'),
('home','Culture At Home','Make a mini travel guide with three must-see spots.'),
('home','Culture At Home','Try writing your name in the local script.'),
('home','Arrival At Home','Do a "we landed!" cheer with everyone at home.'),
('home','Arrival At Home','Stamp everyone''s handmade passport.'),
('home','Arrival At Home','Hold a pretend baggage claim with pillows on the floor.'),
('home','Arrival At Home','Take a "welcome to…" photo with a handmade sign.'),
('home','Arrival At Home','Give a tour of your home like a local guide.'),
('home','Arrival At Home','Rate the "flight" out of five stars with funny reviews.'),
('home','Arrival At Home','Make a souvenir from things around the house.'),
('home','Arrival At Home','Record a 10-second "first impressions" video of the pretend destination.');