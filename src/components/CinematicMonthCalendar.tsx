import { rpc } from "@/data/rpc";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

import { fmtWhen, viewerZone } from "@/lib/viewer-time";
import { friendlyError } from "@/lib/friendly-error";
import { tripToday } from "@/lib/itinerary";
import { nextGameNight } from "@/lib/next-game-night";
import { Avatar } from "./PlayerCards";
import { HostNightActions } from "./HostSwaps";
import { NightGamePicker } from "./NightGamePicker";
import { gameType } from "@/lib/display-game-title";
import { confirmInApp } from "@/lib/confirm";
import type { Tables } from "@/integrations/supabase/types";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Night = Tables<"game_nights">;
type Entry = {
  key: string;
  date: string;
  startsAt: string;
  place: string | null;
  week?: number;
  night?: Night;
};
const dateKey = (s: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: viewerZone(),
  }).formatToParts(new Date(s));
  const value = (kind: string) => parts.find((p) => p.type === kind)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const shift = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export function CinematicMonthCalendar({
  trip,
  nights,
  games = [],
  members,
  cards,
  userId,
  viewOnly,
  onChanged,
}: {
  trip: TripWithRole;
  nights: Night[];
  games?: { number: number; name: string }[];
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly: boolean;
  onChanged?: () => void;
}) {
  const atHome = trip.kind === "at_home" || trip.kind === "cultural_inspiration";
  const [sessions, setSessions] = useState<
    { day: string; startsAt: string; place: string | null }[]
  >([]);
  const [month, setMonth] = useState(() => {
    const upcoming = nextGameNight(nights, Date.now());
    const start = new Date(
      `${upcoming ? dateKey(upcoming.starts_at) : tripToday(viewerZone())}T12:00:00`,
    );
    return new Date(start.getFullYear(), start.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);
  const [place, setPlace] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [localNights, setLocalNights] = useState(nights);
  useEffect(() => setLocalNights(nights), [nights]);
  const captain = trip.myRole === "captain" && !viewOnly;
  const leader = (captain || trip.myRole === "co_captain") && !viewOnly;
  useEffect(() => {
    if (!atHome) return;
    let alive = true;
    void rpc("home_day_view", { p_trip: trip.id }).then((r) => {
      if (!alive) return;
      const data = r.data as { day: string; startsAt: string; place: string | null }[] | null;
      if (r.error) setError(friendlyError(r.error));
      else {
        const next = (data ?? []).filter((s) => new Date(s.startsAt).getTime() >= Date.now())[0];
        if (revision === 0 && next) {
          const d = new Date(`${dateKey(next.startsAt)}T12:00:00`);
          setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
        }
        setSessions(data ?? []);
      }
    });
    return () => {
      alive = false;
    };
  }, [atHome, trip.id, revision]);
  const entries: Entry[] = atHome
    ? sessions.map((s) => ({
        key: s.day,
        date: dateKey(s.startsAt),
        startsAt: s.startsAt,
        place: s.place,
      }))
    : localNights.map((n) => ({
        key: String(n.week_number),
        date: dateKey(n.starts_at),
        startsAt: n.starts_at,
        place: n.place,
        week: n.week_number,
        night: n,
      }));
  const active = entries.find((e) => e.key === selected);
  const callLink = (trip as TripWithRole & { call_link?: string | null }).call_link;
  const location = (entry: Entry) => entry.place || (callLink ? "Video call" : "Place TBA");
  const hostName = (entry: Entry) =>
    cards.find((c) => c.user_id === entry.night?.host_id)?.game_name ||
    members.find((m) => m.user_id === entry.night?.host_id)?.display_name ||
    "Host to be announced";
  const hostAvatar = (entry: Entry) =>
    cards.find((c) => c.user_id === entry.night?.host_id)?.avatarUrl;
  const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = tripToday(viewerZone());
  const [year, mon] = [month.getFullYear(), month.getMonth()];
  const dayKey = (d: number) =>
    `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthEntries = entries
    .filter((entry) => entry.date.startsWith(`${year}-${String(mon + 1).padStart(2, "0")}-`))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const shortTime = (entry: Entry) =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZone: viewerZone() }).format(
      new Date(entry.startsAt),
    );
  const fullTime = (entry: Entry) =>
    new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: viewerZone(),
    }).format(new Date(entry.startsAt));
  const [touchX, setTouchX] = useState(0);
  async function save() {
    if (!active) return;
    setBusy(true);
    setError("");
    const result = atHome
      ? await rpc("set_home_day_place", {
          p_trip: trip.id,
          p_day: active.key,
          p_place: place.trim(),
        })
      : await rpc("set_game_night_place", {
          p_trip: trip.id,
          p_week: active.week ?? null,
          p_place: place.trim(),
        });
    if (result.error) setError(friendlyError(result.error));
    else {
      if (atHome && time) {
        const timed = await rpc("home_day_schedule", {
          p_trip: trip.id,
          p_day: active.key,
          p_time: time,
        });
        if (timed.error) {
          setError(friendlyError(timed.error));
          setBusy(false);
          return;
        }
      }
      if (!atHome)
        setLocalNights((rows) =>
          rows.map((n) =>
            n.week_number === active.week ? { ...n, place: place.trim() || null } : n,
          ),
        );
      setRevision((v) => v + 1);
      onChanged?.();
      setSelected(null);
    }
    setBusy(false);
  }
  async function toggleSkipped(entry: Entry) {
    if (!entry.night || !captain || busy) return;
    if (
      !entry.night.skipped &&
      !(await confirmInApp(`Mark Week ${entry.week} as skipped? Nobody loses points.`))
    )
      return;
    setBusy(true);
    setError("");
    const result = await rpc("set_night_skipped", {
      p_trip: trip.id,
      p_week: entry.week ?? null,
      p_skipped: !entry.night.skipped,
    });
    if (result.error) setError(friendlyError(result.error));
    else {
      setLocalNights((rows) =>
        rows.map((n) => (n.week_number === entry.week ? { ...n, skipped: !n.skipped } : n)),
      );
      onChanged?.();
    }
    setBusy(false);
  }
  function open(entry: Entry) {
    setSelected(entry.key);
    setPlace(entry.place ?? "");
    setTime(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: trip.home_timezone,
      }).format(new Date(entry.startsAt)),
    );
    setError("");
  }
  return (
    <div
      className="cinematic-month mt-4"
      aria-label={atHome ? "Game Day calendar" : "Game Night Calendar"}
      onTouchStart={(e) => {
        setTouchX(e.touches[0]?.clientX ?? 0);
      }}
      onTouchEnd={(e) => {
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX;
        if (Math.abs(dx) > 70) setMonth((m) => shift(m, dx < 0 ? 1 : -1));
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonth((m) => shift(m, -1))}
        >
          <ChevronLeft />
        </Button>
        <h3 className="font-display text-xl font-extrabold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth((m) => shift(m, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day} className="text-center text-xs font-bold text-muted-foreground">
            {day}
          </span>
        ))}
        {Array.from({ length: first }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1;
          const items = entries.filter((e) => e.date === dayKey(day));
          return (
            <div
              key={day}
              className={`cinematic-month-day ${dayKey(day) === today ? "cinematic-month-today" : ""}`}
            >
              <span className="text-xs font-extrabold">{day}</span>
              {items.map((e) => (
                <Button
                  key={e.key}
                  variant="ghost"
                  className={`cinematic-month-chip ${e.night?.skipped ? "cinematic-month-skipped" : ""}`}
                  onClick={() => open(e)}
                  aria-label={`${atHome ? "Game Day" : `Game Night Week ${e.week}`} ${fmtWhen(e.startsAt, trip.home_timezone)} ${location(e)}${e.night?.skipped ? " Skipped" : ""}`}
                >
                  <span>{shortTime(e)}</span>
                </Button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <h4 className="font-display font-extrabold text-lg mb-3">This month</h4>
        <div className="space-y-2">
          {monthEntries.length ? (
            monthEntries.map((entry) => (
              <Button
                key={entry.key}
                variant="ghost"
                className={`night-calendar-card w-full h-auto min-h-20 p-2 flex items-center gap-3 text-left whitespace-normal ${entry.night?.skipped ? "night-calendar-skipped" : ""}`}
                onClick={() => open(entry)}
              >
                <span className="night-calendar-date shrink-0 text-center text-xs font-bold">
                  {new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                  <small>
                    {new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined, {
                      weekday: "short",
                    })}
                  </small>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="neon-chip inline-block mb-1">
                    {atHome ? "Game Day" : `Week ${entry.week}`}
                  </span>
                  <span className="block text-sm font-bold">
                    {atHome ? "Game Day" : "Game Night"} · {fullTime(entry)} · {location(entry)}
                  </span>
                  {entry.night && (
                    <span className="block text-xs text-muted-foreground">
                      {hostName(entry)}
                      {entry.night.skipped ? " · Skipped" : ""}
                    </span>
                  )}
                </span>
                {entry.night && (
                  <Avatar
                    name={hostName(entry)}
                    url={hostAvatar(entry)}
                    className="size-9 shrink-0"
                  />
                )}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No scheduled days this month.</p>
          )}
        </div>
      </div>
      {active && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <div className="absolute inset-0 bg-foreground/60" onClick={() => setSelected(null)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Calendar day details"
            className="relative w-full max-w-lg max-h-[85dvh] overflow-y-auto rounded-t-lg bg-card border border-border p-5 pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3"
              aria-label="Close day"
              onClick={() => setSelected(null)}
            >
              <X />
            </Button>
            <span className="eyebrow text-gold">{atHome ? "GAME DAY" : `WEEK ${active.week}`}</span>
            <h3 className="font-display text-2xl font-extrabold mt-2">
              {new Date(`${active.date}T12:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
            <p className="mt-3">{fmtWhen(active.startsAt, trip.home_timezone)}</p>
            <p className="text-xs text-muted-foreground">
              Trip zone:{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: trip.home_timezone,
              }).format(new Date(active.startsAt))}{" "}
              · {trip.home_timezone}
            </p>
            <p className="mt-3">{location(active)}</p>
            {active.night && (
              <p className="mt-3 flex items-center gap-2">
                <Avatar name={hostName(active)} url={hostAvatar(active)} className="size-8" />
                Host: {hostName(active)}
              </p>
            )}
            {(atHome ? captain : leader) && new Date(active.startsAt).getTime() > Date.now() && (
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                <label className="block text-sm font-bold">
                  Place
                  <input
                    value={place}
                    maxLength={80}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder={callLink ? "Video call" : "Place TBA"}
                    className="mt-1 w-full h-12 bg-background border border-border rounded-md px-3"
                  />
                </label>
                {atHome && (
                  <label className="block text-sm font-bold">
                    Time · {trip.home_timezone}
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="mt-1 w-full h-12 bg-background border border-border rounded-md px-3"
                    />
                  </label>
                )}
                <Button variant="playful" disabled={busy} onClick={() => void save()}>
                  Save changes
                </Button>
              </div>
            )}
            {active.night?.game_number && active.night.game_revealed && (
              <span className="game-type-chip">{gameType(active.night.game_number)}</span>
            )}
            {active.night && (
              <div className="mt-4">
                <NightGamePicker
                  tripId={trip.id}
                  night={active.night}
                  games={games}
                  canPick={!viewOnly && (leader || active.night.host_id === userId)}
                  onSaved={() => {
                    onChanged?.();
                    window.dispatchEvent(new CustomEvent("tripjunkie-night-game-changed"));
                    setSelected(null);
                  }}
                />
                <HostNightActions
                  trip={trip}
                  userId={userId}
                  night={active.night}
                  people={members.map((m) => ({
                    user_id: m.user_id,
                    name:
                      cards.find((c) => c.user_id === m.user_id)?.game_name ||
                      m.display_name ||
                      "Player",
                  }))}
                  viewOnly={viewOnly}
                />
                {captain && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={busy}
                    onClick={() => void toggleSkipped(active)}
                  >
                    {active.night.skipped ? "Un-skip night" : "Mark skipped"}
                  </Button>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 text-destructive text-sm">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
