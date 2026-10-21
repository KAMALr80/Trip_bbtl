ALTER TABLE public.game_night_flow ADD COLUMN quest_step_at timestamptz;
DO $migration$
DECLARE definition text; original text;
BEGIN
  definition := pg_get_functiondef('trip_private.night_flow_action(uuid,integer,text)'::regprocedure);
  original := 'ELSIF p_action=''finale'' THEN';
  IF position(original in definition)=0 THEN RAISE EXCEPTION 'Unexpected night flow implementation'; END IF;
  definition := replace(definition, original, 'ELSIF p_action=''quests'' THEN
  IF NOT trip_private.night_open(p_trip,p_week) THEN RAISE EXCEPTION ''Present quests while the night is live''; END IF;
  UPDATE public.game_night_flow SET quest_step_at=coalesce(quest_step_at,clock_timestamp()) WHERE trip_id=p_trip AND week_number=p_week AND phase=''finale'';
  IF NOT FOUND THEN RAISE EXCEPTION ''Finish the game first''; END IF;
' || original);
  EXECUTE definition;
  definition := pg_get_functiondef('trip_private.spin_next_game(uuid)'::regprocedure);
  original := 'IF v_target IS NULL THEN RAISE EXCEPTION ''No upcoming week needs a game''; END IF;';
  IF position(original in definition)=0 THEN RAISE EXCEPTION 'Unexpected spin implementation'; END IF;
  definition := replace(definition,original,original || '
IF v_current IS NOT NULL AND trip_private.night_open(p_trip,v_current) AND NOT EXISTS (SELECT 1 FROM public.game_night_flow f WHERE f.trip_id=p_trip AND f.week_number=v_current AND f.quest_step_at IS NOT NULL) THEN RAISE EXCEPTION ''Present your quests before spinning for next week''; END IF;');
  EXECUTE definition;
END $migration$;