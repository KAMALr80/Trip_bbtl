// Client mirror of the server rules in trip_private.game_name_problem (server is the source of truth).
const LINK = /(https?:|www\.|\.(com|net|org|app|io|co|me|gg|tv)(\W|$))/i;
const HANDLE = /@[\p{L}\p{N}_]/u;
const HAS_ALNUM = /[\p{L}\p{N}]/u;
const BAD = /(fuck|shit|bitch|cunt|nigg|fag|whore|slut|dick|pussy|rape|nazi|retard)/;
const RESERVED = /(tripjunkie|captain|admin|support|founder)/;

export const PERSONAS = ["planner", "hype person", "photographer", "food finder"] as const;

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/([^\p{L}\p{N}])\1+/gu, "$1");
}
export const charCount = (value: string) => [...value.trim()].length;

function common(value: string, min: number, max: number, label: string) {
  const n = charCount(value);
  if (n < min) return `${label} need at least ${min} characters.`;
  if (n > max) return `${label} can be up to ${max} characters.`;
  if (value !== value.trim()) return "Remove spaces at the start or end.";
  if (/\s\s/.test(value)) return "Use only one space between words.";
  if (!HAS_ALNUM.test(value)) return "Add at least one letter or number.";
  if (LINK.test(value)) return "Links aren't allowed.";
  if (HANDLE.test(value)) return "@handles aren't allowed.";
  if (BAD.test(normalizeName(value))) return "Please pick something friendlier.";
  return null;
}
export function gameNameProblem(value: string, isFounder = false) {
  const p = common(value, 2, 15, "Game names");
  if (p) return p;
  if (!isFounder && RESERVED.test(normalizeName(value)))
    return "That name is reserved. Try something else.";
  return null;
}
export const tripRoleProblem = (value: string) => common(value, 2, 24, "Trip roles");

export function nameSuggestions(value: string) {
  const base = [...value.trim()].slice(0, 12).join("");
  return [`${base}✈`, `${base}_${10 + Math.floor(Math.random() * 90)}`];
}
