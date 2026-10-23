import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { usePrices, usd, BETA_LINE } from "@/lib/prices";

type Seats = { used: number; cap: number; is_window: boolean; extra_seats: boolean };
type Props = { tripId: string; isCaptain: boolean; room?: "culture" | "trip" };

/** Seat count for new-rule rooms. The server enforces the limit; this only explains it. */
export function SeatCap({ tripId, isCaptain, room = "trip" }: Props) {
  const prices = usePrices();
  const addon = prices.cents(room === "culture" ? "culture_addon" : "trip_addon");
  const [seats, setSeats] = useState<Seats | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    const { data } = await supabase.rpc("seat_status", { p_trip: tripId });
    setSeats((data?.[0] as Seats | undefined) ?? null);
  };
  useEffect(() => {
    void load();
  }, [tripId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!seats?.cap) return null;
  const full = seats.used >= seats.cap;
  async function addSeats() {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("unlock_extra_seats", { p_trip: tripId });
    if (e) setError(friendlyError(e));
    else await load();
    setBusy(false);
  }
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
      {isCaptain && !seats.is_window && !seats.extra_seats && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Need more room? Add 6 more seats (up to 12). {BETA_LINE}
            {addon != null ? ` · later ${usd(addon)}` : ""}.
          </p>
          <Button
            variant="outline"
            className="mt-2 min-h-11"
            disabled={busy}
            onClick={() => void addSeats()}
          >
            {busy ? "Adding…" : "Add 6 seats"}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
