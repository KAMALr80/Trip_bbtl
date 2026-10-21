CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.normalize_game_name(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public, extensions AS $$
  SELECT regexp_replace(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p,''))), '\s', '', 'g'), '([^[:alnum:]])\1+', '\1', 'g')
$$;

CREATE OR REPLACE FUNCTION public.game_name_problem(p_name text, p_user uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE n text := coalesce(p_name,''); norm text; len int;
BEGIN
  len := char_length(btrim(n));
  IF len < 2 THEN RETURN 'Game names need at least 2 characters.'; END IF;
  IF len > 20 THEN RETURN 'Game names can be up to 20 characters.'; END IF;
  IF n <> btrim(n) THEN RETURN 'Remove spaces at the start or end.'; END IF;
  IF n ~ '\s\s' THEN RETURN 'Use only one space between words.'; END IF;
  IF n !~ '[[:alpha:][:digit:]]' THEN RETURN 'Add at least one letter or number.'; END IF;
  IF n ~* '(https?:|www\.|\.(com|net|org|app|io|co|me|gg|tv)(\W|$))' THEN RETURN 'Links aren''t allowed in game names.'; END IF;
  IF n ~ '@[[:alnum:]_]' THEN RETURN '@handles aren''t allowed in game names.'; END IF;
  norm := public.normalize_game_name(n);
  IF norm ~ '(fuck|shit|bitch|cunt|nigg|fag|whore|slut|dick|pussy|rape|nazi|retard)' THEN RETURN 'Please pick a friendlier name.'; END IF;
  IF norm ~ '(tripjunkie|captain|admin|support|founder)'
     AND NOT EXISTS (SELECT 1 FROM app_admins WHERE user_id = p_user) THEN
    RETURN 'That name is reserved. Try something else.'; END IF;
  IF EXISTS (SELECT 1 FROM player_profiles WHERE public.normalize_game_name(game_name) = norm AND user_id IS DISTINCT FROM p_user) THEN
    RETURN 'TAKEN'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.game_name_available(p_name text) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT public.game_name_problem(p_name, auth.uid())
$$;
REVOKE ALL ON FUNCTION public.game_name_problem(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.game_name_problem(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.game_name_available(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.game_name_available(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_player_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prob text; r text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.game_name IS DISTINCT FROM OLD.game_name THEN
    prob := public.game_name_problem(NEW.game_name, NEW.user_id);
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
REVOKE ALL ON FUNCTION public.guard_player_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_player_profile ON public.player_profiles;
CREATE TRIGGER guard_player_profile BEFORE INSERT OR UPDATE ON public.player_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_player_profile();

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_game_name_norm_uq ON public.player_profiles (public.normalize_game_name(game_name));