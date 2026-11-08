// Standings from the points ledger (M3-01, M3-15): each season's board in tie-break order (R-506),
// the two crowns (M3-11), and avatars that open the player card (R-722). This replaced the older
// stamp boards when M3-16 retired their scoring.
import { Crown } from "lucide-react";
import { AvatarButton } from "@/features/players/PlayerCards";
import { useCrowns, useStandings } from "@/data/live";
import { t as translate, useT } from "@/i18n";
import { playerName } from "@/lib/player-name";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import { hasPreflight } from "@/features/trip/phase";
import type { Member, TripWithRole } from "@/lib/trips";

type Season = "preflight" | "trip_season";
type Props = {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  onMember?: ((id: string) => void) | undefined;
};

const nameOf = (cards: PlayerWithAvatar[], members: Member[], id: string) =>
  playerName(cards, members, id, translate("player.former"));

/** The season being played now: Trip Season once the trip has started, else Pre-Flight. */
export function currentSeason(trip: TripWithRole): Season {
  if (!hasPreflight(trip)) return "trip_season";
  return new Date(`${trip.start_date}T00:00:00`).getTime() <= Date.now()
    ? "trip_season"
    : "preflight";
}

/** My points, place and crowns, the crowns row, and the boards (one season when compact). */
export function CrewStandings(props: Props & { compact?: boolean }) {
  const t = useT();
  const { trip, userId, compact } = props;
  const season = currentSeason(trip);
  const board = useStandings(trip.id, season).data ?? [];
  const crowns = useCrowns(trip.id).data ?? [];
  const mine = board.find((r) => r.user_id === userId);
  if (!board.length) return null;
  return (
    <section className="mt-4" aria-label={t("standings.title")}>
      {!compact && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              [t("standings.points"), mine?.points ?? 0],
              [t("standings.placeLabel"), mine && mine.points > 0 ? `#${mine.rank}` : "–"],
              [t("standings.crowns"), crowns.filter((c) => c.user_id === userId).length],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="app-card !p-3">
              <p className="font-display text-[22px] font-extrabold">{value}</p>
              <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}
      {!compact && <CrownsRow {...props} crowns={crowns} />}
      {(compact || !hasPreflight(trip) ? [season] : (["preflight", "trip_season"] as Season[])).map(
        (s) => (
          <SeasonBoard key={s} {...props} season={s} />
        ),
      )}
    </section>
  );
}

function CrownsRow({
  trip,
  members,
  cards,
  onMember,
  crowns,
}: Props & { crowns: { season: string; user_id: string }[] }) {
  const t = useT();
  if (!crowns.length) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      {(["preflight", "trip_season"] as Season[]).map((s) => {
        const list = crowns.filter((c) => c.season === s);
        const skipped = s === "preflight" && !hasPreflight(trip);
        return (
          <div key={s} className="rounded-2xl bg-orange-soft p-4 text-center">
            <p className="text-[11px] font-extrabold text-ink-soft flex items-center justify-center gap-1">
              <Crown size={12} /> {t(`standings.crown.${s}`)}
            </p>
            {list.length ? (
              list.map((c) => {
                const name = nameOf(cards, members, c.user_id);
                return (
                  <div key={c.user_id} className="mt-2">
                    <AvatarButton
                      userId={c.user_id}
                      onOpen={onMember}
                      url={cards.find((x) => x.user_id === c.user_id)?.avatarUrl}
                      name={name}
                      className="h-12 w-12"
                      wrapperClass="mx-auto"
                    />
                    <p className="font-bold text-sm truncate mt-1">{name}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm mt-3 text-muted-foreground">
                {skipped ? t("standings.noCrown") : t("standings.notYet")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SeasonBoard({
  trip,
  members,
  cards,
  userId,
  onMember,
  season,
}: Props & { season: Season }) {
  const t = useT();
  const rows = useStandings(trip.id, season).data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <div className="app-card mt-4">
      <h3 className="font-display font-extrabold">{t(`standings.seasonTitle.${season}`)}</h3>
      {rows.every((r) => r.points === 0) ? (
        <p className="text-sm text-muted-foreground mt-2">{t("standings.empty")}</p>
      ) : (
        <ol className="mt-2 grid gap-2">
          {rows.map((r) => {
            const name = nameOf(cards, members, r.user_id);
            return (
              <li
                key={r.user_id}
                className={`flex items-center gap-3 ${r.user_id === userId ? "font-bold" : ""}`}
              >
                <span className="w-6 text-right tabular-nums">{r.points > 0 ? r.rank : "–"}</span>
                <AvatarButton
                  userId={r.user_id}
                  onOpen={onMember}
                  url={cards.find((x) => x.user_id === r.user_id)?.avatarUrl}
                  name={name}
                  className="size-9"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{name}</span>
                  <span className="block h-1.5 rounded-full bg-muted">
                    <span
                      className="block h-1.5 rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (r.points / max) * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="tabular-nums">{t("standings.pts", { count: r.points })}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
