// The setup wizard's screens (M2-05). Each screen edits the draft; TripWizard saves it and moves on.
import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { PlacePicker } from "@/components/PlacePicker";
import { VibePicker, type Vibe } from "@/features/onboarding/BetaAccess";
import { addDays } from "@/features/trip/phase";
import { roomIds, rooms, type RoomId } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { COUNTRIES, countryName, placeLabel } from "@/lib/places";
import {
  guessZone,
  loadPlaces,
  searchCities,
  utcOffsetLabel,
  type PlacesData,
} from "@/lib/place-zones";
import {
  callNightDates,
  focusIds,
  hasCallNights,
  suggestedName,
  today,
  type CallNightDraft,
  type Context,
  type SetupDraft,
} from "./wizard-model";

type ScreenProps = {
  draft: SetupDraft;
  set: (patch: Partial<SetupDraft>) => void;
  ctx: Context;
};

const field =
  "mt-2 h-12 w-full rounded-2xl border-2 border-border bg-background px-4 text-base text-foreground outline-none focus:border-primary";
const label = "mt-5 block text-sm font-bold";

function Choice({
  selected,
  title,
  line,
  onClick,
}: {
  selected: boolean;
  title: string;
  line: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      role="radio"
      aria-checked={selected}
      variant={selected ? "subtle" : "outline"}
      className="h-auto min-h-16 w-full justify-start whitespace-normal px-4 py-3 text-left"
      onClick={onClick}
    >
      <span className="min-w-0">
        <span className="block font-display font-extrabold">{title}</span>
        <span className="block text-xs font-normal text-muted-foreground">{line}</span>
      </span>
      {selected && <Check className="ml-auto shrink-0" />}
    </Button>
  );
}

/** 0 · Who's playing? (and the room, when setup didn't start from one). */
export function WhoScreen({ draft, set, fixedRoom }: ScreenProps & { fixedRoom: boolean }) {
  const t = useT();
  const room = draft.room ? rooms[draft.room] : null;
  return (
    <>
      {!fixedRoom && (
        <div role="radiogroup" aria-label={t("setup.who.room")} className="grid gap-2">
          <h2 className={label}>{t("setup.who.room")}</h2>
          {roomIds.map((id) => (
            <Choice
              key={id}
              selected={draft.room === id}
              title={t(`rooms.${id}.name`)}
              line={t(`rooms.${id}.line`)}
              onClick={() =>
                set({
                  room: id,
                  playMode: rooms[id].modes.includes(draft.playMode ?? "crew")
                    ? draft.playMode
                    : undefined,
                })
              }
            />
          ))}
        </div>
      )}
      {room && (
        <div role="radiogroup" aria-label={t("setup.who.mode")} className="grid gap-2">
          {!fixedRoom && <h2 className={label}>{t("setup.who.mode")}</h2>}
          {room.modes.map((m) => (
            <Choice
              key={m}
              selected={draft.playMode === m}
              title={t(`modes.${m}.name`)}
              line={t(`modes.${m}.line`)}
              onClick={() => set({ playMode: m })}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CountrySelect({
  value,
  onChange,
  labelText,
}: {
  value: string | null | undefined;
  onChange: (code: string) => void;
  labelText: string;
}) {
  return (
    <label className={label}>
      {labelText}
      <select className={field} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          {labelText}
        </option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 1 · Where to? Destination with suggestions (travel rooms) or the culture (at home). */
export function WhereScreen({ draft, set }: ScreenProps) {
  const t = useT();
  const room = rooms[draft.room!];
  const [changeCulture, setChangeCulture] = useState(false);
  if (room.atHome)
    return (
      <>
        <CountrySelect
          value={draft.country}
          labelText={t("setup.where.pickCountry")}
          onChange={(code) => set({ country: code, cultures: [code], region: null, city: null })}
        />
        {room.maxFocuses > 0 && (
          <fieldset className="mt-6">
            <legend className="text-sm font-bold">{t("setup.where.focuses")}</legend>
            <p className="text-xs text-muted-foreground">{t("setup.where.focusesHint")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {focusIds.map((f) => {
                const on = draft.focuses?.includes(f) ?? false;
                const full = (draft.focuses?.length ?? 0) >= room.maxFocuses;
                return (
                  <Button
                    key={f}
                    type="button"
                    variant={on ? "subtle" : "outline"}
                    size="sm"
                    aria-pressed={on}
                    disabled={!on && full}
                    className="min-h-11 rounded-full"
                    onClick={() =>
                      set({
                        focuses: on
                          ? (draft.focuses ?? []).filter((x) => x !== f)
                          : [...(draft.focuses ?? []), f],
                      })
                    }
                  >
                    {t(`focuses.${f}`)}
                  </Button>
                );
              })}
            </div>
          </fieldset>
        )}
      </>
    );
  const culture = draft.cultures?.[0] ?? draft.country ?? null;
  return (
    <>
      <PlacePicker
        value={{
          country: draft.country ?? null,
          region: draft.region ?? null,
          city: draft.city ?? null,
        }}
        onChange={(p) =>
          set({
            country: p.country,
            region: p.region,
            city: p.city,
            lat: null,
            lng: null,
            tripTz: null,
            cultures: p.country && p.country !== draft.country ? [p.country] : draft.cultures,
          })
        }
      />
      {culture && (
        <div className="mt-5 rounded-2xl border border-border p-4">
          <p className="text-sm font-bold">{t("setup.where.culture")}</p>
          {changeCulture ? (
            <CountrySelect
              value={culture}
              labelText={t("setup.where.pickCountry")}
              onChange={(code) => {
                set({ cultures: [code] });
                setChangeCulture(false);
              }}
            />
          ) : (
            <p className="mt-1">
              {countryName(culture)}{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => setChangeCulture(true)}>
                {t("setup.basics.change")}
              </Button>
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{t("setup.where.cultureFrom")}</p>
        </div>
      )}
    </>
  );
}

const zones: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      "timeZone",
    );
  } catch {
    return [];
  }
})();

/** 2 · Trip basics: dates, name, vibe, minors, and the trip time zone (looked up, M2-04). */
export function BasicsScreen({ draft, set, ctx }: ScreenProps) {
  const t = useT();
  const room = rooms[draft.room!];
  const [places, setPlaces] = useState<PlacesData | null>(null);
  const [changeZone, setChangeZone] = useState(false);
  const place = {
    country: draft.country ?? null,
    region: draft.region ?? null,
    city: draft.city ?? null,
  };
  const placeName = room.atHome
    ? draft.country
      ? countryName(draft.country)
      : ""
    : (draft.city ?? draft.region ?? (draft.country ? countryName(draft.country) : ""));
  useEffect(() => {
    if (!room.atHome) void loadPlaces().then(setPlaces);
  }, [room.atHome]);
  const guess = useMemo(
    () => (places ? guessZone(places, place) : null),
    [places, place.country, place.region, place.city],
  );
  // Fill in the zone and coordinates once, from the destination; the Captain can still change it.
  useEffect(() => {
    if (!guess || room.atHome) return;
    const patch: Partial<SetupDraft> = {};
    if (!draft.tripTz && guess.zone) patch.tripTz = guess.zone;
    if (guess.zone && "city" in guess && guess.city && draft.lat == null)
      Object.assign(patch, { lat: guess.city.lat, lng: guess.city.lng });
    if (draft.lat == null && !("city" in guess && guess.city) && places && draft.country) {
      const first = searchCities(places, draft.country, draft.region ?? null, "", 1)[0];
      if (first) Object.assign(patch, { lat: first.lat, lng: first.lng });
    }
    if (Object.keys(patch).length) set(patch);
  }, [guess]);
  useEffect(() => {
    if (!draft.name && placeName) set({ name: suggestedName(draft, placeName) });
  }, [placeName]);
  const earliest = room.takeoff === "home_missions" ? addDays(today(ctx), 1) : today(ctx);
  const range: DateRange | undefined = draft.startDate
    ? {
        from: new Date(`${draft.startDate}T12:00:00`),
        to: draft.endDate ? new Date(`${draft.endDate}T12:00:00`) : undefined,
      }
    : undefined;
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days =
    draft.startDate && draft.endDate
      ? Math.round((Date.parse(draft.endDate) - Date.parse(draft.startDate)) / 86_400_000) + 1
      : 0;
  const candidates: string[] = guess && "candidates" in guess ? guess.candidates : [];
  const zoneOptions: string[] =
    changeZone || (!draft.tripTz && candidates.length)
      ? candidates.length && !changeZone
        ? candidates
        : zones
      : [];
  return (
    <>
      <p className={label}>
        {t(room.atHome ? "setup.basics.experienceDates" : "setup.basics.dates")}
      </p>
      <Calendar
        mode="range"
        className="mt-2 w-fit rounded-2xl border border-border [--cell-size:2.75rem]"
        selected={range}
        defaultMonth={range?.from ?? new Date(`${earliest}T12:00:00`)}
        // "Monday, October 26, 2026": the label contains the day number shown (WCAG 2.5.3).
        labels={{ labelDayButton: (d) => d.toLocaleDateString(undefined, { dateStyle: "full" }) }}
        disabled={{ before: new Date(`${earliest}T12:00:00`) }}
        onSelect={(r) =>
          set({
            startDate: r?.from ? iso(r.from) : undefined,
            endDate: r?.to ? iso(r.to) : r?.from ? iso(r.from) : undefined,
          })
        }
      />
      {days > 0 && (
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          {t("setup.basics.days", { count: days })}
        </p>
      )}
      {!room.atHome && (draft.tripTz || zoneOptions.length > 0) && (
        <div className="mt-5 rounded-2xl border border-border p-4">
          {draft.tripTz && !changeZone && (
            <p>
              {t("setup.basics.tripTime", {
                zone: placeName || draft.tripTz,
                offset: utcOffsetLabel(
                  draft.tripTz,
                  draft.startDate ? new Date(`${draft.startDate}T12:00:00Z`) : undefined,
                ),
              })}{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => setChangeZone(true)}>
                {t("setup.basics.change")}
              </Button>
            </p>
          )}
          {zoneOptions.length > 0 && (
            <label className="block text-sm font-bold">
              {candidates.length && !draft.tripTz
                ? t("setup.basics.zoneAsk")
                : t("setup.basics.pickZone")}
              <select
                className={field}
                value={draft.tripTz ?? ""}
                onChange={(e) => {
                  set({ tripTz: e.target.value || null });
                  setChangeZone(false);
                }}
              >
                <option value="">{t("setup.basics.pickZone")}</option>
                {zoneOptions.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")} ({utcOffsetLabel(z)})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <label className={label}>
        {t("setup.basics.name")}
        <input
          className={field}
          maxLength={100}
          value={draft.name ?? ""}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>
      <p className={label}>{t("setup.basics.vibe")}</p>
      <div className="mt-2">
        <VibePicker value={(draft.vibe ?? "chill") as Vibe} onChange={(v) => set({ vibe: v })} />
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="setup-minors" className="block font-bold">
            {t("setup.basics.minors")}
          </label>
          <p className="text-xs text-muted-foreground">{t("setup.basics.minorsHint")}</p>
        </div>
        <Switch
          id="setup-minors"
          checked={!!draft.hasMinors}
          onCheckedChange={(on) =>
            set({ hasMinors: on, vibe: on && draft.vibe === "party" ? "family" : draft.vibe })
          }
        />
      </div>
    </>
  );
}

const blankNight = (date: string): CallNightDraft => ({
  date,
  time: "19:00",
  callLink: "",
  secondLink: "",
});

/** 3 · Pre-Flight: 0–10 days or Skip, and up to 4 call nights (R-204). */
export function PreflightScreen({ draft, set, ctx }: ScreenProps) {
  const t = useT();
  const room = rooms[draft.room!];
  const days = draft.preflightDays ?? 0;
  const dates = callNightDates(draft, ctx.homeTz);
  const nights = draft.callNights ?? [];
  const editNight = (i: number, patch: Partial<CallNightDraft>) =>
    set({ callNights: nights.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  return (
    <>
      <p className="text-muted-foreground">{t("setup.preflight.intro")}</p>
      <p className={label}>{t("setup.preflight.days")}</p>
      <div className="mt-2 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-12 rounded-full"
          aria-label={t("setup.preflight.fewer")}
          disabled={!!draft.preflightSkipped || days <= room.preFlightDays.min}
          onClick={() => set({ preflightDays: days - 1 })}
        >
          <Minus />
        </Button>
        <output
          className="min-w-20 text-center font-display text-2xl font-extrabold"
          aria-live="polite"
        >
          {t("setup.preflight.daysValue", { count: draft.preflightSkipped ? 0 : days })}
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-12 rounded-full"
          aria-label={t("setup.preflight.more")}
          disabled={!!draft.preflightSkipped || days >= room.preFlightDays.max}
          onClick={() => set({ preflightDays: days + 1 })}
        >
          <Plus />
        </Button>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="setup-skip" className="block font-bold">
            {t("setup.preflight.skip")}
          </label>
          <p className="text-xs text-muted-foreground">{t("setup.preflight.skipHint")}</p>
        </div>
        <Switch
          id="setup-skip"
          checked={!!draft.preflightSkipped}
          onCheckedChange={(on) => set({ preflightSkipped: on })}
        />
      </div>
      {hasCallNights(draft) && (
        <section className="mt-6" aria-label={t("setup.preflight.nights")}>
          <h2 className="text-sm font-bold">{t("setup.preflight.nights")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("setup.preflight.nightsHint", { zone: ctx.homeTz.replace(/_/g, " ") })}
          </p>
          {dates.length === 0 && <p className="mt-3 text-sm">{t("setup.preflight.noNights")}</p>}
          {nights.map((n, i) => (
            <div key={i} className="mt-3 rounded-2xl border border-border p-4">
              <div className="flex gap-3">
                <label className="min-w-0 flex-1 text-sm font-bold">
                  {t("setup.preflight.nightDate")}
                  <select
                    className={field}
                    value={n.date}
                    onChange={(e) => editNight(i, { date: e.target.value })}
                  >
                    {[...new Set([n.date, ...dates])].filter(Boolean).map((d) => (
                      <option key={d} value={d}>
                        {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-32 text-sm font-bold">
                  {t("setup.preflight.nightTime")}
                  <input
                    type="time"
                    className={field}
                    value={n.time}
                    onChange={(e) => editNight(i, { time: e.target.value })}
                  />
                </label>
              </div>
              <label className="mt-3 block text-sm font-bold">
                {t("setup.preflight.callLink")}
                <input
                  type="url"
                  inputMode="url"
                  className={field}
                  value={n.callLink}
                  onChange={(e) => editNight(i, { callLink: e.target.value })}
                />
              </label>
              <label className="mt-3 block text-sm font-bold">
                {t("setup.preflight.secondLink")}
                <input
                  type="url"
                  inputMode="url"
                  className={field}
                  value={n.secondLink}
                  onChange={(e) => editNight(i, { secondLink: e.target.value })}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 min-h-11 text-destructive"
                onClick={() => set({ callNights: nights.filter((_, j) => j !== i) })}
              >
                <Trash2 /> {t("setup.preflight.removeNight")}
              </Button>
            </div>
          ))}
          {dates.length > 0 && nights.length < room.maxCallNights && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 min-h-11 w-full"
              onClick={() =>
                set({
                  callNights: [
                    ...nights,
                    blankNight(dates[Math.min(nights.length, dates.length - 1)]!),
                  ],
                })
              }
            >
              <Plus /> {t("setup.preflight.addNight")}
            </Button>
          )}
        </section>
      )}
    </>
  );
}

/** 4 · Trip Season: the crowning (or finale) night, date · time · place (R-205). */
export function SeasonScreen({ draft, set, ctx }: ScreenProps) {
  const t = useT();
  const room = rooms[draft.room!];
  const zone = room.atHome ? ctx.homeTz : (draft.tripTz ?? ctx.homeTz);
  const tripDays: string[] = [];
  if (draft.startDate && draft.endDate)
    for (let d = draft.startDate; d <= draft.endDate; d = addDays(d, 1)) tripDays.push(d);
  useEffect(() => {
    if (!draft.crowningDate && draft.endDate)
      set({ crowningDate: draft.endDate, crowningTime: draft.crowningTime ?? "19:00" });
  }, [draft.endDate]);
  return (
    <>
      <p className="text-muted-foreground">
        {t(room.atHome ? "setup.season.introHome" : "setup.season.intro")}
      </p>
      <h2 className="mt-5 font-display text-xl font-extrabold">
        {t(room.atHome ? "setup.season.finale" : "setup.season.crowning")}
      </h2>
      <div className="flex gap-3">
        <label className={`${label} min-w-0 flex-1`}>
          {t("setup.season.date")}
          <select
            className={field}
            value={draft.crowningDate ?? ""}
            onChange={(e) => set({ crowningDate: e.target.value })}
          >
            {tripDays.map((d) => (
              <option key={d} value={d}>
                {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} w-36`}>
          {t("setup.season.time", { zone: zone.split("/").pop()?.replace(/_/g, " ") })}
          <input
            type="time"
            className={field}
            value={draft.crowningTime ?? ""}
            onChange={(e) => set({ crowningTime: e.target.value })}
          />
        </label>
      </div>
      <label className={label}>
        {t("setup.season.place")}
        <input
          className={field}
          maxLength={120}
          placeholder={t("setup.season.placeHint")}
          value={draft.crowningPlace ?? ""}
          onChange={(e) => set({ crowningPlace: e.target.value })}
        />
      </label>
      <label className={label}>
        {t("setup.season.callLink")}
        <input
          type="url"
          inputMode="url"
          className={field}
          value={draft.crowningCallLink ?? ""}
          onChange={(e) => set({ crowningCallLink: e.target.value })}
        />
      </label>
    </>
  );
}

/** The place, as it is saved in trips.destination. */
export function destinationOf(draft: SetupDraft, gameNightName: string): string {
  if (draft.room === "game_night") return gameNightName;
  if (draft.room && rooms[draft.room as RoomId].atHome)
    return draft.country ? countryName(draft.country) : "";
  return placeLabel({
    country: draft.country ?? null,
    region: draft.region ?? null,
    city: draft.city ?? null,
  });
}
