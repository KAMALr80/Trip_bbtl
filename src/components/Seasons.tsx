import { tripDisplayName } from "@/lib/trip-display-name";
import { PreviewShareToggle } from "./ExperiencePreviews";
import { confirmInApp } from "@/lib/confirm";
import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { fmtWhen } from "@/lib/viewer-time";
import { useLook } from "@/lib/look";
import { groupTier } from "@/lib/season-plan";
import { TieWheel, useWeeklyQuestions } from "@/components/WeeklyQuestion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Crown,
  Download,
  Flag,
  Shuffle,
  Trash2,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  Plane,
  Palmtree,
  BriefcaseBusiness,
  MapPin,
} from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarButton } from "@/components/PlayerCards";
import { Confetti, Leaderboard, scoringOn, standings, useSeason } from "@/components/Season";
import { TripSeasonBoard, tripHasStarted } from "@/components/TripDayGames";
import { tripToday, tripTz, loadItinerary, type ItineraryDay } from "@/lib/itinerary";
import { friendlyDate, friendlyRange } from "@/lib/trip-dates";
import type { Member, TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

export type SeasonKey = "game" | "trip";
type Info = {
  season: string;
  winners: number;
  prize: string | null;
  crowning_at: string | null;
  crowning_label: string;
  revealed: boolean;
  crowning_mode?: string;
  prize_note?: string | null;
  takeoff_week?: number | null;
};
type Champ = {
  season: string;
  user_id: string;
  score: number;
  stamps: number;
  tie_ids?: string[] | null;
  created_at?: string;
};
type SeasonRow = {
  user_id: string;
  stamps: number;
  today_stamps: number;
  max_stamps: number;
  score: number;
  carry_on: number;
};
type Team = {
  id: string;
  name: string;
  color: string;
  call_link?: string | null;
  host_id?: string | null;
};
type TeamMember = { user_id: string; team_id: string };
type Photo = {
  photo_path: string;
  user_id: string;
  source: string;
  day_date: string;
  created_at: string;
};
type Reaction = { photo_path: string; user_id: string; emoji: string };
type Base = { trip: TripWithRole; members: Member[]; cards: PlayerWithAvatar[]; userId: string };

const field =
  "text-base w-full mt-2 h-12 rounded-2xl border-2 border-border bg-card px-4 outline-none focus:border-primary";
const seasonName: Record<SeasonKey, string> = { game: "Pre-Flight", trip: "Trip Season" };
const seasonEmoji: Record<SeasonKey, string> = { game: "🏆", trip: "🧳" };
export const teamColors = {
  orange: "bg-primary",
  blue: "bg-blue",
  green: "bg-green",
  yellow: "bg-gold",
} as const;
const teamSoft = {
  orange: "bg-orange-soft",
  blue: "bg-blue-soft",
  green: "bg-green-soft",
  yellow: "bg-orange-soft",
} as const;
const EMOJIS = ["❤️", "😂", "🔥", "😍", "👏"] as const;
const isLeader = (t: TripWithRole) => t.myRole === "captain" || t.myRole === "co_captain";
const nameOf = (cards: PlayerWithAvatar[], members: Member[], id: string) =>
  cards.find((c) => c.user_id === id)?.game_name ||
  members.find((m) => m.user_id === id)?.display_name ||
  "Player";
export const tripHasEnded = (t: TripWithRole) => tripToday(tripTz(t)) > t.end_date;
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const tripClosed = (t: TripWithRole) =>
  !!t.ended_at || tripToday(tripTz(t)) > addDays(t.end_date, 2);
export function ReadOnlyBanner({ trip }: { trip: TripWithRole }) {
  if (!tripClosed(trip)) return null;
  return (
    <div className="mb-5 rounded-2xl bg-blue-soft p-4 flex items-center gap-3">
      <span className="text-3xl">🔒</span>
      <div>
        <p className="font-display font-extrabold">This trip has wrapped</p>
        <p className="text-xs text-ink-soft">
          It's read-only now — leaderboards, winners, photos and Trip Wrapped stay here forever.
        </p>
      </div>
    </div>
  );
}
export function useSkipCounts(tripId: string) {
  const [rows, setRows] = useState<{ user_id: string; season: string }[]>([]);
  useEffect(() => {
    void db
      .from("skip_passes")
      .select("user_id,season")
      .eq("trip_id", tripId)
      .then(({ data }: { data: { user_id: string; season: string }[] | null }) =>
        setRows(data ?? []),
      );
  }, [tripId]);
  const [gameLimit, setGameLimit] = useState(3);
  useEffect(() => {
    void db.rpc("skip_limit", { p_trip: tripId }).then(({ data }: { data: number | null }) => {
      if (typeof data === "number") setGameLimit(data);
    });
  }, [tripId]);
  const limit = (season: SeasonKey) => (season === "game" ? gameLimit : 3);
  return Object.assign(
    (userId: string, season: SeasonKey) =>
      Math.max(
        0,
        limit(season) - rows.filter((r) => r.user_id === userId && r.season === season).length,
      ),
    { limit },
  );
}
export function SkipTickets({
  left,
  label,
  total = 3,
}: {
  left: number;
  label: string;
  total?: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-extrabold text-ink-soft"
      aria-label={`${left} of ${total} ${label} skip passes left`}
      title={`${label} skip passes`}
    >
      {Array.from({ length: total }, (_, i) => i).map((i) => (
        <span key={i} className={i < left ? "" : "opacity-25 grayscale"}>
          🎟️
        </span>
      ))}
    </span>
  );
}
export function EndTripTool({
  trip,
  onEnded,
}: {
  trip: TripWithRole;
  onEnded: () => Promise<void>;
}) {
  const today = tripToday(trip.home_timezone);
  const [err, setErr] = useState("");
  if (trip.myRole !== "captain") return null;
  const ended = tripClosed(trip);
  const can = !ended && today >= trip.end_date && today <= addDays(trip.end_date, 1);
  return (
    <>
      <h2 className="font-display font-extrabold text-xl mt-9">End the trip 🏁</h2>
      {ended ? (
        <p className="text-sm text-ink-soft mt-1">
          This trip is wrapped and read-only. Everything stays saved.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-soft mt-1">
            {can
              ? "Ending makes the trip read-only — no new games, votes or posts. Everything stays viewable forever."
              : `You can end it from ${friendlyDate(trip.end_date)} until a day after. If nobody does, it closes on its own 48 hours after the end date.`}
          </p>
          <Button
            variant="outline"
            className="w-full mt-3 bg-card text-destructive"
            disabled={!can}
            onClick={async () => {
              if (!(await confirmInApp("End the trip? This can't be undone."))) return;
              const { error } = await db.rpc("end_trip", { p_trip: trip.id });
              if (error) setErr(friendlyError(error));
              else await onEnded();
            }}
          >
            🏁 End trip
          </Button>
          {err && (
            <p role="alert" className="text-sm text-destructive mt-2">
              {err}
            </p>
          )}
        </>
      )}
    </>
  );
}
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (f: string, a: Record<string, unknown>) => any;
};

/* ---------- shared data ---------- */
export function useSeasonsData(tripId: string) {
  const [info, setInfo] = useState<Info[]>([]),
    [champs, setChamps] = useState<Champ[]>([]),
    [tripRows, setTripRows] = useState<SeasonRow[]>([]),
    [teams, setTeams] = useState<Team[]>([]),
    [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const refresh = async () => {
    const [i, c, t, tm, ts] = await Promise.all([
      db.rpc("season_info", { p_trip: tripId }),
      db
        .from("season_champions")
        .select("season,user_id,score,stamps,tie_ids,created_at")
        .eq("trip_id", tripId)
        .in("season", ["game", "trip"]),
      db
        .from("trip_teams")
        .select("id,name,color,call_link,host_id")
        .eq("trip_id", tripId)
        .order("created_at"),
      db.from("trip_team_members").select("user_id,team_id").eq("trip_id", tripId),
      supabase.rpc("trip_season_score", { p_trip: tripId }),
    ]);
    setInfo(i.data ?? []);
    setChamps(c.data ?? []);
    setTeams(t.data ?? []);
    setTeamMembers(tm.data ?? []);
    setTripRows(ts.data ?? []);
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(timer);
  }, [tripId]);
  return { info, champs, tripRows, teams, teamMembers, refresh };
}
export type SeasonsData = ReturnType<typeof useSeasonsData>;

/* ---------- badges ---------- */
export function useBadges(trip: TripWithRole, members: Member[]) {
  const data = useSeasonsData(trip.id);
  const season = useSeason(trip.id);
  const game = standings(members, season.nights, season.scores, season.settings, season.qotw);
  const totals = members
    .map((m) => ({
      id: m.user_id,
      total:
        (game.find((g) => g.user_id === m.user_id)?.stamps ?? 0) +
        (data.tripRows.find((r) => r.user_id === m.user_id)?.stamps ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
  const junkie =
    totals[0] && totals[0].total > 0 && totals[0].total !== totals[1]?.total ? totals[0].id : null;
  return { champs: data.champs, junkie, data, season };
}
export function ChampionBadge({ season }: { season: string }) {
  return (
    <span className="passport-stamp inline-flex items-center gap-1 border-orange text-orange px-2 py-0.5 text-[10px] font-extrabold uppercase">
      <Crown size={11} className="fill-orange" />
      {season === "game" ? "Pre-Flight" : "Trip Season"} Champion
    </span>
  );
}

/* ---------- countdown ---------- */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
const DAY = 86_400_000;
/** A crowning months away doesn't need a ticking clock — seconds only start moving
 *  inside the last day, where they actually mean something. */
function parts(diff: number) {
  const s = Math.max(0, Math.floor(diff / 1000));
  if (diff >= DAY) {
    const d = Math.floor(s / 86400),
      h = Math.floor((s % 86400) / 3600);
    return [
      [d, d === 1 ? "day" : "days"],
      [h, h === 1 ? "hour" : "hours"],
    ] as const;
  }
  return [
    [Math.floor(s / 3600), "h"],
    [Math.floor((s % 3600) / 60), "m"],
    [s % 60, "s"],
  ] as const;
}

/* ---------- Home: mystery prizes + reveal ---------- */
export function MysteryPrizes({
  trip,
  members,
  cards,
  data,
  onMember,
}: Base & { data: SeasonsData; onMember?: ((id: string) => void) | undefined }) {
  // Tick every second only inside the final day; otherwise a quiet minute refresh.
  const soon = data.info.some((i) => {
    const t = i.crowning_at ? new Date(i.crowning_at).getTime() - Date.now() : Infinity;
    return t > 0 && t < DAY;
  });
  const now = useNow(soon ? 1000 : 60_000);
  const cinematic = useLook("home-top") === "cinematic";
  const [finalNight, setFinalNight] = useState<string | null>(null);
  useEffect(() => {
    if (!cinematic) return;
    let live = true;
    void supabase
      .from("game_nights")
      .select("starts_at,skipped")
      .eq("trip_id", trip.id)
      .order("starts_at", { ascending: false })
      .then(({ data }) => {
        if (live) setFinalNight(data?.find((n) => !n.skipped)?.starts_at ?? null);
      });
    return () => {
      live = false;
    };
  }, [cinematic, trip.id]);
  const [reveal, setReveal] = useState<SeasonKey | null>(null);
  const finalized = useRef<Record<string, boolean>>({});
  useEffect(() => {
    for (const s of data.info) {
      if (!s.crowning_at || new Date(s.crowning_at).getTime() > now) continue;
      const key = `tj-crowned-${trip.id}-${s.season}`;
      if (finalized.current[s.season]) continue;
      finalized.current[s.season] = true;
      void db.rpc("finalize_season", { p_trip: trip.id, p_season: s.season }).then(async () => {
        await data.refresh();
        if (!localStorage.getItem(key)) {
          safeSetItem(key, "1");
          setReveal(s.season as SeasonKey);
        }
      });
    }
  }, [now, data.info, trip.id]);
  const list = (["game", "trip"] as SeasonKey[])
    .map((k) => data.info.find((i) => i.season === k))
    .filter((x): x is Info => !!x && !!x.crowning_at);
  if (!list.length) return null;
  return (
    <section className="mt-6 space-y-3">
      {list.map((s) => {
        const k = s.season as SeasonKey;
        const diff = new Date(s.crowning_at as string).getTime() - now;
        const done = diff <= 0;
        const winners = data.champs.filter((c) => c.season === k);
        return (
          <div key={k} className="app-card relative overflow-hidden cinematic-mystery-prize">
            <div className="flex items-center gap-3">
              <div
                className={`grid place-items-center h-11 w-11 shrink-0 rounded-[14px] border-[1.5px] border-green bg-green-soft text-2xl ${done ? "" : "mystery-q"}`}
              >
                {done ? "🎉" : "🎁"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="eyebrow">MYSTERY PRIZE · {seasonName[k].toUpperCase()}</p>
                <p className="font-display font-extrabold leading-tight mt-1">
                  {done ? (
                    s.prize
                  ) : isLeader(trip) && s.prize ? (
                    <span>{s.prize}</span>
                  ) : (
                    "Top secret 🤫"
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  👑 {s.winners} winner{s.winners > 1 ? "s" : ""}
                  {trip.season_rule === "a2c" && k === "game"
                    ? " · Night before departure"
                    : s.crowning_mode === "takeoff"
                      ? " · Final Call Night 🛫"
                      : s.crowning_mode === "departure"
                        ? " · Departure morning ☀️"
                        : s.crowning_label
                          ? ` · ${s.crowning_label}`
                          : ""}
                  {!done && s.crowning_at
                    ? ` · ${fmtWhen(trip.season_rule !== "a2c" && cinematic && s.crowning_mode === "takeoff" && finalNight ? finalNight : s.crowning_at, trip.home_timezone)}`
                    : ""}
                </p>
                {done && s.prize_note && (
                  <p className="text-xs text-ink-soft mt-1">🎀 {s.prize_note}</p>
                )}
              </div>
            </div>
            {done ? (
              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex min-w-0 -space-x-2">
                  {winners.map((w) => {
                    const c = cards.find((x) => x.user_id === w.user_id);
                    return (
                      <AvatarButton
                        key={w.user_id}
                        userId={w.user_id}
                        onOpen={onMember}
                        url={c?.avatarUrl}
                        name={c?.game_name || "Champ"}
                        className="h-10 w-10 ring-2 ring-card"
                      />
                    );
                  })}
                  <span className="pl-4 self-center min-w-0 truncate font-bold text-base">
                    {winners.length
                      ? winners.map((w) => nameOf(cards, members, w.user_id)).join(" & ")
                      : "No champion yet"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="playful"
                  onClick={() => {
                    import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
                    setReveal(k);
                  }}
                >
                  Replay
                </Button>
              </div>
            ) : (
              <>
                <div
                  className={`mt-4 grid gap-2 ${parts(diff).length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
                >
                  {parts(diff).map(([n, l]) => (
                    <div key={l} className="bg-card rounded-2xl py-2 text-center">
                      <p className="font-display text-2xl font-extrabold tabular-nums">{n}</p>
                      <p className="text-[11px] font-extrabold text-muted-foreground">{l}</p>
                    </div>
                  ))}
                </div>
                {/* The last day is the one worth flagging — people miss a crowning by not knowing it's tomorrow. */}
                {diff < DAY && (
                  <p role="status" className="mt-2 text-sm font-bold text-primary">
                    ⏳ {seasonName[k]} ends within 24 hours.
                  </p>
                )}
              </>
            )}
          </div>
        );
      })}
      {reveal && (
        <CrowningReveal
          season={reveal}
          info={data.info.find((i) => i.season === reveal)}
          champs={data.champs.filter((c) => c.season === reveal)}
          cards={cards}
          members={members}
          onMember={onMember}
          onClose={() => setReveal(null)}
        />
      )}
    </section>
  );
}

function CrowningReveal({
  season,
  info,
  champs,
  cards,
  members,
  onMember,
  onClose,
}: {
  season: SeasonKey;
  info: Info | undefined;
  champs: Champ[];
  cards: PlayerWithAvatar[];
  members: Member[];
  onMember?: ((id: string) => void) | undefined;
  onClose: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), reduced ? 0 : 1100),
      b = window.setTimeout(() => setStage(2), reduced ? 0 : 1900);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${seasonName[season]} crowning`}
      className="fixed inset-0 z-[60] grid place-items-center bg-foreground/90 px-6 text-center text-background"
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] text-background"
        aria-label="Close"
        onClick={onClose}
      >
        <X />
      </Button>
      {stage >= 1 && <Confetti burst={stage} />}
      <div className="max-w-sm w-full">
        <p className="text-xs font-extrabold tracking-widest opacity-80">
          THE CROWNING · {seasonName[season].toUpperCase()}
        </p>
        {stage === 0 ? (
          <>
            <p className="text-8xl mt-10 crown-anticipation">🥁</p>
            <p className="font-display text-3xl font-extrabold mt-6">Drumroll please…</p>
          </>
        ) : (
          <>
            {champs
              .filter((c) => (c.tie_ids?.length ?? 0) > 1)
              .map((c) => (
                <div key={`tie-${c.user_id}`} className="mt-6">
                  <p className="text-sm font-bold opacity-80">
                    Tied on score and nights — the wheel decides 🎡
                  </p>
                  <TieWheel
                    ids={c.tie_ids!}
                    winner={c.user_id}
                    spinAt={c.created_at ?? null}
                    nameOf={(id) => nameOf(cards, members, id)}
                  />
                </div>
              ))}
            <div className="mt-8 flex justify-center gap-6">
              {champs.length ? (
                champs.map((c) => {
                  const card = cards.find((x) => x.user_id === c.user_id);
                  return (
                    <div key={c.user_id} className="crown-spotlight min-w-0 max-w-full">
                      <div className="relative mx-auto w-fit">
                        <Crown
                          size={40}
                          className="crown-drop absolute -top-8 left-1/2 -translate-x-1/2 text-gold fill-gold"
                        />
                        <AvatarButton
                          userId={c.user_id}
                          onOpen={onMember}
                          url={card?.avatarUrl}
                          name={card?.game_name || "Champ"}
                          className="h-28 w-28 ring-4 ring-gold"
                        />
                      </div>
                      <p
                        className="font-display text-[clamp(1rem,5vw,1.5rem)] font-extrabold mt-3 min-w-0 max-w-full truncate"
                        title={nameOf(cards, members, c.user_id)}
                      >
                        {nameOf(cards, members, c.user_id)}
                      </p>
                      <p className="text-sm font-bold opacity-80">
                        {c.score}/100 · 🛂 {c.stamps}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="font-display text-2xl font-extrabold">
                  No stamps yet — no champion this time!
                </p>
              )}
            </div>
            <div
              className={`mt-10 rounded-3xl bg-card text-foreground p-5 transition-all duration-500 ${stage >= 2 ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
            >
              <p className="text-xs font-extrabold text-muted-foreground">🎁 THE PRIZE</p>
              <p className="font-display text-2xl font-extrabold mt-1">
                {info?.prize || "Bragging rights forever"}
              </p>
              {info?.prize_note && (
                <p className="text-sm text-muted-foreground mt-2">🎀 {info.prize_note}</p>
              )}
            </div>
            <Button variant="playful" size="lg" className="mt-8 w-full" onClick={onClose}>
              Long live the champ 👑
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Leaderboards ---------- */
export function ActiveSeasonBoard(props: Base) {
  if (!scoringOn(props.trip)) return null;
  return tripHasStarted(props.trip) ? (
    <TripSeasonBoard key={`ts-${props.trip.id}`} {...props} compact />
  ) : (
    <HomeGame {...props} />
  );
}
function HomeGame(props: Base) {
  const season = useSeason(props.trip.id);
  return <Leaderboard {...props} season={season} compact />;
}

export function SquadSeasons(
  props: Base & {
    data: SeasonsData;
    season: ReturnType<typeof useSeason>;
    onMember?: (id: string) => void;
  },
) {
  const { data, season, members, cards } = props;
  const game = standings(members, season.nights, season.scores, season.settings, season.qotw);
  const mineGame = game.find((g) => g.user_id === props.userId);
  const mineTrip = data.tripRows.find((r) => r.user_id === props.userId);
  const stampTotal = (mineGame?.stamps ?? 0) + (mineTrip?.stamps ?? 0);
  const score = tripHasStarted(props.trip) && mineTrip ? mineTrip.score : (mineGame?.score ?? 0);
  const crowns = data.champs.filter((c) => c.user_id === props.userId).length;
  const skips = useSkipCounts(props.trip.id);
  if (!scoringOn(props.trip)) return null;
  return (
    <>
      <div className="mt-[14px]">
        <div className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Stamps", stampTotal, "text-orange"],
              ["Score", score, "text-blue"],
              ["Crowns", crowns, "text-green"],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label} className="app-card !p-3">
              <p className={`font-display text-[22px] font-extrabold ${color}`}>{value}</p>
              <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <ChampionsRow
        champs={data.champs}
        cards={cards}
        members={members}
        onMember={props.onMember}
      />
      {data.teams.length > 0 && (
        <TeamBoard
          teams={data.teams}
          teamMembers={data.teamMembers}
          cards={cards}
          members={members}
          gameStamps={Object.fromEntries(game.map((g) => [g.user_id, g.stamps]))}
          tripStamps={Object.fromEntries(data.tripRows.map((r) => [r.user_id, r.stamps]))}
          onMember={props.onMember}
        />
      )}
      <Leaderboard
        trip={props.trip}
        members={members}
        cards={cards}
        userId={props.userId}
        season={season}
        onMember={props.onMember}
      />
      <TripSeasonBoard
        trip={props.trip}
        members={members}
        cards={cards}
        userId={props.userId}
        rows={data.tripRows}
        onMember={props.onMember}
      />
    </>
  );
}
function ChampionsRow({
  champs,
  cards,
  members,
  onMember,
}: {
  champs: Champ[];
  cards: PlayerWithAvatar[];
  members: Member[];
  onMember?: ((id: string) => void) | undefined;
}) {
  if (!champs.length) return null;
  return (
    <section className="mt-8 grid grid-cols-2 gap-3">
      {(["game", "trip"] as SeasonKey[]).map((k) => {
        const list = champs.filter((c) => c.season === k);
        return (
          <div key={k} className="rounded-2xl bg-orange-soft p-4 text-center">
            <p className="text-[11px] font-extrabold text-ink-soft">
              {seasonEmoji[k]} {seasonName[k].toUpperCase()} CHAMP
            </p>
            {list.length ? (
              list.map((c) => {
                const card = cards.find((x) => x.user_id === c.user_id);
                return (
                  <div key={c.user_id} className="mt-2">
                    <AvatarButton
                      userId={c.user_id}
                      onOpen={onMember}
                      url={card?.avatarUrl}
                      name={card?.game_name || "Champ"}
                      className="h-12 w-12"
                      wrapperClass="mx-auto"
                    />
                    <p className="font-bold text-sm truncate mt-1">
                      {nameOf(cards, members, c.user_id)}
                    </p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm mt-3 text-muted-foreground">
                {k === "game" ? "Crowned on Final Call Night" : "Crowned at trip end"}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
function TeamBoard({
  teams,
  teamMembers,
  cards,
  members,
  gameStamps,
  tripStamps,
  onMember,
}: {
  teams: Team[];
  teamMembers: TeamMember[];
  cards: PlayerWithAvatar[];
  members: Member[];
  gameStamps: Record<string, number>;
  tripStamps: Record<string, number>;
  onMember?: ((id: string) => void) | undefined;
}) {
  const rows = teams
    .map((t) => {
      const ids = teamMembers.filter((m) => m.team_id === t.id).map((m) => m.user_id);
      return {
        ...t,
        ids,
        game: ids.reduce((s, id) => s + (gameStamps[id] ?? 0), 0),
        trip: ids.reduce((s, id) => s + (tripStamps[id] ?? 0), 0),
      };
    })
    .sort((a, b) => b.game + b.trip - (a.game + a.trip));
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-extrabold">Team scoreboard 🚩</h2>
      <div className="mt-3 space-y-2">
        {rows.map((t, i) => (
          <div
            key={t.id}
            className={`rounded-2xl p-4 ${teamSoft[t.color as keyof typeof teamSoft] ?? "bg-card"}`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`h-4 w-4 rounded-full ${teamColors[t.color as keyof typeof teamColors] ?? "bg-primary"}`}
              />
              <p className="font-display font-extrabold text-lg flex-1 truncate">
                {i === 0 && t.game + t.trip > 0 ? "👑 " : ""}
                {t.name}
              </p>
              <span className="passport-stamp bg-card px-2 py-1 font-display font-extrabold">
                {t.game + t.trip} 🛂
              </span>
            </div>
            <p className="text-xs text-ink-soft mt-1">
              Game {t.game} · Trip {t.trip}
            </p>
            <div className="flex -space-x-2 mt-2">
              {t.ids.map((id) => {
                const c = cards.find((x) => x.user_id === id);
                return (
                  <AvatarButton
                    key={id}
                    userId={id}
                    onOpen={onMember}
                    url={c?.avatarUrl}
                    name={nameOf(cards, members, id)}
                    className="h-8 w-8 ring-2 ring-card"
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Captain Tools: prizes + teams ---------- */
export function SeasonPrizeTools({ trip, members, cards }: Omit<Base, "userId">) {
  const data = useSeasonsData(trip.id);
  return (
    <>
      <h2 className="font-display font-extrabold text-xl mt-9">Seasons & mystery prizes 🎁</h2>
      <p className="text-sm text-ink-soft mt-1">
        Prizes stay hidden from the squad until crowning time.
      </p>
      {(["game", "trip"] as SeasonKey[]).map((k) => (
        <PrizeForm
          key={`${k}-${data.info.length}`}
          trip={trip}
          season={k}
          info={data.info.find((i) => i.season === k)}
          crowned={data.champs.some((c) => c.season === k)}
          onSaved={data.refresh}
        />
      ))}
    </>
  );
}
/** Team editor (opened from the Trip tab's Teams pencil). */
export function TeamsEditor({ trip, members, cards }: Omit<Base, "userId">) {
  const [v, setV] = useState(0);
  return (
    <>
      {trip.myRole === "captain" && (
        <ShuffleTeams tripId={trip.id} onDone={() => setV((n) => n + 1)} />
      )}
      <TeamsEditorInner key={v} trip={trip} members={members} cards={cards} />
    </>
  );
}
function TeamsEditorInner({ trip, members, cards }: Omit<Base, "userId">) {
  const data = useSeasonsData(trip.id);
  return <TeamTools trip={trip} members={members} cards={cards} data={data} />;
}
// Captain-only, before the first game night (server-checked in shuffle_teams).
function ShuffleTeams({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  async function go() {
    setBusy(true);
    setMsg("");
    const { data, error } = await db.rpc("shuffle_teams", { p_trip: tripId });
    setBusy(false);
    setConfirm(false);
    if (error) setMsg(friendlyError(error));
    else {
      setMsg(`Shuffled ${data} players ✓`);
      onDone();
    }
  }
  return (
    <div className="mb-3">
      {confirm ? (
        <div className="rounded-2xl bg-muted p-3">
          <p className="text-sm font-bold">Shuffle everyone into random, balanced teams?</p>
          <p className="text-xs text-muted-foreground mt-1">
            This replaces current picks. Only before the first game night.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="playful" disabled={busy} onClick={() => void go()}>
              Shuffle
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setConfirm(true)}>
          🔀 Shuffle teams
        </Button>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
    </div>
  );
}
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function PrizeForm({
  trip,
  season,
  info,
  crowned,
  onSaved,
}: {
  trip: TripWithRole;
  season: SeasonKey;
  info: Info | undefined;
  crowned: boolean;
  onSaved: () => Promise<void>;
}) {
  const isGame = season === "game";
  const [winners, setWinners] = useState(info?.winners ?? 1),
    [prize, setPrize] = useState(info?.prize ?? ""),
    [when, setWhen] = useState(
      toLocalInput(info?.crowning_mode === "custom" ? (info?.crowning_at ?? null) : null),
    ),
    [label, setLabel] = useState(info?.crowning_label ?? "");
  const [mode, setMode] = useState(
      isGame ? (info?.crowning_mode === "departure" ? "departure" : "takeoff") : "custom",
    ),
    [note, setNote] = useState(info?.prize_note ?? "");
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg("");
    const { error } = await db.rpc("set_season", {
      p_trip: trip.id,
      p_season: season,
      p_winners: winners,
      p_prize: prize,
      p_crowning_at: mode === "custom" && when ? new Date(when).toISOString() : null,
      p_label: isGame ? (mode === "takeoff" ? "Final Call Night" : "Departure morning") : label,
      p_mode: mode,
      p_note: note,
    });
    setBusy(false);
    if (error) setMsg(friendlyError(error));
    else {
      setMsg("Saved ✨");
      await onSaved();
    }
  }
  const takeoffWhen =
    isGame && mode === "takeoff" && info?.crowning_mode === "takeoff" && info.crowning_at
      ? `Week ${info.takeoff_week ?? "?"} · reveals live that night`
      : null;
  return (
    <div className={`mt-4 rounded-[1.5rem] p-4 ${isGame ? "bg-green-soft" : "bg-blue-soft"}`}>
      <p className="font-display font-extrabold text-lg">
        {seasonEmoji[season]} {seasonName[season]}
      </p>
      {crowned ? (
        <p className="text-sm mt-2">Crowned! 👑 This season is locked.</p>
      ) : (
        <>
          <p className="text-sm font-bold mt-3">Winners</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {[1, 2].map((n) => (
              <Button
                key={n}
                type="button"
                variant={winners === n ? "playful" : "outline"}
                className={winners === n ? "" : "bg-card"}
                onClick={() => setWinners(n)}
              >
                {n} winner{n > 1 ? "s" : ""}
              </Button>
            ))}
          </div>
          <label className="block text-sm font-bold mt-3">
            Prize
            <input
              className={field}
              maxLength={200}
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              placeholder="Dinner covered up to $100"
            />
          </label>
          {isGame ? (
            trip.season_rule === "a2c" ? (
              <p className="text-sm mt-3">
                The winner is announced at 8 PM the night before departure in your Trip’s home time
                zone.
              </p>
            ) : (
              <>
                <p className="text-sm font-bold mt-3">Crowning reveal</p>
                <div
                  className="grid grid-cols-2 gap-2 mt-2"
                  role="radiogroup"
                  aria-label="Crowning reveal"
                >
                  {(
                    [
                      ["takeoff", "Final Call Night", "Default"],
                      ["departure", "Departure morning", "8 AM trip time"],
                    ] as const
                  ).map(([k, l, sub]) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={mode === k}
                      onClick={() => setMode(k)}
                      className={`rounded-2xl border-2 p-3 text-left ${mode === k ? "border-primary bg-card" : "border-border bg-card/60"}`}
                    >
                      <span className="block font-bold text-base">{l}</span>
                      <span className="block text-xs text-muted-foreground">{sub}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-ink-soft mt-2">
                  {mode === "takeoff"
                    ? "Revealed live at the last game night before you fly, with the crowning animation. The host or Captain taps “Crown the champion”."
                    : `Unlocks at 8 AM on ${friendlyDate(trip.start_date)} — everyone sees it when they open the app.`}
                </p>
                {takeoffWhen && <p className="text-xs font-bold mt-1">🛫 {takeoffWhen}</p>}
              </>
            )
          ) : (
            <>
              <label className="block text-sm font-bold mt-3">
                Crowning date & time
                <input
                  type="datetime-local"
                  className={field}
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
              <label className="block text-sm font-bold mt-3">
                Where
                <input
                  className={field}
                  maxLength={160}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Welcome dinner, 8 PM"
                />
              </label>
            </>
          )}
          <label className="block text-sm font-bold mt-3">
            How/when the prize will be given{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              className={field}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="I'll treat you at our first dinner in Bangkok"
            />
          </label>
          <Button
            variant="playful"
            className="w-full mt-4"
            disabled={busy || !prize.trim() || (mode === "custom" && !when)}
            onClick={() => void save()}
          >
            Save {seasonName[season]} prize
          </Button>
          {msg && (
            <p role="status" className="text-sm mt-2">
              {msg}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const COLOR_KEYS = ["orange", "blue", "green", "yellow"] as const;
const TEAM_NAMES = ["Jet Setters", "Wild Cards", "Night Owls", "Sun Chasers"];
function TeamTools({ trip, members, cards, data }: Omit<Base, "userId"> & { data: SeasonsData }) {
  type Draft = { name: string; color: string; members: string[] };
  const fromData = (): Draft[] =>
    data.teams.map((t) => ({
      name: t.name,
      color: t.color,
      members: data.teamMembers.filter((m) => m.team_id === t.id).map((m) => m.user_id),
    }));
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [msg, setMsg] = useState("");
  useEffect(() => setDrafts(fromData()), [data.teams, data.teamMembers]);
  function shuffle(n: number) {
    const ids = [...members.map((m) => m.user_id)].sort(() => Math.random() - 0.5);
    setDrafts(
      Array.from({ length: n }, (_, i) => ({
        name: drafts[i]?.name || (TEAM_NAMES[i] as string),
        color: COLOR_KEYS[i] as string,
        members: ids.filter((_, j) => j % n === i),
      })),
    );
  }
  function assign(id: string, idx: number) {
    setDrafts(
      drafts.map((d, i) => ({
        ...d,
        members:
          i === idx
            ? [...d.members.filter((m) => m !== id), id]
            : d.members.filter((m) => m !== id),
      })),
    );
  }
  async function save(list: Draft[]) {
    setMsg("");
    const { error } = await db.rpc("save_teams", { p_trip: trip.id, p_teams: list });
    if (error) setMsg(friendlyError(error));
    else {
      setMsg(list.length ? "Teams saved 🚩" : "Teams cleared");
      await data.refresh();
    }
  }
  const size = members.length,
    tier = groupTier(size, !!(trip as { big_group?: boolean }).big_group);
  const suggested = Math.min(4, Math.max(2, Math.ceil(size / 6)));
  async function unlock() {
    const { error } = await db.rpc("unlock_big_group", { p_trip: trip.id });
    setMsg(
      error
        ? friendlyError(error)
        : "Big Group unlocked 🎉 Free for Founding Members — up to 30 players.",
    );
  }
  return (
    <>
      <h2 className="font-display font-extrabold text-xl mt-9">
        Teams {tier.teams === "optional" ? "· Create teams (optional)" : "(required)"} 🚩
      </h2>
      <p className="text-sm text-ink-soft mt-1">
        {size} players · {tier.tier}.{" "}
        {tier.teams === "optional"
          ? "Create 2–4 auto-balanced teams you can adjust, or play with no teams. A team scoreboard shows in Squad."
          : "13+ players play in team rooms, each with its own call and host. Stamps still roll up to one trip leaderboard plus a team board, and the finale can be one combined call."}
      </p>
      <div className="mt-3 rounded-2xl bg-card border border-border p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold">
            {(trip as { big_group?: boolean }).big_group
              ? "✅ Big Group add-on"
              : "🔒 Big Group add-on"}
          </p>
          <p className="text-xs text-ink-soft">
            Needed for 21–30 players. Free for Founding Members.
          </p>
        </div>
        {!(trip as { big_group?: boolean }).big_group && trip.myRole === "captain" && (
          <Button size="sm" variant="outline" onClick={() => void unlock()}>
            Unlock free
          </Button>
        )}
      </div>
      {tier.teams === "required" && (
        <Button variant="playful" className="w-full mt-3" onClick={() => shuffle(suggested)}>
          <Shuffle /> Suggest {suggested} balanced teams
        </Button>
      )}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[2, 3, 4].map((n) => (
          <Button key={n} variant="outline" className="bg-card" onClick={() => shuffle(n)}>
            <Shuffle /> {n} teams
          </Button>
        ))}
      </div>
      {drafts.length > 0 && (
        <div className="mt-4 space-y-3">
          {drafts.map((d, i) => (
            <div
              key={i}
              className={`rounded-2xl p-3 ${teamSoft[d.color as keyof typeof teamSoft]}`}
            >
              <div className="flex gap-2">
                <input
                  aria-label="Team name"
                  className="flex-1 h-11 rounded-xl border-2 border-border bg-card px-3"
                  maxLength={40}
                  value={d.name}
                  onChange={(e) =>
                    setDrafts(drafts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
                <div className="flex gap-1">
                  {COLOR_KEYS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Color ${c}`}
                      onClick={() =>
                        setDrafts(drafts.map((x, j) => (j === i ? { ...x, color: c } : x)))
                      }
                      className={`h-11 w-8 rounded-lg ${teamColors[c]} ${d.color === c ? "ring-2 ring-foreground" : ""}`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-ink-soft mt-2">
                {d.members.map((id) => nameOf(cards, members, id)).join(", ") || "Nobody yet"}
              </p>
            </div>
          ))}
          <p className="text-sm font-bold">Move people</p>
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2">
              <span className="flex-1 truncate text-sm font-bold">
                {nameOf(cards, members, m.user_id)}
              </span>
              <select
                aria-label={`Team for ${nameOf(cards, members, m.user_id)}`}
                className="h-10 rounded-xl border-2 border-border bg-card px-2 text-base"
                value={drafts.findIndex((d) => d.members.includes(m.user_id))}
                onChange={(e) => assign(m.user_id, Number(e.target.value))}
              >
                <option value={-1}>No team</option>
                {drafts.map((d, i) => (
                  <option key={i} value={i}>
                    {d.name || `Team ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="playful" onClick={() => void save(drafts)}>
              <Users /> Save teams
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (await confirmInApp("Remove all teams?")) {
                  setDrafts([]);
                  void save([]);
                }
              }}
            >
              Clear teams
            </Button>
          </div>
        </div>
      )}
      {data.teams.length > 0 && size > 12 && (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-bold">Team rooms 🎧</p>
          {data.teams.map((t) => (
            <TeamRoom
              key={t.id}
              trip={trip}
              team={t}
              ids={data.teamMembers.filter((m) => m.team_id === t.id).map((m) => m.user_id)}
              label={(id) => nameOf(cards, members, id)}
              onSaved={data.refresh}
            />
          ))}
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
    </>
  );
}
function TeamRoom({
  trip,
  team,
  ids,
  label,
  onSaved,
}: {
  trip: TripWithRole;
  team: Team;
  ids: string[];
  label: (id: string) => string;
  onSaved: () => Promise<void>;
}) {
  const [call, setCall] = useState(team.call_link ?? ""),
    [host, setHost] = useState(team.host_id ?? ""),
    [msg, setMsg] = useState("");
  async function save() {
    const { error } = await db.rpc("set_team_room", {
      p_trip: trip.id,
      p_team: team.id,
      p_call: call || null,
      p_host: host || null,
    });
    setMsg(error ? friendlyError(error) : "Saved ✓");
    if (!error) await onSaved();
  }
  return (
    <div
      className={`rounded-2xl p-3 ${teamSoft[team.color as keyof typeof teamSoft] ?? "bg-card"}`}
    >
      <p className="font-bold text-base">{team.name}</p>
      <input
        aria-label={`${team.name} call link`}
        placeholder="https:// call link"
        className="mt-2 w-full h-11 rounded-xl border-2 border-border bg-card px-3 text-base"
        value={call}
        onChange={(e) => setCall(e.target.value)}
      />
      <div className="flex gap-2 mt-2">
        <select
          aria-label={`${team.name} host`}
          className="flex-1 h-11 rounded-xl border-2 border-border bg-card px-2 text-base"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        >
          <option value="">Pick a host</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {label(id)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" className="h-11" onClick={() => void save()}>
          Save
        </Button>
      </div>
      {msg && (
        <p role="status" className="text-xs mt-1">
          {msg}
        </p>
      )}
    </div>
  );
}

/* ---------- Photo wall ---------- */
function usePhotos(tripId: string) {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [reactions, setReactions] = useState<Reaction[]>([]),
    [urls, setUrls] = useState<Record<string, string>>({}),
    [loaded, setLoaded] = useState(false);
  const refresh = async () => {
    const [p, r] = await Promise.all([
      db.rpc("trip_photos", { p_trip: tripId }),
      db.from("photo_reactions").select("photo_path,user_id,emoji").eq("trip_id", tripId),
    ]);
    const list: Photo[] = p.data ?? [];
    setPhotos(list);
    setReactions(r.data ?? []);
    setLoaded(true);
    const paths = [...new Set(list.map((x) => x.photo_path))];
    if (paths.length) {
      const { data } = await supabase.storage.from("trip-photos").createSignedUrls(paths, 3600);
      if (data)
        setUrls(
          Object.fromEntries(
            data
              .filter((x) => x.signedUrl && x.path)
              .map((x) => [x.path as string, x.signedUrl as string]),
          ),
        );
    }
  };
  useEffect(() => {
    void refresh();
  }, [tripId]);
  return { photos, reactions, urls, loaded, refresh };
}
const sourceLabel: Record<string, string> = {
  bingo: "🎯 Bingo",
  quest: "🧭 Quest",
  challenge: "📸 Challenge",
  airport: "✈️ Airport",
};
export function PhotoWall({ trip, members, cards, userId }: Base) {
  const { photos, reactions, urls, loaded, refresh } = usePhotos(trip.id);
  const [open, setOpen] = useState<Photo | null>(null),
    [msg, setMsg] = useState(""),
    [busyMem, setBusyMem] = useState(""),
    [collageUrl, setCollageUrl] = useState("");
  const cinematic = useLook("journey") === "cinematic";
  const [itineraryDays, setItineraryDays] = useState<ItineraryDay[]>([]);
  useEffect(() => {
    if (!cinematic) return;
    let live = true;
    void loadItinerary(trip.id)
      .then(({ days }) => {
        if (live) setItineraryDays(days);
      })
      .catch(() => {
        if (live) setItineraryDays([]);
      });
    return () => {
      live = false;
    };
  }, [cinematic, trip.id]);
  const closed = tripClosed(trip);
  async function downloadAll() {
    setBusyMem("zip");
    setMsg("");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let n = 0;
      for (const p of photos) {
        const url = urls[p.photo_path];
        if (!url) continue;
        const blob = await (await fetch(url)).blob();
        n++;
        zip.file(
          `${String(n).padStart(3, "0")}-${p.day_date}-${p.source}-${nameOf(cards, members, p.user_id).replace(/[^a-z0-9]+/gi, "-")}.${p.photo_path.split(".").pop() || "jpg"}`,
          blob,
        );
      }
      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `${trip.name.replace(/[^a-z0-9]+/gi, "-")}-photos.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch {
      setMsg("Couldn't build the zip — try again on Wi-Fi.");
    }
    setBusyMem("");
  }
  async function collage() {
    setBusyMem("collage");
    setMsg("");
    try {
      const top = [...new Set(photos.map((p) => p.photo_path))]
        .map((path) => ({ path, n: reactions.filter((r) => r.photo_path === path).length }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 9)
        .filter((x) => urls[x.path]);
      const imgs = await Promise.all(
        top.map(
          (t) =>
            new Promise<HTMLImageElement>((res, rej) => {
              const im = new Image();
              im.crossOrigin = "anonymous";
              im.onload = () => res(im);
              im.onerror = rej;
              im.src = urls[t.path] as string;
            }),
        ),
      );
      const cols = imgs.length >= 5 ? 3 : 2,
        rows = Math.ceil(imgs.length / cols),
        W = 1080,
        pad = 24,
        cell = (W - pad * (cols + 1)) / cols,
        head = 220,
        H = head + rows * (cell + pad) + pad + 70;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d")!;
      const css = getComputedStyle(document.documentElement);
      const col = (v: string, f: string) => css.getPropertyValue(v).trim() || f;
      ctx.fillStyle = col("--primary", "#f97316");
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 64px 'Bricolage Grotesque', sans-serif";
      ctx.fillText(tripDisplayName(trip.name).slice(0, 26), pad * 2, 110);
      ctx.font = "600 34px Figtree, sans-serif";
      ctx.fillText(
        `${trip.destination} · ${friendlyRange(trip.start_date, trip.end_date)}`.slice(0, 50),
        pad * 2,
        165,
      );
      imgs.forEach((im, i) => {
        const x = pad + (i % cols) * (cell + pad),
          y = head + Math.floor(i / cols) * (cell + pad);
        const s = Math.min(im.width, im.height);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, cell, cell, 28);
        ctx.clip();
        ctx.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, x, y, cell, cell);
        ctx.restore();
      });
      ctx.font = "800 36px 'Bricolage Grotesque', sans-serif";
      ctx.fillText("TripJunkies ✳", pad * 2, H - 36);
      setCollageUrl(c.toDataURL("image/png"));
    } catch {
      setMsg("Couldn't build the collage — try again.");
    }
    setBusyMem("");
  }
  async function react(path: string, emoji: string) {
    const mine = reactions.some(
      (r) => r.photo_path === path && r.user_id === userId && r.emoji === emoji,
    );
    const q = mine
      ? db.from("photo_reactions").delete().match({ photo_path: path, user_id: userId, emoji })
      : db
          .from("photo_reactions")
          .insert({ trip_id: trip.id, photo_path: path, user_id: userId, emoji });
    const { error } = await q;
    if (error) setMsg(friendlyError(error));
    await refresh();
  }
  async function report(path: string) {
    const reason = window.prompt("What's wrong with this photo? (optional)") ?? null;
    if (reason === null) return;
    const { error } = await db.from("photo_reports").insert({
      trip_id: trip.id,
      photo_path: path,
      user_id: userId,
      reason: reason.slice(0, 300),
    });
    setMsg(
      error
        ? error.code === "23505"
          ? "You already reported this one."
          : friendlyError(error)
        : "Thanks — your Captain will take a look. 🙏",
    );
  }
  async function remove(path: string) {
    if (!(await confirmInApp("Delete this photo from the wall?"))) return;
    const { error } = await db.rpc("remove_photo", { p_trip: trip.id, p_path: path });
    if (error) setMsg(friendlyError(error));
    else {
      setOpen(null);
      await refresh();
    }
  }
  const counts = (path: string) =>
    EMOJIS.map((e) => ({
      e,
      n: reactions.filter((r) => r.photo_path === path && r.emoji === e).length,
      mine: reactions.some((r) => r.photo_path === path && r.emoji === e && r.user_id === userId),
    }));
  if (cinematic) {
    const byDay = photos.reduce<Record<string, Photo[]>>((groups, photo) => {
      (groups[photo.day_date] ??= []).push(photo);
      return groups;
    }, {});
    const days = Object.keys(byDay).sort();
    const start = new Date(`${trip.start_date}T12:00:00Z`).getTime();
    const firstPlace = trip.destination.split(/[,·]/)[0]?.trim() || trip.destination;
    const stickers = [Plane, Palmtree, BriefcaseBusiness, MapPin];
    const tilt = (path: string) => {
      let hash = 0;
      for (const char of path) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      return `photo-tilt-${hash % 5}`;
    };
    return (
      <section className="mt-5 cinematic-photo-wall">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow text-primary">PHOTO WALL</p>
            <h2 className="mt-1 break-words font-display text-2xl font-extrabold">
              {tripDisplayName(trip.name)} scrapbook
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{trip.destination} · members only</p>
          </div>
          <span
            className="shrink-0 text-sm text-muted-foreground"
            aria-label={`${photos.length} photos`}
          >
            {photos.length}
          </span>
        </div>
        {photos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!busyMem} onClick={() => void downloadAll()}>
              <Download /> {busyMem === "zip" ? "Zipping…" : "Download all"}
            </Button>
            <Button variant="outline" disabled={!!busyMem} onClick={() => void collage()}>
              🖼️ {busyMem === "collage" ? "Building…" : "Make a collage"}
            </Button>
          </div>
        )}
        {collageUrl && (
          <div className="mt-4 rounded-2xl bg-card border border-border p-3">
            <img src={collageUrl} alt="Trip collage" className="w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <a
                href={collageUrl}
                download={`${tripDisplayName(trip.name)}-collage.png`}
                className="h-11 rounded-full bg-primary text-primary-foreground font-bold grid place-items-center text-base"
              >
                Save collage
              </a>
              <Button variant="ghost" onClick={() => setCollageUrl("")}>
                Close
              </Button>
            </div>
          </div>
        )}
        {msg && (
          <p role="status" className="text-sm mt-2">
            {msg}
          </p>
        )}
        <div className="scrapbook-board mt-4">
          {stickers.map((Icon, i) => (
            <Icon
              key={i}
              aria-hidden="true"
              className={`scrapbook-sticker scrapbook-sticker-${i}`}
              strokeWidth={2.5}
            />
          ))}
          {loaded && !photos.length ? (
            <div className="relative z-10 py-9">
              <div className="grid grid-cols-3 gap-2 px-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className={`scrapbook-polaroid scrapbook-blank photo-tilt-${i}`}>
                    <span className="scrapbook-photo-empty" />
                    <span className="scrapbook-fastener" />
                  </div>
                ))}
              </div>
              <div className="scrapbook-empty mx-auto mt-8 max-w-[290px] px-5 py-5 text-center">
                <p className="font-display text-lg font-extrabold">No photos yet</p>
                <p className="mt-2 text-sm">
                  Bingo, Quest and Photo challenge pics land here as the squad plays.
                </p>
              </div>
            </div>
          ) : !loaded ? (
            <div className="scrapbook-empty relative z-10 mx-auto my-10 max-w-[290px] px-5 py-5 text-center text-sm">
              Loading photos…
            </div>
          ) : (
            <div className="relative z-10 space-y-6">
              {days.map((date) => {
                const number = Math.max(
                  1,
                  Math.round((new Date(`${date}T12:00:00Z`).getTime() - start) / 86400000) + 1,
                );
                const city =
                  itineraryDays.find((day) => day.date === date)?.city?.trim() || firstPlace;
                return (
                  <div key={date}>
                    <h3 className="scrapbook-day-label">
                      Day {number} · {city}
                    </h3>
                    <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-6">
                      {byDay[date]?.map((p, i) => {
                        const total = reactions.filter((r) => r.photo_path === p.photo_path).length;
                        return (
                          <Button
                            key={p.photo_path}
                            variant="ghost"
                            type="button"
                            onClick={() => setOpen(p)}
                            aria-label={`Open ${nameOf(cards, members, p.user_id)}'s photo from day ${number}`}
                            className={`scrapbook-polaroid ${tilt(p.photo_path)} ${i % 2 ? "scrapbook-taped" : "scrapbook-pinned"}`}
                          >
                            <span className="scrapbook-fastener" aria-hidden="true" />
                            <span className="scrapbook-photo-frame">
                              {urls[p.photo_path] && (
                                <img
                                  src={urls[p.photo_path]}
                                  alt={`${nameOf(cards, members, p.user_id)}'s ${p.source} photo`}
                                  loading="lazy"
                                  decoding="async"
                                  width={360}
                                  height={360}
                                />
                              )}
                            </span>
                            <span className="scrapbook-caption">
                              {nameOf(cards, members, p.user_id)} · ♥ {total}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Photo"
            className="fixed inset-0 z-50 flex flex-col bg-foreground text-background"
          >
            <div className="flex min-w-0 items-center gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
              <Avatar
                url={cards.find((c) => c.user_id === open.user_id)?.avatarUrl}
                name={nameOf(cards, members, open.user_id)}
                className="h-10 w-10"
              />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{nameOf(cards, members, open.user_id)}</p>
                <p className="text-xs opacity-70">
                  {sourceLabel[open.source]} ·{" "}
                  {new Date(`${open.day_date}T12:00:00`).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-background"
                aria-label="Close"
                onClick={() => setOpen(null)}
              >
                <X />
              </Button>
            </div>
            <div className="flex-1 min-h-0 grid place-items-center px-2">
              {urls[open.photo_path] && (
                <img
                  src={urls[open.photo_path]}
                  alt="Full screen"
                  className="max-h-full max-w-full object-contain rounded-2xl"
                />
              )}
            </div>
            <div className="p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <div className="flex justify-center gap-2">
                {counts(open.photo_path).map(({ e, n, mine }) => (
                  <button
                    key={e}
                    type="button"
                    disabled={closed}
                    onClick={() => void react(open.photo_path, e)}
                    className={`h-12 min-w-12 rounded-full px-3 text-lg font-bold transition active:scale-90 ${mine ? "bg-primary text-primary-foreground" : "bg-background/15"}`}
                  >
                    {e}
                    {n > 0 && <span className="ml-1 text-base">{n}</span>}
                  </button>
                ))}
              </div>
              <div className="flex justify-center gap-2 mt-3">
                {!closed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-background"
                    onClick={() => void report(open.photo_path)}
                  >
                    <Flag /> Report
                  </Button>
                )}
                {isLeader(trip) && !closed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => void remove(open.photo_path)}
                  >
                    <Trash2 /> Delete
                  </Button>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-background">
                Urgent?{" "}
                <a href="mailto:safety@tripjunkies.app" className="underline">
                  Email safety@tripjunkies.app
                </a>
              </p>
            </div>
          </div>
        )}
      </section>
    );
  }
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-extrabold text-muted-foreground">EVERY SNAP, ONE PLACE</p>
          <h2 className="font-display text-2xl font-extrabold">Photo wall 📸</h2>
        </div>
        <span className="text-sm text-muted-foreground">{photos.length}</span>
      </div>
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="bg-card"
            disabled={!!busyMem}
            onClick={() => void downloadAll()}
          >
            <Download /> {busyMem === "zip" ? "Zipping…" : "Download all"}
          </Button>
          <Button
            variant="outline"
            className="bg-card"
            disabled={!!busyMem}
            onClick={() => void collage()}
          >
            🖼️ {busyMem === "collage" ? "Building…" : "Make a collage"}
          </Button>
        </div>
      )}
      {collageUrl && (
        <div className="mt-4 rounded-2xl bg-card border border-border p-3">
          <img src={collageUrl} alt="Trip collage" className="w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-2 mt-3">
            <a
              href={collageUrl}
              download={`${tripDisplayName(trip.name)}-collage.png`}
              className="h-11 rounded-full bg-primary text-primary-foreground font-bold grid place-items-center text-base"
            >
              Save collage
            </a>
            <Button variant="ghost" onClick={() => setCollageUrl("")}>
              Close
            </Button>
          </div>
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
      {loaded && photos.length === 0 ? (
        <div className="mt-4 rounded-[1.75rem] bg-orange-soft p-6 text-center">
          <p className="text-4xl">🖼️</p>
          <p className="font-display font-extrabold text-lg mt-1">No photos yet</p>
          <p className="text-sm text-ink-soft">
            Bingo, quest and photo challenge shots land here during the trip.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const total = reactions.filter((r) => r.photo_path === p.photo_path).length;
            return (
              <button
                key={p.photo_path}
                type="button"
                onClick={() => setOpen(p)}
                className="relative aspect-square overflow-hidden rounded-xl bg-muted text-left"
              >
                {urls[p.photo_path] && (
                  <img
                    src={urls[p.photo_path]}
                    alt={`${nameOf(cards, members, p.user_id)}'s ${p.source} photo`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-card px-1.5 py-0.5 text-[9px] font-bold">
                  {sourceLabel[p.source] ?? p.source}
                </span>
                {total > 0 && (
                  <span className="absolute right-1.5 bottom-1.5 rounded-full bg-card px-1.5 py-0.5 text-[10px] font-bold">
                    ❤️ {total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          className="fixed inset-0 z-50 flex flex-col bg-foreground text-background"
        >
          <div className="flex min-w-0 items-center gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <Avatar
              url={cards.find((c) => c.user_id === open.user_id)?.avatarUrl}
              name={nameOf(cards, members, open.user_id)}
              className="h-10 w-10"
            />
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{nameOf(cards, members, open.user_id)}</p>
              <p className="text-xs opacity-70">
                {sourceLabel[open.source]} ·{" "}
                {new Date(`${open.day_date}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-background"
              aria-label="Close"
              onClick={() => setOpen(null)}
            >
              <X />
            </Button>
          </div>
          <div className="flex-1 min-h-0 grid place-items-center px-2">
            {urls[open.photo_path] && (
              <img
                src={urls[open.photo_path]}
                alt="Full screen"
                className="max-h-full max-w-full object-contain rounded-2xl"
              />
            )}
          </div>
          <div className="p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex justify-center gap-2">
              {counts(open.photo_path).map(({ e, n, mine }) => (
                <button
                  key={e}
                  type="button"
                  disabled={closed}
                  onClick={() => void react(open.photo_path, e)}
                  className={`h-12 min-w-12 rounded-full px-3 text-lg font-bold transition active:scale-90 ${mine ? "bg-primary text-primary-foreground" : "bg-background/15"}`}
                >
                  {e}
                  {n > 0 && <span className="ml-1 text-base">{n}</span>}
                </button>
              ))}
            </div>
            <div className="flex justify-center gap-2 mt-3">
              {!closed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-background"
                  onClick={() => void report(open.photo_path)}
                >
                  <Flag /> Report
                </Button>
              )}
              {isLeader(trip) && !closed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void remove(open.photo_path)}
                >
                  <Trash2 /> Delete
                </Button>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-background">
              Urgent?{" "}
              <a href="mailto:safety@tripjunkies.app" className="underline">
                Email safety@tripjunkies.app
              </a>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Trip Wrapped ---------- */
export function WrappedCard({ trip, onOpen }: { trip: TripWithRole; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-6 w-full rounded-[1.75rem] bg-primary text-primary-foreground p-6 text-left shadow-soft relative overflow-hidden"
    >
      <span className="absolute -right-2 -top-4 text-8xl opacity-25">🎬</span>
      <p className="text-xs font-extrabold">IT'S A WRAP</p>
      <p className="font-display text-3xl font-extrabold mt-1">
        {tripDisplayName(trip.name)} Wrapped
      </p>
      <p className="text-sm mt-1 font-bold">Tap to relive the trip → story-size, made to share</p>
    </button>
  );
}
type Slide = {
  key: string;
  bg: string;
  eyebrow: string;
  title: string;
  big?: string | undefined;
  sub?: string | undefined;
  people?: { id: string; line: string }[];
  photo?: string | undefined;
};
export function TripWrapped({
  trip,
  members,
  cards,
  onClose,
  onPlanTrip,
  onAtHome,
}: Omit<Base, "userId"> & { onClose: () => void; onPlanTrip?: () => void; onAtHome?: () => void }) {
  const data = useSeasonsData(trip.id);
  const season = useSeason(trip.id);
  const { photos, reactions, urls } = usePhotos(trip.id);
  const [extra, setExtra] = useState<{
    quests: Record<string, number>;
    missions: Record<string, number>;
  }>({ quests: {}, missions: {} });
  const qotw = useWeeklyQuestions(trip.id);
  const [squadMsgs, setSquadMsgs] = useState<{ user_id: string; message: string }[]>([]);
  useEffect(() => {
    void supabase
      .rpc("trip_squad_messages", { p_trip: trip.id })
      .then((r) => setSquadMsgs(r.data ?? []));
  }, [trip.id]);
  const [i, setI] = useState(0),
    [saving, setSaving] = useState(false);
  const [earned, setEarned] = useState<string | null>(null);
  const closeWrapped = async () => {
    if (!trip.is_sandbox && (trip.ended_at || tripClosed(trip))) {
      const { data } = await supabase.rpc("passport_collection");
      const stamp = data?.find((s) => s.trip_id === trip.id);
      if (stamp) {
        setEarned(
          stamp.kind === "road_trip"
            ? `${stamp.city ?? ""} · ${stamp.state ?? "Road trip"}`
            : stamp.country,
        );
        return;
      }
      if (trip.kind === "at_home") {
        setEarned(trip.destination);
        return;
      }
    }
    onClose();
  };
  const [nightPasses, setNightPasses] = useState<Set<string>>(new Set());
  useEffect(() => {
    void supabase
      .from("skip_passes")
      .select("user_id,kind,ref")
      .eq("trip_id", trip.id)
      .in("kind", ["night", "host"])
      .then(({ data }) =>
        setNightPasses(new Set((data ?? []).map((r) => `${r.user_id}|${r.ref}`))),
      );
  }, [trip.id]);
  const slideRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void (async () => {
      const [qp, qt, sm, mv] = await Promise.all([
        supabase.from("quest_posts").select("id,user_id").eq("trip_id", trip.id),
        supabase.from("quest_thumbs").select("post_id").eq("trip_id", trip.id),
        supabase
          .from("secret_missions")
          .select("user_id,day_date,revealed_at")
          .eq("trip_id", trip.id)
          .not("revealed_at", "is", null),
        supabase
          .from("mission_votes")
          .select("owner_id,day_date,caught")
          .eq("trip_id", trip.id)
          .eq("caught", true),
      ]);
      const thumbs: Record<string, number> = {};
      for (const t of qt.data ?? []) thumbs[t.post_id] = (thumbs[t.post_id] ?? 0) + 1;
      const quests: Record<string, number> = {};
      for (const p of qp.data ?? [])
        if ((thumbs[p.id] ?? 0) >= 2) quests[p.user_id] = (quests[p.user_id] ?? 0) + 1;
      const caught = new Set((mv.data ?? []).map((v) => `${v.owner_id}|${v.day_date}`));
      const missions: Record<string, number> = {};
      for (const m of sm.data ?? [])
        if (!caught.has(`${m.user_id}|${m.day_date}`))
          missions[m.user_id] = (missions[m.user_id] ?? 0) + 1;
      setExtra({ quests, missions });
    })();
  }, [trip.id]);
  const slides = useMemo<Slide[]>(() => {
    const top = (rec: Record<string, number>) => {
      const max = Math.max(0, ...Object.values(rec));
      return max > 0 ? { ids: Object.keys(rec).filter((k) => rec[k] === max), max } : null;
    };
    const game = standings(members, season.nights, season.scores, season.settings, season.qotw);
    const done = season.nights.filter(
      (n) => !n.skipped && new Date(n.starts_at).getTime() <= Date.now(),
    );
    const skippedNights = season.nights.filter((n) => n.skipped).map((n) => n.week_number);
    const wins: Record<string, number> = {};
    for (const s of season.scores) if (s.won) wins[s.user_id] = (wins[s.user_id] ?? 0) + 1;
    const perfect = done.length
      ? members
          .filter((m) =>
            done.every(
              (n) =>
                season.scores.some(
                  (s) => s.week_number === n.week_number && s.user_id === m.user_id && s.here,
                ) || nightPasses.has(`${m.user_id}|${n.week_number}`),
            ),
          )
          .map((m) => m.user_id)
      : [];
    const gameTotal = game.reduce((s, g) => s + g.stamps, 0),
      tripTotal = data.tripRows.reduce((s, r) => s + r.stamps, 0);
    const champ = (k: SeasonKey) => {
      const list = data.champs.filter((c) => c.season === k);
      if (list.length)
        return list.map((c) => ({ id: c.user_id, line: `${c.score}/100 · 🛂 ${c.stamps}` }));
      const board =
        k === "game"
          ? game.map((g) => ({ id: g.user_id, s: g.score, st: g.stamps }))
          : data.tripRows
              .map((r) => ({ id: r.user_id, s: r.score, st: r.stamps }))
              .sort((a, b) => b.s - a.s || b.st - a.st);
      return board[0] && board[0].st > 0
        ? [{ id: board[0].id, line: `${board[0].s}/100 · 🛂 ${board[0].st}` }]
        : [];
    };
    const ranked = [...new Set(photos.map((p) => p.photo_path))]
      .map((path) => ({
        path,
        n: reactions.filter((r) => r.photo_path === path).length,
        who: photos.find((p) => p.photo_path === path)?.user_id ?? "",
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    const list: Slide[] = [
      {
        key: "intro",
        bg: "bg-blue",
        eyebrow: "TRIPJUNKIES WRAPPED",
        title: tripDisplayName(trip.name),
        big: "🎬",
        sub: `${trip.destination} · ${new Date(`${trip.start_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(`${trip.end_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
      },
    ];
    if (scoringOn(trip))
      for (const k of ["game", "trip"] as SeasonKey[]) {
        const c = champ(k);
        list.push({
          key: `champ-${k}`,
          bg: k === "game" ? "bg-green" : "bg-primary",
          eyebrow: `${seasonName[k].toUpperCase()} CHAMPION`,
          title: c.length ? "All hail 👑" : "Still up for grabs",
          people: c,
          sub: data.info.find((x) => x.season === k)?.prize
            ? `Prize: ${data.info.find((x) => x.season === k)?.prize}`
            : undefined,
        });
      }
    const award = (
      key: string,
      bg: string,
      eyebrow: string,
      title: string,
      rec: Record<string, number>,
      unit: string,
    ) => {
      const t = top(rec);
      if (t)
        list.push({
          key,
          bg,
          eyebrow,
          title,
          people: t.ids.map((id) => ({ id, line: `${t.max} ${unit}${t.max === 1 ? "" : "s"}` })),
        });
    };
    award("wins", "bg-orange", "MOST GAME NIGHT WINS", "Undefeated energy 🏆", wins, "win");
    if (perfect.length)
      list.push({
        key: "perfect",
        bg: "bg-blue",
        eyebrow: "PERFECT ATTENDANCE",
        title: "Never missed a night 📅",
        people: perfect.map((id) => ({ id, line: `${done.length}/${done.length} game nights` })),
      });
    award("quests", "bg-green", "MOST QUESTS DONE", "Side-quest legend 🧭", extra.quests, "quest");
    award(
      "missions",
      "bg-primary",
      "SECRET AGENT",
      "Pulled it off undetected 🕵️",
      extra.missions,
      "secret mission",
    );
    ranked.forEach((r, idx) => {
      if (urls[r.path])
        list.push({
          key: `photo-${idx}`,
          bg: ["bg-orange", "bg-blue", "bg-green"][idx] as string,
          eyebrow: `TOP PHOTO #${idx + 1}`,
          title: `${r.n} reaction${r.n === 1 ? "" : "s"}`,
          photo: urls[r.path],
          sub: `📸 ${nameOf(cards, members, r.who)}`,
        });
    });
    if (skippedNights.length)
      list.push({
        key: "skipped",
        bg: "bg-blue",
        eyebrow: "SKIPPED NIGHTS",
        title: "Life happened ⏭️",
        big: `${skippedNights.length}`,
        sub: `Week${skippedNights.length === 1 ? "" : "s"} ${skippedNights.join(", ")} skipped · no points lost`,
      });
    const best = qotw.list
      .filter((q) => q.revealed_at && q.winner_id)
      .flatMap((q) =>
        qotw.answers.filter((x) => x.week_number === q.week_number && x.user_id === q.winner_id),
      )
      .slice(-3);
    if (best.length)
      list.push({
        key: "qotw",
        bg: "bg-orange",
        eyebrow: "QUESTION OF THE WEEK",
        title: "Your squad's best answers ❓",
        people: best.map((x) => ({ id: x.user_id, line: `${x.emoji ?? ""} “${x.answer}”`.trim() })),
      });
    if (squadMsgs.length)
      list.push({
        key: "squad-msgs",
        bg: "bg-blue",
        eyebrow: "NOTES TO THE SQUAD",
        title: "Messages from the crew 💬",
        people: squadMsgs.slice(0, 6).map((x) => ({ id: x.user_id, line: `“${x.message}”` })),
      });
    list.push({
      key: "stats",
      bg: "bg-foreground",
      eyebrow: "BY THE NUMBERS",
      title: "What a trip.",
      big: `${gameTotal + tripTotal}`,
      sub: `stamps collected · ${done.length} game nights · ${photos.length} photos · ${members.length} travelers`,
    });
    list.push({
      key: "outro",
      bg: "bg-primary",
      eyebrow: "SEE YOU NEXT TRIP",
      title: "Collect the moments. Let's go.",
      big: "✳",
    });
    return list;
  }, [
    data.champs,
    data.tripRows,
    data.info,
    season.nights,
    season.scores,
    season.settings,
    season.qotw,
    qotw.list,
    qotw.answers,
    squadMsgs,
    photos,
    reactions,
    urls,
    extra,
    members,
    cards,
    trip,
    nightPasses,
  ]);
  const slide = slides[Math.min(i, slides.length - 1)] as Slide;
  const [saveError, setSaveError] = useState("");
  async function save() {
    if (!slideRef.current) return;
    setSaving(true);
    setSaveError("");
    try {
      const url = await toPng(slideRef.current, {
        pixelRatio: 1080 / slideRef.current.offsetWidth,
        cacheBust: true,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `tripjunkies-wrapped-${slide.key}.png`;
      a.click();
    } catch {
      setSaveError("Couldn't save that image — try a screenshot instead.");
      setSaving(false);
      return;
    }
    setSaving(false);
  }
  const touch = useRef(0);
  if (earned)
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Passport collectible earned"
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-background/95 p-5"
      >
        <p className="eyebrow">ONE FOR THE PASSPORT</p>
        <div className="passport-ink stamp-arrive mt-7 flex aspect-square w-52 flex-col items-center justify-center border-primary text-primary text-center p-4">
          <span className="text-4xl">{trip.kind === "at_home" ? "📮" : "✈️"}</span>
          <span className="font-display text-xl font-extrabold uppercase break-words">
            {earned}
          </span>
          <span className="text-xs font-bold mt-2">{trip.end_date}</span>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">Find it in Me › My Passport</p>
        <Button variant="playful" className="mt-6" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trip Wrapped"
      className="fixed inset-x-0 top-0 bottom-[var(--nav-clearance)] z-10 flex flex-col items-center justify-start overflow-y-auto bg-background text-foreground px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8"
    >
      <div className="flex w-full max-w-[380px] gap-1 mb-3">
        {slides.map((s, j) => (
          <span
            key={s.key}
            className={`h-1 flex-1 rounded-full ${j <= i ? "bg-foreground" : "bg-muted"}`}
          />
        ))}
      </div>
      <div
        className="relative w-full max-w-[380px]"
        onTouchStart={(e) => {
          touch.current = e.touches[0]?.clientX ?? 0;
        }}
        onTouchEnd={(e) => {
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touch.current;
          if (dx < -40) setI(Math.min(slides.length - 1, i + 1));
          if (dx > 40) setI(Math.max(0, i - 1));
        }}
      >
        <div
          ref={slideRef}
          key={slide.key}
          className={`wrapped-slide aspect-[9/16] w-full overflow-hidden rounded-[1.75rem] ${slide.bg} text-background flex flex-col p-7`}
        >
          <p className="text-xs font-extrabold tracking-widest opacity-90">{slide.eyebrow}</p>
          <h2 className="font-display text-4xl font-extrabold leading-[1.05] mt-3">
            {slide.title}
          </h2>
          <div className="flex-1 grid place-items-center min-h-0">
            {slide.photo ? (
              <img
                src={slide.photo}
                crossOrigin="anonymous"
                alt="Top photo"
                className="max-h-full w-full object-cover rounded-2xl"
              />
            ) : slide.people?.length ? (
              <div className="space-y-5 w-full">
                {slide.people.map((p) => {
                  const c = cards.find((x) => x.user_id === p.id);
                  return (
                    <div key={p.id} className="flex flex-col items-center text-center">
                      <Avatar
                        url={c?.avatarUrl}
                        name={nameOf(cards, members, p.id)}
                        className="h-28 w-28 ring-4 ring-background"
                      />
                      <p className="font-display text-2xl font-extrabold mt-3">
                        {nameOf(cards, members, p.id)}
                      </p>
                      <p className="font-bold opacity-90">{p.line}</p>
                    </div>
                  );
                })}
              </div>
            ) : slide.big ? (
              <p className="font-display text-[7rem] font-extrabold leading-none">{slide.big}</p>
            ) : (
              <p className="text-6xl">✳</p>
            )}
          </div>
          {slide.sub && <p className="font-bold text-lg leading-snug">{slide.sub}</p>}
          <p className="mt-4 font-display font-extrabold text-lg">
            Trip<span className="opacity-80">Junkies</span> ✳
          </p>
        </div>
        <button
          type="button"
          aria-label="Previous slide"
          className="absolute left-0 top-0 h-full w-1/3"
          onClick={() => setI(Math.max(0, i - 1))}
        />
        <button
          type="button"
          aria-label="Next slide"
          className="absolute right-0 top-0 h-full w-1/3"
          onClick={() => setI(Math.min(slides.length - 1, i + 1))}
        />
      </div>
      {trip.myRole === "captain" &&
        !trip.is_sandbox &&
        (trip.kind === "trip" || trip.kind === "at_home") &&
        (Boolean(trip.ended_at) || tripToday(tripTz(trip)) > trip.end_date) && (
          <div className="w-full max-w-[380px]">
            <PreviewShareToggle tripId={trip.id} />
          </div>
        )}
      {saveError && (
        <p role="alert" className="text-foreground text-xs mt-2">
          {saveError}
        </p>
      )}
      <div className="flex w-full max-w-[380px] items-center gap-2 mt-4">
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground"
          aria-label="Previous"
          disabled={i === 0}
          onClick={() => setI(i - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button variant="playful" className="flex-1" disabled={saving} onClick={() => void save()}>
          <Download /> {saving ? "Saving…" : "Save image"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground"
          aria-label="Next"
          disabled={i >= slides.length - 1}
          onClick={() => setI(i + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-foreground"
          aria-label="Close"
          onClick={() => void closeWrapped()}
        >
          <X />
        </Button>
      </div>
      <div className="w-full max-w-[380px] mt-4 grid gap-2">
        <Button
          variant="outline"
          className="min-h-11 w-full rounded-full"
          disabled={!onPlanTrip}
          title={!onPlanTrip ? "Trip Captains must be 21 or older" : undefined}
          onClick={onPlanTrip}
        >
          <Plane size={18} /> Start your next trip
        </Button>
        <Button
          variant="outline"
          className="min-h-11 w-full rounded-full whitespace-normal h-auto py-3"
          disabled={!onAtHome}
          onClick={onAtHome}
        >
          Try an At Home night while you plan
        </Button>
        <Button
          variant="playful"
          className="min-h-11 w-full rounded-full"
          disabled={saving}
          onClick={() => void save()}
        >
          <Download size={18} /> Share your Wrapped
        </Button>
      </div>
    </div>
  );
}
