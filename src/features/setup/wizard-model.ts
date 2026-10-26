// Captain setup wizard, the rules without the screens (M2-05, M2-07; R-201 – R-207). Which screens a
// room shows, what each screen needs before Next, and how the answers become create_trip_v2's input.
// The server checks everything again; this keeps the Captain from getting there with a mistake.
import { addDays, phaseBoundaries, zonedInstant } from "@/features/trip/phase";
import { rooms, type PlayMode, type RoomId } from "@/features/trip/rooms";

/** 0 Who's playing (asked first, Q2) · 1 Where to? · 2 Basics · 3 Pre-Flight · 4 Trip Season · 5 Invite */
export type Step = 0 | 1 | 2 | 3 | 4 | 5;
export const lastStep: Step = 5;

export type CallNightDraft = { date: string; time: string; callLink: string; secondLink: string };
type DraftFields = {
  room: RoomId;
  playMode: PlayMode;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  cultures: string[];
  focuses: string[];
  name: string;
  startDate: string;
  endDate: string;
  vibe: "family" | "chill" | "party";
  hasMinors: boolean;
  tripTz: string | null;
  preflightDays: number;
  preflightSkipped: boolean;
  callNights: CallNightDraft[];
  crowningDate: string;
  crowningTime: string;
  crowningPlace: string;
  crowningCallLink: string;
  /** Furthest screen reached, so a refresh can't skip ahead. */
  reached: Step;
};
/** Every answer is optional until its screen; undefined clears one. */
export type SetupDraft = { [K in keyof DraftFields]?: DraftFields[K] | undefined };

export const focusIds = [
  "food",
  "music",
  "language",
  "fashion",
  "holidays",
  "history",
  "art",
  "games",
  "manners",
  "folklore",
  "film",
] as const;

/** The screens this room and mode go through, in order. */
export function stepsFor(draft: SetupDraft): Step[] {
  if (draft.room === "game_night") return [0, 5]; // instant: just "Who's playing?" (M2-14)
  return [0, 1, 2, 3, 4, 5];
}
export function nextStep(draft: SetupDraft, step: Step): Step {
  const list = stepsFor(draft);
  return list[Math.min(list.indexOf(step) + 1, list.length - 1)] ?? lastStep;
}
export function prevStep(draft: SetupDraft, step: Step): Step {
  const list = stepsFor(draft);
  return list[Math.max(list.indexOf(step) - 1, 0)] ?? 0;
}

/** Call nights are for crews on the app; solo and one-phone rooms don't have them (Q2 default). */
export const hasCallNights = (d: SetupDraft) =>
  d.playMode === "crew" && !!d.room && rooms[d.room].maxCallNights > 0;

export type Problem =
  | "room"
  | "mode"
  | "destination"
  | "culture"
  | "focuses"
  | "name"
  | "dates"
  | "datesPast"
  | "atHomeTomorrow"
  | "tooLong"
  | "minorsParty"
  | "tripTz"
  | "preflight"
  | "callNightTime"
  | "callNightWindow"
  | "callNightPast"
  | "tooManyCallNights"
  | "crowning"
  | "crowningDay"
  | "crowningPlace"
  | "link";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTime = (s: unknown): s is string => typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
const okLink = (s: string | undefined) => !s?.trim() || /^https:\/\/\S{3,490}$/i.test(s.trim());
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export type Context = { homeTz: string; now: number };
export const today = (ctx: Context) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ctx.homeTz }).format(new Date(ctx.now));

/** What stops this screen's Next button, or null. */
export function problem(draft: SetupDraft, step: Step, ctx: Context): Problem | null {
  const room = draft.room ? rooms[draft.room] : null;
  if (step === 0) {
    if (!room) return "room";
    if (!draft.playMode || !room.modes.includes(draft.playMode)) return "mode";
    return null;
  }
  if (!room) return "room";
  if (step === 1) {
    if (!draft.country) return room.atHome ? "culture" : "destination";
    if ((draft.focuses?.length ?? 0) > room.maxFocuses) return "focuses";
    return null;
  }
  if (step === 2) {
    const name = draft.name?.trim() ?? "";
    if (name.length < 1 || name.length > 100) return "name";
    if (!isDate(draft.startDate) || !isDate(draft.endDate) || draft.endDate < draft.startDate)
      return "dates";
    const now = today(ctx);
    if (draft.endDate < now) return "datesPast";
    if (room.takeoff === "home_missions" && draft.startDate <= now) return "atHomeTomorrow";
    const days = daysBetween(draft.startDate, draft.endDate) + 1;
    if (days > room.mainDays.max || days < room.mainDays.min) return "tooLong";
    if (draft.hasMinors && draft.vibe === "party") return "minorsParty";
    if (!room.atHome && !draft.tripTz) return "tripTz";
    return null;
  }
  if (step === 3) {
    const pre = draft.preflightDays ?? 0;
    if (!draft.preflightSkipped && (pre < 0 || pre > room.preFlightDays.max)) return "preflight";
    const nights = hasCallNights(draft) ? (draft.callNights ?? []) : [];
    if (nights.length > room.maxCallNights) return "tooManyCallNights";
    const window = preflightWindow(draft, ctx.homeTz);
    for (const n of nights) {
      if (!isDate(n.date) || !isTime(n.time)) return "callNightTime";
      if (!okLink(n.callLink) || !okLink(n.secondLink)) return "link";
      const at = zonedInstant(n.date, minutes(n.time), ctx.homeTz);
      if (at <= ctx.now) return "callNightPast";
      if (!window || at < window[0] || at >= window[1]) return "callNightWindow";
    }
    return null;
  }
  if (step === 4) {
    if (!isDate(draft.crowningDate) || !isTime(draft.crowningTime)) return "crowning";
    if (!isDate(draft.startDate) || !isDate(draft.endDate)) return "dates";
    if (draft.crowningDate < draft.startDate || draft.crowningDate > draft.endDate)
      return "crowningDay";
    if (draft.playMode !== "solo" && !draft.crowningPlace?.trim()) return "crowningPlace";
    if (!okLink(draft.crowningCallLink)) return "link";
    return null;
  }
  return null;
}

/** [start, end) of Pre-Flight as instants, or null when there is none (Skip or 0 days). */
export function preflightWindow(draft: SetupDraft, homeTz: string): [number, number] | null {
  if (!draft.room || !isDate(draft.startDate) || !isDate(draft.endDate)) return null;
  const b = phaseBoundaries({
    room: draft.room,
    startDate: draft.startDate,
    endDate: draft.endDate,
    preflightDays: draft.preflightDays ?? 0,
    preflightSkipped: !!draft.preflightSkipped,
    homeTz,
    tripTz: draft.tripTz ?? null,
    arrivedAt: null,
    setupComplete: true,
  });
  return b.preflight[1] > b.preflight[0] ? [b.preflight[0], b.preflight[1]] : null;
}

/** Days a Pre-Flight call night can be on (local dates in home time). */
export function callNightDates(draft: SetupDraft, homeTz: string): string[] {
  const w = preflightWindow(draft, homeTz);
  if (!w) return [];
  const local = (t: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: homeTz }).format(new Date(t));
  const list: string[] = [];
  for (let d = local(w[0]); d < local(w[1]); d = addDays(d, 1)) list.push(d);
  return list;
}

/** A trip name to start from: the city (or region, or country) plus "Crew" / the room. */
export function suggestedName(draft: SetupDraft, placeName: string): string {
  if (!placeName) return "";
  if (draft.room === "explore_culture") return `Exploring ${placeName}`;
  if (draft.room === "show_culture") return `${placeName} Showcase`;
  return draft.playMode === "solo" ? `${placeName} Solo` : `${placeName} Crew`;
}

/** create_trip_v2's input. Local dates and times become instants in the right zone: call nights
 * in home time (they're before the flight), the crowning night in trip time (R-108). */
export function toSetupPayload(draft: SetupDraft, ctx: Context & { destination: string }) {
  const room = rooms[draft.room!];
  const tripTz = room.atHome ? ctx.homeTz : (draft.tripTz ?? ctx.homeTz);
  const gameNight = draft.room === "game_night";
  const start = gameNight ? today(ctx) : draft.startDate!;
  const nights = hasCallNights(draft) ? (draft.callNights ?? []) : [];
  return {
    room: draft.room,
    playMode: draft.playMode,
    name: gameNight ? ctx.destination : draft.name?.trim(),
    destination: ctx.destination,
    country: draft.country ?? null,
    state: draft.region ?? null,
    city: draft.city ?? null,
    lat: draft.lat ?? null,
    lng: draft.lng ?? null,
    cultures: draft.cultures ?? (draft.country ? [draft.country] : []),
    focuses: draft.focuses ?? [],
    startDate: start,
    endDate: gameNight ? start : draft.endDate,
    vibe: draft.vibe ?? "chill",
    hasMinors: !!draft.hasMinors,
    preflightDays: draft.preflightSkipped ? 0 : (draft.preflightDays ?? 0),
    preflightSkipped: !!draft.preflightSkipped,
    callNights: nights.map((n) => ({
      startsAt: new Date(zonedInstant(n.date, minutes(n.time), ctx.homeTz)).toISOString(),
      callLink: n.callLink.trim() || null,
      secondLink: n.secondLink.trim() || null,
    })),
    crowningAt:
      gameNight || !draft.crowningDate || !draft.crowningTime
        ? null
        : new Date(
            zonedInstant(draft.crowningDate, minutes(draft.crowningTime), tripTz),
          ).toISOString(),
    crowningPlace: draft.crowningPlace?.trim() || null,
    crowningCallLink: draft.crowningCallLink?.trim() || null,
    homeTz: ctx.homeTz,
    tripTz,
  };
}
