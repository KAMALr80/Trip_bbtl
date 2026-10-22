import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FileUp, Link2, MapPin, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripWithRole } from "@/lib/trips";
import { analyzeTripPlan } from "@/lib/itinerary-ai.functions";
import { askCredits, creditError, creditStatus } from "@/components/AiCredits";
import {
  blankDays,
  loadItinerary,
  mapsLink,
  safeLink,
  normalizeDays,
  saveDayTag,
  saveItinerary,
  tripToday,
  tripTz,
  type DayTag,
  type DayTags,
  type ItineraryDay,
} from "@/lib/itinerary";

const input =
  "w-full min-w-0 h-11 rounded-xl border border-border bg-card px-3 outline-none focus:border-primary text-sm";
const tagEmoji: Record<DayTag, string> = { Party: "🎉", Explore: "🧭", Chill: "🌿", Travel: "✈️" };
function dateLabel(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
function flightDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function isPlanDay(day: ItineraryDay) {
  return Boolean(
    day.city.trim() ||
    day.note?.trim() ||
    day.stays.length ||
    day.flights.length ||
    day.spots.length,
  );
}

export function TripTimeline({
  trip,
  version = 0,
  preview = false,
}: {
  trip: TripWithRole;
  version?: number;
  preview?: boolean;
}) {
  const past =
    !!trip.ended_at ||
    trip.end_date <
      new Date().toLocaleDateString("en-CA", {
        timeZone: (trip as { home_timezone?: string | null }).home_timezone || "UTC",
      });
  const [days, setDays] = useState<ItineraryDay[]>([]),
    [tags, setTags] = useState<DayTags>({}),
    [saved, setSaved] = useState(false),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const todayRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError("");
    void loadItinerary(trip.id)
      .then((result) => {
        if (live) {
          setDays(normalizeDays(trip, result.days));
          setTags(result.tags);
          setSaved(result.saved);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (live) {
          setLoadError(friendlyError(error));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [trip.id, version, trip.start_date, trip.end_date]);
  const today = tripToday(tripTz(trip));
  useEffect(() => {
    if (!preview && !loading && window.sessionStorage.getItem(`journey-day-${trip.id}`)) {
      window.sessionStorage.removeItem(`journey-day-${trip.id}`);
      return;
    }
    if (!preview && !loading && todayRef.current)
      todayRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [preview, loading, trip.id]);
  if (loading) return <p className="mt-8 text-muted-foreground">Opening the plan…</p>;
  if (loadError)
    return (
      <p role="alert" className="mt-8 text-destructive text-sm">
        Could not open this plan: {loadError}
      </p>
    );
  if (!saved || !days.some(isPlanDay))
    return (
      <div className="mt-8 text-center border-2 border-dashed border-border rounded-3xl py-10 px-6">
        <span className="text-5xl">🗺️</span>
        <h2 className="font-display text-xl font-extrabold mt-4">The plan is coming</h2>
        <p className="text-muted-foreground text-sm mt-2">
          Your Captain hasn't added the plan yet.
        </p>
      </div>
    );
  const visible = preview
    ? days
        .map((day, i) => ({ day, i }))
        .filter(({ day }) => day.date >= today && isPlanDay(day))
        .slice(0, 2)
    : days.map((day, i) => ({ day, i }));
  return (
    <div className="mt-6 space-y-[14px] pb-8" aria-label="Trip itinerary">
      {visible.map(({ day, i }) => {
        const tag =
          tags[day.date] ??
          (day.flights.length ||
          /\b(fly|flight|travel|air|depart|homebound)\b/i.test(day.note ?? "")
            ? "Travel"
            : "Explore");
        const current = day.date === today;
        const color = ["border-primary", "border-blue", "border-orange", "border-green"][i % 4];
        const text = ["text-primary", "text-blue", "text-orange", "text-green"][i % 4];
        const d = new Date(`${day.date}T12:00:00Z`);
        return (
          <section
            id={`itinerary-day-${trip.id}-${day.date}`}
            ref={current ? todayRef : undefined}
            key={day.date}
            className={`app-card !p-4 border-[1.5px] ${current ? "border-orange" : color}`}
          >
            <div className="flex items-start gap-3">
              <div className="h-[52px] w-[52px] shrink-0 rounded-xl bg-secondary grid place-items-center text-center">
                <span className="font-display text-xl leading-none font-extrabold">
                  {d.getUTCDate()}
                </span>
                <span className="-mt-3 text-[10px] font-bold text-muted-foreground">
                  {d
                    .toLocaleDateString(undefined, { month: "short", timeZone: "UTC" })
                    .toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={`eyebrow ${text}`}>
                  {day.city || trip.destination} · {tag}
                  {current ? " · Today" : ""}
                </p>
                <h3 className="font-display text-base font-extrabold mt-1">Day {i + 1}</h3>
                {day.note && <p className="text-sm text-muted-foreground mt-1">{day.note}</p>}
              </div>
            </div>
            {day.stays.map((stay, j) =>
              past ? (
                <p
                  key={`s${j}`}
                  className="mt-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground min-h-11"
                >
                  <MapPin size={16} className="shrink-0 opacity-50" /> 🛏️ {stay.name}
                  {(day.city || trip.destination) && (
                    <span className="font-normal"> · {day.city || trip.destination}</span>
                  )}
                </p>
              ) : (
                <a
                  key={`s${j}`}
                  href={mapsLink(stay.name, day.city || trip.destination)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-2 text-sm font-semibold text-blue min-h-11"
                >
                  <MapPin size={16} className="shrink-0" /> 🛏️ {stay.name}
                </a>
              ),
            )}
            {day.spots.map((spot, j) => (
              <div key={`p${j}`} className="mt-1">
                {past ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground min-h-11">
                    <MapPin size={16} className="shrink-0 opacity-50" />{" "}
                    <span>
                      {spot.name}
                      <span className="block text-xs font-normal">
                        {spot.address || day.city || trip.destination}
                      </span>
                    </span>
                  </p>
                ) : (
                  <a
                    href={mapsLink(spot.name, day.city || trip.destination, spot.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-semibold text-blue min-h-11"
                  >
                    <MapPin size={16} className="shrink-0" />{" "}
                    <span>
                      {spot.name}
                      {spot.address && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {spot.address}
                        </span>
                      )}
                    </span>
                  </a>
                )}
                {safeLink(spot.link) && past && (
                  <span
                    className="ml-6 inline-flex min-h-9 items-center gap-1 text-xs font-bold text-muted-foreground"
                    aria-disabled="true"
                  >
                    <Link2 size={12} className="opacity-50" /> Booking · trip ended
                  </span>
                )}
                {safeLink(spot.link) && !past && (
                  <a
                    href={safeLink(spot.link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-6 inline-flex min-h-9 items-center text-xs font-bold text-green"
                  >
                    🎟️ Booking or excursion ↗
                  </a>
                )}
              </div>
            ))}
            {!day.note && !day.stays.length && !day.spots.length && !day.flights.length && (
              <p className="text-sm text-muted-foreground mt-2">Open day ✨</p>
            )}
            {day.flights.map((flight, j) => (
              <div key={`f${j}`} className="mt-3 rounded-xl bg-orange-soft p-3 text-sm">
                <p className="text-xs font-bold text-orange">
                  ✈️ FLIGHT · {flightDate(flight.date || day.date)}
                </p>
                <p className="font-semibold">
                  {flight.from} → {flight.to}
                </p>
              </div>
            ))}
          </section>
        );
      })}
      {preview && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">No upcoming plan items.</p>
      )}
    </div>
  );
}

export function ItineraryEditor({
  trip,
  onBack,
  onSaved,
}: {
  trip: TripWithRole;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "upload" | "form" | "review">("choose");
  const [days, setDays] = useState<ItineraryDay[]>(() => blankDays(trip));
  const [tags, setTags] = useState<DayTags>({});
  const [text, setText] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const analyze = useServerFn(analyzeTripPlan);
  useEffect(() => {
    void loadItinerary(trip.id)
      .then((result) => {
        setDays(normalizeDays(trip, result.days));
        setTags(result.tags);
        setSaved(result.saved);
      })
      .catch((error) => setError(friendlyError(error)));
  }, [trip.id]);
  const change = (index: number, update: (day: ItineraryDay) => ItineraryDay) =>
    setDays((current) => current.map((d, i) => (i === index ? update(d) : d)));
  async function extract() {
    setBusy(true);
    setError("");
    try {
      let base64: string | undefined;
      let mime: string | undefined;
      if (file) {
        if (file.size > 6 * 1024 * 1024) throw new Error("Choose a file under 6 MB.");
        mime = file.type;
        if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mime))
          throw new Error("Choose a PDF, JPG, PNG or WebP image.");
        base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.onerror = () => reject(new Error("Could not open that file"));
          r.readAsDataURL(file);
        });
      }
      {
        const st = await creditStatus(trip.id);
        if (st && st.itinerary_today >= 20 && !(await askCredits(trip.id, "itinerary_extra")))
          return;
      }
      const extracted = await analyze({
        data: {
          tripId: trip.id,
          destination: trip.destination,
          startDate: trip.start_date,
          endDate: trip.end_date,
          ...(text.trim() ? { text: text.trim() } : {}),
          ...(file && mime && base64 ? { mime, base64, filename: file.name } : {}),
        },
      });
      setDays(normalizeDays(trip, extracted));
      setMode("review");
    } catch (e) {
      setError(creditError(e));
    } finally {
      setBusy(false);
    }
  }
  async function persist() {
    setBusy(true);
    setError("");
    try {
      await saveItinerary(
        trip.id,
        days.map((day) => ({
          ...day,
          stays: day.stays.filter((s) => s.name.trim()),
          flights: day.flights.filter((f) => f.from.trim() && f.to.trim()),
          spots: day.spots
            .filter((s) => s.name.trim())
            .map((s) => ({
              name: s.name.trim(),
              ...(s.address?.trim() ? { address: s.address.trim() } : {}),
              ...(safeLink(s.link) ? { link: safeLink(s.link) } : {}),
            })),
        })),
      );
      if (trip.myRole === "captain")
        await Promise.all(
          days
            .filter(
              (day) =>
                tags[day.date] ||
                day.flights.length ||
                /\b(fly|flight|travel|air|depart|homebound)\b/i.test(day.note ?? ""),
            )
            .map((day) => saveDayTag(trip.id, day.date, tags[day.date] ?? "Travel")),
        );
      await onSaved();
      onBack();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-8 border-t border-border pt-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-extrabold">Itinerary 🗺️</h2>
        <Button variant="ghost" size="icon" aria-label="Close itinerary" onClick={onBack}>
          <X />
        </Button>
      </div>
      {mode === "choose" && (
        <div className="space-y-3 mt-5">
          <Button
            className="w-full h-16 justify-start bg-blue-soft"
            variant="subtle"
            onClick={() => setMode("upload")}
          >
            <FileUp /> Upload or paste <span className="ml-auto">→</span>
          </Button>
          <Button
            className="w-full h-16 justify-start bg-green-soft"
            variant="subtle"
            onClick={() => setMode("form")}
          >
            <Plus /> Quick form <span className="ml-auto">→</span>
          </Button>
          {saved && (
            <Button
              className="w-full h-14 justify-start"
              variant="outline"
              onClick={() => setMode("review")}
            >
              Edit saved plan →
            </Button>
          )}
          <Button variant="ghost" className="w-full" onClick={onBack}>
            Skip for now
          </Button>
        </div>
      )}
      {mode === "upload" && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            One PDF (up to 3 pages) or one image, or paste your plan.
          </p>
          <label className="block text-sm font-bold">
            Choose a file
            <input
              type="file"
              accept=".pdf,application/pdf,image/png,image/jpeg,image/webp"
              className="mt-2 block w-full text-sm file:rounded-full file:border-0 file:bg-blue-soft file:text-blue file:px-4 file:py-3"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="block text-sm font-bold">
            Or paste text
            <textarea
              className={`${input} h-36 py-3 mt-2`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={20000}
              placeholder="Day 1: arrive in…"
            />
          </label>
          <Button
            variant="playful"
            className="w-full"
            disabled={busy || (!file && !text.trim())}
            onClick={() => void extract()}
          >
            <Sparkles />
            {busy ? "Reading your plan…" : "Preview with AI"}
          </Button>
          <Button variant="ghost" onClick={() => setMode("choose")}>
            <ArrowLeft /> Back
          </Button>
        </div>
      )}
      {(mode === "form" || mode === "review") && (
        <div className="mt-5">
          <p className="text-sm text-muted-foreground">
            {mode === "review"
              ? "Check everything before saving."
              : "Add what you know. Leave the rest open."}
          </p>
          <div className="space-y-5 mt-5">
            {days.map((day, i) => (
              <section
                className="rounded-2xl border border-border bg-card p-4 space-y-3"
                key={day.date}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-extrabold">
                    Day {i + 1} · {dateLabel(day.date)}
                  </h3>
                  {trip.myRole === "captain" && (
                    <select
                      aria-label={`Day ${i + 1} tag`}
                      className="rounded-full bg-orange-soft text-orange text-xs font-bold px-2 py-2"
                      value={
                        tags[day.date] ??
                        (day.flights.length ||
                        /\b(fly|flight|travel|air|depart|homebound)\b/i.test(day.note ?? "")
                          ? "Travel"
                          : "Explore")
                      }
                      onChange={(e) =>
                        setTags((t) => ({ ...t, [day.date]: e.target.value as DayTag }))
                      }
                    >
                      {(Object.keys(tagEmoji) as DayTag[]).map((tag) => (
                        <option key={tag} value={tag}>
                          {tagEmoji[tag]} {tag}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  aria-label={`Day ${i + 1} city`}
                  className={input}
                  placeholder="City or area"
                  value={day.city}
                  maxLength={120}
                  onChange={(e) => change(i, (d) => ({ ...d, city: e.target.value }))}
                />
                <input
                  aria-label={`Day ${i + 1} note`}
                  className={input}
                  placeholder="Day note (optional)"
                  value={day.note ?? ""}
                  maxLength={240}
                  onChange={(e) => change(i, (d) => ({ ...d, note: e.target.value }))}
                />
                {day.stays.map((stay, j) => (
                  <div key={`s${j}`} className="rounded-xl bg-blue-soft p-3 space-y-2">
                    <div className="flex justify-between text-sm font-bold">
                      <span>🛏️ Stay</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove stay"
                        onClick={() =>
                          change(i, (d) => ({ ...d, stays: d.stays.filter((_, k) => k !== j) }))
                        }
                      >
                        <Trash2 size={17} />
                      </Button>
                    </div>
                    <input
                      aria-label="Stay name or area"
                      className={input}
                      placeholder="Name or area"
                      value={stay.name}
                      maxLength={160}
                      onChange={(e) =>
                        change(i, (d) => ({
                          ...d,
                          stays: d.stays.map((s, k) =>
                            k === j ? { ...s, name: e.target.value } : s,
                          ),
                        }))
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        aria-label="Check-in"
                        className={input}
                        placeholder="Check-in"
                        value={stay.checkIn}
                        onChange={(e) =>
                          change(i, (d) => ({
                            ...d,
                            stays: d.stays.map((s, k) =>
                              k === j ? { ...s, checkIn: e.target.value } : s,
                            ),
                          }))
                        }
                      />
                      <input
                        aria-label="Check-out"
                        className={input}
                        placeholder="Check-out"
                        value={stay.checkOut}
                        onChange={(e) =>
                          change(i, (d) => ({
                            ...d,
                            stays: d.stays.map((s, k) =>
                              k === j ? { ...s, checkOut: e.target.value } : s,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
                {day.flights.map((flight, j) => (
                  <div key={`f${j}`} className="rounded-xl bg-orange-soft p-3 space-y-2">
                    <div className="flex justify-between text-sm font-bold">
                      <span>✈️ Flight</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove flight"
                        onClick={() =>
                          change(i, (d) => ({ ...d, flights: d.flights.filter((_, k) => k !== j) }))
                        }
                      >
                        <Trash2 size={17} />
                      </Button>
                    </div>
                    <input
                      aria-label="Flight date"
                      type="date"
                      min={trip.start_date}
                      max={trip.end_date}
                      className={input}
                      value={flight.date}
                      onChange={(e) =>
                        change(i, (d) => ({
                          ...d,
                          flights: d.flights.map((f, k) =>
                            k === j ? { ...f, date: e.target.value } : f,
                          ),
                        }))
                      }
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        aria-label="Flight from"
                        className={input}
                        placeholder="From"
                        value={flight.from}
                        onChange={(e) =>
                          change(i, (d) => ({
                            ...d,
                            flights: d.flights.map((f, k) =>
                              k === j ? { ...f, from: e.target.value } : f,
                            ),
                          }))
                        }
                      />
                      <input
                        aria-label="Flight to"
                        className={input}
                        placeholder="To"
                        value={flight.to}
                        onChange={(e) =>
                          change(i, (d) => ({
                            ...d,
                            flights: d.flights.map((f, k) =>
                              k === j ? { ...f, to: e.target.value } : f,
                            ),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
                {day.spots.map((spot, j) => (
                  <div key={`p${j}`} className="rounded-xl bg-green-soft p-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        aria-label={`Spot ${j + 1}`}
                        className={input}
                        placeholder="📍 Place name"
                        value={spot.name}
                        maxLength={160}
                        onChange={(e) =>
                          change(i, (d) => ({
                            ...d,
                            spots: d.spots.map((s, k) =>
                              k === j ? { ...s, name: e.target.value } : s,
                            ),
                          }))
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove spot"
                        onClick={() =>
                          change(i, (d) => ({ ...d, spots: d.spots.filter((_, k) => k !== j) }))
                        }
                      >
                        <Trash2 size={17} />
                      </Button>
                    </div>
                    <input
                      aria-label={`Spot ${j + 1} address`}
                      className={input}
                      placeholder="Address (map link is automatic)"
                      value={spot.address ?? ""}
                      maxLength={200}
                      onChange={(e) =>
                        change(i, (d) => ({
                          ...d,
                          spots: d.spots.map((s, k) =>
                            k === j ? { ...s, address: e.target.value } : s,
                          ),
                        }))
                      }
                    />
                    <input
                      aria-label={`Spot ${j + 1} booking or excursion link`}
                      type="url"
                      inputMode="url"
                      className={input}
                      placeholder="Booking or excursion link (optional)"
                      value={spot.link ?? ""}
                      maxLength={500}
                      onChange={(e) =>
                        change(i, (d) => ({
                          ...d,
                          spots: d.spots.map((s, k) =>
                            k === j ? { ...s, link: e.target.value } : s,
                          ),
                        }))
                      }
                    />
                    {spot.link?.trim() && !safeLink(spot.link) && (
                      <p className="text-xs text-destructive">Links should start with https://</p>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="subtle"
                    disabled={day.stays.length >= 12}
                    onClick={() =>
                      change(i, (d) => ({
                        ...d,
                        stays: [...d.stays, { name: "", checkIn: "", checkOut: "" }],
                      }))
                    }
                  >
                    + Stay
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    disabled={day.flights.length >= 12}
                    onClick={() =>
                      change(i, (d) => ({
                        ...d,
                        flights: [...d.flights, { date: d.date, from: "", to: "" }],
                      }))
                    }
                  >
                    + Flight
                  </Button>
                  <Button
                    size="sm"
                    variant="subtle"
                    disabled={day.spots.length >= 3}
                    onClick={() => change(i, (d) => ({ ...d, spots: [...d.spots, { name: "" }] }))}
                  >
                    + Spot
                  </Button>
                </div>
              </section>
            ))}
          </div>
          <Button
            variant="playful"
            className="w-full mt-6"
            disabled={busy}
            onClick={() => void persist()}
          >
            {busy ? "Saving…" : "Save itinerary"}
          </Button>
          <Button variant="ghost" className="w-full mt-2" onClick={onBack}>
            Skip for now
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm mt-4">
          {error}
        </p>
      )}
    </div>
  );
}
