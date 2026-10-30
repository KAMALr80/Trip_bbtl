// Game Night Live (M3-07, R-401 – R-405): the same screen for call nights and the crowning night.
// No host and no turn order: people present out loud, the app collects 👍 and the secret award
// votes, and the Captain or Co-Captain closes it. Counts refresh every few seconds.
import { Button } from "@/components/ui/button";
import { useCallNights } from "@/data/schedule";
import { AWARDS, useLiveActions, useLiveSession, useLiveState, type Award } from "@/data/live";
import { Avatar } from "@/features/players/PlayerCards";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { Member, TripWithRole } from "@/lib/trips";

type Props = {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  crowning: boolean;
  viewOnly?: boolean | undefined;
};

export function GameNightLive({ trip, members, cards, userId, crowning, viewOnly }: Props) {
  const t = useT();
  const session = useLiveSession(trip.id).data ?? null;
  const nights = useCallNights(trip.id).data ?? [];
  const open = session?.status === "open";
  const state = useLiveState(session?.id, open).data ?? [];
  const act = useLiveActions(trip.id, session?.id);
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  // A session from an earlier night that has closed isn't tonight's.
  const shown = session && (open || session.is_crowning === crowning) ? session : null;
  const now = Date.now();
  const tonight = nights.find(
    (n) =>
      Date.parse(n.starts_at) - 3_600_000 <= now && Date.parse(n.starts_at) + 4 * 3_600_000 > now,
  );
  const nameOf = (id: string) =>
    cards.find((c) => c.user_id === id)?.game_name ??
    members.find((m) => m.user_id === id)?.display_name ??
    "?";
  const avatarOf = (id: string) => cards.find((c) => c.user_id === id)?.avatarUrl;
  const canOpen = !viewOnly && (crowning ? leader : true);

  return (
    <section className="app-card mt-3" aria-label={t("live.title")}>
      <h3 className="font-display text-lg font-extrabold">{t("live.title")}</h3>
      <p className="text-xs text-muted-foreground">
        {crowning ? t("live.lineCrowning") : t("live.lineCall")}
      </p>
      {!shown && canOpen && (
        <Button
          className="mt-3 w-full min-h-11"
          disabled={act.isPending}
          onClick={() =>
            act.mutate({
              type: "open",
              callNight: crowning ? null : (tonight?.id ?? null),
              crowning,
            })
          }
        >
          {crowning ? t("live.openCrowning") : t("live.open")}
        </Button>
      )}
      {shown && (
        <>
          {!open && (
            <p className="text-sm font-bold mt-3" role="status">
              {t("live.closed")}
            </p>
          )}
          <h4 className="font-bold mt-4">{t("live.showTell")}</h4>
          {open && <p className="text-xs text-muted-foreground">{t("live.showTellHint")}</p>}
          <ul className="grid grid-cols-3 gap-2 mt-2">
            {state.map((row) => {
              const me = row.user_id === userId;
              const name = nameOf(row.user_id);
              return (
                <li key={row.user_id}>
                  <Button
                    variant={row.i_tapped ? "default" : "outline"}
                    className="h-auto min-h-11 w-full flex-col gap-1 py-2"
                    disabled={!open || me || row.i_tapped || viewOnly || act.isPending}
                    aria-label={me ? t("live.you", { name }) : t("live.tap", { name })}
                    onClick={() => act.mutate({ type: "present", presenter: row.user_id })}
                  >
                    <Avatar url={avatarOf(row.user_id)} name={name} className="h-11 w-11" />
                    <span className="max-w-full truncate text-xs">{name}</span>
                    <span className="text-xs">{t("live.thumbs", { count: row.thumbs })}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
          {open && (
            <>
              <h4 className="font-bold mt-4">{t("live.awards")}</h4>
              <p className="text-xs text-muted-foreground">{t("live.awardsHint")}</p>
              {AWARDS.map((award) => (
                <AwardPicker
                  key={award}
                  award={award}
                  rows={state.filter((r) => r.user_id !== userId)}
                  nameOf={nameOf}
                  disabled={!!viewOnly || act.isPending}
                  onPick={(nominee) => act.mutate({ type: "award", award, nominee })}
                />
              ))}
            </>
          )}
          {!open && <Winners rows={state} nameOf={nameOf} />}
          {leader && !viewOnly && (
            <Button
              variant={open ? "default" : "outline"}
              className="mt-4 w-full min-h-11"
              disabled={act.isPending}
              onClick={() => act.mutate({ type: open ? "close" : "reopen" })}
            >
              {open ? t("live.close") : t("live.reopen")}
            </Button>
          )}
        </>
      )}
      {act.error && (
        <p className="text-xs text-destructive mt-2" role="alert">
          {t("live.error", { reason: friendlyError(act.error) })}
        </p>
      )}
    </section>
  );
}

function AwardPicker({
  award,
  rows,
  nameOf,
  disabled,
  onPick,
}: {
  award: Award;
  rows: { user_id: string; my_awards: string[] }[];
  nameOf: (id: string) => string;
  disabled: boolean;
  onPick: (nominee: string) => void;
}) {
  const t = useT();
  return (
    <fieldset className="mt-3">
      <legend className="text-sm font-semibold">{t(`live.award.${award}`)}</legend>
      <div className="flex flex-wrap gap-2 mt-1">
        {rows.map((r) => {
          const picked = r.my_awards.includes(award);
          return (
            <Button
              key={r.user_id}
              size="sm"
              variant={picked ? "default" : "outline"}
              className="min-h-11"
              aria-pressed={picked}
              disabled={disabled}
              aria-label={`${t(`live.award.${award}`)}: ${t("live.pick", { name: nameOf(r.user_id) })}`}
              onClick={() => onPick(r.user_id)}
            >
              {nameOf(r.user_id)}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Winners({
  rows,
  nameOf,
}: {
  rows: { user_id: string; won_awards: string[] }[];
  nameOf: (id: string) => string;
}) {
  const t = useT();
  const won = rows.filter((r) => r.won_awards.length);
  return (
    <div className="mt-4">
      <h4 className="font-bold">{t("live.winners")}</h4>
      {won.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("live.noWinners")}</p>
      ) : (
        <ul className="mt-1 grid gap-1">
          {won.map((r) => (
            <li key={r.user_id} className="text-sm">
              {t("live.won", {
                name: nameOf(r.user_id),
                awards: r.won_awards.map((a) => t(`live.award.${a as Award}`)).join(" · "),
              })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
