import type { TripWithRole } from "@/lib/trips";
import { readOfflineRoster } from "@/lib/play-arrangement";

/**
 * One-phone (friends NOT on the app) daily cards and sealed quests. Local-only: no account, database,
 * score, Passport or crown writes. The 12 culture-grounded templates below (6 daily, 6 sealed) are the
 * only new content; games themselves reuse OnePhoneNight. Filled with place + learning lens + format.
 */
const LENSES = [
  "culture",
  "food",
  "music",
  "language",
  "history",
  "traditions",
  "landmarks",
  "sports",
] as const;
type Lens = (typeof LENSES)[number];
const ANGLE: Record<Lens, string> = {
  culture: "an everyday custom",
  food: "a regional dish",
  music: "a local song or instrument",
  language: "a useful local phrase",
  history: "a moment in local history",
  traditions: "a festival or celebration",
  landmarks: "a world-famous landmark",
  sports: "a local sports tradition",
};

// 6 daily templates — quick, no photo, culture-tied.
const DAILY = [
  "Learn {angle} from {place}. Each player says it back in their own words, then vote on the clearest explanation.",
  "Guess It: one player reads a clue about {angle} in {place}; everyone else guesses before the timer ends.",
  "Pass the phone: each player names one respectful fact about {angle} in {place}. Pick the most surprising.",
  "Know It: look up {angle} in {place} together and make up one true and one false statement. The group spots the false one.",
  "Teach-back: one player has 30 seconds to teach {angle} from {place}; the group rates it with a thumbs up or down.",
  "Taste or tell: share where {angle} in {place} comes from and why it matters to people there. Vote on the best backstory.",
];
// 6 sealed templates — a bigger group mission, permission-first photos.
const SEALED = [
  "Team Up: split into two teams and each find {angle} in {place}. Present it in one minute; the Captain picks a winner.",
  "Act It: recreate {angle} from {place} as a 20-second scene, respectfully — no accents or costumes of a people. Vote for the best.",
  "Make It: build or sketch something inspired by {angle} in {place} with what you have on hand. The group votes.",
  "Find It: spot three things linked to {angle} in {place} today. Take a group photo only with everyone's permission.",
  "Tell It: each player shares one thing they learned about {angle} in {place}. The Captain crowns the best storyteller.",
  "Vote It: everyone pitches the best way to experience {angle} in {place} on this trip. Majority vote wins.",
];

const hash = (value: string) =>
  [...value].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 2166136261);
const localDay = (trip: TripWithRole) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: (trip as { trip_timezone?: string | null }).trip_timezone || trip.home_timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dayIndex = (trip: TripWithRole, iso = localDay(trip)) =>
  Math.floor(
    (Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${trip.start_date}T12:00:00Z`)) / 86400000,
  );

/**
 * Deterministic per room and day. Daily and sealed use different lenses on the same day and different
 * templates, so no slot repeats another. 6 templates × 8 lenses = 48 distinct cards per slot before any
 * repeat; after that a fresh lens/template pairing is used instead of an exact duplicate.
 */
export function offlineCard(trip: TripWithRole, kind: "daily" | "quest", iso?: string) {
  const d = Math.max(0, dayIndex(trip, iso)) + (hash(trip.id) % 48);
  const lens = LENSES[(d + (kind === "quest" ? 4 : 0)) % LENSES.length]!;
  const pool = kind === "daily" ? DAILY : SEALED;
  const tpl = pool[Math.floor(d / LENSES.length) % pool.length]!;
  const players = readOfflineRoster(trip.id).length;
  const text = tpl.replaceAll("{angle}", ANGLE[lens]).replaceAll("{place}", trip.destination);
  const small =
    kind === "quest" && players > 0 && players < 4
      ? text.replace(/split into two teams and each find/i, "take turns finding")
      : text;
  return small;
}
