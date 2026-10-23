// TanStack Query hooks for the data every trip screen shares (M1-05). Keys live here so a write
// can refresh exactly what it changed: `invalidateTrip(queryClient, tripId)` after a roster or card
// change, `invalidateTrips(queryClient, userId)` after joining, leaving or creating a trip.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { loadCards, loadMembers, loadTrips } from "./trips";

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
    enabled: !!userId,
  });
}

/** A trip's roster (`trip_roster`): approved members with role and display name. */
export function useMembers(tripId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.members(tripId ?? ""),
    queryFn: () => loadMembers(tripId!),
    enabled: !!tripId,
  });
}

/** A trip's player cards with resolved avatar URLs; the viewer's own card has every field. */
export function useCards(tripId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.cards(tripId ?? ""),
    queryFn: () => loadCards(tripId!),
    enabled: !!tripId,
  });
}

export function fetchTrips(queryClient: QueryClient, userId: string) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.trips(userId),
    queryFn: () => loadTrips(userId),
    staleTime: 0,
  });
}

export function invalidateTrip(queryClient: QueryClient, tripId: string) {
  return queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
}
