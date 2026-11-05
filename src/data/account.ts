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

/**
 * Whether Supabase Auth has this sign-in provider turned on (the public GET /auth/v1/settings), so
 * a disabled one can say so instead of sending the browser to Auth's raw error page. null when it
 * can't tell (no network, an unexpected answer): callers then try the provider as before.
 */
export async function authProviderEnabled(provider: "google"): Promise<boolean | null> {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const settings = (await res.json()) as { external?: Record<string, unknown> };
    const on = settings.external?.[provider];
    return typeof on === "boolean" ? on : null;
  } catch {
    return null;
  }
}
