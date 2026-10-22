import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hapticTap } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/PlayerCards";
import { CaptainCrown } from "@/components/CaptainCrown";
import { StampBadge } from "@/components/StampBadge";
import { tripDisplayName } from "@/lib/trip-display-name";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { Tables } from "@/integrations/supabase/types";

type Night = Tables<"game_nights">;
type LiveVote = Tables<"live_votes">;
type Score = Tables<"game_scores">;
type Settings = { here_stamps: number; win_stamps: number; host_stamps: number };

const barColors = ["bg-primary", "bg-green", "bg-orange", "bg-blue"];
const field = "w-full h-12 rounded-xl bg-card border-2 border-border px-3 text-foreground";
const defaults: Settings = { here_stamps: 1, win_stamps: 3, host_stamps: 1 };

/* ---------- shared data ---------- */
export function useSeason(tripId: string, key = "main") {
  const [votes, setVotes] = useState<LiveVote[]>([]),
    [mine, setMine] = useState<Record<string, number>>({}),
    [scores, setScores] = useState<Score[]>([]),
    [settings, setSettings] = useState<Settings>(defaults),
    [nights, setNights] = useState<Night[]>([]),
    [qotw, setQotw] = useState<Qotw>({ total: 0, by: {} }),
    [error, setError] = useState("");
  const refresh = async () => {
    const [v, b, s, st, n] = await Promise.all([
      supabase
        .from("live_votes")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("live_vote_ballots").select("vote_id,option_index"),
      supabase.from("game_scores").select("*").eq("trip_id", tripId),
      supabase
        .from("stamp_settings")
        .select("here_stamps,win_stamps,host_stamps")
        .eq("trip_id", tripId)
        .maybeSingle(),
      supabase.from("game_nights").select("*").eq("trip_id", tripId).order("week_number"),
    ]);
    const [qs, qa] = await Promise.all([
      supabase.rpc("weekly_question_status", { p_trip: tripId }),
      supabase.from("weekly_answers").select("week_number,user_id").eq("trip_id", tripId),
    ]);
    const rev = (qs.data ?? []).filter((q) => q.revealed_at);
    const revealed = new Set(rev.map((q) => q.week_number));
    const by: Record<string, number> = {};
    for (const a of qa.data ?? [])
      if (revealed.has(a.week_number)) by[a.user_id] = (by[a.user_id] ?? 0) + 1;
    for (const q of rev)
      if (
        q.winner_id &&
        (qa.data ?? []).some((a) => a.week_number === q.week_number && a.user_id === q.winner_id)
      )
        by[q.winner_id] = (by[q.winner_id] ?? 0) + 2;
    const [tm, hp] = await Promise.all([
      supabase
        .from("trip_members")
        .select("user_id,start_stamps,joined_week,season_closed")
        .eq("trip_id", tripId)
        .eq("status", "approved"),
      (
        supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                k: string,
                v: string,
              ) => PromiseLike<{
                data: { user_id: string; stamps: number; week_number?: number }[] | null;
              }>;
            };
          };
        }
      )
        .from("host_penalties")
        .select("user_id,stamps,week_number")
        .eq("trip_id", tripId),
    ]);
    const { data: skippedRows } = await supabase
      .from("game_nights")
      .select("week_number")
      .eq("trip_id", tripId)
      .eq("skipped", true);
    const skippedWeeks = new Set((skippedRows ?? []).map((r) => r.week_number));
    const start: Record<string, number> = {},
      joined: Record<string, number> = {},
      pen: Record<string, number> = {};
    const closed: string[] = [];
    for (const m of (tm.data ?? []) as {
      user_id: string;
      start_stamps: number;
      joined_week: number | null;
      season_closed?: boolean;
    }[]) {
      if (m.season_closed) closed.push(m.user_id);
      if (m.start_stamps) start[m.user_id] = m.start_stamps;
      if (m.joined_week) joined[m.user_id] = m.joined_week;
    }
    for (const p of (hp.data ?? []) as { user_id: string; stamps: number; week_number?: number }[])
      if (!skippedWeeks.has(p.week_number ?? -1)) pen[p.user_id] = (pen[p.user_id] ?? 0) + p.stamps;
    const { data: capRows } = await supabase
      .from("skip_passes")
      .select("user_id,ref")
      .eq("trip_id", tripId)
      .eq("kind", "captain");
    const excused = (capRows ?? []).map((r) => `${r.user_id}|${r.ref}`);
    for (const p of (hp.data ?? []) as { user_id: string; stamps: number; week_number?: number }[])
      if (
        !skippedWeeks.has(p.week_number ?? -1) &&
        excused.includes(`${p.user_id}|${p.week_number}`)
      )
        pen[p.user_id] = (pen[p.user_id] ?? 0) - p.stamps;
    const total = rev.reduce((t, q) => t + (q.week_number >= 1000 ? 1 : 3), 0);
    // Released Secret Mission bonus (server-capped at 12) — mirrors trip_private.mission_bonus in game_board.
    const mb = await (
      supabase as unknown as {
        rpc: (
          f: string,
          a: object,
        ) => PromiseLike<{ data: { user_id: string; points: number }[] | null }>;
      }
    ).rpc("mission_bonus", { p_trip: tripId });
    const bonus: Record<string, number> = {};
    for (const r of mb.data ?? []) bonus[r.user_id] = Number(r.points) || 0;
    setQotw({ total, by, start, joined, closed, pen, excused, bonus });
    const failure = [v, b, s, st, n].find((r) => r.error)?.error;
    if (failure) {
      setError(friendlyError(failure));
      return;
    }
    setVotes(v.data ?? []);
    setMine(Object.fromEntries((b.data ?? []).map((x) => [x.vote_id, x.option_index])));
    setScores(s.data ?? []);
    setSettings(st.data ?? defaults);
    setNights(n.data ?? []);
  };
  useEffect(() => {
    void refresh();
    const ch = supabase.channel(`season-${tripId}-${key}-${Math.random()}`);
    for (const table of [
      "live_votes",
      "game_scores",
      "stamp_settings",
      "game_nights",
      "weekly_answers",
    ])
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `trip_id=eq.${tripId}` },
        () => void refresh(),
      );
    ch.subscribe();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(ch);
    };
  }, [tripId]);
  return { votes, mine, scores, settings, nights, qotw, error, setError, refresh };
}

export type Standing = {
  user_id: string;
  stamps: number;
  max: number;
  score: number;
  wins: number;
  pen: number;
  attended: number;
};
export type Qotw = {
  total: number;
  by: Record<string, number>;
  start?: Record<string, number>;
  joined?: Record<string, number>;
  closed?: string[];
  pen?: Record<string, number>;
  excused?: string[];
  bonus?: Record<string, number>;
};
/** Season score out of 100 — mirrors trip_private.game_board / finalize_season. */
export const scoreOf = (stamps: number, max: number, pen = 0) =>
  Math.min(100, Math.max(0, (max ? Math.round((stamps / max) * 100) : 0) - pen));
export const scoringOn = (trip: { season_scoring?: boolean | null }) =>
  trip.season_scoring !== false;
export function standings(
  members: Member[],
  nights: Night[],
  scores: Score[],
  s: Settings,
  q: Qotw = { total: 0, by: {} },
): Standing[] {
  const done = nights.filter((n) => !n.skipped && new Date(n.starts_at).getTime() <= Date.now());
  return members
    .filter((m) => !q.closed?.includes(m.user_id))
    .map((m) => {
      let stamps = (q.by[m.user_id] ?? 0) + (q.start?.[m.user_id] ?? 0),
        max = q.total,
        wins = 0,
        attended = 0;
      for (const n of done) {
        if (q.excused?.includes(`${m.user_id}|${n.week_number}`)) continue; // Captain pass: night excused
        const hosting = n.host_id === m.user_id;
        max += s.here_stamps + s.win_stamps + (hosting ? s.host_stamps : 0);
        const row = scores.find((r) => r.week_number === n.week_number && r.user_id === m.user_id);
        if (!row) continue;
        if (row.here) attended++;
        if (row.here) stamps += s.here_stamps + (hosting ? s.host_stamps : 0);
        if (row.won) {
          stamps += s.win_stamps;
          wins++;
        }
      }
      const pen = Math.max(0, q.pen?.[m.user_id] ?? 0); // missed hosting: -5 points (Captain -8), in score points
      return {
        user_id: m.user_id,
        stamps,
        max,
        wins,
        pen,
        attended,
        score: scoreOf(stamps, max, pen - (q.bonus?.[m.user_id] ?? 0)),
      };
    })
    .sort((a, b) => b.score - a.score || b.attended - a.attended || b.stamps - a.stamps);
}
/* ---------- fun effects ---------- */
export function Confetti({ burst }: { burst: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!burst || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 1200);
    return () => window.clearTimeout(t);
  }, [burst]);
  const bits = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: 35 + Math.random() * 30,
        delay: Math.random() * 0.12,
        dur: 0.85 + Math.random() * 0.3,
        rot: Math.random() * 360,
        color: barColors[i % 4],
      })),
    [burst],
  );
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className={`confetti-bit absolute -top-4 h-3 w-2 rounded-sm ${b.color}`}
          style={{
            left: `${b.left}%`,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            rotate: `${b.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}

export function StampThunk({ total }: { total: number }) {
  const prev = useRef<number | null>(null),
    [gain, setGain] = useState(0),
    [key, setKey] = useState(0);
  useEffect(() => {
    if (prev.current !== null && total > prev.current) {
      setGain(total - prev.current);
      setKey((k) => k + 1);
      hapticTap();
    }
    prev.current = total;
  }, [total]);
  useEffect(() => {
    if (!key) return;
    const t = window.setTimeout(() => setGain(0), 850);
    return () => window.clearTimeout(t);
  }, [key]);
  if (!gain) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[60] grid place-items-center"
    >
      <div
        key={key}
        className="stamp-thunk passport-stamp bg-card px-7 py-5 text-center text-primary shadow-soft"
      >
        <p className="font-display text-5xl font-extrabold">+{gain}</p>
        <p className="text-xs font-extrabold tracking-widest">
          STAMP{gain === 1 ? "" : "S"} COLLECTED
        </p>
      </div>
    </div>
  );
}

function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative bg-card rounded-t-3xl w-full max-w-lg p-6 pb-10 max-h-[88dvh] overflow-y-auto animate-slide-up"
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
        {children}
      </div>
    </div>
  );
}

/* ---------- leaderboard ---------- */
export function Leaderboard({
  trip,
  members,
  cards,
  userId,
  season,
  compact,
  onMember,
  expanded = false,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  season: ReturnType<typeof useSeason>;
  compact?: boolean;
  onMember?: ((id: string) => void) | undefined;
  expanded?: boolean;
}) {
  const full = !compact;
  const { scores, settings, nights, qotw, refresh } = season;
  const table = standings(members, nights, scores, settings, qotw);
  const me = table.find((s) => s.user_id === userId);
  const [edit, setEdit] = useState(false),
    [vals, setVals] = useState(settings),
    [err, setErr] = useState("");
  useEffect(() => setVals(settings), [settings]);
  const rows = compact ? table.slice(0, 5) : table;
  const [allRows, setAllRows] = useState(false);
  useEffect(() => {
    try {
      setAllRows(localStorage.getItem(`board-game-${trip.id}`) === "true");
    } catch {
      /* storage unavailable */
    }
  }, [trip.id]);
  const [how, setHow] = useState(false);
  if (!scoringOn(trip)) return null;
  return (
    <section className={`mt-8 ${full ? "cinematic-leaderboard" : ""}`}>
      <StampThunk total={me?.stamps ?? 0} />
      {full && (
        <div className="cinematic-season-heading">
          <p className="eyebrow text-gold">PRE-FLIGHT · {tripDisplayName(trip.name)}</p>
          <h2 className="font-display text-3xl font-extrabold mt-1">Your squad</h2>
        </div>
      )}
      <div className="flex items-center justify-between">
        {!full && <h2 className="font-display text-2xl font-extrabold">Pre-Flight 🏆</h2>}
        {trip.myRole === "captain" && !compact && (
          <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
            <Settings2 /> Stamp values
          </Button>
        )}
      </div>
      {full && table.length > 0 && (
        <div className="cinematic-podium">
          {table.slice(0, 3).map((s, i) => {
            const c = cards.find((x) => x.user_id === s.user_id);
            return (
              <Button
                variant="ghost"
                key={s.user_id}
                className="cinematic-podium-place"
                onClick={() => onMember?.(s.user_id)}
                disabled={!onMember}
              >
                <span className="cinematic-podium-avatar">
                  {members.some((m) => m.user_id === s.user_id && m.role === "captain") && (
                    <CaptainCrown badge />
                  )}
                  {i === 0 && <Crown size={18} className="cinematic-podium-crown" />}
                  <Avatar url={c?.avatarUrl} name={c?.game_name || "Player"} className="size-12" />
                </span>
                <strong className="truncate max-w-full">{c?.game_name || "Player"}</strong>
                <small>
                  {i + 1}
                  {i === 0 ? "st" : i === 1 ? "nd" : "rd"} · {s.score}
                </small>
              </Button>
            );
          })}
        </div>
      )}
      {nights.length === 0 ? (
        <div className="mt-3 bg-green-soft rounded-2xl p-5 text-center">
          <p className="text-3xl">🛂</p>
          <p className="font-display font-extrabold">The season hasn't started</p>
          <p className="text-sm text-ink-soft">Stamps roll in after the first game night.</p>
        </div>
      ) : (
        <ol className="mt-3 space-y-2">
          {(full
            ? [
                ...table.slice(3, 8),
                ...table.slice(8).filter((s) => s.user_id === userId),
                ...(allRows || expanded
                  ? table
                      .slice(3)
                      .filter((s) => !table.slice(3, 8).includes(s) && s.user_id !== userId)
                  : []),
              ]
            : rows.length > 3 && !allRows
              ? rows.slice(0, 3)
              : rows
          ).map((s, i) => {
            const c = cards.find((x) => x.user_id === s.user_id);
            return (
              <li
                key={s.user_id}
                role={onMember ? "button" : undefined}
                tabIndex={onMember ? 0 : undefined}
                aria-label={onMember ? "Open player card" : undefined}
                onClick={onMember ? () => onMember(s.user_id) : undefined}
                onKeyDown={
                  onMember
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onMember(s.user_id);
                        }
                      }
                    : undefined
                }
                className={`flex items-center gap-3 rounded-2xl p-3 ${full && i >= 5 && s.user_id !== userId ? "cinematic-extra-row" : ""} ${onMember ? "cursor-pointer hover:border-primary" : ""} ${!full && i === 0 && s.stamps > 0 ? "bg-orange-soft" : "bg-card border border-border"} ${s.user_id === userId ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-display font-extrabold w-6 text-center">
                  {full ? table.indexOf(s) + 1 : i + 1}
                </span>
                <span className="relative">
                  {!full && i === 0 && s.stamps > 0 && (
                    <Crown
                      size={20}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 text-orange fill-orange"
                    />
                  )}
                  <Avatar
                    url={c?.avatarUrl}
                    name={c?.game_name || "Player"}
                    className="h-11 w-11"
                  />
                  {full && members.some((m) => m.user_id === s.user_id && m.role === "captain") && (
                    <CaptainCrown badge />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{c?.game_name || "Player"}</span>
                  <StampBadge tripId={trip.id} userId={s.user_id} />
                  <span className="block text-xs text-ink-soft">
                    {full
                      ? `${s.attended} nights played`
                      : `🛂 ${s.stamps} stamps · ${s.wins} win${s.wins === 1 ? "" : "s"}`}
                    {s.pen ? ` · −${s.pen} missed hosting` : ""}
                  </span>
                  {qotw.joined?.[s.user_id] && (
                    <span className="ml-1 neon-chip text-[10px] px-1.5 py-0.5 rounded-full bg-blue-soft font-extrabold">
                      Joined Week {qotw.joined[s.user_id]}
                    </span>
                  )}
                </span>
                <span className="passport-stamp bg-card px-2 py-1 font-display font-extrabold text-lg text-green">
                  {s.score}
                  <span className="text-[10px] text-muted-foreground">/100</span>
                </span>
              </li>
            );
          })}
          {full && table.length > 8 && (
            <li>
              <Button
                variant="ghost"
                className="w-full"
                aria-expanded={allRows}
                onClick={() => setAllRows(!allRows)}
              >
                {allRows ? "See less" : `See all (${table.length})`}
              </Button>
            </li>
          )}
          {!full && rows.length > 3 && (
            <li>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setAllRows(!allRows);
                  safeSetItem(`board-game-${trip.id}`, String(!allRows));
                }}
              >
                {allRows ? "Show less" : `Show all (${rows.length})`}
              </Button>
            </li>
          )}
        </ol>
      )}
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => setHow(true)}>
        {full ? "How scoring works ›" : "ⓘ How scoring works"}
      </Button>
      {how && <ScoringSheet onClose={() => setHow(false)} />}
      {edit && (
        <Sheet label="Stamp values" onClose={() => setEdit(false)}>
          <h3 className="font-display text-2xl font-extrabold">Stamp values 🛂</h3>
          {(
            [
              ["here_stamps", "Here"],
              ["win_stamps", "Won"],
              ["host_stamps", "Hosting bonus"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="block text-sm font-bold mt-4">
              {label}
              <input
                type="number"
                min={0}
                max={10}
                className={field}
                value={vals[k]}
                onChange={(e) => setVals({ ...vals, [k]: Number(e.target.value) })}
              />
            </label>
          ))}
          {err && (
            <p role="alert" className="text-sm text-destructive mt-2">
              {err}
            </p>
          )}
          <Button
            variant="playful"
            className="w-full mt-6"
            onClick={async () => {
              const { error } = await supabase.rpc("set_stamp_values", {
                p_trip: trip.id,
                p_here: vals.here_stamps,
                p_win: vals.win_stamps,
                p_host: vals.host_stamps,
              });
              if (error) setErr(friendlyError(error));
              else {
                await refresh();
                setEdit(false);
              }
            }}
          >
            Save
          </Button>
        </Sheet>
      )}
    </section>
  );
}

export function ScoringSheet({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["🛂 Stamps", "You earn stamps for showing up and winning."],
    [
      "💯 Score out of 100",
      "Your stamps ÷ the most you could have earned so far. Short and long seasons are equally fair.",
    ],
    ["🤝 Ties", "More nights attended wins. Still tied? Spin the wheel."],
  ];
  return (
    <Sheet label="How scoring works" onClose={onClose}>
      <h3 className="font-display text-2xl font-extrabold">How scoring works</h3>
      <div className="mt-4 space-y-3">
        {rows.map(([t, d]) => (
          <div key={t} className="app-card !p-4">
            <p className="font-display font-extrabold">{t}</p>
            <p className="text-sm text-ink-soft mt-1">{d}</p>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
