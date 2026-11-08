// The trip's phase as the server sees it (QA-02). trip_phase is the rule; phase.ts mirrors it so a
// screen has something to show before the answer arrives and while offline. When the server has
// answered, its answer wins: the device's clock and date never override it.
import { useQuery } from "@tanstack/react-query";
import { rpc } from "./rpc";
import { phases, tripPhase, type Phase } from "@/features/trip/phase";

type PhaseTrip = Parameters<typeof tripPhase>[0] & { id: string };

/** The server's phase if it gave a known one, else the display mirror's. */
export function chooseTripPhase(server: unknown, mirror: Phase): Phase {
  return phases.includes(server as Phase) ? (server as Phase) : mirror;
}

export function useTripPhase(trip: PhaseTrip): Phase {
  const server = useQuery({
    // The trip row's phase inputs are in the key, so "We've arrived" or new dates ask again at once.
    queryKey: [
      "trip",
      trip.id,
      "phase",
      trip.start_date,
      trip.end_date,
      trip.preflight_days,
      trip.preflight_skipped,
      trip.arrived_at,
      trip.setup_completed_at,
    ],
    queryFn: async () => {
      const { data, error } = await rpc("trip_phase", { p_trip: trip.id });
      if (error) throw error;
      return data?.[0]?.phase ?? null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return chooseTripPhase(server.data, tripPhase(trip).phase);
}
