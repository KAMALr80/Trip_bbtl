/** The same upcoming-night rule used by Home, Play and the calendar. */
export function nextGameNight<T extends { starts_at: string; skipped: boolean }>(
  nights: T[],
  now: number,
): T | undefined {
  return nights
    .filter((n) => !n.skipped && new Date(n.starts_at).getTime() + 3 * 3600000 >= now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
}
