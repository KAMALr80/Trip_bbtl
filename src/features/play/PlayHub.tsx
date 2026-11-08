import { useNavigate } from "@tanstack/react-router";
import { rpc } from "@/data/rpc";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  Gamepad2,
  LockKeyhole,
  Plane,
  ScanLine,
  Sparkles,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarButton } from "@/features/players/PlayerCards";
import { ProfileSheet } from "@/features/profile/ProfilePage";
import { PhaseNotice } from "@/features/play/PhaseNotice";
import { GameArcade } from "@/features/play/GameArcade";
import { gameSceneArt } from "@/features/play/GameScene";
import { OnePhoneNight } from "@/features/play/OnePhoneNight";
import { SoloGuide } from "@/features/window-seat/SoloGuide";
import { TripGuide, isShowcase } from "@/features/guide/TripGuide";
import { JournalPrompt } from "@/features/guide/JournalPrompt";
import { PostcardPicks } from "@/features/postcard/PostcardPicks";
import { WrapupWeek } from "@/features/postcard/WrapupWeek";
import { AtHomePlay, isAtHome } from "@/features/at-home/AtHome";
import { HomeDayFlow } from "@/features/play/HomeDayFlow";
import { DailyCard } from "@/features/daily/DailyPlay";
import { CrewCheck, QuestProofs } from "@/features/quests/QuestProofs";
import { SurpriseDrop } from "@/features/quests/SurpriseDrop";
import { GameNightLive } from "@/features/live/GameNightLive";
import { useCrowns, usePointsBreakdown, useSoloGoal, useStandings } from "@/data/live";
import { useMySchedule } from "@/data/daily";
import { useMyProofs } from "@/data/proofs";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { noFlight, readOfflineRoster } from "@/lib/play-arrangement";
import {
  hasPreflight,
  phaseBoundaries,
  tripPhase,
  tripPhaseInput,
  type Phase as EnginePhase,
} from "@/features/trip/phase";
import { useTripPhase } from "@/data/phase";
import { useMyWrapupAnswers, usePostcardInfo } from "@/data/postcard";
import { wrapupState } from "@/features/postcard/wrapup";
import { fmtWhen } from "@/lib/viewer-time";
import { roomOf } from "@/features/trip/rooms";
import { t as translate, useT } from "@/i18n";
import { playerName } from "@/lib/player-name";
import { CallNightsCard, CrowningCard } from "@/features/play/TripNights";
import { useQueryClient } from "@tanstack/react-query";
import { tripToday, tripTz } from "@/lib/itinerary";
import { friendlyRange } from "@/lib/trip-dates";
import { tripDisplayName } from "@/lib/trip-display-name";
import { hapticTap } from "@/lib/haptics";
import preflightArt from "@/assets/play-phase-preflight.jpg";
import takeoffArt from "@/assets/play-phase-takeoff.jpg";
import tripArt from "@/assets/play-phase-trip-season.jpg";
import wrappedArt from "@/assets/play-phase-wrapped.jpg";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Phase = "preflight" | "takeoff" | "trip" | "wrapped";
type Detail = "arcade" | "offline-night" | "solo" | "home" | "guide" | null;
/** A standings row for the crown boards: ledger points (M3-01). */
type Row = { user_id: string; total: number };
/** A crown, in the season names the older Wrapped screen uses. */
type Champion = { season: "game" | "trip"; user_id: string; score: number };
type Props = {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly: boolean;
  onManage?: (() => void) | undefined;
  onCalendar?: (() => void) | undefined;
  onWrapped?: (() => void) | undefined;
  onMember?: ((id: string) => void) | undefined;
  refresh: () => Promise<void>;
};
const PHASES: { id: Phase; label: string; art: string; tagline: string }[] = [
  {
    id: "preflight",
    label: "Pre-Flight",
    art: preflightArt,
    tagline: "Bond before you go. Crown #1 is on the line.",
  },
  {
    id: "takeoff",
    label: "Takeoff",
    art: takeoffArt,
    tagline: "Departure-day missions count toward Trip Season.",
  },
  {
    id: "trip",
    label: "Trip Season",
    art: tripArt,
    tagline: "Crown #2 is open. Play it while you're there.",
  },
  {
    id: "wrapped",
    label: "Wrapped",
    art: wrappedArt,
    tagline: "The points, crowns and memories from your trip.",
  },
];
const indexOf = (phase: Phase) => PHASES.findIndex((p) => p.id === phase);
const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000));
const shortDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const stampLabel = (value: string) => {
  const words = value.trim().toUpperCase().split(/\s+/).filter(Boolean);
  let label = "";
  for (const word of words) {
    const next = label ? `${label} ${word}` : word;
    if (next.length > 12) break;
    label = next;
  }
  return label || words[0] || "TRIP";
};

/** Before the first phase opens (QA-09): the hub has no "now" yet. */
const isUpcoming = (p: EnginePhase) => p === "upcoming" || p === "setup";
const instantDay = (at: number, tz: string) =>
  shortDate(new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(at)));

/** The hub's phase page for the engine phase (M2-09): before the trip shows Pre-Flight, after
 * Baggage Claim stays on the last page. */
function hubPhase(p: EnginePhase): Phase {
  return p === "takeoff"
    ? "takeoff"
    : p === "trip_season"
      ? "trip"
      : p === "baggage_claim" || p === "archived"
        ? "wrapped"
        : "preflight";
}

const engineId = {
  preflight: "preflight",
  takeoff: "takeoff",
  trip: "trip_season",
  wrapped: "baggage_claim",
} as const;
function phaseProgress(trip: TripWithRole, phase: Phase) {
  const b = phaseBoundaries(tripPhaseInput(trip));
  const id = engineId[phase];
  const [start, end] = b[id];
  const total = Math.max(1, Math.round((end - start) / 86_400_000));
  const now = tripPhase(trip);
  const day = now.phase === id && now.dayIndex ? Math.min(total, now.dayIndex) : 1;
  return { day, total };
}

function FaceCard({
  icon,
  tone,
  title,
  line,
  points,
  pill,
  live,
  onClick,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  line: ReactNode;
  points?: string | undefined;
  pill?: string | undefined;
  live?: boolean | undefined;
  onClick?: (() => void) | undefined;
}) {
  return (
    <Button
      variant="ghost"
      className={`play-face-card ${live ? "play-face-live" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className={`play-face-icon ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <strong>{title}</strong>
        <small>{line}</small>
      </span>
      <span className="play-face-meta">
        {pill && <em className={pill === "New" ? "play-new-pill" : ""}>{pill}</em>}
        {points && <b>{points}</b>}
        <ChevronRight size={17} />
      </span>
    </Button>
  );
}

/** Cards the new engine adds in M2/M3; shown so every phase page lists what it will hold. */
function ComingCard({
  icon,
  tone,
  title,
  line,
}: {
  icon: ReactNode;
  tone: string;
  title: string;
  line: string;
}) {
  return <FaceCard icon={icon} tone={tone} title={title} line={line} pill="Coming in this phase" />;
}

function SquadAvatars({
  members,
  cards,
  onMember,
}: {
  members: Member[];
  cards: PlayerWithAvatar[];
  onMember?: ((id: string) => void) | undefined;
}) {
  const shown = members.slice(0, 4);
  return (
    <div className="play-squad-avatars" aria-label={`${members.length} in the squad`}>
      {shown.map((m) => {
        const c = cards.find((x) => x.user_id === m.user_id);
        return (
          <AvatarButton
            key={m.user_id}
            userId={m.user_id}
            onOpen={onMember}
            url={c?.avatarUrl}
            name={c?.game_name || m.display_name || "Player"}
            className="size-8"
            wrapperClass="play-squad-avatar"
          />
        );
      })}
      {members.length > 4 && <span>+{members.length - 4}</span>}
    </div>
  );
}

function CrownBoard({
  rows,
  members,
  cards,
  userId,
  onMember,
  label,
  onFull,
}: {
  rows: { user_id: string; total: number }[];
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  onMember?: ((id: string) => void) | undefined;
  label: string;
  onFull: () => void;
}) {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, 3);
  const mine = sorted.find((r) => r.user_id === userId);
  const list = mine && !top.some((r) => r.user_id === userId) ? [...top, mine] : top;
  const max = Math.max(1, ...sorted.map((r) => r.total));
  return (
    <section className="play-crown-board">
      <div className="play-section-heading">
        <h2>{label}</h2>
        <Button variant="ghost" className="min-h-11" onClick={onFull}>
          Full board <ChevronRight />
        </Button>
      </div>
      <ol>
        {list.map((row) => {
          const rank = sorted.findIndex((x) => x.user_id === row.user_id) + 1;
          const c = cards.find((x) => x.user_id === row.user_id);
          const name = playerName(cards, members, row.user_id, translate("player.former"));
          return (
            <li key={row.user_id}>
              <span>{rank}</span>
              <AvatarButton
                userId={row.user_id}
                onOpen={onMember}
                url={c?.avatarUrl}
                name={name}
                className="size-9"
              />
              <span className="min-w-0 flex-1">
                <strong>{name}</strong>
                <i>
                  <span style={{ width: `${Math.max(4, (row.total / max) * 100)}%` }} />
                </i>
              </span>
              <b>{row.total}</b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function PhaseRail({
  trip,
  current,
  upcoming,
  onOpen,
}: {
  trip: TripWithRole;
  current: Phase;
  upcoming: boolean;
  onOpen: (p: Phase) => void;
}) {
  const t = useT();
  const now = indexOf(current);
  const b = phaseBoundaries(tripPhaseInput(trip));
  const day = (at: number, tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(at));
  // Phase names per room (R-107, R-110): Home Missions at home; the last phase is Baggage Claim.
  const name = (id: Phase) =>
    id === "takeoff"
      ? t(roomOf(trip.room).atHome ? "phases.homeMissions" : "phases.takeoff")
      : t(`phases.${engineId[id]}`);
  return (
    <div className="play-phase-ticket" role="navigation" aria-label="Trip phases">
      {PHASES.map((p, i) => {
        const skipped = p.id === "preflight" && !hasPreflight(trip);
        const done = i < now && !skipped,
          active = i === now && !upcoming && !skipped;
        const [opens] = b[engineId[p.id]];
        const date = b[engineId[p.id]][1] > opens ? day(opens, b.tz[engineId[p.id]]) : null;
        const activeLine =
          p.id === "takeoff"
            ? "Until arrival"
            : p.id === "wrapped"
              ? "Crowning"
              : `${phaseProgress(trip, p.id).day} of ${phaseProgress(trip, p.id).total}`;
        return (
          <Button
            key={p.id}
            variant="ghost"
            aria-current={active ? "step" : undefined}
            className={`play-phase-segment ${active ? "is-current" : done ? "is-done" : "is-locked"}`}
            onClick={() => onOpen(p.id)}
          >
            <span className={done ? "play-phase-stamp" : ""}>
              {done ? <Check size={15} /> : active ? "NOW" : <LockKeyhole size={13} />}
            </span>
            <strong>{name(p.id)}</strong>
            <small>
              {skipped
                ? t("phases.skipped")
                : active
                  ? activeLine
                  : p.id === "trip" && i > now
                    ? "After arrival"
                    : date
                      ? shortDate(date)
                      : i > now
                        ? "Coming up"
                        : "Done"}
            </small>
          </Button>
        );
      })}
    </div>
  );
}

const nightGames = [
  "Card flip",
  "Spin the wheel",
  "30-sec Draw",
  "Guess the song",
  "Vote showdown",
  "Two truths & lie",
].map((title, index) => ({
  index: [0, 1, 2, 3, 5, 6][index] ?? index,
  title,
  art: gameSceneArt(title),
  icon: "",
}));

/** One-night Game Night room (M2-14, R-008): straight to the games, free, no points or crowns.
 * Friends off the app pass one phone; a crew on the app plays the arcade until Game Night Live
 * (M3-07) gives everyone their own screen. */
function GameNightRoom({ trip }: { trip: TripWithRole }) {
  const t = useT();
  const navigate = useNavigate();
  const onExit = () => void navigate({ to: "/home" });
  return (
    <div className="play-hub">
      <header className="play-hub-heading">
        <div className="min-w-0">
          <h1>{tripDisplayName(trip.name)}</h1>
          <p>{t("gameNight.line")}</p>
        </div>
      </header>
      {trip.play_mode === "offline" ? (
        <OnePhoneNight
          tripId={trip.id}
          destination={trip.destination}
          games={nightGames}
          onExit={onExit}
        />
      ) : (
        <GameArcade trips={[trip]} practiceMode onBack={onExit} />
      )}
    </div>
  );
}

export function PlayHub(props: Props) {
  if (props.trip.room === "game_night") return <GameNightRoom trip={props.trip} />;
  return <EnginePlayHub {...props} />;
}

function EnginePlayHub(props: Props) {
  const { trip, members, cards, userId, onMember } = props;
  const t = useT();
  const [phase, setPhase] = useState<Phase | null>(null),
    [detail, setDetail] = useState<Detail>(null),
    [breakdown, setBreakdown] = useState(false),
    [fullBoard, setFullBoard] = useState(false),
    [passport, setPassport] = useState(false),
    [pointPop, setPointPop] = useState(0),
    [displayPoints, setDisplayPoints] = useState(0),
    [error, setError] = useState("");
  const [tripStarted, setTripStarted] = useState(false),
    [cultureKind, setCultureKind] = useState<string | null>(null);
  const scrolls = useRef<Record<string, number>>({});
  const previousPoints = useRef<number | null>(null);
  const engine = useTripPhase(trip);
  const upcoming = isUpcoming(engine);
  const active = hubPhase(engine),
    shownPhase = phase ?? active,
    preview = upcoming || indexOf(shownPhase) > indexOf(active);
  const local = trip.play_arrangement === "solo" || trip.play_arrangement === "offline";
  const onlineGroup = !local;
  // Score and place come from the points ledger (M3-01, M3-15): the season being played now.
  const ledgerSeason = active === "preflight" && hasPreflight(trip) ? "preflight" : "trip_season";
  const standings = useStandings(trip.id, ledgerSeason).data ?? [];
  const myStanding = standings.find((r) => r.user_id === userId);
  const ledgerRows = usePointsBreakdown(trip.id, ledgerSeason).data ?? [];
  const soloGoal = useSoloGoal(trip.id, ledgerSeason, trip.play_mode === "solo").data ?? 0;
  // Both seasons' boards and the crowns come from the ledger (M3-16 retired the older scoring).
  const toRows = (r: { user_id: string; points: number }[] | undefined): Row[] =>
    (r ?? []).map((x) => ({ user_id: x.user_id, total: x.points }));
  const preRows = toRows(useStandings(trip.id, "preflight").data);
  const tripRows = toRows(useStandings(trip.id, "trip_season").data);
  const champions: Champion[] = (useCrowns(trip.id).data ?? []).map((c) => ({
    season: c.season === "preflight" ? "game" : "trip",
    user_id: c.user_id,
    score: c.points,
  }));
  const schedule = useMySchedule(trip.id).data ?? [];
  const myProofs = useMyProofs(trip.id).data ?? [];
  // Wrap-up week (QA-08): on Up now for all of Baggage Claim, not only when the page is opened.
  const inWrapup = engine === "baggage_claim" && !trip.locked_at && roomOf(trip.room).pointsEnabled;
  const wrapupInfo = usePostcardInfo(trip.id, inWrapup).data;
  const wrapupAnswers = useMyWrapupAnswers(trip.id, inWrapup).data;
  const load = useCallback(async () => {
    const [startedResult, cultureResult] = await Promise.all([
      rpc("trip_season_started", { p_trip: trip.id }),
      trip.a2e_room
        ? supabase
            .from("culture_experiences")
            .select("a2e_kind")
            .eq("trip_id", trip.id)
            .not("a2e_kind", "is", null)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const issue = [startedResult, cultureResult].find((r) => r.error)?.error;
    if (issue) setError(friendlyError(issue));
    else setError("");
    setTripStarted(startedResult.data === true);
    setCultureKind((cultureResult.data as { a2e_kind?: string } | null)?.a2e_kind ?? null);
  }, [trip.id, trip.a2e_room]);
  useEffect(() => {
    void load();
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 20000);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer);
    };
  }, [load]);
  const rank = myStanding?.rank ?? 0;
  const me = cards.find((c) => c.user_id === userId);
  useEffect(() => {
    const total = myStanding?.points;
    let timer: number | undefined;
    let frame: number | undefined;
    if (typeof total === "number") {
      const previous = previousPoints.current;
      if (previous !== null && total > previous) {
        setPointPop(total - previous);
        hapticTap();
        const started = performance.now();
        const animate = (time: number) => {
          const progress = Math.min(1, (time - started) / 650);
          setDisplayPoints(Math.round(previous + (total - previous) * progress));
          if (progress < 1) frame = window.requestAnimationFrame(animate);
        };
        frame = window.requestAnimationFrame(animate);
        timer = window.setTimeout(() => setPointPop(0), 1400);
      } else setDisplayPoints(total);
      previousPoints.current = total;
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [myStanding?.points]);
  const openPhase = (nextPhase: Phase) => {
    scrolls.current[shownPhase] = window.scrollY;
    setDetail(null);
    setFullBoard(false);
    setPhase(nextPhase);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const backHub = () => {
    setDetail(null);
    setFullBoard(false);
    setPhase(null);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openDetail = (nextDetail: Detail) => {
    scrolls.current[shownPhase] = window.scrollY;
    setDetail(nextDetail);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const closeDetail = () => {
    setDetail(null);
    window.setTimeout(
      () => window.scrollTo({ top: scrolls.current[shownPhase] ?? 0, behavior: "instant" }),
      0,
    );
  };
  if (detail)
    return (
      <PlayDetail
        {...props}
        detail={detail}
        phase={shownPhase}
        tripStarted={tripStarted}
        onBack={closeDetail}
      />
    );
  if (phase)
    return (
      <PhasePage
        {...props}
        phase={shownPhase}
        current={upcoming ? null : active}
        preview={preview}
        preRows={preRows}
        tripRows={tripRows}
        champions={champions}
        tripStarted={tripStarted}
        cultureKind={cultureKind}
        fullBoard={fullBoard}
        onFullBoard={() => setFullBoard((v) => !v)}
        onBack={backHub}
        onDetail={openDetail}
      />
    );
  const nowMs = Date.now();
  const sealedReady = schedule.find(
    (i) =>
      i.user_id === userId &&
      ["sealed_quest", "airport_mission", "home_mission", "trip_quest"].includes(i.kind) &&
      i.is_open &&
      i.body == null &&
      (!i.closes_at || Date.parse(i.closes_at) > nowMs),
  );
  const pending = myProofs.find((p) => p.crew_status === "waiting");
  const up: {
    key: string;
    icon: React.ReactNode;
    tone: string;
    title: string;
    line: string;
    points?: string;
    pill?: string;
    action: () => void;
  }[] = [];
  if (sealedReady)
    up.push({
      key: sealedReady.id,
      icon: <Ticket />,
      tone: "pink",
      title: sealedReady.kind === "sealed_quest" ? "Sealed quest dropped" : "Sealed card waiting",
      line:
        sealedReady.kind === "sealed_quest"
          ? "Open it within 3 hours for +5"
          : "Open it to see what to do",
      ...(sealedReady.points ? { points: `${sealedReady.points} pts` } : {}),
      pill: "New",
      action: () => openPhase(active),
    });
  if (up.length < 2 && pending)
    up.push({
      key: pending.id,
      icon: <Camera />,
      tone: "orange",
      title: "Proof pending",
      line: "One 👍 from the crew approves it",
      pill: "Pending",
      action: () => openPhase(active),
    });
  const wrapup = wrapupState({
    phase: inWrapup ? engine : "",
    lockedAt: trip.locked_at,
    locksAt: wrapupInfo?.locks_at,
    questionKeys: wrapupInfo?.questions.map((q) => q.key) ?? [],
    answers: wrapupAnswers ?? {},
    now: nowMs,
  });
  const locksWhen = wrapupInfo?.locks_at ? fmtWhen(wrapupInfo.locks_at, trip.home_timezone) : "";
  if (wrapup.remaining > 0)
    up.unshift({
      key: "wrapup",
      icon: <Sparkles />,
      tone: "gold",
      title: t("postcard.wrapupTitle"),
      line: t("postcard.upNow", { count: wrapup.remaining, total: wrapup.total, when: locksWhen }),
      action: () => openPhase("wrapped"),
    });
  const progress = phaseProgress(trip, active);
  const bounds = phaseBoundaries(tripPhaseInput(trip));
  // What opens first: Pre-Flight, or Takeoff when there's no Pre-Flight (R-105).
  const firstOpens = hasPreflight(trip)
    ? t("phases.opensPreflight", { date: instantDay(bounds.preflight[0], bounds.tz.preflight) })
    : t("phases.opensTakeoff", { date: instantDay(bounds.takeoff[0], bounds.tz.takeoff) });
  return (
    <div
      className={`play-hub ${cultureKind === "inspire" ? "window-play-scene" : cultureKind ? "home-play-scene" : ""}`}
    >
      <header className="play-hub-heading">
        <div className="min-w-0">
          <h1>{tripDisplayName(trip.name)}</h1>
          <p>
            {trip.destination} · {friendlyRange(trip.start_date, trip.end_date)}
          </p>
        </div>
        <SquadAvatars members={members} cards={cards} onMember={onMember} />
      </header>
      <PhaseNotice trip={trip} viewOnly={props.viewOnly} />
      <section className="play-score-card" aria-label="Your score">
        <AvatarButton
          userId={userId}
          onOpen={() => setPassport(true)}
          url={me?.avatarUrl}
          name={me?.game_name || "Player"}
          className="size-14"
          wrapperClass="play-score-avatar"
        />
        <div className="min-w-0 flex-1">
          <strong>
            {local
              ? trip.play_arrangement === "solo"
                ? "Solo journey"
                : `${readOfflineRoster(trip.id).length || 1} playing`
              : `${displayPoints} pts`}
          </strong>
          <small>
            {upcoming ? (
              <>
                {t("phases.upcoming")} · {firstOpens}
              </>
            ) : (
              <>
                {PHASES[indexOf(active)]?.label} ·{" "}
                {active === "takeoff"
                  ? "Travel day"
                  : active === "wrapped"
                    ? shortDate(trip.end_date)
                    : `Day ${progress.day} of ${progress.total}`}
              </>
            )}
          </small>
          {!upcoming && (active === "preflight" || active === "trip") && (
            <small>
              {trip.play_mode === "solo"
                ? soloGoal > 0 &&
                  t("standings.goal", { points: myStanding?.points ?? 0, goal: soloGoal })
                : rank > 0 &&
                  t("standings.place", {
                    race: t(`standings.race.${ledgerSeason}`),
                    rank,
                    count: standings.length,
                  })}
            </small>
          )}
          <Button variant="ghost" className="play-score-link" onClick={() => setPassport(true)}>
            Tap your avatar → Passport
          </Button>
        </div>
        {pointPop > 0 && (
          <span className="play-points-pop" role="status">
            +{pointPop}
          </span>
        )}
        {onlineGroup && (
          <div className="play-place">
            <small>PLACE</small>
            <strong>
              #{(!upcoming && rank) || "–"} <span>of {standings.length || members.length}</span>
            </strong>
          </div>
        )}
        {onlineGroup && (
          <Button
            variant="ghost"
            className="play-breakdown"
            aria-expanded={breakdown}
            onClick={() => setBreakdown((v) => !v)}
          >
            See breakdown <ChevronDown className={breakdown ? "rotate-180" : ""} />
          </Button>
        )}
      </section>
      {breakdown && (
        <div className="play-breakdown-panel">
          {ledgerRows.length === 0 ? (
            <span>{t("standings.nothingYet")}</span>
          ) : (
            ledgerRows.map((r) => (
              <span key={r.source}>
                {r.label} <b>{r.points}</b>
              </span>
            ))
          )}
        </div>
      )}
      <PhaseRail trip={trip} current={active} upcoming={upcoming} onOpen={openPhase} />
      <div className="play-section-heading play-up-heading">
        <h2>Up now</h2>
        <span>
          {up.length} {up.length === 1 ? "thing" : "things"}
        </span>
      </div>
      <div className="play-face-stack">
        {up.slice(0, 2).map(({ key, action, ...item }) => (
          <FaceCard key={key} {...item} onClick={action} />
        ))}
        {up.length === 0 && (
          <div className="play-all-caught">
            <Check />
            <div>
              <strong>You’re all caught up</strong>
              <small>
                {upcoming
                  ? firstOpens
                  : active === "wrapped"
                    ? wrapup.open && locksWhen
                      ? t("postcard.locks", { when: locksWhen })
                      : "Your trip has wrapped"
                    : active === "takeoff"
                      ? "Next phase: after arrival"
                      : `Next phase: ${shortDate(active === "preflight" ? trip.start_date : trip.end_date)}`}
              </small>
            </div>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {passport && (
        <ProfileSheet userId={userId} tripId={trip.id} onClose={() => setPassport(false)} />
      )}
    </div>
  );
}

function PhasePage(
  props: Props & {
    phase: Phase;
    current: Phase | null;
    preview: boolean;
    preRows: Row[];
    tripRows: Row[];
    champions: Champion[];
    tripStarted: boolean;
    cultureKind: string | null;
    fullBoard: boolean;
    onFullBoard: () => void;
    onBack: () => void;
    onDetail: (d: Detail) => void;
  },
) {
  const {
    trip,
    members,
    cards,
    userId,
    phase,
    preview,
    preRows,
    tripRows,
    champions,
    tripStarted,
    onMember,
    onBack,
    onDetail,
    fullBoard,
    onFullBoard,
  } = props;
  const queryClient = useQueryClient();
  const t = useT();
  const meta = PHASES[indexOf(phase)] ?? PHASES[0]!;
  const p = phaseProgress(trip, phase);
  const local = trip.play_arrangement === "solo" || trip.play_arrangement === "offline";
  const culture = noFlight(trip) || roomOf(trip.room).atHome;
  const windowSeat = props.cultureKind === "inspire" || trip.room === "window_seat";
  const noCrown = local || trip.season_scoring === false || windowSeat;
  const groupRows = phase === "trip" || phase === "wrapped" ? tripRows : preRows;
  // Takeoff before landing: flight games and "We've arrived" until Trip Season starts (R-111).
  const inFlight = phase === "takeoff" && !culture && !tripStarted;
  const noPreflight = phase === "preflight" && !hasPreflight(trip);
  const bounds = phaseBoundaries(tripPhaseInput(trip));
  const titleLabel =
    phase === "preflight" && props.current === null
      ? t("phases.upcoming").toUpperCase()
      : phase === "takeoff"
        ? "TRAVEL DAY"
        : phase === "wrapped"
          ? shortDate(trip.end_date).toUpperCase()
          : `DAY ${p.day} OF ${p.total}`;
  return (
    <div className="play-phase-page">
      <Button variant="ghost" className="min-h-11 -ml-2" onClick={onBack}>
        <ArrowLeft /> Play
      </Button>
      {phase === props.current && <PhaseNotice trip={trip} viewOnly={props.viewOnly} />}
      {phase === props.current && (
        <>
          <CrewCheck trip={trip} members={members} viewOnly={props.viewOnly} />
          <SurpriseDrop trip={trip} userId={userId} viewOnly={props.viewOnly} />
          <JournalPrompt trip={trip} userId={userId} viewOnly={props.viewOnly} />
          <QuestProofs trip={trip} userId={userId} viewOnly={props.viewOnly} />
          {phase === "trip" && <PostcardPicks trip={trip} viewOnly={props.viewOnly} />}
          {phase === "wrapped" && <WrapupWeek trip={trip} viewOnly={props.viewOnly} />}
        </>
      )}
      <header className="play-phase-art">
        <img src={meta.art} width={1536} height={768} loading="lazy" alt="" />
        <div>
          <p>
            PHASE {indexOf(phase) + 1} · {titleLabel}
          </p>
          <h1>{meta.label}</h1>
          <span>
            {culture && phase === "takeoff"
              ? "The next part starts here. No flight needed."
              : meta.tagline}
          </span>
        </div>
      </header>
      {noPreflight ? (
        <p className="play-preview-banner">
          <LockKeyhole /> {t("phases.noPreflight")}
        </p>
      ) : (
        preview && (
          <p className="play-preview-banner">
            <LockKeyhole /> Preview · opens{" "}
            {phase === "preflight"
              ? instantDay(bounds.preflight[0], bounds.tz.preflight)
              : phase === "takeoff" || phase === "trip"
                ? shortDate(trip.start_date)
                : shortDate(trip.end_date)}
          </p>
        )
      )}
      {!noCrown && !noPreflight && (phase === "preflight" || phase === "trip") && (
        <CrownBoard
          rows={fullBoard ? groupRows : groupRows.slice(0, 4)}
          members={members}
          cards={cards}
          userId={userId}
          onMember={onMember}
          label={`${phase === "preflight" ? "Pre-Flight" : "Trip Season"} crown`}
          onFull={onFullBoard}
        />
      )}
      {trip.play_arrangement === "solo" && trip.solo_experience_id && (
        <FaceCard
          icon={<Ticket />}
          tone="gold"
          title="Your fare-class goal"
          line="Play against your available points, not a leaderboard"
          pill="Solo"
          onClick={() => onDetail("solo")}
        />
      )}
      {trip.play_arrangement === "offline" && (
        <FaceCard
          icon={<Users />}
          tone="gold"
          title="One-phone progress"
          line={`${readOfflineRoster(trip.id).length || "Add"} players · saved only on this phone`}
          pill="Local"
          onClick={() => onDetail("offline-night")}
        />
      )}
      {trip.play_arrangement === "solo" && !trip.solo_experience_id && (
        <FaceCard
          icon={<Ticket />}
          tone="gold"
          title="Your fare-class goal"
          line="Play against your available points, not a leaderboard"
          pill="Solo"
        />
      )}{" "}
      {isAtHome(trip) && (phase === "trip" || phase === "wrapped") && (
        <FaceCard
          icon={<CalendarClock />}
          tone="gold"
          title={phase === "wrapped" ? "Day plan · Land the trip" : "Your day plan"}
          line={
            trip.ended_at
              ? "Experience landed · plan stays viewable"
              : "Daily activities, boarding passes, call link and sing-off"
          }
          pill={
            trip.myRole === "captain" && !trip.ended_at && phase === "wrapped" ? "Captain" : "Open"
          }
          onClick={() => onDetail("home")}
        />
      )}{" "}
      {inFlight && (
        <div className="play-preview-banner">
          <Plane />
          <div>
            <strong>You’re in the air — Trip Season opens when you land</strong>
          </div>
        </div>
      )}
      <div className="play-section-heading">
        <h2>
          {phase === "trip"
            ? "Today"
            : phase === "takeoff"
              ? culture
                ? "This phase"
                : inFlight
                  ? "In flight"
                  : "Travel day"
              : phase === "wrapped"
                ? "Your trip"
                : "This phase"}
        </h2>
      </div>
      <div className="play-face-stack">
        {phase === "preflight" && (
          <>
            {!noPreflight && trip.play_mode === "crew" && roomOf(trip.room).maxCallNights > 0 && (
              <CallNightsCard trip={trip} />
            )}
            {windowSeat && (
              <FaceCard
                icon={<BookOpen />}
                tone="gold"
                title={t("guide.title")}
                line={t("guide.line")}
                pill={t("guide.open")}
                onClick={() => onDetail("guide")}
              />
            )}
            {!noPreflight && phase !== props.current && (
              <ComingCard
                icon={<Ticket />}
                tone="pink"
                title="Sealed Quests"
                line="One drops 3 days before each call night · 5–15 pts, +5 if opened within 3h"
              />
            )}
            {!local && phase === props.current && (
              <GameNightLive
                trip={trip}
                members={members}
                cards={cards}
                userId={userId}
                crowning={false}
                viewOnly={props.viewOnly}
              />
            )}
            {!noPreflight && phase !== props.current && (
              <ComingCard
                icon={<Trophy />}
                tone="orange"
                title="Showcase"
                line="One task each before takeoff · 20 pts"
              />
            )}
            {phase === props.current && <DailyCard trip={trip} viewOnly={props.viewOnly} />}
          </>
        )}
        {phase === "takeoff" && (
          <>
            {inFlight && (
              <FaceCard
                icon={<Gamepad2 />}
                tone="blue"
                title="Games on the Flight"
                line="Free · no points · works offline"
                onClick={() => onDetail("arcade")}
              />
            )}
            {phase !== props.current && (
              <ComingCard
                icon={<ScanLine />}
                tone="cyan"
                title={culture ? "Home Missions" : "Airport Missions"}
                line="3 sealed missions, opened one at a time · up to 12 pts toward Trip Season"
              />
            )}
            {!inFlight && (
              <FaceCard
                icon={<Gamepad2 />}
                tone="blue"
                title={culture ? "Games during the experience" : "Games on the Flight"}
                line="Free · no points · works offline"
                onClick={() => onDetail("arcade")}
              />
            )}{" "}
            {!tripStarted && (
              <FaceCard
                icon={<Plane />}
                tone="gold"
                title={culture ? "Start Trip Season" : "We’ve arrived"}
                line={
                  culture
                    ? "Trip Season also opens on its own"
                    : "Tap when you land, or Trip Season opens on its own."
                }
                pill={
                  trip.myRole === "captain"
                    ? "Captain"
                    : trip.myRole === "co_captain"
                      ? "Co-Captain"
                      : "Leader"
                }
                onClick={
                  (trip.myRole === "captain" || trip.myRole === "co_captain") &&
                  !trip.arrived_at &&
                  !preview &&
                  tripPhase(trip).phase === "takeoff"
                    ? async () => {
                        const r = await rpc("mark_arrived", { p_trip: trip.id });
                        if (!r.error) await queryClient.invalidateQueries({ queryKey: ["trips"] });
                      }
                    : undefined
                }
              />
            )}
          </>
        )}
        {phase === "trip" && (
          <>
            {roomOf(trip.room).pointsEnabled && <CrowningCard trip={trip} />}
            {(windowSeat || isShowcase(trip)) && (
              <FaceCard
                icon={<BookOpen />}
                tone="gold"
                title={isShowcase(trip) ? t("guide.showcaseTitle") : t("guide.title")}
                line={isShowcase(trip) ? t("guide.showcaseLine") : t("guide.line")}
                pill={t("guide.open")}
                onClick={() => onDetail("guide")}
              />
            )}{" "}
            <ComingCard
              icon={<Sparkles />}
              tone="gold"
              title="Surprise Drops"
              line="Bingo, Scavenger Hunt, Speed or Photo Challenge on random days"
            />
            {!local && phase === props.current && (
              <GameNightLive
                trip={trip}
                members={members}
                cards={cards}
                userId={userId}
                crowning
                viewOnly={props.viewOnly}
              />
            )}
          </>
        )}
        {phase === "wrapped" && (
          <WrappedSummary
            trip={trip}
            members={members}
            cards={cards}
            userId={userId}
            preRows={preRows}
            tripRows={tripRows}
            champions={champions}
            onMember={onMember}
          />
        )}
      </div>
      {phase === "takeoff" && !noCrown && (
        <CrownBoard
          rows={groupRows}
          members={members}
          cards={cards}
          userId={userId}
          onMember={onMember}
          label="Pre-Flight crown · Closes 11:59 PM the night before departure."
          onFull={onFullBoard}
        />
      )}
    </div>
  );
}

function WrappedSummary({
  trip,
  members,
  cards,
  userId,
  preRows,
  tripRows,
  champions,
  onMember,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  preRows: Row[];
  tripRows: Row[];
  champions: Champion[];
  onMember?: ((id: string) => void) | undefined;
}) {
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    const key = `tj-wrapped-crown-${trip.id}`;
    if (!champions.length || window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
    setCelebrate(true);
    const timer = window.setTimeout(() => setCelebrate(false), 1400);
    return () => window.clearTimeout(timer);
  }, [trip.id, champions.length]);
  const days = daysBetween(trip.start_date, trip.end_date) + 1;
  const sorted = tripRows.length ? tripRows : preRows;
  const me = sorted.findIndex((r) => r.user_id === userId) + 1;
  const champ = (season: string) => champions.find((c) => c.season === season);
  const name = (id: string | undefined) =>
    cards.find((c) => c.user_id === id)?.game_name ||
    members.find((m) => m.user_id === id)?.display_name ||
    "To be crowned";
  return (
    <>
      <div className={`play-wrapped-intro ${celebrate ? "is-celebrating" : ""}`}>
        <h2>You’ve arrived.</h2>
        <p>
          {days} days · {members.length} junkies · {champions.length} crowns
        </p>
      </div>
      <div className={`play-crown-pair ${celebrate ? "is-celebrating" : ""}`}>
        {[
          ["game", "Pre-Flight"],
          ["trip", "Trip Season"],
        ].map(([key, label]) => {
          const c = champ(key ?? "");
          return (
            <div key={key}>
              <Crown className="play-crown-drop" />
              <small>{label}</small>
              <AvatarButton
                userId={c?.user_id ?? ""}
                onOpen={c ? onMember : undefined}
                url={cards.find((x) => x.user_id === c?.user_id)?.avatarUrl}
                name={name(c?.user_id)}
                className="size-11"
              />
              <strong>{name(c?.user_id)}</strong>
            </div>
          );
        })}
      </div>
      <FaceCard
        icon={<Trophy />}
        tone="gold"
        title="Final standings"
        line={
          me > 0 ? `You finished #${me} of ${sorted.length}` : "Final places appear after crowning"
        }
        points={`${(preRows.find((r) => r.user_id === userId)?.total ?? 0) + (tripRows.find((r) => r.user_id === userId)?.total ?? 0)} pts`}
      />
      <div className="play-stamp-row">
        <span>TRIP</span>
        <span title={trip.destination}>{stampLabel(trip.destination)}</span>
        {champions.length > 0 && <span>CROWN</span>}
      </div>
      <p className="play-photo-expiry">Trip photos are removed 15 days after the trip.</p>
    </>
  );
}

function PlayDetail(
  props: Props & {
    detail: Detail;
    phase: Phase;
    tripStarted: boolean;
    onBack: () => void;
  },
) {
  const { detail, trip, members, cards, userId, viewOnly, onBack } = props;
  const livePhase = hubPhase(useTripPhase(trip));
  if (detail === "arcade")
    return (
      <div className="play-detail">
        <GameArcade trips={[trip]} practiceMode onBack={onBack} />
      </div>
    );
  if (detail === "offline-night")
    return (
      <div className="play-detail">
        <Button variant="ghost" className="min-h-11" onClick={onBack}>
          <ArrowLeft /> {PHASES[indexOf(props.phase)]?.label}
        </Button>
        <OnePhoneNight
          tripId={trip.id}
          destination={trip.destination}
          games={nightGames}
          onExit={onBack}
        />
      </div>
    );
  if (detail === "solo" && trip.solo_experience_id)
    return (
      <div className="play-detail">
        <Button variant="ghost" className="min-h-11" onClick={onBack}>
          <ArrowLeft /> {PHASES[indexOf(props.phase)]?.label}
        </Button>
        <SoloGuide
          exp={{
            id: trip.solo_experience_id,
            title: trip.name,
            country: trip.destination,
            region: null,
            city: null,
            start_date: trip.start_date,
            finished_at: trip.ended_at,
          }}
          userId={userId}
          place={trip.destination}
        />
      </div>
    );
  return (
    <div className="play-detail">
      <Button variant="ghost" className="min-h-11" onClick={onBack}>
        <ArrowLeft /> {PHASES[indexOf(props.phase)]?.label}
      </Button>
      {detail === "home" &&
        (trip.at_home_length?.startsWith("d") ? (
          <>
            <HomeDayFlow
              trip={trip}
              members={members}
              cards={cards}
              userId={userId}
              viewOnly={viewOnly || livePhase === "preflight"}
            />
            <LandTrip trip={trip} refresh={props.refresh} />
          </>
        ) : livePhase === "preflight" ? (
          <p className="av-glass-card mt-5 text-sm">
            Daily activities open on your experience dates.
          </p>
        ) : (
          <AtHomePlay
            trip={trip}
            cards={cards}
            userId={userId}
            viewOnly={viewOnly}
            refresh={props.refresh}
          />
        ))}{" "}
      {detail === "guide" && <TripGuide trip={trip} viewOnly={viewOnly} />}
    </div>
  );
}

function LandTrip({
  trip,
  refresh,
}: {
  trip: TripWithRole;
  refresh?: (() => unknown) | undefined;
}) {
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  if (trip.myRole !== "captain" || trip.ended_at || tripToday(tripTz(trip)) < trip.end_date)
    return null;
  return (
    <div className="mt-4">
      <Button
        variant="outline"
        className="w-full min-h-11"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await rpc("end_trip", { p_trip: trip.id });
          setBusy(false);
          if (r.error) setMsg(friendlyError(r.error));
          else {
            setMsg("");
            await refresh?.();
          }
        }}
      >
        Land the trip (everyone gets a postcard)
      </Button>
      {msg && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {msg}
        </p>
      )}
    </div>
  );
}
