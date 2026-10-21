import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Stamp = {
  user_id: string;
  country: string;
  state: string | null;
  city: string | null;
  stamped_on: string;
  trip_name: string;
  squad_count: number;
  stamp_count: number;
};
const cache = new Map<string, Stamp[]>();

export function StampBadge({ tripId, userId }: { tripId: string; userId: string }) {
  const [stamp, setStamp] = useState<Stamp | null>(
    cache.get(tripId)?.find((s) => s.user_id === userId) ?? null,
  );
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    const saved = cache.get(tripId);
    if (saved) {
      setStamp(saved.find((s) => s.user_id === userId) ?? null);
      return;
    }
    void supabase.rpc("member_stamp_badges", { p_trip: tripId }).then(({ data, error }) => {
      if (!live || error) return;
      const rows = (data ?? []) as Stamp[];
      cache.set(tripId, rows);
      setStamp(rows.find((s) => s.user_id === userId) ?? null);
    });
    return () => {
      live = false;
    };
  }, [tripId, userId]);
  if (!stamp) return null;
  const place = [stamp.city, stamp.state, stamp.country].filter(Boolean).join(", ");
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mini-ink mt-1 h-7 max-w-full px-2 text-[10px]"
        aria-label={`Open ${place} stamp, ${stamp.stamp_count} stamps`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {stamp.state || stamp.country} · ×{stamp.stamp_count}
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute inset-0 bg-foreground/70" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Stamp detail"
            className="relative w-full max-w-lg rounded-t-lg bg-card p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4"
              aria-label="Close stamp"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
            <p className="eyebrow">PASSPORT STAMP</p>
            <h3 className="mt-2 font-display text-2xl font-extrabold">{place}</h3>
            <p className="mt-3 text-muted-foreground">
              {stamp.trip_name} ·{" "}
              {new Date(`${stamp.stamped_on}T12:00:00`).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
            <p className="mt-2 text-sm">{stamp.squad_count} in the squad</p>
            <p className="mt-2 text-sm">Earned by finishing this trip with the squad.</p>
          </div>
        </div>
      )}
    </>
  );
}
