// The signed-in player's own account rows and app-wide switches read by the app shell (M1-05).
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { rpc } from "./rpc";

export async function isAppAdmin() {
  const { data } = await rpc("is_app_admin");
  return !!data;
}

export function touchLastSeen() {
  return rpc("touch_last_seen");
}

/** Whether sign-up is open to everyone (`app_settings.public_launch`) or still private beta. */
export async function isPublicLaunch() {
  const { data } = await rpc("public_launch");
  return !!data;
}

export async function loadPlayerProfile(userId: string) {
  const { data } = await supabase
    .from("player_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function loadTimeZoneSetting(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("time_zone,time_zone_manual")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export function saveDeviceTimeZone(userId: string, zone: string) {
  return supabase.from("profiles").update({ time_zone: zone }).eq("id", userId);
}

export async function completeOnboarding(userId: string) {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", userId);
  return { error };
}

export async function loadTrip(tripId: string): Promise<Tables<"trips"> | null> {
  const { data } = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
  return data;
}

export function signOut() {
  return supabase.auth.signOut();
}
