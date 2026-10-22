import { tripDisplayName } from "@/lib/trip-display-name";
import { confirmInApp } from "@/lib/confirm";
import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { fmtWhen } from "@/lib/viewer-time";

import { TieWheel } from "@/components/TieWheel";
import { useEffect, useRef, useState } from "react";
import {
  Crown,
  Download,
  Flag,
  Trash2,
  X,
  Plane,
  Palmtree,
  BriefcaseBusiness,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarButton } from "@/components/PlayerCards";
import { Confetti, Leaderboard, scoringOn, standings, useSeason } from "@/components/Season";
import { TripSeasonBoard, tripHasStarted } from "@/components/TripSeasonBoard";
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
    [tripRows, setTripRows] = useState<SeasonRow[]>([]);
  const refresh = async () => {
    const [i, c, ts] = await Promise.all([
      db.rpc("season_info", { p_trip: tripId }),
      db
        .from("season_champions")
        .select("season,user_id,score,stamps,tie_ids,created_at")
        .eq("trip_id", tripId)
        .in("season", ["game", "trip"]),
      supabase.rpc("trip_season_score", { p_trip: tripId }),
    ]);
    setInfo(i.data ?? []);
    setChamps(c.data ?? []);
    setTripRows(ts.data ?? []);
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(timer);
  }, [tripId]);
  return { info, champs, tripRows, refresh };
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
  const [finalNight, setFinalNight] = useState<string | null>(null);
  useEffect(() => {
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
  }, [true, trip.id]);
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
                    ? ` · ${fmtWhen(trip.season_rule !== "a2c" && s.crowning_mode === "takeoff" && finalNight ? finalNight : s.crowning_at, trip.home_timezone)}`
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
  const [itineraryDays, setItineraryDays] = useState<ItineraryDay[]>([]);
  useEffect(() => {
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
  }, [true, trip.id]);
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
