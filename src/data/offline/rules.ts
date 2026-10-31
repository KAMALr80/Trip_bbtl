// What the offline snapshot keeps (M4-03), and how to tell "no network" from "the server said no".
// Pure, so the rules are unit-tested and shared by the snapshot code and the screens.
import type { QueryKey } from "@tanstack/react-query";

/**
 * Per-trip queries kept for offline use (the third part of ["trip", tripId, part, ...]). Only the
 * player's own view of the trip: the server already hides what they may not see (sealed text,
 * other players' answers), so the snapshot can't show more than the app did online. The crew's
 * proof photos (`crew-check`), live session counts and the shared guide stay online-only.
 */
const TRIP_PARTS = new Set([
  "members",
  "cards",
  "schedule",
  "daily-answers",
  "standings",
  "call-nights",
  "crowns",
  "journal",
]);

/** Is this query saved in the snapshot? `userId` is the signed-in player. */
export function keepQuery(key: QueryKey, userId: string): boolean {
  const [scope, id, part] = key as readonly unknown[];
  if (scope === "trips") return id === userId;
  return scope === "trip" && typeof id === "string" && id !== "" && TRIP_PARTS.has(String(part));
}

/**
 * True when a request failed because the network is down (or the browser says it's offline), not
 * because the server refused it. Only then may a screen fall back to the snapshot: a refusal
 * (signed out, removed from the trip, consent needed) must still be shown.
 */
export function isNetworkError(error: unknown, online = true): boolean {
  if (!online) return true;
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown; status?: unknown };
  if (e.name === "AuthRetryableFetchError") return true;
  const message = typeof e.message === "string" ? e.message : String(error);
  return /Failed to fetch|NetworkError|Load failed|Network request failed|fetch failed|ERR_INTERNET_DISCONNECTED/i.test(
    message,
  );
}

/** The newest time any saved query was loaded from the server: the snapshot's "last synced". */
export function lastSynced(
  queries: readonly { state: { dataUpdatedAt: number } }[],
): number | null {
  let newest = 0;
  for (const q of queries) newest = Math.max(newest, q.state.dataUpdatedAt);
  return newest || null;
}

/** "5 minutes ago", "2 hours ago", "yesterday" in the app's language. */
export function syncedAgo(at: number, now: number, locale: string): string {
  const minutes = Math.floor((now - at) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}
