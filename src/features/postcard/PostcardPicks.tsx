// Postcard Picks (M5-01, R-601, R-354): during the trip, nominate your own photos for the Trip
// Postcard: 2 each, 5 in a Window Seat crew, 10 when playing solo. Swap any time until the last
// trip day ends. display-only; server: trip_private.pick_postcard decides the limit and the close.
import { Check } from "lucide-react";
import { useMyPicks, useMyTripPhotos, usePickPostcard, usePostcardInfo } from "@/data/postcard";
import { roomOf } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";
import { fmtWhen } from "@/lib/viewer-time";

export function PostcardPicks({
  trip,
  viewOnly,
}: {
  trip: TripWithRole;
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const info = usePostcardInfo(trip.id).data;
  const photos = useMyTripPhotos(trip.id).data ?? [];
  const picks = useMyPicks(trip.id).data ?? [];
  const pick = usePickPostcard(trip.id);
  if (!roomOf(trip.room).pointsEnabled || !info || info.picks === 0) return null;
  const picked = new Set(picks.map((p) => p.proof_id));
  const full = picked.size >= info.picks;
  return (
    <section className="app-card mt-3" aria-label={t("postcard.picksTitle")}>
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {t("postcard.picksTitle")} · {t("postcard.picked", { count: picked.size, max: info.picks })}
      </p>
      <p className="text-sm mt-1">{t("postcard.picksLine", { count: info.picks })}</p>
      {info.picks_close_at && (
        <p className="text-xs text-muted-foreground mt-1">
          {t("postcard.picksClose", { when: fmtWhen(info.picks_close_at, trip.trip_timezone) })}
        </p>
      )}
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">{t("postcard.noPhotos")}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const on = picked.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={on ? t("postcard.unpick") : t("postcard.pick")}
                  disabled={viewOnly || pick.isPending || (!on && full)}
                  onClick={() => pick.mutate({ proofId: p.id, pick: !on })}
                  className={`relative block aspect-square w-full overflow-hidden rounded-md border-2 disabled:opacity-60 ${
                    on ? "border-primary" : "border-transparent"
                  }`}
                >
                  {p.url ? (
                    <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="block h-full w-full bg-muted" />
                  )}
                  {on && (
                    <span className="absolute right-1 top-1 rounded-full bg-primary p-1 text-primary-foreground">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {full && !viewOnly && <p className="text-xs mt-2">{t("postcard.fullHint")}</p>}
      {pick.error && (
        <p className="text-xs text-destructive mt-2" role="alert">
          {friendlyError(pick.error)}
        </p>
      )}
    </section>
  );
}
