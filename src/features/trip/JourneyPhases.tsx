// The "two crowns" card on Home: my points and place in each season, from the points ledger
// (M3-01). Opens a short explainer with who leads each season.
import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStandings } from "@/data/live";
import { useT } from "@/i18n";
import { hasPreflight } from "@/features/trip/phase";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

export function JourneyPhases({
  trip,
  members,
  cards,
  userId,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const pre = useStandings(trip.id, "preflight").data ?? [];
  const season = useStandings(trip.id, "trip_season").data ?? [];
  const nickname = (id: string | undefined) =>
    (id &&
      (cards.find((c) => c.user_id === id)?.game_name ||
        members.find((m) => m.user_id === id)?.display_name)) ||
    t("journey.nobody");
  const line = (rows: typeof pre, emoji: string, label: string) => {
    const me = rows.find((r) => r.user_id === userId);
    return t("journey.line", {
      emoji,
      season: label,
      points: me?.points ?? 0,
      place:
        me && me.points > 0
          ? t("journey.place", { rank: me.rank, count: rows.length })
          : t("journey.noPlace"),
    });
  };
  const leader = (rows: typeof pre) => rows.find((r) => r.rank === 1 && r.points > 0)?.user_id;
  return (
    <>
      <Button
        variant="outline"
        className="app-card mt-4 w-full h-auto text-left flex justify-between items-center"
        onClick={() => setOpen(true)}
      >
        <span>
          <span className="eyebrow text-blue">{t("journey.eyebrow")}</span>
          {hasPreflight(trip) && (
            <span className="block font-bold mt-2">{line(pre, "✈️", t("phases.preflight"))}</span>
          )}
          <span className="block font-bold mt-2">
            {line(season, "🌴", t("phases.trip_season"))}
          </span>
        </span>
        <ArrowRight className="shrink-0" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-foreground/50" onClick={() => setOpen(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("journey.dialog")}
            className="relative w-full max-w-lg rounded-t-3xl bg-card p-6 pb-10"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4"
              onClick={() => setOpen(false)}
              aria-label={t("journey.close")}
            >
              <X />
            </Button>
            <h2 className="font-display text-2xl font-extrabold pr-10">{t("journey.title")}</h2>
            <p className="text-sm text-muted-foreground mt-2">{t("journey.intro")}</p>
            <div className="bg-blue-soft rounded-2xl p-4 mt-5">
              <h3 className="font-bold">{t("journey.earlyBird")}</h3>
              <p className="text-sm mt-1">{t("journey.earlyBirdLine")}</p>
              <p className="text-xs font-bold mt-2">
                {t("journey.leading", { name: nickname(leader(pre)) })}
              </p>
            </div>
            <div className="bg-orange-soft rounded-2xl p-4 mt-3">
              <h3 className="font-bold">{t("journey.jetSetter")}</h3>
              <p className="text-sm mt-1">{t("journey.jetSetterLine")}</p>
              <p className="text-xs font-bold mt-2">
                {t("journey.leading", { name: nickname(leader(season)) })}
              </p>
            </div>
            <Button variant="playful" className="w-full mt-5" onClick={() => setOpen(false)}>
              {t("journey.go")}
            </Button>
          </section>
        </div>
      )}
    </>
  );
}
