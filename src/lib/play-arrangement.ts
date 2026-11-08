import type { TripWithRole } from "@/lib/trips";
import { tripTz } from "@/lib/itinerary";

export type PlayArrangement = "solo" | "online" | "offline";
export const modes: { id: PlayArrangement; title: string; line: string }[] = [
  { id: "solo", title: "Just me", line: "Play every trip day. Sharing a guide is optional." },
  { id: "online", title: "Me + friends on the app", line: "Invite your squad with a join code." },
  {
    id: "offline",
    title: "Me + friends NOT on the app",
    line: "Pass one phone around and pick the winners together.",
  },
];

/** The server-owned start flag decides Trip Season; local dates only separate Pre-Flight from Takeoff. */
export function datePhase(
  trip: TripWithRole,
  tripSeasonStarted = false,
  now: Date = new Date(),
): "preflight" | "airport" | "trip" | null {
  if (!trip.play_arrangement) return null;
  if (tripSeasonStarted) return "trip";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: tripTz(trip),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return today < trip.start_date ? "preflight" : "airport";
}

/** Culture rooms (no flight) never claim a flight or a landing. */
export const noFlight = (trip: TripWithRole) => !!trip.a2e_room || trip.kind !== "trip";

const key = (tripId: string) => `tj-offline-roster:${tripId}`;
export function saveOfflineRoster(tripId: string, names: string[]): boolean {
  try {
    localStorage.setItem(key(tripId), JSON.stringify(names));
    return true;
  } catch {
    return false;
  }
}
export function readOfflineRoster(tripId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(tripId)) ?? "null");
    return Array.isArray(value)
      ? value.filter((n): n is string => typeof n === "string").slice(0, 10)
      : [];
  } catch {
    return [];
  }
}
