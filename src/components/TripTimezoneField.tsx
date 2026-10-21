import { friendlyError } from "@/lib/friendly-error";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";
import { tripTz } from "@/lib/itinerary";

const db = supabase as unknown as { rpc: (f: string, a: object) => PromiseLike<{ error: { message: string } | null }> };

/** Captain Tools: where the trip happens. Trip-day games and votes follow this clock; pre-trip nights stay on home time. */
export function TripTimezoneField({ trip }: { trip: TripWithRole }) {
  const [tz, setTz] = useState(tripTz(trip)), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const zones = useMemo(() => {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    return Array.from(new Set([tripTz(trip), trip.home_timezone, ...list]));
  }, [trip]);
  async function save() {
    setBusy(true); setMsg("");
    const r = await db.rpc("set_trip_timezone", { p_trip: trip.id, p_tz: tz });
    setBusy(false); setMsg(r.error ? friendlyError(r.error) : "Trip time zone saved ✓");
  }
  return <div className="mt-4">
    <label className="block text-sm font-bold">Trip time zone
      <select className="w-full h-12 rounded-xl bg-card border-2 border-border px-3 mt-1" value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}</select>
    </label>
    <p className="text-xs text-muted-foreground mt-1">Trip-day games and votes use this clock. Pre-trip game nights stay on home time ({trip.home_timezone.replace(/_/g, " ")}).</p>
    {tz !== tripTz(trip) && <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void save()}>Save time zone</Button>}
    {msg && <p role="status" className="text-sm mt-2">{msg}</p>}
  </div>;
}
