import { rpcByName } from "@/data/rpc";
import { rpc } from "@/data/rpc";
import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, Crown, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";

import { fmtWhen, zoneLabel } from "@/lib/viewer-time";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Day = {
  id: string;
  day: string;
  startsAt: string;
  place: string | null;
  step: "card" | "present" | "vote" | "done";
  presenter: string | null;
  revealed: boolean;
  title: string | null;
  body: string | null;
  mine: { completed?: boolean; presented?: boolean; voted?: boolean; choice?: number };
  counts: [number, number] | null;
};
type Score = { user_id: string; points: number };
const localDay = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

/** Sessions are read from one server-authoritative timeline, including the host's current step. */
export function HomeDayFlow({
  trip,
  members,
  cards,
  userId,
  viewOnly,
  title = "Trip Season",
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly: boolean;
  title?: string;
}) {
  const [days, setDays] = useState<Day[]>([]),
    [scores, setScores] = useState<Score[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const [times, setTimes] = useState<Record<string, string>>({});
  const [crowned, setCrowned] = useState(false);
  const captain = trip.myRole === "captain" && !viewOnly;
  const leader = ["captain", "co_captain"].includes(trip.myRole) && !viewOnly;
  const name = (id: string | null) =>
    cards.find((c) => c.user_id === id)?.game_name ||
    members.find((m) => m.user_id === id)?.display_name ||
    "Player";
  const load = useCallback(async () => {
    const [plan, board] = await Promise.all([
      rpc("home_day_view", { p_trip: trip.id }),
      rpc("home_day_scores", { p_trip: trip.id }),
    ]);
    if (plan.error || board.error) {
      setError(friendlyError(plan.error || board.error));
      return;
    }
    setDays((plan.data as Day[]) ?? []);
    setScores((board.data as Score[]) ?? []);
  }, [trip.id]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void load();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function action(name: string, args: object) {
    setBusy(true);
    setError("");
    const result = await rpcByName(name, args);
    if (result.error) setError(friendlyError(result.error));
    await load();
    setBusy(false);
  }
  const isFinished = days.length > 0 && days.every((d) => d.step === "done");
  const top = scores[0];
  const showCrown = isFinished && top && top.points > 0 && !crowned && top.user_id === userId;
  return (
    <section className="mt-5 space-y-4" aria-label="Trip Season schedule">
      <div className="flex items-center gap-2">
        <Clock3 size={20} />
        <h2 className="font-display text-xl font-extrabold">{title}</h2>
      </div>
      {days.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">Your daily sessions are being prepared.</p>
      )}
      {days.map((d, index) => {
        const opened = now >= Date.parse(d.startsAt);
        const future = !opened && d.step === "card";
        const time =
          times[d.day] ??
          new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: trip.home_timezone,
          }).format(new Date(d.startsAt));
        return (
          <article key={d.id} className="av-glass-card min-w-0" aria-label={`Day ${index + 1}`}>
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="eyebrow text-gold">
                  DAY {index + 1} · {localDay(d.day)}
                </p>
                <h3 className="font-display text-lg font-extrabold mt-1">
                  {d.title ?? "Culture Card"}
                </h3>
              </div>
              <span className="sm-chip shrink-0">
                {d.step === "done" ? "Finished" : future ? "Scheduled" : "Live"}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {fmtWhen(d.startsAt, trip.home_timezone)} ·{" "}
              {d.place || (trip.call_link ? "Video call" : "Place TBA")}
            </p>
            {captain && future && (
              <div className="flex flex-wrap gap-2 items-end mt-3">
                <label className="text-xs font-bold">
                  Session time · {zoneLabel(trip.home_timezone)}
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTimes((old) => ({ ...old, [d.day]: e.target.value }))}
                    className="block h-11 mt-1 rounded-md bg-card border border-border px-2"
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action("home_day_schedule", {
                      p_trip: trip.id,
                      p_day: d.day,
                      p_time: time,
                    })
                  }
                >
                  Save time
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void action("home_day_schedule", {
                      p_trip: trip.id,
                      p_day: d.day,
                      p_time: time,
                      p_all: true,
                    })
                  }
                >
                  Same time every day
                </Button>
              </div>
            )}
            {d.body && <p className="mt-3 text-sm">{d.body}</p>}
            {opened && (
              <div className="mt-4 space-y-3">
                {d.step === "card" && (
                  <>
                    <p className="text-sm">Show what you did in person or on your group call.</p>
                    {!d.mine.completed && (
                      <Button
                        variant="playful"
                        disabled={busy || viewOnly}
                        onClick={() =>
                          void action("home_day_action", { p_session: d.id, p_action: "complete" })
                        }
                      >
                        <Check size={16} /> I did the card
                      </Button>
                    )}
                    {d.mine.completed && <p className="text-sm font-bold text-green">Card done</p>}
                    {leader && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void action("home_day_action", { p_session: d.id, p_action: "next" })
                        }
                      >
                        Start presentations
                      </Button>
                    )}
                  </>
                )}
                {d.step === "present" && (
                  <>
                    <p className="font-bold">Now showing: {name(d.presenter)}</p>
                    {leader && (
                      <Button
                        variant="playful"
                        disabled={busy}
                        onClick={() =>
                          void action("home_day_action", { p_session: d.id, p_action: "presented" })
                        }
                      >
                        Presented · next person
                      </Button>
                    )}
                  </>
                )}
                {d.step === "vote" && (
                  <>
                    <p className="text-sm font-bold">
                      The squad votes. Your choice stays anonymous until reveal.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {["Cleared for Takeoff", "Grounded"].map((label, choice) => (
                        <Button
                          key={choice}
                          variant={d.mine.choice === choice ? "playful" : "outline"}
                          className="min-h-16 h-auto whitespace-normal text-center"
                          disabled={busy || viewOnly}
                          onClick={() =>
                            void action("home_day_action", {
                              p_session: d.id,
                              p_action: "vote",
                              p_choice: choice,
                            })
                          }
                        >
                          <Vote size={16} />
                          {label}
                        </Button>
                      ))}
                    </div>
                    {d.mine.voted && <p className="text-sm font-bold">Vote cast ✓</p>}
                    {leader && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void action("home_day_action", { p_session: d.id, p_action: "reveal" })
                        }
                      >
                        Reveal totals
                      </Button>
                    )}
                  </>
                )}
                {d.step === "done" && (
                  <p className="text-sm font-bold">
                    Cleared {d.counts?.[0] ?? 0} · Grounded {d.counts?.[1] ?? 0}
                  </p>
                )}
              </div>
            )}
          </article>
        );
      })}
      {scores.length > 0 && (
        <section className="mt-5" aria-label="Experience scores">
          <h2 className="font-display text-xl font-extrabold">Experience Scores</h2>
          <ol className="mt-2 space-y-2">
            {scores.map((row, i) => (
              <li
                key={row.user_id}
                className="flex justify-between gap-2 border-b border-border py-2 text-sm"
              >
                <span>
                  {i + 1}. {name(row.user_id)}
                  {row.user_id === userId ? " · You" : ""}
                </span>
                <b>{row.points} pts</b>
              </li>
            ))}
          </ol>
          {isFinished && top && (
            <p className="font-bold text-gold mt-3">
              <Crown size={17} className="inline" /> Crowned: {name(top.user_id)}
            </p>
          )}
        </section>
      )}
      {showCrown && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Experience champion"
          className="cinematic-crown-celebration"
        >
          <div className="cinematic-crown-content">
            <Crown className="cinematic-crown-icon" />
            <h2 className="font-display text-3xl font-extrabold">Experience Champion!</h2>
            <p className="mt-3">
              {name(top.user_id)} · {top.points} points
            </p>
            <Button className="mt-8" variant="playful" onClick={() => setCrowned(true)}>
              Continue
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
