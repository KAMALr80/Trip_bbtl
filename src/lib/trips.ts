import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Trip = Tables<"trips">;
export type Member = { user_id: string; role: string; display_name: string | null; avatar_url: string | null; joined_at: string };
export type TripWithRole = Trip & { myRole: string };

export async function loadTrips(userId: string): Promise<TripWithRole[]> {
  const { data: memberships, error } = await supabase.from("trip_members").select("trip_id,role").eq("user_id", userId);
  if (error) throw error;
  if (!memberships?.length) return [];
  const { data: trips, error: tripError } = await supabase.from("trips").select("*").in("id", memberships.map((m) => m.trip_id));
  if (tripError) throw tripError;
  return (trips ?? []).map((trip) => ({ ...trip, myRole: memberships.find((m) => m.trip_id === trip.id)?.role ?? "player" })).sort((a,b) => a.start_date.localeCompare(b.start_date));
}

export async function loadMembers(tripId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc("trip_roster", { p_trip: tripId });
  if (error) throw error;
  return data ?? [];
}

export function inviteUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}
export async function shareInvite(code: string, name: string) {
  const url = inviteUrl(code);
  if (navigator.share) {
    try { await navigator.share({ title: `Join ${name} on TripJunkies`, text: `You're invited to ${name}!`, url }); return "shared"; }
    catch (error) { if ((error as Error).name === "AbortError") return "cancelled"; }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
