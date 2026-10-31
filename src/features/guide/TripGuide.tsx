// The trip's guide (M3-12, R-354, R-355): every journal entry and approved quest photo, day by day.
// A Window Seat crew of up to 4 shares one; a solo at-home room uses it as the finale showcase page
// (M3-13, R-365). Leaders can share it as a read-only link; each player decides whether their name
// and photos show there (off by default).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useGuideActions, useGuidePrefs, useGuideState, useTripGuide } from "@/data/guide";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import { friendlyDate } from "@/lib/trip-dates";
import type { TripWithRole } from "@/lib/trips";

export const isShowcase = (trip: TripWithRole) =>
  trip.play_mode === "solo" && (trip.room === "explore_culture" || trip.room === "show_culture");

export type GuideItem = {
  day: string;
  kind: string;
  author: string | null;
  prompt: string | null;
  body: string | null;
  photoUrl: string | null;
};

/** Days in order, each with its entries and photos. Shared with the public page. */
export function GuideDays({ items, startDate }: { items: GuideItem[]; startDate: string }) {
  const t = useT();
  const days = [...new Set(items.map((i) => i.day))].sort();
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  return (
    <div className="grid gap-4 mt-4">
      {days.map((d) => (
        <article key={d} className="app-card">
          <h3 className="font-display font-extrabold">
            {t("guide.day", {
              n: Math.max(
                1,
                Math.round((new Date(`${d}T00:00:00Z`).getTime() - start) / 86400000) + 1,
              ),
              date: friendlyDate(d),
            })}
          </h3>
          {items
            .filter((i) => i.day === d)
            .map((i, n) =>
              i.kind === "photo" ? (
                i.photoUrl && (
                  <figure key={n} className="mt-3">
                    <img
                      src={i.photoUrl}
                      alt={t("guide.photoAlt", { date: friendlyDate(d) })}
                      className="w-full rounded-md object-cover max-h-80"
                      loading="lazy"
                    />
                    {(i.body || i.author) && (
                      <figcaption className="text-xs text-muted-foreground mt-1">
                        {i.body}
                        {i.author && ` · ${t("guide.by", { name: i.author })}`}
                      </figcaption>
                    )}
                  </figure>
                )
              ) : (
                <div key={n} className="mt-3">
                  {i.prompt && (
                    <p className="text-xs font-semibold text-muted-foreground">{i.prompt}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{i.body}</p>
                  {i.author && (
                    <p className="text-xs text-muted-foreground">
                      {t("guide.by", { name: i.author })}
                    </p>
                  )}
                </div>
              ),
            )}
        </article>
      ))}
    </div>
  );
}

export function TripGuide({
  trip,
  viewOnly,
}: {
  trip: TripWithRole;
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const guide = useTripGuide(trip.id);
  const state = useGuideState(trip.id).data;
  const prefs = useGuidePrefs(trip.id).data ?? { show_name: false, share_photos: false };
  const act = useGuideActions(trip.id);
  const [copied, setCopied] = useState(false);
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  const items = guide.data ?? [];
  const link =
    state?.published_at && typeof window !== "undefined"
      ? `${window.location.origin}/guide/${state.token}`
      : null;
  return (
    <section aria-label={isShowcase(trip) ? t("guide.showcaseTitle") : t("guide.title")}>
      <h2 className="font-display text-2xl font-extrabold">
        {isShowcase(trip) ? t("guide.showcaseTitle") : t("guide.title")}
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-2">{t("guide.empty")}</p>
      ) : (
        <GuideDays items={items} startDate={trip.start_date} />
      )}
      {!viewOnly && (
        <div className="app-card mt-4">
          <h3 className="font-bold">{t("guide.privacy")}</h3>
          <p className="text-xs text-muted-foreground">{t("guide.privacyHint")}</p>
          <label className="flex items-center gap-2 mt-2 text-sm min-h-11">
            <input
              type="checkbox"
              checked={prefs.show_name}
              onChange={(e) =>
                act.mutate({
                  type: "prefs",
                  showName: e.target.checked,
                  sharePhotos: prefs.share_photos,
                })
              }
            />
            {t("guide.showName")}
          </label>
          <label className="flex items-center gap-2 text-sm min-h-11">
            <input
              type="checkbox"
              checked={prefs.share_photos}
              onChange={(e) =>
                act.mutate({
                  type: "prefs",
                  showName: prefs.show_name,
                  sharePhotos: e.target.checked,
                })
              }
            />
            {t("guide.sharePhotos")}
          </label>
          {leader ? (
            <div className="mt-3 grid gap-2">
              {link && (
                <>
                  <p className="text-xs font-bold" role="status">
                    {t("guide.shared")}
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() =>
                      void navigator.clipboard?.writeText(link).then(() => setCopied(true))
                    }
                  >
                    {copied ? t("guide.copied") : t("guide.copy")}
                  </Button>
                </>
              )}
              <Button
                variant={link ? "ghost" : "default"}
                className="min-h-11"
                disabled={act.isPending}
                onClick={() => act.mutate({ type: "publish", publish: !link })}
              >
                {link ? t("guide.unpublish") : t("guide.publish")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">{t("guide.leaderOnly")}</p>
          )}
          {act.error && (
            <p className="text-xs text-destructive mt-2" role="alert">
              {t("guide.error", { reason: friendlyError(act.error) })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
