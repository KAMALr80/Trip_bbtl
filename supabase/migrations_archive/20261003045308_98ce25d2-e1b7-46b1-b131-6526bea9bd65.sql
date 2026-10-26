ALTER FUNCTION public.game_name_problem(text, uuid) SET SCHEMA trip_private;
REVOKE ALL ON FUNCTION trip_private.game_name_problem(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION trip_private.game_name_problem(text, uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.game_name_available(p_name text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$ SELECT trip_private.game_name_problem(p_name, auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.guard_player_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prob text; r text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.game_name IS DISTINCT FROM OLD.game_name THEN
    prob := trip_private.game_name_problem(NEW.game_name, NEW.user_id);
    IF prob = 'TAKEN' THEN RAISE EXCEPTION 'That game name is taken. Try another.' USING ERRCODE = '23505'; END IF;
    IF prob IS NOT NULL THEN RAISE EXCEPTION '%', prob USING ERRCODE = '22023'; END IF;
  END IF;
  IF NEW.trip_persona IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.trip_persona IS DISTINCT FROM OLD.trip_persona)
     AND NEW.trip_persona NOT IN ('planner','hype person','photographer','food finder') THEN
    r := NEW.trip_persona;
    IF char_length(btrim(r)) < 2 OR char_length(btrim(r)) > 24 THEN RAISE EXCEPTION 'Trip roles need 2–24 characters.' USING ERRCODE='22023'; END IF;
    IF r <> btrim(r) OR r ~ '\s\s' THEN RAISE EXCEPTION 'Check the spaces in your trip role.' USING ERRCODE='22023'; END IF;
    IF r !~ '[[:alpha:][:digit:]]' THEN RAISE EXCEPTION 'Add at least one letter or number to your trip role.' USING ERRCODE='22023'; END IF;
    IF r ~* '(https?:|www\.|\.(com|net|org|app|io|co|me|gg|tv)(\W|$))' OR r ~ '@[[:alnum:]_]' THEN RAISE EXCEPTION 'Links aren''t allowed in your trip role.' USING ERRCODE='22023'; END IF;
    IF public.normalize_game_name(r) ~ '(fuck|shit|bitch|cunt|nigg|fag|whore|slut|dick|pussy|rape|nazi|retard)' THEN RAISE EXCEPTION 'Please pick a friendlier trip role.' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN NEW;
END $$;