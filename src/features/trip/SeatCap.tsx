import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Seats = { used: number; cap: number; is_window: boolean; extra_seats: boolean };
type Props = { tripId: string; isCaptain: boolean; room?: "culture" | "trip" };

/** The trip's seat limit from the server (seat_status), or null while loading / for older rooms. */
export function useSeatCap(tripId: string) {
  const [cap, setCap] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.rpc("seat_status", { p_trip: tripId }).then(({ data }) => {
      const row = data?.[0] as Seats | undefined;
      if (alive) setCap(row?.cap ? row.cap : null);
    });
    return () => {
      alive = false;
    };
  }, [tripId]);
  return cap;
}

/** Seat count for new-rule rooms. The server enforces the limit; this only explains it. A crew
 * already has every seat its room allows (R-005), so there is no seat add-on (QA-B02). */
export function SeatCap({ tripId, isCaptain }: Props) {
  const [seats, setSeats] = useState<Seats | null>(null);
  const load = async () => {
    const { data } = await supabase.rpc("seat_status", { p_trip: tripId });
    setSeats((data?.[0] as Seats | undefined) ?? null);
  };
  useEffect(() => {
    void load();
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!seats?.cap) return null;
  const full = seats.used >= seats.cap;
  return (
    <div className="mt-4 rounded-2xl border border-border p-4 text-left" aria-live="polite">
      <p className="flex items-center gap-2 font-bold">
        <Users size={18} className="text-primary" /> {seats.used} of {seats.cap} seats taken
      </p>
      {full && <p className="mt-1 text-sm">This flight is full.</p>}
      {isCaptain && full && seats.is_window && (
        <p className="mt-1 text-sm text-muted-foreground">
          Bigger group? Start a Going on a Trip instead.
        </p>
      )}
    </div>
  );
}
