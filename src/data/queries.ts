// TanStack Query hooks for the data every trip screen shares (M1-05). Keys live here so a write
// can refresh exactly what it changed: everything about one trip sits under ["trip", tripId].
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { loadCards, loadMembers, loadTrips } from "./trips";
import { dailyAnswersQuery, scheduleQuery } from "./daily";
import { crownsQuery, standingsQuery } from "./live";
import { callNightsQuery } from "./schedule";

// Avatar photo links are signed for an hour; a minute keeps tab switches from re-signing them.
const staleTime = 60_000;

export const queryKeys = {
  trips: (userId: string) => ["trips", userId] as const,
  members: (tripId: string) => ["trip", tripId, "members"] as const,
  cards: (tripId: string) => ["trip", tripId, "cards"] as const,
};

/** The signed-in player's trips, each with their role, sorted by start date. */
export function useTrips(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.trips(userId ?? ""),
    queryFn: () => loadTrips(userId!),
    staleTime,
    enabled: !!userId,
  });
}

/** A trip's roster (`trip_roster`): approved members with role and display name. */
export function useMembers(tripId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.members(tripId ?? ""),
    queryFn: () => loadMembers(tripId!),
    staleTime,
    enabled: !!tripId,
  });
}

/** A trip's player cards with resolved avatar URLs; the viewer's own card has every field. */
export function useCards(tripId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.cards(tripId ?? ""),
    queryFn: () => loadCards(tripId!),
    staleTime,
    enabled: !!tripId,
  });
}

/** Start loading a trip's roster and cards (route loaders). Browser only: the session lives there. */
export async function prefetchTrip(queryClient: QueryClient, tripId: string) {
  if (typeof window === "undefined") return;
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.members(tripId),
      queryFn: () => loadMembers(tripId),
      staleTime,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.cards(tripId),
      queryFn: () => loadCards(tripId),
      staleTime,
    }),
  ]);
}

/**
 * Load what the open trip's Home and Play show, so it is in the offline snapshot (M4-03) even if
 * the player never opened Play before losing the network. Online only; already-fresh data is kept.
 */
export async function prefetchTripForOffline(queryClient: QueryClient, tripId: string) {
  if (typeof window === "undefined" || !navigator.onLine) return;
  await Promise.allSettled([
    prefetchTrip(queryClient, tripId),
    queryClient.prefetchQuery(scheduleQuery(tripId)),
    queryClient.prefetchQuery(dailyAnswersQuery(tripId)),
    queryClient.prefetchQuery(callNightsQuery(tripId)),
    queryClient.prefetchQuery(crownsQuery(tripId)),
    queryClient.prefetchQuery(standingsQuery(tripId, "preflight")),
    queryClient.prefetchQuery(standingsQuery(tripId, "trip_season")),
  ]);
}
