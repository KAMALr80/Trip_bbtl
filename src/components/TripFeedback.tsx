import { tripDisplayName } from "@/lib/trip-display-name";
import { ContentRatings } from "@/components/ContentVote";
import { AiCostSummary } from "@/components/AiCredits";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TripWithRole } from "@/lib/trips";

export const FAVORITES: Record<string, string> = {
  game_nights: "🎲 Game nights",
  qotw: "❓ Question of the Week",
  bingo: "🎯 Trip-day bingo",
  photo_wall: "📸 Photo wall",
  wrapped: "🎬 Trip Wrapped",
  other: "✨ Other",
};
const field = "mt-1 w-full rounded-xl border border-border bg-card px-3 py-3 text-base";

/** Has the signed-in player already answered or skipped feedback for this trip? null while loading. */
export function useFeedbackDone(tripId: string) {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase
      .rpc("my_trip_feedback_done", { p_trip: tripId })
      .then((r) => setDone(r.error ? true : !!r.data));
  }, [tripId]);
  return [done, setDone] as const;
}

/** One-time end-of-trip feedback, shown before Trip Wrapped. */
export function TripFeedbackForm({ trip, onDone }: { trip: TripWithRole; onDone: () => void }) {
  const [score, setScore] = useState<number | null>(null);
  const [fav, setFav] = useState<string | null>(null);
  const [change, setChange] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send(skipped: boolean) {
    if (!skipped && score === null) {
      setErr("Pick a number from 0 to 10.");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await supabase.rpc("submit_trip_feedback", {
      p_trip: trip.id,
      p_skipped: skipped,
      p_score: score as number,
      p_favorite: fav as string,
      p_change: change,
      p_message: message,
    });
    setBusy(false);
    if (r.error && !/already/i.test(r.error.message)) {
      setErr("Couldn't send that. Try again.");
      return;
    }
    onDone();
  }
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-background px-[18px] pb-10 pt-6"
      role="dialog"
      aria-modal="true"
      aria-label="Trip feedback"
    >
      <div className="mx-auto max-w-[420px]">
        <p className="eyebrow text-primary">BEFORE YOUR TRIP WRAPPED</p>
        <h1 className="font-display text-[28px] font-extrabold mt-1">
          How was {tripDisplayName(trip.name)}? 🧳
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Four quick questions, asked only once. Only the TripJunkies founder sees your answers —
          except your squad message.
        </p>
        <p className="mt-6 font-bold">How likely are you to use TripJunkies on your next trip?</p>
        <div className="mt-3 grid grid-cols-6 gap-2">
          {Array.from({ length: 11 }, (_, n) => (
            <Button
              key={n}
              type="button"
              variant={score === n ? "playful" : "outline"}
              className="h-12 px-0"
              aria-pressed={score === n}
              onClick={() => setScore(n)}
            >
              {n}
            </Button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>0 · Not likely</span>
          <span>10 · Absolutely</span>
        </div>
        <p className="mt-6 font-bold">Favorite part?</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {Object.entries(FAVORITES).map(([k, v]) => (
            <Button
              key={k}
              type="button"
              variant={fav === k ? "playful" : "outline"}
              className="h-auto min-h-12 whitespace-normal py-2"
              aria-pressed={fav === k}
              onClick={() => setFav(fav === k ? null : k)}
            >
              {v}
            </Button>
          ))}
        </div>
        <label className="mt-6 block font-bold">
          What would you change or cut?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
          <textarea
            className={field}
            rows={3}
            maxLength={500}
            value={change}
            onChange={(e) => setChange(e.target.value)}
          />
        </label>
        <label className="mt-5 block font-bold">
          Leave a message for the squad{" "}
          <span className="font-normal text-muted-foreground">
            (optional · shows in Trip Wrapped)
          </span>
          <textarea
            className={field}
            rows={3}
            maxLength={280}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Best trip ever, same time next year?"
          />
          <span className="block text-right text-xs font-normal text-muted-foreground">
            {message.length}/280
          </span>
        </label>
        {err && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {err}
          </p>
        )}
        <Button
          variant="playful"
          className="mt-6 w-full"
          disabled={busy}
          onClick={() => void send(false)}
        >
          Send & see Trip Wrapped 🎬
        </Button>
        <Button
          variant="ghost"
          className="mt-2 w-full"
          disabled={busy}
          onClick={() => void send(true)}
        >
          Skip
        </Button>
      </div>
    </div>
  );
}

/** Founder-only summary of all feedback. RLS returns nothing for anyone else. */
export function FeedbackAdmin({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Tables<"trip_feedback">[] | null>(null);
  const [trips, setTrips] = useState<Record<string, string>>({});
  useEffect(() => {
    void (async () => {
      const r = await supabase
        .from("trip_feedback")
        .select("*")
        .order("created_at", { ascending: false });
      setRows(r.data ?? []);
      const ids = [...new Set((r.data ?? []).map((x) => x.trip_id))];
      if (ids.length) {
        const t = await supabase.from("trips").select("id,name").in("id", ids);
        setTrips(Object.fromEntries((t.data ?? []).map((x) => [x.id, x.name])));
      }
    })();
  }, []);
  const answered = (rows ?? []).filter((r) => !r.skipped && r.score !== null);
  const avg = answered.length
    ? answered.reduce((a, r) => a + (r.score ?? 0), 0) / answered.length
    : null;
  const favCounts = Object.keys(FAVORITES).map(
    (k) => [k, answered.filter((r) => r.favorite === k).length] as const,
  );
  return (
    <div className="pb-10">
      <Button variant="ghost" data-view-navigation="true" className="-ml-2" onClick={onBack}>
        <ArrowLeft /> Me
      </Button>
      <h1 className="font-display text-2xl font-extrabold mt-4">Trip feedback 📊</h1>
      {rows === null ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="app-card !p-3">
              <p className="eyebrow text-muted-foreground">RESPONSES</p>
              <p className="font-display text-xl font-extrabold mt-1">{answered.length}</p>
            </div>
            <div className="app-card !p-3">
              <p className="eyebrow text-muted-foreground">SKIPPED</p>
              <p className="font-display text-xl font-extrabold mt-1">
                {rows.length - answered.length}
              </p>
            </div>
            <div className="app-card !p-3">
              <p className="eyebrow text-muted-foreground">AVG SCORE</p>
              <p className="font-display text-xl font-extrabold mt-1">
                {avg === null ? "—" : avg.toFixed(1)}
              </p>
            </div>
          </div>
          <div className="app-card mt-3">
            <p className="eyebrow text-muted-foreground">FAVORITE PART</p>
            {favCounts.map(([k, n]) => (
              <div key={k} className="mt-2 flex justify-between text-sm">
                <span>{FAVORITES[k]}</span>
                <b>{n}</b>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {answered.map((r) => (
              <div key={`${r.trip_id}-${r.user_id}`} className="app-card text-sm">
                <p className="text-xs text-muted-foreground">
                  {trips[r.trip_id] ?? "Trip"} · {new Date(r.created_at).toLocaleDateString()}
                </p>
                <p className="font-bold mt-1">
                  Score {r.score}/10{r.favorite ? ` · ${FAVORITES[r.favorite]}` : ""}
                </p>
                {r.change_text && <p className="mt-2">✂️ {r.change_text}</p>}
                {r.squad_message && (
                  <p className="mt-2 text-muted-foreground">💬 {r.squad_message}</p>
                )}
              </div>
            ))}
          </div>
          {!rows.length && (
            <p className="mt-4 text-sm text-muted-foreground">
              No feedback yet. It arrives when trips end.
            </p>
          )}
        </>
      )}
      <ContentRatings />
      <AiCostSummary />
    </div>
  );
}
