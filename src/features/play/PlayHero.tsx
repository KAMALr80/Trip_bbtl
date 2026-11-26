// The Play hub's hero (founder review, deck slide 21): the phase's art behind the trip name, a
// countdown to the next stop on the route, and the crew at the gate. Presentation only: the phase
// and its dates come from phaseBoundaries / the server, exactly as the phase strip reads them.
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { AvatarButton } from "@/features/players/PlayerCards";
import { useT } from "@/i18n";
import { playerName } from "@/lib/player-name";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import { shareInvite, type Member, type TripWithRole } from "@/lib/trips";
import { tripDisplayName } from "@/lib/trip-display-name";
import { friendlyRange } from "@/lib/trip-dates";
import { useMinute } from "@/features/play/PhaseNotice";

export const ROUTE = ["preflight", "takeoff", "trip_season", "baggage_claim"] as const;
export type RouteStop = (typeof ROUTE)[number];
type Bounds = Record<RouteStop, readonly [number, number]>;

/** The next stop on the route and when it opens; null once the last phase is under way. */
export function nextStop(
  bounds: Bounds,
  current: RouteStop | null,
  withPreflight: boolean,
  now: number,
): { stop: RouteStop; at: number } | null {
  const stops = ROUTE.filter((s) => withPreflight || s !== "preflight");
  const from = current === null ? 0 : stops.indexOf(current) + 1;
  for (const stop of stops.slice(from)) {
    const at = bounds[stop][0];
    if (at > now) return { stop, at };
  }
  return null;
}

/** Days, hours and minutes left (never negative). */
export function countdownParts(ms: number) {
  const left = Math.max(0, Math.floor(ms / 60_000));
  return { d: Math.floor(left / 1440), h: Math.floor((left % 1440) / 60), m: left % 60 };
}

export function PlayHero({
  trip,
  art,
  current,
  bounds,
  withPreflight,
  atHome,
  children,
}: {
  trip: TripWithRole;
  art: string;
  /** The phase under way, or null before the trip's first phase opens. */
  current: RouteStop | null;
  bounds: Bounds;
  withPreflight: boolean;
  atHome: boolean;
  /** The score card and the route, drawn over the same art. */
  children: ReactNode;
}) {
  const t = useT();
  const now = useMinute();
  const stopName = (s: RouteStop) =>
    s === "takeoff" && atHome ? t("phases.homeMissions") : t(`phases.${s}`);
  const next = nextStop(bounds, current, withPreflight, now);
  const left = next ? countdownParts(next.at - now) : null;
  return (
    <div className="play-hero-scene" style={{ ["--play-hero-art" as string]: `url(${art})` }}>
      <header className="play-hero">
        <img className="play-hero-art" src={art} alt="" width={1536} height={768} />
        <svg className="play-hero-route" viewBox="0 0 320 120" aria-hidden="true">
          <path d="M-10 108 C 70 96, 120 40, 205 46 S 300 14, 330 6" />
        </svg>
        <span className="play-hero-plane" aria-hidden="true">
          ✈
        </span>
        {next && left && (
          <div className="play-hero-countdown" role="timer" aria-live="off">
            <small>{t("play.hero.in", { phase: stopName(next.stop) })}</small>
            <span>
              {left.d > 0 && (
                <>
                  <b>{left.d}</b>
                  <i>{t("play.hero.d")}</i>
                </>
              )}
              <b>{left.h}</b>
              <i>{t("play.hero.h")}</i>
              {left.d === 0 && (
                <>
                  <b>{left.m}</b>
                  <i>{t("play.hero.m")}</i>
                </>
              )}
            </span>
          </div>
        )}
        <div className="play-hero-title">
          <p>
            {current === null
              ? t("play.hero.nextTrip")
              : t("play.hero.now", { phase: stopName(current) })}
          </p>
          <h1>{tripDisplayName(trip.name)}</h1>
          <small>
            {trip.destination} · {friendlyRange(trip.start_date, trip.end_date)}
          </small>
        </div>
      </header>
      {children}
    </div>
  );
}

const ROLE_KEY = {
  captain: "play.crew.captain",
  co_captain: "play.crew.coCaptain",
} as const;

/** "Your crew at the gate": everyone's avatar, name and role, plus Invite for leaders. */
export function CrewAtGate({
  trip,
  members,
  cards,
  cap,
  onMember,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  cap: number | null;
  onMember?: ((id: string) => void) | undefined;
}) {
  const t = useT();
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  const canInvite = leader && !!trip.join_code && (cap === null || members.length < cap);
  return (
    <section className="play-crew-gate" aria-label={t("play.crew.title")}>
      <div className="play-section-heading">
        <h2>{t("play.crew.title")}</h2>
        {cap !== null && <span>{t("play.crew.seats", { count: members.length, cap })}</span>}
      </div>
      <ul>
        {members.map((m) => {
          const card = cards.find((c) => c.user_id === m.user_id);
          const name = playerName(cards, members, m.user_id, t("player.former"));
          const role =
            m.role === "captain" || m.role === "co_captain"
              ? t(ROLE_KEY[m.role])
              : card?.trip_persona || t("play.crew.player");
          return (
            <li key={m.user_id} className={`play-crew-seat is-${m.role}`}>
              <AvatarButton
                userId={m.user_id}
                onOpen={onMember}
                url={card?.avatarUrl}
                name={name}
                className="size-14"
                wrapperClass="play-crew-avatar"
              />
              <strong>{name}</strong>
              <small>{role}</small>
            </li>
          );
        })}
        {canInvite && (
          <li className="play-crew-seat is-invite">
            <button
              type="button"
              className="play-crew-invite"
              aria-label={t("play.crew.invite")}
              onClick={async () => {
                const status = await shareInvite(trip.join_code, trip.name);
                if (status === "copied") toast(t("play.crew.copied"));
              }}
            >
              <Plus aria-hidden />
            </button>
            <strong>{t("play.crew.invite")}</strong>
            <small>{t("play.crew.shareCode")}</small>
          </li>
        )}
      </ul>
    </section>
  );
}
