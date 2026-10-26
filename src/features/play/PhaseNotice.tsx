import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { datePhase, phaseBanner, noFlight } from "@/lib/play-arrangement";
import type { TripWithRole } from "@/lib/trips";
import { tripToday, tripTz } from "@/lib/itinerary";

export function PhaseNotice({
  trip,
  viewOnly,
  started,
}: {
  trip: TripWithRole;
  viewOnly?: boolean;
  started?: boolean;
}) {
  const [serverStarted, setServerStarted] = useState(started ?? false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: issue } = await supabase.rpc(
      "trip_season_started" as never,
      { p_trip: trip.id } as never,
    );
    if (issue) setError(issue.message);
    else setServerStarted(data === true);
  }, [trip.id]);
  useEffect(() => {
    if (started === undefined) void load();
    else setServerStarted(started);
  }, [load, started]);
  const banner = phaseBanner(trip, serverStarted);
  if (!banner) return null;
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  const canConfirm =
    !serverStarted &&
    !trip.arrived_at &&
    datePhase(trip, serverStarted) === "airport" &&
    trip.start_date <= tripToday(tripTz(trip)) &&
    leader &&
    !viewOnly;
  return (
    <div className="mt-3 border-l-4 border-primary bg-muted p-3 text-sm" role="status">
      <p className="font-bold">{banner}</p>
      {canConfirm && (
        <>
          <Button
            variant="outline"
            className="min-h-11 mt-2"
            onClick={async () => {
              const { error: issue } = await supabase.rpc(
                "confirm_departure" as never,
                { p_trip: trip.id } as never,
              );
              if (issue) setError(issue.message);
              else {
                setServerStarted(true);
                window.location.reload();
              }
            }}
          >
            {noFlight(trip) ? "Start Trip Season" : "We’ve arrived"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {noFlight(trip)
              ? "Tap when your experience begins, or Trip Season opens on its own."
              : "Tap when you land, or Trip Season opens on its own."}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-destructive mt-2">
          {error}
        </p>
      )}
    </div>
  );
}
