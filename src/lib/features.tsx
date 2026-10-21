// Trip feature switches (decided on the server via trip_features; FULL trips get everything).
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeatureKey = "at_home" | "ai_extras" | "trip_pot" | "passport" | "challenges" | "sing_off" | "calendar" | "photo_wall" | "qotw" | "host_timer" | "spin_wheel" | "teams" | "wrapped" | "party_cards" | "inspiration";
export const FEATURE_LABELS: Record<FeatureKey, string> = { at_home: "At Home", ai_extras: "AI extras / credits", trip_pot: "Trip pot", passport: "Passport", challenges: "Trip-day challenge library", sing_off: "Sing-Off", calendar: "Game Night Calendar", photo_wall: "Photo wall", qotw: "Question of the Week", host_timer: "Host timer", spin_wheel: "Spin wheel", teams: "Teams", wrapped: "Trip Wrapped", party_cards: "21+ / Party cards", inspiration: "Travel From Home & Window Seat" };

type State = { level: "full" | "preview"; features: Partial<Record<FeatureKey, boolean>> };
const cache = new Map<string, State>();
const db = supabase as unknown as { rpc: (n: string, a?: object) => Promise<{ data: unknown; error: { message: string } | null }> };

export function useTripFeatures(tripId: string | null | undefined) {
  const [state, setState] = useState<State | null>(tripId ? cache.get(tripId) ?? null : null);
  useEffect(() => {
    if (!tripId) return;
    let live = true;
    void db.rpc("trip_features", { p_trip: tripId }).then(r => { if (!live || r.error || !r.data) return; const s = r.data as State; cache.set(tripId, s); setState(s); });
    return () => { live = false; };
  }, [tripId]);
  return { level: state?.level ?? null, on: (k: FeatureKey) => state ? state.level === "full" || !!state.features[k] : true };
}

/** Renders children when the feature is on for this trip; otherwise a small "Coming soon" card. */
export function FeatureGate({ tripId, feature, children, compact }: { tripId: string; feature: FeatureKey; children: ReactNode; compact?: boolean }) {
  const { on } = useTripFeatures(tripId);
  if (on(feature)) return <>{children}</>;
  return <ComingSoon title={FEATURE_LABELS[feature]} compact={compact} />;
}

export function ComingSoon({ title, compact }: { title: string; compact?: boolean | undefined }) {
  return <div className={`app-card ${compact ? "mt-3" : "mt-5"}`} role="note"><p className="eyebrow text-blue">COMING SOON</p><p className="font-display font-extrabold mt-1">{title}</p><p className="text-sm text-muted-foreground mt-1">This part of TripJunkies is on its way for preview trips.</p></div>;
}
