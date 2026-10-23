import { useState } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { datePhase } from "@/lib/play-arrangement";
import { offlineCard } from "@/lib/offline-trip-content";
import { tripToday } from "@/lib/itinerary";
import type { TripWithRole } from "@/lib/trips";

export function OfflineTripCards({
  trip,
  viewOnly,
  tripSeasonStarted = false,
}: {
  trip: TripWithRole;
  viewOnly: boolean;
  tripSeasonStarted?: boolean;
}) {
  const key = `tj-offline-quest:${trip.id}:${tripToday(trip.home_timezone)}`;
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(key) === "done";
    } catch {
      return false;
    }
  });
  return (
    <div className="mt-4 space-y-4">
      <section className="flight-daily text-center" aria-label="Today's one-phone Daily Card">
        <p className="text-xs font-bold uppercase text-muted-foreground">Today's Daily Card</p>
        <p className="font-display font-extrabold mt-2">{offlineCard(trip, "daily")}</p>
      </section>
      <section className="app-card" aria-label="One-phone sealed quest">
        <p className="eyebrow text-primary">SEALED TRIP QUEST</p>
        {datePhase(trip, tripSeasonStarted) === "trip" ? (
          <>
            <h2 className="font-display text-xl font-extrabold mt-2">Today's group mission</h2>
            <p className="text-sm mt-2">{offlineCard(trip, "quest")}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Local-only. This never adds account, Passport, or leaderboard points.
            </p>
            {done ? (
              <p className="mt-3 inline-flex items-center gap-2 font-bold">
                <Check size={18} /> Completed on this phone
              </p>
            ) : (
              !viewOnly && (
                <Button
                  variant="playful"
                  className="w-full min-h-11 mt-4"
                  onClick={() => {
                    try {
                      localStorage.setItem(key, "done");
                    } catch {
                      /* optional storage */
                    }
                    setDone(true);
                  }}
                >
                  Mark complete
                </Button>
              )
            )}
          </>
        ) : (
          <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LockKeyhole size={17} /> Opens when Trip Season starts.
          </p>
        )}
      </section>
    </div>
  );
}
