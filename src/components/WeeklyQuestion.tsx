import { friendlyError } from "@/lib/friendly-error";
import { fmtWhen } from "@/lib/viewer-time";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Pencil, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/Season";
import { hapticTap } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/PlayerCards";
import type { TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

export type Qotw = {
  week_number: number;
  prompt: string | null;
  source: string | null;
  drops_at: string;
  revealed_at: string | null;
  starts_at: string;
  answered: number;
  players: number;
  phase: string;
  read_index: number;
  winner_id: string | null;
  tie_ids: string[];
  tie_spin_at: string | null;
  votes: number;
  my_vote: number | null;
};
type AnonAnswer = {
  idx: number;
  answer: string;
  emoji: string | null;
  mine: boolean;
  user_id: string | null;
  votes: number | null;
};
export type QAnswer = {
  week_number: number;
  user_id: string;
  answer: string;
  emoji: string | null;
};
const EMOJIS = ["😂", "🔥", "😍", "🤯", "✈️", "🍜", "🌴", "💯"];
const field = "w-full rounded-xl bg-card border-2 border-border px-3 py-2 text-foreground";
const fmt = (iso: string, tz: string) => fmtWhen(iso, tz);

export function useWeeklyQuestions(tripId: string, fast = false) {
  const [list, setList] = useState<Qotw[]>([]),
    [answers, setAnswers] = useState<QAnswer[]>([]),
    [error, setError] = useState("");
  const refresh = async () => {
    const [s, a] = await Promise.all([
      supabase.rpc("weekly_question_status", { p_trip: tripId }),
      supabase
        .from("weekly_answers")
        .select("week_number,user_id,answer,emoji")
        .eq("trip_id", tripId),
    ]);
    if (s.error) {
      setError(friendlyError(s.error));
      return;
    }
    setList((s.data ?? []) as Qotw[]);
    setAnswers(a.data ?? []);
  };
  useEffect(() => {
    void refresh();
    const ch = supabase
      .channel(`qotw-${tripId}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_answers", filter: `trip_id=eq.${tripId}` },
        () => void refresh(),
      )
      .subscribe();
    const timer = window.setInterval(() => void refresh(), fast ? 3000 : 15000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(ch);
    };
  }, [tripId, fast]);
  const now = Date.now();
  const current = list.find(
    (q) =>
      !q.revealed_at &&
      new Date(q.drops_at).getTime() <= now &&
      new Date(q.starts_at).getTime() > now - 6 * 3600 * 1000,
  );
  return { list, answers, current, error, setError, refresh };
}

/** Small card for Home and Play: answer this week's question. */
export function QotwCard({
  trip,
  userId,
  viewOnly,
}: {
  trip: TripWithRole;
  userId: string;
  viewOnly?: boolean;
}) {
  const { current, answers, refresh, error, setError, list } = useWeeklyQuestions(trip.id);
  const mine = current
    ? answers.find((a) => a.week_number === current.week_number && a.user_id === userId)
    : undefined;
  const [open, setOpen] = useState(false),
    [text, setText] = useState(""),
    [emoji, setEmoji] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setText(mine?.answer ?? "");
    setEmoji(mine?.emoji ?? null);
  }, [mine?.answer, mine?.emoji]);
  const next = list.find((q) => new Date(q.drops_at).getTime() > Date.now());
  if (!current)
    return next ? (
      <section className="app-card mt-5" aria-label="Question of the Week">
        <p className="font-display font-extrabold">❓ Question of the Week</p>
        <p className="text-sm text-muted-foreground mt-1">
          Next one drops {fmt(next.drops_at, trip.home_timezone)}.
        </p>
      </section>
    ) : null;
  const locked = new Date(current.starts_at).getTime() <= Date.now();
  async function save() {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("answer_weekly_question", {
      p_trip: trip.id,
      p_week: current!.week_number,
      p_answer: text,
      p_emoji: emoji ?? "",
    });
    setBusy(false);
    if (e) {
      setError(friendlyError(e));
      return;
    }
    setOpen(false);
    await refresh();
  }
  return (
    <section className="app-card mt-5" aria-label="Question of the Week">
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <p className="font-display font-extrabold">
          ❓ Question of the Week ·{" "}
          <span className="text-green">
            {current.answered} of {current.players} answered
          </span>
        </p>
        <p className="mt-2 text-[15px] font-bold">{current.prompt}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {mine
            ? `Your answer: ${mine.emoji ?? ""} ${mine.answer}`
            : locked
              ? "Answers are locked — reveal at game night."
              : `Answer before ${fmt(current.starts_at, trip.home_timezone)} · hidden until the reveal 🤫`}
        </p>
      </button>
      {open && !locked && !viewOnly && (
        <div className="mt-3 space-y-2">
          <textarea
            className={field}
            rows={3}
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your answer…"
            aria-label="Your answer"
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Optional emoji">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={emoji === e}
                  onClick={() => setEmoji(emoji === e ? null : e)}
                  className={`h-9 w-9 rounded-full text-lg ${emoji === e ? "bg-primary" : "bg-muted"}`}
                >
                  {e}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{text.length}/200</span>
          </div>
          <Button
            variant="playful"
            className="w-full"
            disabled={busy || !text.trim()}
            onClick={() => void save()}
          >
            {mine ? "Update answer" : "Submit answer"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </section>
  );
}

/** Warm-up: host reads answers anonymously, everyone votes, names flip on reveal. */
export function QotwReveal({
  trip,
  week,
  canRun,
  players,
}: {
  trip: TripWithRole;
  week: number;
  canRun: boolean;
  players: PlayerWithAvatar[];
}) {
  const { list, refresh, error, setError } = useWeeklyQuestions(trip.id, true);
  const q = list.find((x) => x.week_number === week);
  const [rows, setRows] = useState<AnonAnswer[]>([]),
    [i, setI] = useState(0),
    [busy, setBusy] = useState(false);
  const sig = q
    ? `${q.phase}-${q.read_index}-${q.votes}-${q.revealed_at}-${q.winner_id}-${q.answered}`
    : "";
  useEffect(() => {
    if (!q || q.phase === "hidden") {
      setRows([]);
      return;
    }
    void supabase
      .rpc("qotw_answers", { p_trip: trip.id, p_week: week })
      .then(({ data }) => setRows((data ?? []) as AnonAnswer[]));
  }, [sig, trip.id, week]);
  const [winnerBurst, setWinnerBurst] = useState(0);
  const lastWinner = useRef<string | null>(q?.winner_id ?? null);
  useEffect(() => {
    if (q?.winner_id && q.winner_id !== lastWinner.current) {
      setWinnerBurst((n) => n + 1);
      lastWinner.current = q.winner_id;
    }
  }, [q?.winner_id]);
  if (!q || new Date(q.drops_at).getTime() > Date.now()) return null;
  const nameOf = (id: string | null) =>
    players.find((x) => x.user_id === id)?.game_name ?? "Player";
  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError(friendlyError(e));
    else await refresh();
  }
  const action = (a: string) =>
    act(() => supabase.rpc("qotw_action", { p_trip: trip.id, p_week: week, p_action: a }));
  const vote = (idx: number) => {
    hapticTap();
    return act(() =>
      supabase.rpc("vote_weekly_answer", { p_trip: trip.id, p_week: week, p_idx: idx }),
    );
  };
  const current = rows.find((r) => r.idx === q.read_index);
  const revealed = q.phase === "revealed" || q.phase === "tie";
  const ordered = revealed
    ? [...rows].sort(
        (a, b) =>
          Number(b.user_id === q.winner_id) - Number(a.user_id === q.winner_id) ||
          (b.votes ?? 0) - (a.votes ?? 0),
      )
    : rows;
  const shown = ordered[i % Math.max(1, ordered.length)];
  const p = shown ? players.find((x) => x.user_id === shown.user_id) : undefined;
  const voters = q.players - (q.answered === 1 ? 1 : 0);
  return (
    <div className="mt-4 rounded-2xl bg-muted p-4">
      <Confetti burst={winnerBurst} />
      <p className="eyebrow text-green">
        ❓ QUESTION OF THE WEEK · {q.answered} OF {q.players} ANSWERED
      </p>
      <p className="font-bold mt-1">{q.prompt}</p>
      {q.phase === "hidden" &&
        (canRun ? (
          <Button
            variant="green"
            className="w-full mt-3"
            disabled={busy}
            onClick={() => void action("read")}
          >
            <Eye /> Read answers
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">The host reads the answers soon 👀</p>
        ))}
      {q.phase === "reading" && current && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground text-center">
            Answer {q.read_index + 1} of {q.answered} · no names yet 🤫
          </p>
          <div key={`r-${q.read_index}`} className="qotw-flip app-card text-center mt-2">
            <p className="text-lg font-bold">
              {current.emoji} {current.answer}
            </p>
          </div>
          {canRun ? (
            <Button
              variant="playful"
              className="w-full mt-3"
              disabled={busy}
              onClick={() => void action("next")}
            >
              {q.read_index + 1 >= q.answered ? "Start voting 🗳️" : "Next answer"} <ChevronRight />
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              The host reads each one aloud.
            </p>
          )}
        </div>
      )}
      {q.phase === "voting" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-bold">
            Vote for your favorite · {q.votes} of {voters} votes in
          </p>
          {rows.map((r) => (
            <button
              key={r.idx}
              type="button"
              disabled={busy || r.mine}
              aria-pressed={q.my_vote === r.idx}
              onClick={() => void vote(r.idx)}
              className={`w-full text-left rounded-xl border-2 p-3 text-sm font-bold transition ${q.my_vote === r.idx ? "border-primary bg-primary/15" : "border-border bg-card"} ${r.mine ? "opacity-50" : ""}`}
            >
              {r.emoji} {r.answer}
              {r.mine && (
                <span className="block text-xs font-normal text-muted-foreground">
                  Your answer · can't vote for it
                </span>
              )}
              {q.my_vote === r.idx && (
                <span className="block text-xs font-normal text-primary">Your vote ✓</span>
              )}
            </button>
          ))}
          {canRun && (
            <Button
              variant="green"
              className="w-full"
              disabled={busy}
              onClick={() => void action("end_voting")}
            >
              End voting
            </Button>
          )}
        </div>
      )}
      {revealed &&
        (!rows.length ? (
          <p className="text-sm text-muted-foreground mt-2">No answers this week.</p>
        ) : (
          <div className="mt-3">
            {q.tie_ids.length > 1 && (
              <TieWheel
                ids={q.tie_ids}
                winner={q.winner_id}
                spinAt={q.tie_spin_at}
                nameOf={nameOf}
              />
            )}
            {q.phase === "tie" &&
              (canRun ? (
                <Button
                  variant="playful"
                  className="w-full mt-3"
                  disabled={busy}
                  onClick={() => void action("break_tie")}
                >
                  🎡 Break the tie
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  It's a tie! The host spins to break it.
                </p>
              ))}
            {q.winner_id && (
              <p className="text-center font-display font-extrabold mt-3">
                🏆 {nameOf(q.winner_id)} wins the week · +2 stamps
              </p>
            )}
            <div key={`${shown?.idx}-${i}`} className="qotw-flip app-card text-center mt-3">
              <div className="flex items-center justify-center gap-2">
                {p && <Avatar url={p.avatarUrl} name={p.game_name} className="h-9 w-9" />}
                <span className="font-display font-extrabold">
                  {nameOf(shown?.user_id ?? null)}
                </span>
              </div>
              <p className="mt-3 text-lg font-bold">
                {shown?.emoji} {shown?.answer}
              </p>
              <p className="text-xs text-green mt-2">
                {shown?.votes ?? 0} vote{shown?.votes === 1 ? "" : "s"} · +
                {shown?.user_id === q.winner_id ? 3 : 1} stamp
                {shown?.user_id === q.winner_id ? "s" : ""} 🛂
              </p>
            </div>
            <div className="flex items-center justify-between mt-2">
              <Button
                variant="ghost"
                size="sm"
                aria-label="Previous answer"
                onClick={() => setI((n) => (n - 1 + ordered.length) % ordered.length)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-xs text-muted-foreground">
                {(i % ordered.length) + 1} of {ordered.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Next answer"
                onClick={() => setI((n) => (n + 1) % ordered.length)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ))}
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </div>
  );
}

const SLICE = ["var(--primary)", "var(--blue)", "var(--green)", "var(--orange)"];
export function TieWheel({
  ids,
  winner,
  spinAt,
  nameOf,
}: {
  ids: string[];
  winner: string | null;
  spinAt: string | null;
  nameOf: (id: string) => string;
}) {
  const n = ids.length,
    deg = 360 / n;
  const target = winner ? ids.indexOf(winner) : -1;
  const final = target >= 0 ? 360 * 6 + (360 - (target + 0.5) * deg) : 0;
  const fresh = !!spinAt && Date.now() - new Date(spinAt).getTime() < 8000;
  const [angle, setAngle] = useState(fresh ? 0 : final);
  useEffect(() => {
    if (!fresh) {
      setAngle(final);
      return;
    }
    const t = window.setTimeout(() => setAngle(final), 50);
    return () => window.clearTimeout(t);
  }, [final, fresh]);
  const bg = `conic-gradient(${ids.map((_, k) => `${SLICE[k % SLICE.length]} ${k * deg}deg ${(k + 1) * deg}deg`).join(",")})`;
  return (
    <div className="text-center" aria-label="Tie-break wheel">
      <div className="mx-auto w-0 h-0 border-x-[9px] border-x-transparent border-t-[15px] border-t-foreground" />
      <div
        className="relative mx-auto mt-1 size-[170px] rounded-full border-2 border-blue ring-4 ring-wheel-hub overflow-hidden motion-safe:transition-transform motion-safe:duration-[5000ms] motion-safe:ease-[cubic-bezier(.12,.78,.18,1)]"
        style={{ background: bg, transform: `rotate(${angle}deg)` }}
      >
        {ids.map((id, k) => (
          <span
            key={id}
            className="absolute left-1/2 top-1/2 text-[11px] font-extrabold text-background"
            style={{
              transform: `rotate(${(k + 0.5) * deg}deg) translateY(-56px) translateX(-50%)`,
              transformOrigin: "0 0",
            }}
          >
            {nameOf(id).slice(0, 10)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Captain Tools: swap or write the question before it drops. */
export function QotwTools({ trip }: { trip: TripWithRole }) {
  const { list, refresh, error, setError } = useWeeklyQuestions(trip.id);
  const [edit, setEdit] = useState<number | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const upcoming = list.filter((q) => new Date(q.drops_at).getTime() > Date.now());
  async function set(week: number, prompt: string | null) {
    setBusy(true);
    setError("");
    const { error: e } = await supabase.rpc("set_weekly_question", {
      p_trip: trip.id,
      p_week: week,
      p_prompt: prompt ?? "",
    });
    setBusy(false);
    if (e) setError(friendlyError(e));
    else {
      setEdit(null);
      await refresh();
    }
  }
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-muted-foreground">
        Drops Mondays 9 AM trip time. Swap or write your own before it drops.
      </p>
      {!upcoming.length && (
        <p className="text-sm text-muted-foreground">
          No upcoming questions — set game nights first.
        </p>
      )}
      {upcoming.map((q) => (
        <div key={q.week_number} className="bg-card rounded-xl p-3 border border-border text-sm">
          <p className="eyebrow">
            WEEK {q.week_number} · DROPS {fmt(q.drops_at, trip.home_timezone)}
            {q.source === "custom" ? " · YOURS" : ""}
          </p>
          {edit === q.week_number ? (
            <>
              <textarea
                className={`${field} mt-2`}
                rows={2}
                maxLength={200}
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label="Your question"
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button variant="subtle" size="sm" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button
                  variant="playful"
                  size="sm"
                  disabled={busy || text.trim().length < 3}
                  onClick={() => void set(q.week_number, text)}
                >
                  Save
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-bold mt-1">{q.prompt}</p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={busy}
                  onClick={() => void set(q.week_number, null)}
                >
                  <Shuffle /> Swap
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setEdit(q.week_number);
                    setText(q.prompt ?? "");
                  }}
                >
                  <Pencil /> Write my own
                </Button>
              </div>
            </>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
