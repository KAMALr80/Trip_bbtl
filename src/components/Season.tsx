import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Eye, Plus, Settings2, Shuffle, Trophy, Vote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hapticTap } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/PlayerCards";
import { CaptainCrown } from "@/components/CaptainCrown";
import { StampBadge } from "@/components/StampBadge";
import { useLook, type LookKey } from "@/lib/look";
import { tripDisplayName } from "@/lib/trip-display-name";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { Tables } from "@/integrations/supabase/types";

type Night = Tables<"game_nights">;
type Game = Tables<"game_catalog">;
type Card = Tables<"game_cards">;
type LiveVote = Tables<"live_votes">;
type Score = Tables<"game_scores">;
type Settings = { here_stamps: number; win_stamps: number; host_stamps: number };
type Option = { label: string; user_id?: string };
type Rpc = () => PromiseLike<{ error: { message: string } | null }>;

const barColors = ["bg-primary", "bg-green", "bg-orange", "bg-blue"];
const softs = ["bg-pink-soft", "bg-green-soft", "bg-orange-soft", "bg-blue-soft"];
const field = "w-full h-12 rounded-xl bg-card border-2 border-border px-3 text-foreground";
const defaults: Settings = { here_stamps: 1, win_stamps: 3, host_stamps: 1 };
export const GUESSING_GAMES = [1, 3, 5, 11];
export const AGE_GAME = 2;

const optionsOf = (v: LiveVote): Option[] =>
  Array.isArray(v.options) ? (v.options as Option[]) : [];
const resultsOf = (v: LiveVote): number[] =>
  Array.isArray(v.results) ? (v.results as number[]) : [];
const isLeader = (trip: TripWithRole) => trip.myRole === "captain" || trip.myRole === "co_captain";
export const currentWeek = (nights: Night[]) =>
  [...nights]
    .reverse()
    .find((n) => new Date(n.starts_at).getTime() <= Date.now() + 12 * 3600 * 1000);

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
export const weekWinners = (scores: Score[], week: number) =>
  scores.filter((r) => r.week_number === week && r.won).map((r) => r.user_id);

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

/* ---------- live votes ---------- */
type Kind = "most_likely" | "would_you_rather" | "custom";
export function LiveVotes({
  trip,
  members,
  cards,
  userId,
  season,
  games,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  season: ReturnType<typeof useSeason>;
  games: Game[];
}) {
  const { votes, mine, nights, refresh, setError } = season;
  const week = currentWeek(nights);
  const canPost = isLeader(trip) || week?.host_id === userId;
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState<Kind>("most_likely"),
    [prompt, setPrompt] = useState(""),
    [opts, setOpts] = useState(["", ""]),
    [busy, setBusy] = useState(false);
  async function act(run: Rpc) {
    setBusy(true);
    setError("");
    try {
      const r = await run();
      if (r.error) throw r.error;
      await refresh();
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function randomPrompt() {
    const cat =
      kind === "would_you_rather"
        ? "would-you-rather"
        : kind === "most_likely"
          ? "most-likely"
          : "get-to-know";
    const { data, error } = await supabase.rpc("game_card_view", {
      p_trip: trip.id,
      p_category: cat,
    });
    if (error) {
      setError(friendlyError(error));
      return;
    }
    const pool = data ?? [];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return;
    if (kind === "would_you_rather") {
      const body = pick.prompt.replace(/^would you rather\s*/i, "").replace(/\?$/, "");
      const parts = body.split(/\s+or\s+/i);
      setPrompt("Would you rather…");
      setOpts(parts.length >= 2 ? [parts[0]!, parts.slice(1).join(" or ")] : [body, ""]);
    } else setPrompt(pick.prompt);
  }
  const optionList = kind === "would_you_rather" ? opts.slice(0, 2) : opts;
  const valid = prompt.trim() && (kind === "most_likely" || optionList.every((o) => o.trim()));
  async function post() {
    const ok = await act(() =>
      supabase.rpc("post_live_vote", {
        p_trip: trip.id,
        p_kind: kind,
        p_prompt: prompt.trim(),
        p_options: kind === "most_likely" ? [] : optionList.map((o) => o.trim()),
        p_week: week?.week_number ?? (null as unknown as number),
      }),
    );
    if (ok) {
      setOpen(false);
      setPrompt("");
      setOpts(["", ""]);
    }
  }
  const live = votes.filter((v) => v.status === "open");
  const history = votes.filter((v) => v.status === "revealed");
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-extrabold">Live votes 🗳️</h2>
        {canPost && (
          <Button variant="playful" size="sm" onClick={() => setOpen(true)}>
            <Plus /> New vote
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground mt-1">
        Anonymous. No voting for yourself. Change your mind until the host ends voting.
      </p>
      {live.length === 0 && (
        <div className="mt-4 bg-pink-soft rounded-2xl p-5 text-center">
          <p className="text-3xl">🤫</p>
          <p className="font-display font-extrabold mt-1">No vote open right now</p>
          <p className="text-sm text-ink-soft">
            {canPost
              ? "Start one when the squad is ready."
              : "Your host will start one during the call."}
          </p>
        </div>
      )}
      <div className="space-y-4 mt-4">
        {live.map((v) => (
          <VoteCard
            key={v.id}
            vote={v}
            myOption={mine[v.id]}
            userId={userId}
            cards={cards}
            canRun={
              isLeader(trip) ||
              nights.find((n) => n.week_number === v.week_number)?.host_id === userId
            }
            busy={busy}
            onVote={(i) =>
              void act(() => supabase.rpc("cast_live_vote", { p_vote: v.id, p_option: i }))
            }
            onReveal={() => void act(() => supabase.rpc("reveal_live_vote", { p_vote: v.id }))}
          />
        ))}
      </div>
      {history.length > 0 && (
        <>
          <h3 className="font-display font-extrabold text-lg mt-8">Past votes</h3>
          <div className="mt-3 flex gap-3 overflow-x-auto snap-x pb-2 -mx-6 px-6">
            {history.map((v) => (
              <div key={v.id} className="snap-start shrink-0 w-[82%]">
                <VoteCard
                  vote={v}
                  myOption={mine[v.id]}
                  userId={userId}
                  cards={cards}
                  canRun={false}
                  busy
                  compact
                />
              </div>
            ))}
          </div>
        </>
      )}
      {open && (
        <Sheet label="New vote" onClose={() => setOpen(false)}>
          <h3 className="font-display text-2xl font-extrabold">Start a vote ✨</h3>
          <div className="grid grid-cols-3 gap-2 mt-5">
            {(
              [
                ["most_likely", "Most likely to", "🙋"],
                ["would_you_rather", "Would you rather", "🤔"],
                ["custom", "Custom", "✏️"],
              ] as const
            ).map(([k, label, emoji], i) => (
              <Button
                key={k}
                variant="outline"
                className={`h-auto min-h-16 flex-col whitespace-normal text-xs ${kind === k ? `${softs[i]} border-foreground` : "bg-card"}`}
                onClick={() => {
                  setKind(k);
                  setOpts(["", ""]);
                }}
              >
                <span className="text-xl">{emoji}</span>
                {label}
              </Button>
            ))}
          </div>
          <label className="block text-sm font-bold mt-5">
            Prompt
            <input
              className={field}
              value={prompt}
              maxLength={200}
              placeholder={
                kind === "most_likely" ? "Most likely to miss the flight…" : "Ask the squad…"
              }
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void randomPrompt()}>
            <Shuffle /> Random prompt
          </Button>
          {kind === "most_likely" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {members.map((m) => {
                const c = cards.find((x) => x.user_id === m.user_id);
                return (
                  <span
                    key={m.user_id}
                    className="flex min-w-0 max-w-full items-center gap-1.5 bg-muted rounded-full pl-1 pr-3 py-1 text-xs font-bold"
                  >
                    <Avatar
                      url={c?.avatarUrl}
                      name={c?.game_name || "Player"}
                      className="h-6 w-6"
                    />
                    <span
                      className="min-w-0 truncate"
                      title={c?.game_name || m.display_name || "Player"}
                    >
                      {c?.game_name || m.display_name || "Player"}
                    </span>
                  </span>
                );
              })}
              <p className="w-full text-xs text-muted-foreground">
                Everyone in the trip is an option.
              </p>
            </div>
          ) : (
            <div className="space-y-2 mt-3">
              {optionList.map((o, i) => (
                <input
                  key={i}
                  aria-label={`Option ${i + 1}`}
                  className={field}
                  maxLength={80}
                  value={o}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))}
                />
              ))}
              {kind === "custom" && (
                <div className="flex gap-2">
                  {opts.length < 4 && (
                    <Button variant="subtle" size="sm" onClick={() => setOpts([...opts, ""])}>
                      + Option
                    </Button>
                  )}
                  {opts.length > 2 && (
                    <Button variant="ghost" size="sm" onClick={() => setOpts(opts.slice(0, -1))}>
                      Remove last
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <Button
            variant="playful"
            className="w-full mt-6"
            disabled={busy || !valid}
            onClick={() => void post()}
          >
            <Vote /> Post vote
          </Button>
        </Sheet>
      )}
    </section>
  );
}

export function VoteCard({
  vote,
  myOption,
  userId,
  cards,
  canRun,
  busy,
  onVote,
  onReveal,
  compact,
}: {
  vote: LiveVote;
  myOption: number | undefined;
  userId: string;
  cards: PlayerWithAvatar[];
  canRun: boolean;
  busy: boolean;
  onVote?: (i: number) => void;
  onReveal?: () => void;
  compact?: boolean;
}) {
  const options = optionsOf(vote),
    results = resultsOf(vote),
    revealed = vote.status === "revealed";
  const total = results.reduce((a, b) => a + b, 0),
    top = Math.max(0, ...results);
  const label =
    {
      most_likely: "MOST LIKELY TO",
      would_you_rather: "WOULD YOU RATHER",
      custom: "SQUAD VOTE",
      best_answer: "BEST ANSWER",
    }[vote.kind] ?? "VOTE";
  return (
    <div className="app-card">
      <p className="text-[11px] font-extrabold tracking-widest text-blue">{label}</p>
      <h4 className="font-display text-xl font-extrabold mt-1">{vote.prompt}</h4>
      <div className="space-y-2 mt-4">
        {options.map((o, i) => {
          const card = o.user_id ? cards.find((c) => c.user_id === o.user_id) : undefined;
          const self = o.user_id === userId,
            chosen = myOption === i,
            count = results[i] ?? 0,
            winner = revealed && top > 0 && count === top;
          if (revealed)
            return (
              <div
                key={i}
                className={`vote-card-turn relative overflow-hidden rounded-lg bg-muted h-14 flex items-center px-3 gap-2 ${winner ? "result-winner" : "border border-border"}`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div
                  className={`absolute inset-y-0 left-0 ${barColors[i % 4]} opacity-25 vote-bar`}
                  style={{
                    width: `${total ? (count / total) * 100 : 0}%`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
                {card && (
                  <Avatar
                    url={card.avatarUrl}
                    name={o.label}
                    className="h-[34px] w-[34px] relative"
                  />
                )}
                <span className="relative font-bold text-sm flex-1 truncate">{o.label}</span>
                <span
                  className={`relative font-display font-extrabold ${winner ? "text-primary" : ""}`}
                >
                  {winner && <Trophy size={18} className="inline mr-1 text-orange" />}
                  {count}
                </span>
              </div>
            );
          return (
            <Button
              key={i}
              variant="outline"
              disabled={busy || self || compact}
              onClick={() => {
                hapticTap();
                onVote?.(i);
              }}
              className={`tap-bounce w-full h-12 justify-start gap-2 ${chosen ? "bg-green-soft border-green" : "bg-card"}`}
            >
              {card && <Avatar url={card.avatarUrl} name={o.label} className="h-8 w-8" />}
              <span className="truncate flex-1 text-left">
                {o.label}
                {self ? " (you)" : ""}
              </span>
              {chosen && <span>✓</span>}
            </Button>
          );
        })}
      </div>
      {!revealed && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="mystery-q font-display text-3xl font-extrabold text-blue">?</span>
          <span className="text-sm font-bold text-ink-soft flex-1">
            {vote.ballot_count} voted · results hidden
          </span>
          {canRun && (vote.ballot_count ?? 0) > 0 && (
            <Button variant="green" size="sm" disabled={busy} onClick={onReveal}>
              <Eye /> End voting
            </Button>
          )}
        </div>
      )}
      {!revealed && canRun && (vote.ballot_count ?? 0) === 0 && (
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground" role="status">
            Waiting for votes
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              void supabase.rpc("close_live_vote" as never, { p_vote: vote.id } as never)
            }
          >
            Close · No votes
          </Button>
        </div>
      )}
      {revealed && (
        <p className="mt-3 text-xs text-muted-foreground">
          {total ? `${total} vote${total === 1 ? "" : "s"}` : "No votes"}
        </p>
      )}
    </div>
  );
}

/* ---------- score sheet ---------- */
type Row = { here: boolean; won: boolean; guesses: string };
export function ScoreSheet({
  trip,
  members,
  cards,
  night,
  game,
  season,
  onClose,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  night: Night;
  game: Game | undefined;
  season: ReturnType<typeof useSeason>;
  onClose: () => void;
}) {
  const { scores, settings, refresh } = season;
  const mode = game
    ? GUESSING_GAMES.includes(game.number)
      ? "guess"
      : game.number === AGE_GAME
        ? "age"
        : "talk"
    : "talk";
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      members.map((m) => {
        const r = scores.find(
          (s) => s.week_number === night.week_number && s.user_id === m.user_id,
        );
        return [
          m.user_id,
          {
            here: r?.here ?? false,
            won: r?.won ?? false,
            guesses: r?.correct_guesses?.toString() ?? "",
          },
        ];
      }),
    ),
  );
  const [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const set = (id: string, patch: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id]!, ...patch } }));
  async function run(fn: Rpc, done?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fn();
      if (r.error) throw r.error;
      await refresh();
      if (done) setNote(done);
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function pickWinner() {
    const best = Math.max(0, ...members.map((m) => Number(rows[m.user_id]?.guesses) || 0));
    if (!best) {
      setError("Enter some correct guesses first");
      return;
    }
    setRows((r) =>
      Object.fromEntries(
        Object.entries(r).map(([id, row]) => [
          id,
          {
            ...row,
            won: (Number(row.guesses) || 0) === best,
            here: row.here || (Number(row.guesses) || 0) > 0,
          },
        ]),
      ),
    );
  }
  const save = () =>
    run(() =>
      supabase.rpc("save_game_scores", {
        p_trip: trip.id,
        p_week: night.week_number,
        p_rows: members.map((m) => ({
          user_id: m.user_id,
          here: rows[m.user_id]!.here,
          won: rows[m.user_id]!.won,
          correct_guesses:
            rows[m.user_id]!.guesses === "" ? null : Number(rows[m.user_id]!.guesses),
        })),
      }),
    ).then((ok) => ok && onClose());
  return (
    <Sheet label={`Score week ${night.week_number}`} onClose={onClose}>
      <p className="text-xs font-extrabold text-green">WEEK {night.week_number}</p>
      <h3 className="font-display text-2xl font-extrabold">Score sheet 📒</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {game?.name ?? "Game night"} · Here {settings.here_stamps} · Won {settings.win_stamps} ·
        Host bonus {settings.host_stamps}
      </p>
      {mode === "age" && (
        <div className="mt-4 bg-orange-soft rounded-2xl p-4">
          <p className="font-bold text-sm">
            Guess the Age: enter the real age and the closest guess wins.
          </p>
          <div className="flex gap-2 mt-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={120}
              aria-label="Real age"
              className={field}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Real age"
            />
            <Button
              variant="playful"
              disabled={busy || answer === ""}
              onClick={() =>
                void run(
                  () =>
                    supabase.rpc("resolve_age_guesses", {
                      p_trip: trip.id,
                      p_week: night.week_number,
                      p_answer: Number(answer),
                    }),
                  "Winner picked! 🏆",
                ).then(() => setRows((r) => r))
              }
            >
              Pick
            </Button>
          </div>
        </div>
      )}
      {mode === "talk" && (
        <div className="mt-4 bg-blue-soft rounded-2xl p-4">
          <p className="font-bold text-sm">Talking game: let the squad vote for the best answer.</p>
          <Button
            variant="green"
            size="sm"
            className="mt-2"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  supabase.rpc("post_live_vote", {
                    p_trip: trip.id,
                    p_kind: "best_answer",
                    p_prompt: `Best answer: ${game?.name ?? "this week"} 🏆`,
                    p_options: [],
                    p_week: night.week_number,
                  }),
                "Vote is live in Play! Winners are scored on reveal.",
              )
            }
          >
            <Vote /> Start best answer vote
          </Button>
        </div>
      )}
      {mode === "guess" && (
        <Button variant="subtle" size="sm" className="mt-4" onClick={pickWinner}>
          <Trophy /> Pick winner from guesses
        </Button>
      )}
      {note && (
        <p role="status" className="mt-3 text-sm font-bold text-green">
          {note}
        </p>
      )}
      <div className="mt-4 space-y-2">
        {members.map((m) => {
          const c = cards.find((x) => x.user_id === m.user_id),
            row = rows[m.user_id]!;
          return (
            <div key={m.user_id} className="flex items-center gap-2 bg-muted/50 rounded-xl p-2">
              <Avatar url={c?.avatarUrl} name={c?.game_name || "Player"} className="h-9 w-9" />
              <span className="flex-1 min-w-0 truncate text-sm font-bold">
                {c?.game_name || m.display_name || "Player"}
                {night.host_id === m.user_id && " 🎤"}
              </span>
              {mode === "guess" && (
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-label="Correct guesses"
                  className="w-14 h-10 rounded-lg border-2 border-border bg-card text-center"
                  value={row.guesses}
                  onChange={(e) => set(m.user_id, { guesses: e.target.value })}
                />
              )}
              <Button
                size="sm"
                variant="outline"
                aria-pressed={row.here}
                className={`tap-bounce ${row.here ? "bg-green-soft border-green" : "bg-card"}`}
                onClick={() => set(m.user_id, { here: !row.here })}
              >
                Here
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={row.won}
                className={`tap-bounce ${row.won ? "bg-orange-soft border-orange" : "bg-card"}`}
                onClick={() => set(m.user_id, { won: !row.won, here: row.here || !row.won })}
              >
                Won
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        Ties all win. Hosting earns the bonus automatically when the host is marked Here.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
      <Button variant="playful" className="w-full mt-5" disabled={busy} onClick={() => void save()}>
        Save scores
      </Button>
    </Sheet>
  );
}

export function AgeGuess({
  trip,
  week,
  userId,
}: {
  trip: TripWithRole;
  week: number;
  userId: string;
}) {
  const [guess, setGuess] = useState(""),
    [saved, setSaved] = useState<number | null>(null),
    [err, setErr] = useState("");
  useEffect(() => {
    void supabase
      .from("age_guesses")
      .select("guess")
      .eq("trip_id", trip.id)
      .eq("week_number", week)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSaved(Number(data.guess));
          setGuess(String(data.guess));
        }
      });
  }, [trip.id, week, userId]);
  async function submit() {
    setErr("");
    const { error } = await supabase
      .from("age_guesses")
      .upsert({ trip_id: trip.id, week_number: week, user_id: userId, guess: Number(guess) });
    if (error) setErr(friendlyError(error));
    else setSaved(Number(guess));
  }
  return (
    <div className="mt-4 bg-orange-soft rounded-2xl p-4">
      <p className="font-display font-extrabold">Your age guess 👶</p>
      <div className="flex gap-2 mt-2">
        <input
          type="number"
          min={0}
          max={120}
          inputMode="decimal"
          aria-label="Your guess"
          className={field}
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
        />
        <Button variant="playful" disabled={guess === ""} onClick={() => void submit()}>
          {saved === null ? "Lock in" : "Update"}
        </Button>
      </div>
      {saved !== null && (
        <p className="text-xs mt-2 text-ink-soft">Locked in: {saved}. Closest guess wins!</p>
      )}
      {err && (
        <p role="alert" className="text-xs text-destructive mt-1">
          {err}
        </p>
      )}
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
  lookKey = "squad",
}: {
  lookKey?: LookKey;
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  season: ReturnType<typeof useSeason>;
  compact?: boolean;
  onMember?: ((id: string) => void) | undefined;
  expanded?: boolean;
}) {
  const cinematic = useLook(lookKey) === "cinematic" && !compact;
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
    <section className={`mt-8 ${cinematic ? "cinematic-leaderboard" : ""}`}>
      <StampThunk total={me?.stamps ?? 0} />
      {cinematic && (
        <div className="cinematic-season-heading">
          <p className="eyebrow text-gold">PRE-FLIGHT · {tripDisplayName(trip.name)}</p>
          <h2 className="font-display text-3xl font-extrabold mt-1">Your squad</h2>
        </div>
      )}
      <div className="flex items-center justify-between">
        {!cinematic && <h2 className="font-display text-2xl font-extrabold">Pre-Flight 🏆</h2>}
        {trip.myRole === "captain" && !compact && (
          <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
            <Settings2 /> Stamp values
          </Button>
        )}
      </div>
      {cinematic && table.length > 0 && (
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
          {(cinematic
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
                className={`flex items-center gap-3 rounded-2xl p-3 ${cinematic && i >= 5 && s.user_id !== userId ? "cinematic-extra-row" : ""} ${onMember ? "cursor-pointer hover:border-primary" : ""} ${!cinematic && i === 0 && s.stamps > 0 ? "bg-orange-soft" : "bg-card border border-border"} ${s.user_id === userId ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-display font-extrabold w-6 text-center">
                  {cinematic ? table.indexOf(s) + 1 : i + 1}
                </span>
                <span className="relative">
                  {!cinematic && i === 0 && s.stamps > 0 && (
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
                  {cinematic &&
                    members.some((m) => m.user_id === s.user_id && m.role === "captain") && (
                      <CaptainCrown badge />
                    )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{c?.game_name || "Player"}</span>
                  <StampBadge tripId={trip.id} userId={s.user_id} />
                  <span className="block text-xs text-ink-soft">
                    {cinematic
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
          {cinematic && table.length > 8 && (
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
          {!cinematic && rows.length > 3 && (
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
        {cinematic ? "How scoring works ›" : "ⓘ How scoring works"}
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
    [
      "🛂 Stamps",
      "You still earn stamps for showing up, winning, hosting and Question of the Week.",
    ],
    [
      "💯 Score out of 100",
      "Your stamps ÷ the most you could have earned on nights played so far. Short and long seasons are equally fair.",
    ],
    [
      "🎤 Missed hosting",
      "−5 points, or −8 if the Captain misses their own night. Only if the host hasn't tapped “I'm here” 15 minutes after start. Never on skipped nights.",
    ],
    [
      "🎟️ Passes",
      "Players keep their skip passes. The Captain gets 2 passes (seasons up to 8 nights) or 3 (9–12) for nights they host — no penalty, and that night doesn't count against them.",
    ],
    ["🤝 Ties", "More nights attended wins. Still tied? Spin the wheel."],
    ["🧭 Trip-day games", "Their own leaderboard, scored out of 100 the same way."],
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

export function HomeSeason(props: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
}) {
  const season = useSeason(props.trip.id);
  return <Leaderboard {...props} season={season} compact />;
}
