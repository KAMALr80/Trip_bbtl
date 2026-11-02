// After the Day 7 lock (M5-12, R-609): the trip shows its overview, the answers and the kept photos
// only, all on the Trip Postcard, which can be downloaded or shared. Nothing here writes.
import { useT } from "@/i18n";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { TripWithRole } from "@/lib/trips";
import { AvatarButton } from "@/features/players/PlayerCards";
import { TripPostcard } from "./TripPostcard";

const fmtDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function AfterTrip({
  trip,
  cards,
  onMember,
}: {
  trip: TripWithRole;
  cards: PlayerWithAvatar[];
  onMember: (id: string) => void;
}) {
  const t = useT();
  return (
    <section aria-labelledby="after-trip-title">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("postcard.afterEyebrow")}
        </p>
        <h1 id="after-trip-title" className="font-display text-2xl font-extrabold">
          {trip.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {trip.cultures?.[0] ?? trip.destination} · {fmtDay(trip.start_date)} –{" "}
          {fmtDay(trip.end_date)}
        </p>
      </header>
      <p className="mt-3 text-sm">{t("postcard.afterLine")}</p>
      <h2 className="mt-4 font-display text-lg font-bold">{t("postcard.crew")}</h2>
      <ul className="mt-2 flex flex-wrap gap-3">
        {cards.map((card) => (
          <li key={card.user_id} className="flex flex-col items-center gap-1 text-xs">
            <AvatarButton
              userId={card.user_id}
              url={card.avatarUrl}
              name={card.game_name}
              onOpen={onMember}
            />
            <span>{card.game_name}</span>
          </li>
        ))}
      </ul>
      <TripPostcard trip={trip} />
    </section>
  );
}
