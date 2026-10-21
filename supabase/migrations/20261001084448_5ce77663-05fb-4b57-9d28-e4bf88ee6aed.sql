ALTER TABLE public.player_profiles ADD COLUMN pronouns text CHECK (length(pronouns) <= 60);
ALTER TABLE public.trip_player_cards ADD COLUMN pronouns text CHECK (length(pronouns) <= 60);
CREATE OR REPLACE FUNCTION trip_private.sync_profile_to_cards() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ BEGIN
UPDATE public.trip_player_cards SET real_name=NEW.real_name, game_name=NEW.game_name, avatar_style=NEW.avatar_style, avatar_seed=NEW.avatar_seed, avatar_path=NEW.avatar_path, hometown=NEW.hometown, occupation=NEW.occupation, fun_fact=NEW.fun_fact, trip_persona=NEW.trip_persona, next_year_goal=NEW.next_year_goal, pronouns=NEW.pronouns WHERE user_id=NEW.user_id;
RETURN NEW; END $fn$;
CREATE OR REPLACE FUNCTION trip_private.fill_card_from_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$ DECLARE p public.player_profiles; BEGIN
SELECT * INTO p FROM public.player_profiles WHERE user_id=NEW.user_id;
IF FOUND THEN NEW.real_name:=p.real_name; NEW.game_name:=p.game_name; NEW.avatar_style:=p.avatar_style; NEW.avatar_seed:=p.avatar_seed; NEW.avatar_path:=p.avatar_path; NEW.hometown:=p.hometown; NEW.occupation:=p.occupation; NEW.fun_fact:=p.fun_fact; NEW.trip_persona:=p.trip_persona; NEW.next_year_goal:=p.next_year_goal; NEW.pronouns:=p.pronouns; END IF;
RETURN NEW; END $fn$;
CREATE OR REPLACE FUNCTION trip_private.spin_next_game(p_trip uuid) RETURNS TABLE(game_number integer, week_number integer, spin_time timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_target integer; v_current integer; v_game integer; v_used integer[]; v_now timestamptz := clock_timestamp();
BEGIN
IF NOT EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=p_trip AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Not in this trip'; END IF;
SELECT n.week_number INTO v_current FROM public.game_nights n WHERE n.trip_id=p_trip AND n.starts_at<=v_now ORDER BY n.starts_at DESC LIMIT 1;
SELECT n.week_number INTO v_target FROM public.game_nights n WHERE n.trip_id=p_trip AND n.game_number IS NULL AND n.starts_at>v_now AND (v_current IS NULL OR n.week_number>v_current) ORDER BY n.week_number LIMIT 1;
IF v_target IS NULL THEN RAISE EXCEPTION 'No upcoming week needs a game'; END IF;
IF v_target=1 THEN RAISE EXCEPTION 'The Captain chooses the first game'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.trip_members m WHERE m.trip_id=p_trip AND m.user_id=auth.uid() AND (m.role IN ('captain','co_captain') OR m.user_id=(SELECT n.host_id FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=coalesce(v_current,1)))) THEN RAISE EXCEPTION 'Only a leader or this week''s host can spin'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.game_nights n WHERE n.trip_id=p_trip AND n.week_number=v_target-1 AND n.game_number IS NOT NULL) THEN RAISE EXCEPTION 'Choose the previous week''s game first'; END IF;
INSERT INTO public.trip_play_state(trip_id) VALUES(p_trip) ON CONFLICT DO NOTHING;
SELECT s.used_games INTO v_used FROM public.trip_play_state s WHERE s.trip_id=p_trip FOR UPDATE;
IF cardinality(v_used)>=12 THEN v_used:='{}'; END IF;
SELECT g.number INTO v_game FROM public.game_catalog g WHERE NOT(g.number=ANY(v_used)) ORDER BY random() LIMIT 1;
UPDATE public.game_nights n SET game_number=v_game WHERE n.trip_id=p_trip AND n.week_number=v_target AND n.game_number IS NULL;
IF NOT FOUND THEN RAISE EXCEPTION 'That week already has a game'; END IF;
UPDATE public.trip_play_state s SET used_games=array_append(v_used,v_game),spin_game=v_game,spin_week=v_target,spin_at=v_now WHERE s.trip_id=p_trip;
RETURN QUERY SELECT v_game,v_target,v_now;
END $fn$;