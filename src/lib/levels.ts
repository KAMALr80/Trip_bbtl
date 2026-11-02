// Passport level names by number of countries stamped (R-703). The server computes the count and the
// level when a stamp is added (M5-08, trip_private.level_for); this mirrors those thresholds for display.
export const LEVELS = [
  { name: "Tourist", at: 1 },
  { name: "Explorer", at: 3 },
  { name: "Voyager", at: 5 },
  { name: "Globetrotter", at: 7 },
  { name: "Passport Junkie", at: 10 },
  { name: "Passport Junkie ★", at: 15 },
  { name: "Passport Junkie ★★", at: 20 },
  { name: "Passport Junkie ★★★", at: 30 },
] as const;

export type Level = { name: string; countries: number; next: { name: string; at: number } | null };

/** The level for a number of distinct stamped countries; null before the first stamp. */
export function levelFor(countries: number): Level | null {
  const reached = LEVELS.filter((l) => countries >= l.at);
  const current = reached.at(-1);
  if (!current) return null;
  const next = LEVELS.find((l) => l.at > countries) ?? null;
  return { name: current.name, countries, next: next ? { name: next.name, at: next.at } : null };
}

/** Distinct countries in a list of stamps (case and spacing insensitive). */
export function countCountries(stamps: { country: string }[]): number {
  return new Set(stamps.map((s) => s.country.trim().toLowerCase()).filter(Boolean)).size;
}
