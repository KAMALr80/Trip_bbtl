// Call nights on the Pre-Flight page and the crowning / finale night on Trip Season (M2-06, R-204,
// R-205). Times show in the viewer's own zone (R-109); "Join call" opens the link the Captain set.
import { CalendarPlus, Crown, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallNights } from "@/data/schedule";
import { roomOf } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { saveFlightEvent } from "@/lib/flight-calendar";
import type { TripWithRole } from "@/lib/trips";
import { fmtWhen } from "@/lib/viewer-time";

export function CallNightsCard({ trip }: { trip: TripWithRole }) {
  const t = useT();
  const nights = useCallNights(trip.id).data ?? [];
  return (
    <section className="app-card" aria-label={t("nights.title")}>
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
        <Video size={18} /> {t("nights.title")}
      </h3>
      {nights.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">{t("nights.none")}</p>
      )}
      <ul className="mt-2 grid gap-3">
        {nights.map((n, i) => {
          const past = Date.parse(n.starts_at) + 3 * 3_600_000 < Date.now();
          return (
            <li key={n.id} className="rounded-2xl border border-border p-3">
              <p className="font-bold">{fmtWhen(n.starts_at, trip.home_timezone)}</p>
              {past ? (
                <p className="text-xs text-muted-foreground">{t("nights.past")}</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {n.call_link && (
                    <Button asChild size="sm" className="min-h-11">
                      <a href={n.call_link} target="_blank" rel="noreferrer noopener">
                        {t("nights.join")}
                      </a>
                    </Button>
                  )}
                  {n.second_link && (
                    <Button asChild size="sm" variant="outline" className="min-h-11">
                      <a href={n.second_link} target="_blank" rel="noreferrer noopener">
                        {t("nights.joinSecond")}
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() =>
                      saveFlightEvent(trip, t("nights.event"), n.starts_at, 120, `call-${i + 1}`)
                    }
                  >
                    <CalendarPlus /> {t("nights.calendar")}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function CrowningCard({ trip }: { trip: TripWithRole }) {
  const t = useT();
  const title = t(roomOf(trip.room).atHome ? "nights.finaleTitle" : "nights.crowningTitle");
  return (
    <section className="app-card" aria-label={title}>
      <h3 className="flex items-center gap-2 font-display text-lg font-extrabold">
        <Crown size={18} /> {title}
      </h3>
      {trip.crowning_at ? (
        <>
          <p className="mt-2 font-bold">
            {fmtWhen(
              trip.crowning_at,
              roomOf(trip.room).atHome ? trip.home_timezone : trip.trip_timezone,
            )}
          </p>
          {trip.crowning_place && (
            <p className="text-sm text-muted-foreground">{trip.crowning_place}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {trip.crowning_call_link && (
              <Button asChild size="sm" className="min-h-11">
                <a href={trip.crowning_call_link} target="_blank" rel="noreferrer noopener">
                  {t("nights.join")}
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => saveFlightEvent(trip, title, trip.crowning_at!, 180, "crowning")}
            >
              <CalendarPlus /> {t("nights.calendar")}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{t("nights.crowningPending")}</p>
      )}
    </section>
  );
}
