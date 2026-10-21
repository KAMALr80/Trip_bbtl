import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, BookOpen, CalendarClock, Camera, Check, ChevronDown, ChevronRight, CircleGauge, Crown, Gamepad2, Image, LockKeyhole, Plane, ScanLine, Sparkles, Ticket, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarButton, PlayerCardView } from "@/components/PlayerCards";
import { SealedQuests } from "@/components/SealedQuests";
import { SeasonGames, seasonGamesApply, todaysSeasonGame } from "@/components/SeasonGames";
import { SecretMissions } from "@/components/SecretMissions";
import { TripDayGames, tripIsLive } from "@/components/TripDayGames";
import { PlayNights } from "@/components/GameNights";
import { GameNightCabin } from "@/components/GameNightCabin";
import { PhaseNotice } from "@/components/PhaseNotice";
import { PhaseCountdown } from "@/components/PhaseCountdown";
import { GameArcade } from "@/components/GameArcade";
import { gameSceneArt } from "@/components/GameScene";
import { OnePhoneNight } from "@/components/OnePhoneNight";
import { SoloGuide } from "@/components/SoloGuide";
import { CrewGuide } from "@/components/CrewGuide";
import { AtHomePlay, isAtHome } from "@/components/AtHome";
import { HomeDayFlow } from "@/components/HomeDayFlow";
import { LockedNote, isUnlocked } from "@/components/TripUnlock";
import { FeatureGate } from "@/lib/features";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { datePhase, noFlight, readOfflineRoster } from "@/lib/play-arrangement";
import { tripToday, tripTz } from "@/lib/itinerary";
import { friendlyRange } from "@/lib/trip-dates";
import { tripDisplayName } from "@/lib/trip-display-name";
import { fmtWhen } from "@/lib/viewer-time";
import { nextGameNight } from "@/lib/next-game-night";
import { hapticTap } from "@/lib/haptics";
import preflightArt from "@/assets/play-phase-preflight.jpg";
import takeoffArt from "@/assets/play-phase-takeoff.jpg";
import tripArt from "@/assets/play-phase-trip-season.jpg";
import wrappedArt from "@/assets/play-phase-wrapped.jpg";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Phase = "preflight" | "takeoff" | "trip" | "wrapped";
type Detail = "quests" | "missions" | "night" | "trip-day" | "arcade" | "offline-night" | "solo" | "home" | "guide" | "season" | null;
type Night = { week_number: number; starts_at: string; skipped: boolean; host_id: string | null; game_number?: number | null; game_revealed?: boolean | null; place?: string | null };
type Score = { user_id: string; games: number; quests: number; showcase: number; legacy: number; other: number; total: number };
type Quest = { id: string; kind: "sealed" | "showcase"; state: string; value: number; points: number; drop_no: number; open_by: string; destroy_at: string | null; opened_at: string | null; title: string | null };
type Mission = { id: string; status: string; points: number };
type MissionWindow = { opens_at: string; closes_at: string; proof_due_at: string | null };
type Champion = { season: string; user_id: string; score: number; stamps: number };
type TripSeasonScore = { user_id: string; stamps: number; today_stamps: number; max_stamps: number; score: number; carry_on: number };
type Props = { trip: TripWithRole; members: Member[]; cards: PlayerWithAvatar[]; userId: string; viewOnly: boolean; onManage?: (() => void) | undefined; onCalendar?: (() => void) | undefined; onWrapped?: (() => void) | undefined; onMember?: ((id: string) => void) | undefined; refresh: () => Promise<void> };
const rpc = supabase as unknown as { rpc: (name: string, args: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const PHASES: { id: Phase; label: string; art: string; tagline: string }[] = [
  { id: "preflight", label: "Pre-Flight", art: preflightArt, tagline: "Bond before you go. Crown #1 is on the line." },
  { id: "takeoff", label: "Takeoff", art: takeoffArt, tagline: "Departure-day missions count toward Trip Season." },
  { id: "trip", label: "Trip Season", art: tripArt, tagline: "Crown #2 is open. Play it while you're there." },
  { id: "wrapped", label: "Wrapped", art: wrappedArt, tagline: "The points, crowns and memories from your trip." },
];
const indexOf = (phase: Phase) => PHASES.findIndex(p => p.id === phase);
const addDays = (value: string, count: number) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000));
const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const tripLocalDate = (value: string, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  }
  catch { return new Date(value).toISOString().slice(0, 10); }
};
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

function currentPhase(trip: TripWithRole, tripSeasonStarted: boolean): Phase {
  const date = datePhase(trip, tripSeasonStarted);
  if (date === "preflight") return "preflight";
  if (date === "airport") return "takeoff";
  if (date === "trip") return tripToday(tripTz(trip)) > trip.end_date || !!trip.ended_at ? "wrapped" : "trip";
  const today = tripToday(tripTz(trip));
  if (trip.ended_at || today > trip.end_date) return "wrapped";
  if (today >= trip.start_date) return "trip";
  if (today >= addDays(trip.start_date, -1)) return "takeoff";
  return "preflight";
}

function phaseProgress(trip: TripWithRole, phase: Phase) {
  const today = tripToday(tripTz(trip));
  if (phase === "trip") { const total = daysBetween(trip.start_date, trip.end_date) + 1; const day = Math.min(total, Math.max(1, daysBetween(trip.start_date, today) + 1)); return { day, total }; }
  const start = (trip as TripWithRole & { game_start?: string | null }).game_start ?? addDays(trip.start_date, -7);
  const total = Math.max(1, daysBetween(start, addDays(trip.start_date, -1)) + 1);
  const day = Math.min(total, Math.max(1, daysBetween(start, today) + 1));
  return { day, total };
}

function FaceCard({ icon, tone, title, line, points, pill, live, onClick }: { icon: ReactNode; tone: string; title: string; line: ReactNode; points?: string | undefined; pill?: string | undefined; live?: boolean | undefined; onClick?: (() => void) | undefined }) {
  return <Button variant="ghost" className={`play-face-card ${live ? "play-face-live" : ""}`} onClick={onClick} disabled={!onClick}>
    <span className={`play-face-icon ${tone}`}>{icon}</span><span className="min-w-0 flex-1 text-left"><strong>{title}</strong><small>{line}</small></span><span className="play-face-meta">{pill && <em className={pill === "New" ? "play-new-pill" : ""}>{pill}</em>}{points && <b>{points}</b>}<ChevronRight size={17}/></span>
  </Button>;
}

function SquadAvatars({ members, cards, onMember }: { members: Member[]; cards: PlayerWithAvatar[]; onMember?: ((id: string) => void) | undefined }) {
  const shown = members.slice(0, 4);
  return <div className="play-squad-avatars" aria-label={`${members.length} in the squad`}>{shown.map(m => { const c = cards.find(x => x.user_id === m.user_id); return <AvatarButton key={m.user_id} userId={m.user_id} onOpen={onMember} url={c?.avatarUrl} name={c?.game_name || m.display_name || "Player"} className="size-8" wrapperClass="play-squad-avatar"/>; })}{members.length > 4 && <span>+{members.length - 4}</span>}</div>;
}

function CrownBoard({ rows, members, cards, userId, onMember, label, onFull }: { rows: { user_id: string; total: number }[]; members: Member[]; cards: PlayerWithAvatar[]; userId: string; onMember?: ((id: string) => void) | undefined; label: string; onFull: () => void }) {
  const sorted = [...rows].sort((a,b) => b.total - a.total);
  const top = sorted.slice(0, 3); const mine = sorted.find(r => r.user_id === userId); const list = mine && !top.some(r => r.user_id === userId) ? [...top, mine] : top;
  const max = Math.max(1, ...sorted.map(r => r.total));
  return <section className="play-crown-board"><div className="play-section-heading"><h2>{label}</h2><Button variant="ghost" className="min-h-11" onClick={onFull}>Full board <ChevronRight/></Button></div><ol>{list.map(row => { const rank = sorted.findIndex(x => x.user_id === row.user_id) + 1; const c = cards.find(x => x.user_id === row.user_id); const name = c?.game_name || members.find(m => m.user_id === row.user_id)?.display_name || "Player"; return <li key={row.user_id}><span>{rank}</span><AvatarButton userId={row.user_id} onOpen={onMember} url={c?.avatarUrl} name={name} className="size-9"/><span className="min-w-0 flex-1"><strong>{name}</strong><i><span style={{ width: `${Math.max(4, row.total / max * 100)}%` }}/></i></span><b>{row.total}</b></li>; })}</ol></section>;
}

function PhaseRail({ trip, current, onOpen }: { trip: TripWithRole; current: Phase; onOpen: (p: Phase) => void }) {
  const now = indexOf(current);
   return <div className="play-phase-ticket" role="navigation" aria-label="Trip phases">{PHASES.map((p, i) => { const done = i < now, active = i === now; const date = p.id === "takeoff" ? trip.start_date : p.id === "wrapped" ? trip.end_date : p.id === "preflight" ? (trip as TripWithRole & { game_start?: string | null }).game_start : null; const activeLine = p.id === "takeoff" ? "Until arrival" : p.id === "wrapped" ? "Crowning" : `${phaseProgress(trip, p.id).day} of ${phaseProgress(trip, p.id).total}`; return <Button key={p.id} variant="ghost" aria-current={active ? "step" : undefined} className={`play-phase-segment ${active ? "is-current" : done ? "is-done" : "is-locked"}`} onClick={() => onOpen(p.id)}><span className={done ? "play-phase-stamp" : ""}>{done ? <Check size={15}/> : active ? "NOW" : <LockKeyhole size={13}/>}</span><strong>{p.label}</strong><small>{active ? activeLine : p.id === "trip" && i > now ? "After arrival" : date ? shortDate(date) : i > now ? "Coming up" : "Done"}</small></Button>; })}</div>;
}

export function PlayHub(props: Props) {
  const { trip, members, cards, userId, viewOnly, onMember } = props;
  const [phase, setPhase] = useState<Phase | null>(null), [detail, setDetail] = useState<Detail>(null), [breakdown, setBreakdown] = useState(false), [fullBoard, setFullBoard] = useState(false), [cabin, setCabin] = useState(false), [passport, setPassport] = useState(false), [pointPop, setPointPop] = useState(0), [displayPoints, setDisplayPoints] = useState(0), [error, setError] = useState("");
  const [nights, setNights] = useState<Night[]>([]), [scores, setScores] = useState<Score[]>([]), [tripScores, setTripScores] = useState<TripSeasonScore[]>([]), [quests, setQuests] = useState<Quest[]>([]), [missions, setMissions] = useState<Mission[]>([]), [champions, setChampions] = useState<Champion[]>([]), [live, setLive] = useState(false), [tripStarted, setTripStarted] = useState(false), [missionWindow, setMissionWindow] = useState<MissionWindow | null>(null), [cultureKind, setCultureKind] = useState<string | null>(null), [now, setNow] = useState(Date.now());
  const scrolls = useRef<Record<string, number>>({});
  const previousPoints = useRef<number | null>(null);
  const active = currentPhase(trip, tripStarted), shownPhase = phase ?? active, preview = indexOf(shownPhase) > indexOf(active);
  const local = trip.play_arrangement === "solo" || trip.play_arrangement === "offline";
  const onlineGroup = !local;
  const load = useCallback(async () => {
    const season = active === "trip" || active === "wrapped" ? "trip" : trip.kind === "trip" ? "preflight" : "home";
    const [nightResult, scoreResult, tripResult, questResult, missionResult, championResult, liveResult, startedResult, windowResult, cultureResult] = await Promise.all([
      supabase.from("game_nights").select("week_number,starts_at,skipped,host_id,game_number,game_revealed,place").eq("trip_id", trip.id).order("starts_at"),
      local ? Promise.resolve({ data: [], error: null }) : rpc.rpc("season_points", { p_trip: trip.id, p_season: season }),
      local ? Promise.resolve({ data: [], error: null }) : supabase.rpc("trip_season_score", { p_trip: trip.id }),
      trip.play_arrangement === "offline" ? Promise.resolve({ data: [], error: null }) : rpc.rpc("sealed_quest_state", { p_trip: trip.id }),
      supabase.from("mission_claims").select("id,status,points").eq("trip_id", trip.id).eq("user_id", userId).eq("phase", "takeoff"),
      supabase.from("season_champions").select("season,user_id,score,stamps").eq("trip_id", trip.id).in("season", ["game", "trip"]),
      rpc.rpc("games_live", { p_trip: trip.id }),
      rpc.rpc("trip_season_started", { p_trip: trip.id }),
      rpc.rpc("mission_window", { p_trip: trip.id }),
      trip.a2e_room ? supabase.from("culture_experiences").select("a2e_kind").eq("trip_id", trip.id).not("a2e_kind", "is", null).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    const issue = [nightResult, scoreResult, tripResult, questResult, missionResult, championResult, liveResult, startedResult, windowResult, cultureResult].find(r => r.error)?.error;
    if (issue) setError(friendlyError(issue)); else setError("");
    setNights((nightResult.data as Night[]) ?? []); setScores((scoreResult.data as Score[]) ?? []); setTripScores((tripResult.data as TripSeasonScore[]) ?? []); setQuests((questResult.data as Quest[]) ?? []); setMissions((missionResult.data as Mission[]) ?? []); setChampions((championResult.data as Champion[]) ?? []); setLive(liveResult.data === true); setTripStarted(startedResult.data === true); setMissionWindow((Array.isArray(windowResult.data) ? windowResult.data[0] : windowResult.data) as MissionWindow | null); setCultureKind((cultureResult.data as { a2e_kind?: string } | null)?.a2e_kind ?? null); setNow(Date.now());
  }, [trip.id, trip.kind, trip.a2e_room, trip.play_arrangement, userId, local]);
  useEffect(() => { void load(); const visible = () => { if (!document.hidden) void load(); }; document.addEventListener("visibilitychange", visible); const timer = window.setInterval(visible, 20000); return () => { document.removeEventListener("visibilitychange", visible); window.clearInterval(timer); }; }, [load]);
  const next = nextGameNight(nights, now); const mine = scores.find(s => s.user_id === userId); const rank = [...scores].sort((a,b) => b.total-a.total).findIndex(s => s.user_id === userId) + 1; const me = cards.find(c => c.user_id === userId);
  useEffect(() => { const total = mine?.total; let timer: number | undefined; let frame: number | undefined; if (typeof total === "number") { const previous = previousPoints.current; if (previous !== null && total > previous) { setPointPop(total - previous); hapticTap(); const started = performance.now(); const animate = (time: number) => { const progress = Math.min(1, (time - started) / 650); setDisplayPoints(Math.round(previous + (total - previous) * progress)); if (progress < 1) frame = window.requestAnimationFrame(animate); }; frame = window.requestAnimationFrame(animate); timer = window.setTimeout(() => setPointPop(0), 1400); } else setDisplayPoints(total); previousPoints.current = total; } return () => { if (timer !== undefined) window.clearTimeout(timer); if (frame !== undefined) window.cancelAnimationFrame(frame); }; }, [mine?.total]);
  const openPhase = (nextPhase: Phase) => { scrolls.current[shownPhase] = window.scrollY; setDetail(null); setFullBoard(false); setPhase(nextPhase); window.scrollTo({ top: 0, behavior: "instant" }); };
  const backHub = () => { setDetail(null); setFullBoard(false); setPhase(null); window.scrollTo({ top: 0, behavior: "instant" }); };
  const openDetail = (nextDetail: Detail) => { scrolls.current[shownPhase] = window.scrollY; setDetail(nextDetail); window.scrollTo({ top: 0, behavior: "instant" }); };
  const closeDetail = () => { setDetail(null); window.setTimeout(() => window.scrollTo({ top: scrolls.current[shownPhase] ?? 0, behavior: "instant" }), 0); };
  if (detail) return <PlayDetail {...props} detail={detail} phase={shownPhase} live={live} tripStarted={tripStarted} onBack={closeDetail} onCabin={() => setCabin(true)}/>;
  if (phase) return <PhasePage {...props} phase={shownPhase} current={active} preview={preview} nights={nights} scores={scores} tripScores={tripScores} quests={quests} missions={missions} champions={champions} live={live} tripStarted={tripStarted} missionWindow={missionWindow} now={now} cultureKind={cultureKind} fullBoard={fullBoard} onFullBoard={() => setFullBoard(v => !v)} onBack={backHub} onDetail={openDetail} onCabin={() => setCabin(true)}/>;
  const currentQuest = quests.find(q => q.kind === "sealed" && ["sealed","open"].includes(q.state));
  const pending = quests.find(q => ["show_pending"].includes(q.state)) ?? (missions.some(m => m.status === "pending") ? { id: "mission", kind: "sealed", state: "pending", value: 0, points: 0, drop_no: 0, open_by: "", destroy_at: null, opened_at: null, title: "Proof waiting" } as Quest : undefined);
  const up: { key: string; icon: React.ReactNode; tone: string; title: string; line: string; points?: string; pill?: string; action: () => void }[] = [];
  if (currentQuest) up.push({ key: currentQuest.id, icon: <Ticket/>, tone: "pink", title: currentQuest.state === "sealed" ? "Sealed quest dropped" : currentQuest.title || "Sealed quest", line: currentQuest.state === "sealed" ? "Open within 3 days · +5 if finished in 3h" : "Quest open · finish before it closes", points: `${currentQuest.value} pts`, pill: currentQuest.state === "sealed" ? "New" : "Open", action: () => openDetail("quests") });
  if (up.length < 2 && active === "trip" && tripIsLive(trip) && onlineGroup) up.push({ key: "today", icon: <CircleGauge/>, tone: "blue", title: "Today’s games", line: "Open today’s released Trip Season activities", pill: "Today", action: () => openDetail("trip-day") });
  if (up.length < 2 && pending) up.push({ key: pending.id, icon: <Camera/>, tone: "orange", title: "Proof pending", line: "Your Captain or Co-Captain will review it", pill: "Pending", action: () => openDetail(pending.id === "mission" ? "missions" : "quests") });
  const progress = phaseProgress(trip, active);
  return <div className={`play-hub ${cultureKind === "inspire" ? "window-play-scene" : cultureKind ? "home-play-scene" : ""}`}>
    <header className="play-hub-heading"><div className="min-w-0"><h1>{tripDisplayName(trip.name)}</h1><p>{trip.destination} · {friendlyRange(trip.start_date, trip.end_date)}</p></div><SquadAvatars members={members} cards={cards} onMember={onMember}/></header>
    <section className="play-score-card" aria-label="Your score"><AvatarButton userId={userId} onOpen={() => setPassport(true)} url={me?.avatarUrl} name={me?.game_name || "Player"} className="size-14" wrapperClass="play-score-avatar"/><div className="min-w-0 flex-1"><strong>{local ? trip.play_arrangement === "solo" ? "Solo journey" : `${readOfflineRoster(trip.id).length || 1} playing` : `${displayPoints} pts`}</strong><small>{PHASES[indexOf(active)]?.label} · {active === "takeoff" ? "Travel day" : active === "wrapped" ? shortDate(trip.end_date) : `Day ${progress.day} of ${progress.total}`}</small><Button variant="ghost" className="play-score-link" onClick={() => setPassport(true)}>Tap your avatar → Passport</Button></div>{pointPop > 0 && <span className="play-points-pop" role="status">+{pointPop}</span>}{onlineGroup && <div className="play-place"><small>PLACE</small><strong>#{rank || "–"} <span>of {scores.length || members.length}</span></strong></div>}
      {onlineGroup && <Button variant="ghost" className="play-breakdown" aria-expanded={breakdown} onClick={() => setBreakdown(v => !v)}>See breakdown <ChevronDown className={breakdown ? "rotate-180" : ""}/></Button>}
    </section>
    {breakdown && mine && <div className="play-breakdown-panel"><span>Game nights <b>{mine.games}</b></span><span>Sealed quests <b>{mine.quests}</b></span><span>Showcase <b>{mine.showcase}</b></span><span>Earlier quests <b>{mine.legacy}</b></span><span>Phase points <b>{mine.other}</b></span></div>}
    <PhaseRail trip={trip} current={active} onOpen={openPhase}/>
    <div className="play-section-heading play-up-heading"><h2>Up now</h2><span>{up.length} {up.length === 1 ? "thing" : "things"}</span></div>
    <div className="play-face-stack">{up.slice(0,2).map(({ key, action, ...item }) => <FaceCard key={key} {...item} onClick={action}/>)}{up.length === 0 && <div className="play-all-caught"><Check/><div><strong>You’re all caught up</strong><small>{next ? `Next drop: ${fmtWhen(next.starts_at, trip.home_timezone)}` : active === "wrapped" ? "Your trip has wrapped" : active === "takeoff" ? "Next phase: after arrival" : `Next phase: ${shortDate(active === "preflight" ? trip.start_date : trip.end_date)}`}</small></div></div>}</div>
    {next && !local && <><div className="play-section-heading"><h2>Next up</h2></div><FaceCard icon={<CalendarClock/>} tone="cyan" title="Game Night" line={`${fmtWhen(next.starts_at, trip.home_timezone)} · ${live ? "Join now" : "opens when live"}`} points="up to 15" pill={live ? "Live" : undefined} live={live} onClick={() => live ? setCabin(true) : openPhase(tripLocalDate(next.starts_at, tripTz(trip)) < trip.start_date ? "preflight" : "trip")}/></>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {cabin && <GameNightCabin {...props} onClose={() => setCabin(false)}/>} 
    {passport && <PlayerCardView tripId={trip.id} userId={userId} fallback={me} initialPassport onClose={() => setPassport(false)}/>} 
  </div>;
}

function PhasePage(props: Props & { phase: Phase; current: Phase; preview: boolean; nights: Night[]; scores: Score[]; tripScores: TripSeasonScore[]; quests: Quest[]; missions: Mission[]; champions: Champion[]; live: boolean; tripStarted: boolean; missionWindow: MissionWindow | null; now: number; cultureKind: string | null; fullBoard: boolean; onFullBoard: () => void; onBack: () => void; onDetail: (d: Detail) => void; onCabin: () => void }) {
  const { trip, members, cards, userId, phase, current, preview, nights, scores, tripScores, quests, missions, champions, live, tripStarted, missionWindow, now, onMember, onBack, onDetail, onCabin, fullBoard, onFullBoard } = props;
  const meta = PHASES[indexOf(phase)] ?? PHASES[0]!; const p = phaseProgress(trip, phase); const local = trip.play_arrangement === "solo" || trip.play_arrangement === "offline"; const culture = noFlight(trip); const windowSeat = props.cultureKind === "inspire"; const noCrown = local || trip.season_scoring === false || windowSeat; const next = nextGameNight(nights, Date.now()); const groupRows = phase === "trip" || phase === "wrapped" ? tripScores.map(r => ({ user_id: r.user_id, total: r.score })) : scores.map(r => ({ user_id: r.user_id, total: r.total }));
  const sealed = quests.filter(q => q.kind === "sealed"), showcase = quests.find(q => q.kind === "showcase"); const waiting = sealed.filter(q => q.state === "sealed").length; const opened = sealed.filter(q => ["open","counted","show_pending"].includes(q.state)).length;
  const zone = tripTz(trip); const phaseNights = nights.filter(n => { const localDate = tripLocalDate(n.starts_at, zone); return !n.skipped && (phase === "preflight" ? localDate < trip.start_date : phase === "trip" ? localDate >= trip.start_date : false); }); const phaseNight = next && phaseNights.some(n => n.week_number === next.week_number) ? next : phaseNights.at(-1);
  const missionBefore = !!missionWindow && now < Date.parse(missionWindow.opens_at), missionAfter = !!missionWindow && now > Date.parse(missionWindow.closes_at), inFlight = phase === "takeoff" && !culture && missionAfter && !tripStarted;
  const missionLine = culture ? "A short start-day challenge set" : !missionWindow ? "Checking the departure-day window" : missionBefore ? `Missions open 12:00 AM on ${shortDate(trip.start_date)} — your home time.` : missionAfter ? missionWindow.proof_due_at ? "Reveal closed · upload your opened mission proof before its deadline" : missions.length ? "Reveal closed · completed missions stay on your record" : "Missed · 0 pts" : <PhaseCountdown target={missionWindow.closes_at} prefix="Open ·" connector=" " suffix=" left to reveal" expired="Reveal window closed" timeZone={trip.home_timezone}/>;
  const titleLabel = phase === "takeoff" ? "TRAVEL DAY" : phase === "wrapped" ? shortDate(trip.end_date).toUpperCase() : `DAY ${p.day} OF ${p.total}`;
  return <div className="play-phase-page"><Button variant="ghost" className="min-h-11 -ml-2" onClick={onBack}><ArrowLeft/> Play</Button><header className="play-phase-art"><img src={meta.art} width={1536} height={768} loading="lazy" alt=""/><div><p>PHASE {indexOf(phase)+1} · {titleLabel}</p><h1>{meta.label}</h1><span>{culture && phase === "takeoff" ? "The next part starts here. No flight needed." : meta.tagline}</span></div></header>{preview && <p className="play-preview-banner"><LockKeyhole/> Preview · opens {phase === "takeoff" || phase === "trip" ? shortDate(trip.start_date) : shortDate(trip.end_date)}</p>}
    {!noCrown && (phase === "preflight" || phase === "trip") && <CrownBoard rows={fullBoard ? groupRows : groupRows.slice(0,4)} members={members} cards={cards} userId={userId} onMember={onMember} label={`${phase === "preflight" ? "Pre-Flight" : "Trip Season"} crown`} onFull={onFullBoard}/>} 
    {trip.play_arrangement === "solo" && trip.solo_experience_id && <FaceCard icon={<Ticket/>} tone="gold" title="Your fare-class goal" line="Play against your available points, not a leaderboard" pill="Solo" onClick={() => onDetail("solo")}/>} 
    {trip.play_arrangement === "offline" && <FaceCard icon={<Users/>} tone="gold" title="One-phone progress" line={`${readOfflineRoster(trip.id).length || "Add"} players · saved only on this phone`} pill="Local" onClick={() => onDetail("offline-night")}/>} 
    {trip.play_arrangement === "solo" && !trip.solo_experience_id && <FaceCard icon={<Ticket/>} tone="gold" title="Your fare-class goal" line="Play against your available points, not a leaderboard" pill="Solo"/>} {isAtHome(trip) && (phase === "trip" || phase === "wrapped") && <FaceCard icon={<CalendarClock/>} tone="gold" title={phase === "wrapped" ? "Day plan · Land the trip" : "Your day plan"} line={trip.ended_at ? "Experience landed · plan stays viewable" : "Daily activities, boarding passes, call link and sing-off"} pill={trip.myRole === "captain" && !trip.ended_at && phase === "wrapped" ? "Captain" : "Open"} onClick={() => onDetail("home")}/>} {inFlight && <div className="play-preview-banner"><Plane/><div><strong>You’re in the air — Trip Season opens when you land</strong>{missionWindow?.proof_due_at && <span className="block text-xs mt-1">Still-revealed missions can upload proof below.</span>}</div></div>}<div className="play-section-heading"><h2>{phase === "trip" ? "Today" : phase === "takeoff" ? culture ? "This phase" : inFlight ? "In flight" : "Travel day" : phase === "wrapped" ? "Your trip" : "This phase"}</h2></div><div className="play-face-stack">
      {phase === "preflight" && <>{windowSeat && <FaceCard icon={<BookOpen/>} tone="gold" title="Shared guide" line="Propose, review and publish the squad’s travel guide" pill={trip.myRole === "captain" ? "Captain" : "Open"} onClick={() => onDetail("guide")}/>}<FaceCard icon={<Ticket/>} tone="pink" title="Sealed Quests" line={`${opened} of ${sealed.length} opened · ${waiting} waiting`} points={sealed.length ? `${sealed.reduce((n,q)=>n+q.value,0)} pts` : undefined} pill={waiting ? "New" : sealed.length ? "Done" : "Soon"} onClick={sealed.length ? () => onDetail("quests") : undefined}/>{!local && !windowSeat && <FaceCard icon={<CalendarClock/>} tone="cyan" title="Game Night" line={phaseNight ? `${fmtWhen(phaseNight.starts_at,trip.home_timezone)} · ${live ? "live now" : "opens when live"}` : "The next night is being planned"} points="up to 15" pill={live ? "Live" : undefined} live={live} onClick={phaseNight ? () => live ? onCabin() : onDetail("night") : undefined}/>}<FaceCard icon={<Trophy/>} tone="orange" title="Showcase" line={showcase?.title ? `${showcase.title} · due before takeoff` : "Your task appears before takeoff"} points={showcase ? `${showcase.value} pts` : "20 pts"} pill={showcase ? showcase.state === "approved" ? "Done" : "Set" : "Soon"} onClick={showcase ? () => onDetail("quests") : undefined}/>{!windowSeat && <FaceCard icon={<Sparkles/>} tone="blue" title="Mystery Game" line={phaseNight?.game_revealed ? "Tonight’s game has been revealed" : "Unlocks with your Game Night"} pill={phaseNight?.game_revealed ? "Open" : "Locked"} onClick={phaseNight ? () => onDetail("night") : undefined}/>}<FaceCard icon={<BookOpen/>} tone="gold" title="Daily Card" line="A quick daily challenge is queued for a later round" pill="Soon"/></>}
      {phase === "takeoff" && <>{inFlight && <FaceCard icon={<Gamepad2/>} tone="blue" title="Games on the Flight" line="Free · no points · works offline" onClick={() => onDetail("arcade")}/>}<FaceCard icon={<ScanLine/>} tone="cyan" title={culture ? "Start-day Missions" : "Airport Missions"} line={missionLine} points={missionAfter && !missions.length ? "0 pts" : "up to 12"} pill={missions.some(m=>m.status==="pending") ? "Pending" : missionBefore ? "Locked" : missionAfter && !missions.length ? "Missed" : missionAfter ? "Proof open" : "Open"} onClick={() => onDetail("missions")}/>{missionWindow?.proof_due_at && <FaceCard icon={<Camera/>} tone="orange" title="Mission proof" line={<PhaseCountdown target={missionWindow.proof_due_at} prefix="Proof due" expired="Proof deadline passed · mission locked" timeZone={trip.home_timezone}/>} pill="Open" onClick={() => onDetail("missions")}/>}<FaceCard icon={<Ticket/>} tone="pink" title="Travel-day quest" line={quests.some(q=>q.kind==="sealed") ? "Your sealed quest is ready when its drop opens" : "Queued for a later content round"} pill={quests.some(q=>q.kind==="sealed") ? "Sealed" : "Soon"} onClick={quests.some(q=>q.kind==="sealed") ? () => onDetail("quests") : undefined}/>{!inFlight && <FaceCard icon={<Gamepad2/>} tone="blue" title={culture ? "Games during the experience" : "Games on the Flight"} line="Free · no points · works offline" onClick={() => onDetail("arcade")}/>} {!tripStarted && <FaceCard icon={<Plane/>} tone="gold" title={culture ? "Start Trip Season" : "We’ve arrived"} line={culture ? "Trip Season also opens on its own" : "Tap when you land, or Trip Season opens on its own."} pill={trip.myRole === "captain" ? "Captain" : trip.myRole === "co_captain" ? "Co-Captain" : "Leader"} onClick={(trip.myRole === "captain" || trip.myRole === "co_captain") && !trip.departure_confirmed_at && !preview && trip.start_date <= tripToday(tripTz(trip)) ? async () => { const r = await supabase.rpc("confirm_departure" as never,{p_trip:trip.id} as never); if (!r.error) window.location.reload(); } : undefined}/>}</>}
      {phase === "trip" && <>{windowSeat && <FaceCard icon={<BookOpen/>} tone="gold" title="Shared guide" line="Approved stories, photos and tips for the crew" pill={trip.guide_published_at ? "Published" : trip.myRole === "captain" ? "Captain" : "Open"} onClick={() => onDetail("guide")}/>} {!windowSeat && <FaceCard icon={<CircleGauge/>} tone="blue" title="Today’s games" line={tripIsLive(trip) ? "Open today’s released Trip Season activities" : `Opens on ${shortDate(trip.start_date)}`} points="up to 10" pill={tripIsLive(trip) ? "Today" : "Locked"} onClick={tripIsLive(trip) && !local ? () => onDetail("trip-day") : undefined}/>} {!windowSeat && <FaceCard icon={<Image/>} tone="pink" title="Photo of the Day" line="One per person · the squad votes" points="up to 3" pill={tripIsLive(trip) ? "Open" : "Locked"} onClick={tripIsLive(trip) && !local ? () => onDetail("trip-day") : undefined}/>} {sealed.length > 0 && <FaceCard icon={<Ticket/>} tone="orange" title="Sealed quest" line={sealed.find(q=>q.state==="open") ? "Opened · add your proof before it closes" : "Your next quest stays sealed until its drop"} points="10 pts" pill={sealed.find(q=>q.state==="open") ? "Prove it" : "Sealed"} onClick={() => onDetail("quests")}/>} {!local && !windowSeat && phaseNight && <FaceCard icon={<CalendarClock/>} tone="cyan" title="Game Night" line={`${fmtWhen(phaseNight.starts_at,trip.home_timezone)} · ${live ? "live now" : "opens when live"}`} points="up to 15" pill={live ? "Live" : undefined} live={live} onClick={() => live ? onCabin() : onDetail("night")}/>} {seasonGamesApply(trip, windowSeat) && (() => { const g = todaysSeasonGame(trip); return <FaceCard icon={<Sparkles/>} tone="gold" title="Bingo · Scavenger · Speed" line={g ? `Today: ${g === "bingo" ? "Bingo" : g === "scavenger" ? "Scavenger Hunt" : "Speed Challenge"}` : `Opens on ${shortDate(trip.start_date)}`} points={g === "bingo" ? "up to 33" : g === "scavenger" ? "up to 25" : g ? "up to 15" : undefined} pill={g ? "Today" : "Locked"} onClick={g ? () => onDetail("season") : undefined}/>; })()}</>}
      {phase === "wrapped" && <WrappedSummary trip={trip} members={members} cards={cards} userId={userId} scores={scores} tripScores={tripScores} champions={champions} onMember={onMember} onWrapped={props.onWrapped}/>} 
    </div>
    {phase === "takeoff" && <PhaseNotice trip={trip} viewOnly={props.viewOnly} started={tripStarted}/>} 
    {phase === "takeoff" && !noCrown && <CrownBoard rows={groupRows} members={members} cards={cards} userId={userId} onMember={onMember} label="Pre-Flight crown · Closes 11:59 PM the night before departure." onFull={onFullBoard}/>} 
  </div>;
}

function WrappedSummary({ trip, members, cards, userId, scores, tripScores, champions, onMember, onWrapped }: { trip: TripWithRole; members: Member[]; cards: PlayerWithAvatar[]; userId: string; scores: Score[]; tripScores: TripSeasonScore[]; champions: Champion[]; onMember?: ((id:string)=>void)|undefined; onWrapped?: (()=>void)|undefined }) {
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => { const key = `tj-wrapped-crown-${trip.id}`; if (!champions.length || window.sessionStorage.getItem(key)) return; window.sessionStorage.setItem(key, "1"); setCelebrate(true); const timer = window.setTimeout(() => setCelebrate(false), 1400); return () => window.clearTimeout(timer); }, [trip.id, champions.length]);
  const days = daysBetween(trip.start_date,trip.end_date)+1; const sorted = [...scores].sort((a,b)=>b.total-a.total); const me = sorted.findIndex(r=>r.user_id === userId)+1;
  const champ = (season:string) => champions.find(c=>c.season===season); const name=(id:string|undefined)=>cards.find(c=>c.user_id===id)?.game_name||members.find(m=>m.user_id===id)?.display_name||"To be crowned";
  return <><div className={`play-wrapped-intro ${celebrate ? "is-celebrating" : ""}`}><h2>You’ve arrived.</h2><p>{days} days · {members.length} junkies · {champions.length} crowns</p></div><div className={`play-crown-pair ${celebrate ? "is-celebrating" : ""}`}>{[["game","Pre-Flight"],["trip","Trip Season"]].map(([key,label])=>{const c=champ(key ?? "");return <div key={key}><Crown className="play-crown-drop"/><small>{label}</small><AvatarButton userId={c?.user_id ?? ""} onOpen={c ? onMember : undefined} url={cards.find(x=>x.user_id===c?.user_id)?.avatarUrl} name={name(c?.user_id)} className="size-11"/><strong>{name(c?.user_id)}</strong></div>;})}</div><FaceCard icon={<Trophy/>} tone="gold" title="Final standings" line={me>0?`You finished #${me} of ${sorted.length}`:"Final places appear after crowning"} points={`${(sorted.find(r=>r.user_id===userId)?.total??0)+(tripScores.find(r=>r.user_id===userId)?.score??0)} pts`} onClick={onWrapped}/><FaceCard icon={<Image/>} tone="pink" title="Trip Postcard" line="Captain collage and sharing are queued separately" pill="Soon"/><div className="play-stamp-row"><span>TRIP</span><span title={trip.destination}>{stampLabel(trip.destination)}</span>{champions.length>0&&<span>CROWN</span>}</div><p className="play-photo-expiry">Trip photos are removed 15 days after the trip.</p></>;
}

function PlayDetail(props: Props & { detail: Detail; phase: Phase; live: boolean; tripStarted: boolean; onBack: () => void; onCabin: () => void }) {
  const { detail, trip, members, cards, userId, viewOnly, onBack } = props;
  if (detail === "arcade") return <div className="play-detail"><GameArcade trips={[trip]} practiceMode onBack={onBack}/></div>;
  if (detail === "offline-night") return <div className="play-detail"><Button variant="ghost" className="min-h-11" onClick={onBack}><ArrowLeft/> {PHASES[indexOf(props.phase)]?.label}</Button><OnePhoneNight tripId={trip.id} destination={trip.destination} games={["Card flip", "Spin the wheel", "30-sec Draw", "Guess the song", "Vote showdown", "Two truths & lie"].map((title,index)=>({index:[0,1,2,3,5,6][index] ?? index,title,art:gameSceneArt(title),icon:""}))} onExit={onBack}/></div>;
  if (detail === "solo" && trip.solo_experience_id) return <div className="play-detail"><Button variant="ghost" className="min-h-11" onClick={onBack}><ArrowLeft/> {PHASES[indexOf(props.phase)]?.label}</Button><SoloGuide exp={{id:trip.solo_experience_id,title:trip.name,country:trip.destination,region:null,city:null,start_date:trip.start_date,finished_at:trip.ended_at}} userId={userId} place={trip.destination}/></div>;
  return <div className="play-detail"><Button variant="ghost" className="min-h-11" onClick={onBack}><ArrowLeft/> {PHASES[indexOf(props.phase)]?.label}</Button>{detail === "season" && <SeasonGames trip={trip} userId={userId} viewOnly={viewOnly}/>} {detail === "quests" && <SealedQuests trip={trip} members={members} cards={cards} userId={userId} viewOnly={viewOnly}/>} {detail === "missions" && <SecretMissions trip={trip} userId={userId} viewOnly={viewOnly} canPlay={datePhase(trip, props.tripStarted)==="airport"}/>} {detail === "night" && <PlayNights trip={trip} members={members} userId={userId} players={cards} viewOnly={viewOnly} onManage={props.onManage} onCalendar={props.onCalendar} onWrapped={props.onWrapped} onMember={props.onMember}/>} {detail === "trip-day" && (isUnlocked(trip) ? <FeatureGate tripId={trip.id} feature="challenges"><TripDayGames trip={trip} members={members} cards={cards} userId={userId} viewOnly={viewOnly}/></FeatureGate> : <LockedNote trip={trip} what="trip-day games"/>)} {detail === "home" && (trip.at_home_length?.startsWith("d") ? <><HomeDayFlow trip={trip} members={members} cards={cards} userId={userId} viewOnly={viewOnly || currentPhase(trip, props.tripStarted) === "preflight"}/><LandTrip trip={trip} refresh={props.refresh}/></> : currentPhase(trip, props.tripStarted) === "preflight" ? <p className="av-glass-card mt-5 text-sm">Daily activities open on your experience dates.</p> : <AtHomePlay trip={trip} cards={cards} userId={userId} viewOnly={viewOnly} refresh={props.refresh}/>)} {detail === "guide" && <CrewGuide tripId={trip.id} tripName={trip.name} userId={userId} isCaptain={trip.myRole==="captain"} publishedAt={trip.guide_published_at}/>}</div>;
}

function LandTrip({ trip, refresh }: { trip: TripWithRole; refresh?: (() => unknown) | undefined }) {
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  if (trip.myRole !== "captain" || trip.ended_at || tripToday(tripTz(trip)) < trip.end_date) return null;
  return <div className="mt-4"><Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={async () => { setBusy(true); const r = await rpc.rpc("end_trip", { p_trip: trip.id }); setBusy(false); if (r.error) setMsg(friendlyError(r.error)); else { setMsg(""); await refresh?.(); } }}>Land the trip (everyone gets a postcard)</Button>{msg && <p role="alert" className="text-sm text-destructive mt-2">{msg}</p>}</div>;
}
