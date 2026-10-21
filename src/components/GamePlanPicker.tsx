import { friendlyError } from "@/lib/friendly-error";
import { fmtWhen } from "@/lib/viewer-time";
import { tripToday } from "@/lib/itinerary";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";
import { questionRhythm, skipPasses } from "@/lib/season-plan";
import { useLook } from "@/lib/look";

type Plan = "recommended" | "short" | "custom";
type Row = { week_number: number; starts_at: string; kept: boolean };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const field = "w-full h-12 rounded-xl bg-card border-2 border-border px-3 text-foreground mt-1";
const db = supabase as unknown as {
  rpc: (f: string, a: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const fmt = (iso: string, tz: string) => fmtWhen(iso, tz);
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
export const planSummary = (n: number, windowDays = 99) =>
  `${n} game night${n === 1 ? "" : "s"} · ${n <= 1 ? "Meet the Squad" : questionRhythm(windowDays, n)} · ${skipPasses(n)} skip pass${skipPasses(n) === 1 ? "" : "es"}`;

/** Pick how the pre-trip games run. Trip dates never change here. */
export function GamePlanPicker(props: {
  trip: TripWithRole;
  onSaved: () => void | Promise<void>;
  compact?: boolean;
}) {
  if (props.trip.season_rule === "a2c") return <NewSeasonPlanPicker {...props} />;
  return <LegacyGamePlanPicker {...props} />;
}

function NewSeasonPlanPicker({
  trip,
  onSaved,
  compact,
}: {
  trip: TripWithRole;
  onSaved: () => void | Promise<void>;
  compact?: boolean;
}) {
  const today = tripToday(trip.home_timezone);
  const first = addDays(trip.start_date, -10) > today ? addDays(trip.start_date, -10) : today;
  const [start, setStart] = useState(first),
    [weekday, setWeekday] = useState(new Date(`${first}T12:00:00Z`).getUTCDay());
  const [time, setTime] = useState("18:00"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  // New rooms (play_arrangement set) never see Quick Start: dates decide the phase.
  const hasPlan = trip.play_arrangement
    ? !!trip.game_plan && trip.game_plan !== "quick_start"
    : !!trip.game_plan || trip.start_date <= today;
  if (
    trip.play_arrangement &&
    (trip.start_date <= addDays(today, 1) || trip.play_arrangement !== "online")
  )
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        {trip.start_date <= addDays(today, 1)
          ? "Your dates start you at Airport Missions or Trip Season automatically."
          : "Your trip days start automatically. No group call is required."}
      </p>
    );
  return (
    <div className={compact ? "mt-5" : "mt-5 rounded-2xl border border-border bg-card p-4"}>
      <h3 className="font-display font-extrabold">Your Pre-Flight nights</h3>
      {hasPlan ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {trip.play_arrangement
            ? "Your dates set your current phase automatically. Final Call Night is the last Pre-Flight night."
            : trip.start_date <= today
              ? "This Trip goes straight into Trip Season."
              : trip.game_plan === "quick_start"
                ? "Quick Start has one call before departure."
                : "Final Call Night is the last night before departure."}
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Finish the game-night schedule for this Trip.
          </p>
          {trip.start_date > addDays(today, 1) && (
            <label className="mt-3 block text-sm font-bold">
              Pre-Flight start date
              <input
                type="date"
                className={field}
                min={first}
                max={addDays(trip.start_date, -2)}
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
          )}
          <label className="mt-3 block text-sm font-bold">
            Night of the week
            <select
              className={field}
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
            >
              {DAYS.map((day, index) => (
                <option value={index} key={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-bold">
            Call time
            <input
              type="time"
              className={field}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          {message && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {message}
            </p>
          )}
          <Button
            variant="playful"
            className="mt-4 w-full"
            disabled={busy || !start}
            onClick={async () => {
              setBusy(true);
              const r = await db.rpc("set_preflight_a2c", {
                p_trip: trip.id,
                p_start: start,
                p_weekday: weekday,
                p_time: `${time}:00`,
              });
              setBusy(false);
              if (r.error) setMessage(friendlyError(r.error));
              else {
                setMessage("");
                await onSaved();
              }
            }}
          >
            {busy ? "Saving…" : "Set game nights"}
          </Button>
        </>
      )}
      {compact && hasPlan && (
        <Button variant="playful" className="mt-4 w-full" onClick={() => void onSaved()}>
          Continue to invite <span aria-hidden="true">→</span>
        </Button>
      )}
    </div>
  );
}

function LegacyGamePlanPicker({
  trip,
  onSaved,
  compact = false,
}: {
  trip: TripWithRole;
  onSaved: () => void | Promise<void>;
  compact?: boolean;
}) {
  const cinematic = useLook("journey") === "cinematic";
  const current = (trip as { game_plan?: Plan | null }).game_plan ?? null;
  const [plan, setPlan] = useState<Plan>(current ?? "recommended");
  const [weekday, setWeekday] = useState(0),
    [time, setTime] = useState("18:00");
  const [start, setStart] = useState(
      trip.game_start ??
        (addDays(trip.start_date, -84) > tripToday(trip.home_timezone)
          ? addDays(trip.start_date, -84)
          : tripToday(trip.home_timezone)),
    ),
    [every, setEvery] = useState(1);
  const [want, setWant] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({}),
    [rows, setRows] = useState<Row[] | null>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  const captain = trip.myRole === "captain";
  const todayIso = tripToday(trip.home_timezone);
  const win = (p: Plan) => {
    const from =
      cinematic || p === "custom"
        ? start > todayIso
          ? start
          : todayIso
        : addDays(trip.start_date, -84) > todayIso
          ? addDays(trip.start_date, -84)
          : todayIso;
    return Math.round(
      (Date.parse(`${trip.start_date}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000,
    );
  };
  const args = (p: Plan) => ({
    p_trip: trip.id,
    p_plan: p,
    p_weekday: weekday,
    p_time: `${time}:00`,
    p_start: cinematic ? start : p === "custom" ? start : null,
    p_every: every,
    ...(p === "custom" && want !== null ? { p_count: want } : {}),
  });
  useEffect(() => {
    // default day/time from the next scheduled night
    void supabase
      .from("game_nights")
      .select("starts_at")
      .eq("trip_id", trip.id)
      .gt("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .then(({ data }) => {
        const s = data?.[0]?.starts_at;
        if (!s) return;
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: trip.home_timezone,
          weekday: "long",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        }).formatToParts(new Date(s));
        const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
        setWeekday(Math.max(0, DAYS.indexOf(g("weekday"))));
        setTime(`${g("hour")}:${g("minute")}`);
      });
  }, [trip.id]);
  useEffect(() => {
    setRows(null);
    void Promise.all(
      (["recommended", "short", "custom"] as Plan[]).map(async (p) => {
        const r = await db.rpc("plan_game_nights", args(p));
        return [p, ((r.data ?? []) as Row[]).length] as const;
      }),
    ).then((x) => setCounts(Object.fromEntries(x)));
  }, [weekday, time, start, every, trip.start_date, want]);
  useEffect(() => {
    if (want === null && counts["custom"]) setWant(counts["custom"]);
  }, [counts, want]);
  async function preview() {
    setMsg("");
    const r = await db.rpc("plan_game_nights", args(plan));
    if (r.error) setMsg(friendlyError(r.error));
    else setRows((r.data ?? []) as Row[]);
  }
  async function save() {
    setBusy(true);
    setMsg("");
    const r = await db.rpc(cinematic ? "set_preflight_start" : "apply_game_plan", args(plan));
    setBusy(false);
    if (r.error) {
      setMsg(friendlyError(r.error));
      return;
    }
    setMsg("Game plan saved ✓");
    setRows(null);
    await onSaved();
  }
  const cards: { id: Plan; title: string; line: string }[] = [
    {
      id: "recommended",
      title: "⭐ Recommended",
      line: counts["recommended"]
        ? planSummary(counts["recommended"], win("recommended"))
        : "Sized to the time before departure",
    },
    {
      id: "short",
      title: "🍬 Short & Sweet",
      line: `3–4 nights ending at Final Call Night${counts["short"] ? ` · ${planSummary(counts["short"], win("short"))}` : ""}`,
    },
    {
      id: "custom",
      title: "🛠️ Custom",
      line: counts["custom"]
        ? `You pick the start date, day, time and how often · ${planSummary(counts["custom"], win("custom"))}`
        : "You pick the start date, day, time and how often",
    },
  ];
  return (
    <div className={compact ? "" : "mt-6 rounded-2xl bg-card border border-border p-4"}>
      {!compact && (
        <>
          <h3 className="font-display font-extrabold">
            {cinematic ? "Pre-Flight start date" : "Game Day start date 🎯"}
          </h3>
          <p className="text-xs text-ink-soft mt-1">
            Trip dates don't change here. Played nights and the next confirmed night stay. Every
            plan ends with Final Call Night.
          </p>
        </>
      )}
      <div className="space-y-2 mt-3" role="radiogroup" aria-label="Game plan">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={plan === c.id}
            onClick={() => {
              setPlan(c.id);
              setRows(null);
            }}
            className={`w-full text-left rounded-2xl p-4 border-2 ${plan === c.id ? "border-primary bg-orange-soft" : "border-border bg-card"}`}
          >
            <p className="font-display font-extrabold">
              {c.title}
              {current === c.id ? " · current" : ""}
            </p>
            <p className="text-xs text-ink-soft mt-1">{c.line}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <label className="text-sm font-bold">
          Day
          <select
            className={field}
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Time
          <input
            type="time"
            className={field}
            value={time}
            onChange={(e) => setTime(e.target.value || "18:00")}
          />
        </label>
      </div>
      {(plan === "custom" || cinematic) && (
        <>
          <label className="block text-sm font-bold mt-3">
            {cinematic ? "Pre-Flight start date" : "First game night on or after"}
            <input
              type="date"
              className={field}
              min={cinematic ? todayIso : addDays(trip.start_date, -84)}
              max={addDays(trip.start_date, -2)}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          {plan === "custom" && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[1, 2].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={every === n ? "playful" : "outline"}
                  onClick={() => setEvery(n)}
                >
                  {n === 1 ? "Weekly" : "Every other week"}
                </Button>
              ))}
            </div>
          )}
          {plan === "custom" && (
            <label className="block text-sm font-bold mt-3">
              How many game nights
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                className={field}
                value={want ?? ""}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value));
                  setWant(e.target.value === "" ? null : Math.min(12, Math.max(1, v || 1)));
                  setRows(null);
                }}
              />
            </label>
          )}
        </>
      )}
      <p className="text-xs text-ink-soft mt-2">Times use {trip.home_timezone}.</p>
      <Button variant="outline" className="w-full mt-3" onClick={() => void preview()}>
        Preview plan
      </Button>
      {rows && (
        <div className="mt-3 space-y-1">
          {rows.map((r, i) => (
            <p
              key={r.week_number}
              className={`text-sm ${r.kept ? "text-muted-foreground" : "font-bold"}`}
            >
              Week {r.week_number} · {fmt(r.starts_at, trip.home_timezone)}
              {r.kept ? " · stays" : ""}
              {i === rows.length - 1 ? " · 🛫 Final Call Night" : ""}
            </p>
          ))}
          {rows.length === 0 ? (
            <p className="text-sm">No nights fit before the trip — try another day.</p>
          ) : (
            <>
              <p className="text-xs text-ink-soft mt-1">{planSummary(rows.length, win(plan))}</p>
              {plan === "custom" && want !== null && rows.length < want && (
                <p role="status" className="text-sm font-bold mt-1">
                  Only {rows.length} fit before you leave. Start earlier or play every week for
                  more.
                </p>
              )}
              {captain ? (
                <Button
                  variant="playful"
                  className="w-full mt-2"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Confirm game plan
                </Button>
              ) : (
                <p className="text-xs mt-2">Only the Captain can save a plan.</p>
              )}
            </>
          )}
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
    </div>
  );
}
