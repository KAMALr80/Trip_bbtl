// Badges (M5-09, R-711 – R-713) and the new-engine stamps (M5-07, R-701): each stamp shows its
// room, season, crowns and solo marker, and opens the trip's postcard. Level, badges and stamps are
// computed on the server when a trip locks (R-704); this only reads them.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMarkBadgesSeen, useMyStamps, usePassportProgress, type Stamp } from "@/data/postcard";
import { TripPostcard } from "@/features/postcard/TripPostcard";
import { useT } from "@/i18n";

const BADGE_ICON = { us_explorer: "🗽", culture_collector: "🎎", storyteller: "📖" } as const;
const TIER = ["carry_on", "carry_on", "checked_bag", "first_class"] as const;
const tierKey = (tier: number) => TIER[Math.min(3, Math.max(1, tier))] ?? "carry_on";
const KIND = ["international", "road_trip", "postcard"] as const;
const kindKey = (kind: string) => KIND.find((k) => k === kind) ?? "international";
const BADGE_STEPS = {
  us_explorer: [1, 5, 15],
  culture_collector: [1, 5, 10],
  storyteller: [1, 3, 10],
} as const;

/** The three badges with their tier (Carry-On → Checked Bag → First Class) and a tier-up note. */
export function BadgeShelf() {
  const t = useT();
  const badges = usePassportProgress().data?.badges ?? [];
  const seen = useMarkBadgesSeen();
  const fresh = badges.filter((b) => b.new);
  const [celebrate, setCelebrate] = useState<typeof fresh>([]);
  useEffect(() => {
    // Show the tier-up once, then tell the server it was seen (M5-09 acceptance).
    if (fresh.length && !seen.isPending && !seen.isSuccess) {
      setCelebrate(fresh);
      seen.mutate();
    }
  }, [fresh, seen]);
  if (!badges.length) return null;
  return (
    <section className="mt-4" aria-label={t("passport.badgesTitle")}>
      <h3 className="passport-rule-title">{t("passport.badgesTitle")}</h3>
      {celebrate.length > 0 && (
        <p className="mt-2 rounded-md bg-muted p-2 text-sm font-bold" role="status">
          🎉{" "}
          {celebrate
            .map((b) =>
              t("passport.tierUp", {
                badge: t(`passport.badge.${b.badge}`),
                tier: t(`passport.tier.${tierKey(b.tier)}`),
              }),
            )
            .join(" · ")}
        </p>
      )}
      <ul className="mt-2 grid gap-2">
        {badges.map((b) => {
          const next = BADGE_STEPS[b.badge].find((n) => n > b.progress);
          return (
            <li key={b.badge} className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {BADGE_ICON[b.badge]}
              </span>
              <span className="text-sm">
                <strong>{t(`passport.badge.${b.badge}`)}</strong> ·{" "}
                {t(`passport.tier.${tierKey(b.tier)}`)}
                <span className="block text-xs text-muted-foreground">
                  {next
                    ? t(`passport.badgeNext.${b.badge}`, { count: next - b.progress })
                    : t("passport.badgeTop")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Stamps from finished trips; tap one for its postcard (R-701). */
export function TripStamps() {
  const t = useT();
  const stamps = (useMyStamps().data ?? []).filter((s) => s.has_postcard);
  const [open, setOpen] = useState<Stamp | null>(null);
  if (!stamps.length) return null;
  return (
    <section className="mt-4" aria-label={t("passport.stampsTitle")}>
      <h3 className="passport-rule-title">{t("passport.stampsTitle")}</h3>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {stamps.map((s) => (
          <li key={s.trip_id}>
            <button
              type="button"
              className="passport-stamp w-full min-h-11 p-2 text-left text-xs"
              onClick={() => setOpen(s)}
              aria-label={t("passport.openPostcard", { trip: s.trip_name })}
            >
              <strong className="block uppercase">
                {s.kind === "postcard" ? `🏠 ${s.culture ?? s.country}` : (s.state ?? s.country)}
              </strong>
              <span className="block">{t(`passport.kind.${kindKey(s.kind)}`)}</span>
              <span className="block">
                {s.season_label}
                {s.solo ? ` · ${t("passport.solo")}` : ""}
              </span>
              {s.crowns.length > 0 && (
                <span className="block">
                  {s.crowns
                    .map(
                      (c) =>
                        `👑 ${t(`standings.crown.${c === "preflight" ? "preflight" : "trip_season"}`)}`,
                    )
                    .join(" ")}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>{open?.trip_name}</DialogTitle>
          {open && (
            <TripPostcard
              trip={{
                id: open.trip_id,
                name: open.trip_name,
                destination: open.city ?? open.country,
                start_date: open.stamped_on,
                end_date: open.stamped_on,
                cultures: open.culture ? [open.culture] : [],
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
