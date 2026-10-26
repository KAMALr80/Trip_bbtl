-- 1. Trip persona: widen to match player_profiles' rule (trip_private.guard_player_profile):
--    the five presets OR free text of 2-24 chars, trimmed, no double spaces,
--    at least one letter/number, no links or @handles, friendly language. NULL allowed.
ALTER TABLE public.trip_player_cards
  DROP CONSTRAINT trip_player_cards_trip_persona_check;

ALTER TABLE public.trip_player_cards
  ADD CONSTRAINT trip_player_cards_trip_persona_check CHECK (
    trip_persona IS NULL
    OR (
      trip_persona = btrim(trip_persona)
      AND char_length(btrim(trip_persona)) BETWEEN 2 AND 24
      AND trip_persona !~ '\s\s'
      AND trip_persona ~ '[[:alpha:][:digit:]]'
      AND trip_persona !~* '(https?:|www\.|\.(com|net|org|app|io|co|me|gg|tv)(\W|$))'
      AND trip_persona !~ '@[[:alnum:]_]'
      AND public.normalize_game_name(trip_persona) !~ '(fuck|shit|bitch|cunt|nigg|fag|whore|slut|dick|pussy|rape|nazi|retard)'
    )
  );

-- 2. avatar_path: also accept the account/<user_id>/... shape used by the profile editor.
ALTER TABLE public.trip_player_cards
  DROP CONSTRAINT trip_player_cards_check;

ALTER TABLE public.trip_player_cards
  ADD CONSTRAINT trip_player_cards_check CHECK (
    avatar_path IS NULL
    OR (
      char_length(avatar_path) <= 250
      AND (
        avatar_path LIKE trip_id::text || '/' || user_id::text || '/%'
        OR avatar_path LIKE 'account/' || user_id::text || '/%'
      )
    )
  );