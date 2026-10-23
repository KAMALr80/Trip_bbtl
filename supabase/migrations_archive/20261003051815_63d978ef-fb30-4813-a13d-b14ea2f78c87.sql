CREATE OR REPLACE FUNCTION trip_private.game_name_problem(p_name text, p_user uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n text := coalesce(p_name,''); norm text; len int;
BEGIN
  len := char_length(btrim(n));
  IF len < 2 THEN RETURN 'Game names need at least 2 characters.'; END IF;
  IF len > 15 THEN RETURN 'Game names can be up to 15 characters.'; END IF;
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
END $function$;