// Founder sandbox helpers (display only — the server enforces every bypass via trip_private.lab_bypass).
import { useEffect, useState } from "react";

let founder = false;
let view: { trip_id: string; view: string } | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export function setFounder(v: boolean) { if (founder !== v) { founder = v; emit(); } }
export function setLabView(v: { trip_id: string; view: string } | null) { view = v; emit(); }
/** True only for the founder on a Test Lab sandbox trip: schedules and "opens at" locks are skipped. */
export function labBypass(trip: { is_sandbox?: boolean | null } | null | undefined) { return founder && !!trip?.is_sandbox; }

export function useLabView() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(n => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return { founder, view };
}

export const VIEW_LABELS: Record<string, string> = { co_captain: "Co-Captain", player: "Player", waiting: "Waiting member", teen: "Teen (15)", invitee: "New invitee" };
