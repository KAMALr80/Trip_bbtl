// Phase banner (M2-09, R-106 / R-107): the phase's line at the top of Home and Play, never a pop-up.
// Trip Season names the city, or the culture for at-home rooms. During Takeoff the Captain and
// Co-Captain also get "We've arrived" (R-103, R-111). The phase is display-only; the server's
// trip_phase decides (mark_arrived checks it again).
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { rpc } from "@/data/rpc";
import { useTripPhase } from "@/data/phase";
import type { Phase } from "@/features/trip/phase";
import { roomOf } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { countryName } from "@/lib/places";
import { noFlight } from "@/lib/play-arrangement";
import type { TripWithRole } from "@/lib/trips";

/** Re-renders every minute so banners and countdowns move on their own. */
export function useMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function bannerPlace(trip: TripWithRole): string {
  if (roomOf(trip.room).atHome) {
    const culture = trip.cultures?.[0] ?? trip.passport_country;
    return culture ? countryName(culture) : trip.destination;
  }
  return trip.passport_city || trip.destination.split(",")[0]?.trim() || trip.destination;
}

/** Which banner a phase shows, or null: nothing before the first phase or after the last. */
function bannerKey(trip: TripWithRole, phase: Phase) {
  if (trip.room === "game_night") return null;
  if (phase === "takeoff" && noFlight(trip)) return "homeMissions";
  return phase === "preflight" ||
    phase === "takeoff" ||
    phase === "trip_season" ||
    phase === "baggage_claim"
    ? phase
    : null;
}

/** The Home dashboard's line for the phase the server says the trip is in (QA-02). */
export function HomePhaseBanner({ trip }: { trip: TripWithRole }) {
  const t = useT();
  const key = bannerKey(trip, useTripPhase(trip));
  if (!key) return null;
  return (
    <p className="app-card mt-3 text-sm font-bold" role="status">
      {t(`phases.banner.${key}`, { place: bannerPlace(trip) })}
    </p>
  );
}

export function PhaseNotice({
  trip,
  viewOnly,
}: {
  trip: TripWithRole;
  viewOnly?: boolean;
  started?: boolean;
}) {
  const t = useT();
  useMinute();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const phase = useTripPhase(trip);
  const key = bannerKey(trip, phase);
  if (!key) return null;
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  const canArrive =
    phase === "takeoff" &&
    leader &&
    !viewOnly &&
    !trip.arrived_at &&
    roomOf(trip.room).tripSeasonStart === "arrival_button";
  return (
    <div className="phase-banner mt-3 border-l-4 border-primary bg-muted p-3 text-sm" role="status">
      <p className="font-bold">{t(`phases.banner.${key}`, { place: bannerPlace(trip) })}</p>
      {canArrive && (
        <>
          <Button
            variant="outline"
            className="mt-2 min-h-11"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const { error: issue } = await rpc("mark_arrived", { p_trip: trip.id });
              setBusy(false);
              if (issue) setError(friendlyError(issue));
              else await queryClient.invalidateQueries({ queryKey: ["trips"] });
            }}
          >
            {busy ? t("phases.arrivedSaving") : t("phases.arrived")}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">{t("phases.arrivedHint")}</p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
