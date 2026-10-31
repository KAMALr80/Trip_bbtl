// Call nights and the trip schedule (M2-06, M2-12).
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { rpc } from "./rpc";

export type CallNight = Tables<"call_nights">;

async function loadCallNights(tripId: string): Promise<CallNight[]> {
  const { data, error } = await supabase
    .from("call_nights")
    .select("*")
    .eq("trip_id", tripId)
    .order("starts_at");
  if (error) throw error;
  return data ?? [];
}

export const callNightsQuery = (tripId: string) =>
  queryOptions({
    queryKey: ["trip", tripId, "call-nights"],
    queryFn: () => loadCallNights(tripId),
    staleTime: 60_000,
  });

export function useCallNights(tripId: string) {
  return useQuery(callNightsQuery(tripId));
}

/** Replace the trip's upcoming call nights (Captain or Co-Captain; up to 4, inside Pre-Flight). */
export async function setCallNights(
  tripId: string,
  nights: { startsAt: string; callLink: string | null; secondLink: string | null }[],
) {
  const { error } = await rpc("set_call_nights", { p_trip: tripId, p_nights: nights });
  if (error) throw error;
}
