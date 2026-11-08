// Phase engine, TypeScript mirror (M2-03, dev-docs/03 §6). The server's
// trip_private.phase_at(...) is the rule; this copy is for display and countdowns only, and both
// run the same cases in supabase/tests/fixtures/phases.json.
//
// Phases, in order:
//   setup          draft: the Captain hasn't finished setup
//   upcoming       set up, but before the first phase opens
//   preflight      0–10 days, closing 23:59 home time the night before takeoff (R-101)
//   takeoff        trips: takeoff day from 00:00 home time until Trip Season starts (R-102, R-111)
//                  at home: Home Missions, the day before the first experience day (R-110)
//   trip_season    trips: from "We've arrived", or the backup at 23:59 trip time the next night,
//                  to the end of the last trip day (R-103); at home: the experience days
//   baggage_claim  the 7 days after the last trip day, in home time (R-104); it starts when the
//                  trip ends in trip time, so its first stretch counts as Day 1
//   archived       after Day 7
// Late start and Skip need no special case: the phase is whatever the instant falls in (R-105).
import type { RoomId } from "./rooms";
import { rooms } from "./rooms";

export const phases = [
  "setup",
  "upcoming",
  "preflight",
  "takeoff",
  "trip_season",
  "baggage_claim",
  "archived",
] as const;
export type Phase = (typeof phases)[number];

export type PhaseInput = {
  room: RoomId;
  /** First and last trip / experience day, YYYY-MM-DD (local dates). */
  startDate: string;
  endDate: string;
  preflightDays: number;
  preflightSkipped: boolean;
  homeTz: string;
  /** Destination zone; at-home rooms and a missing value use home time (R-108). */
  tripTz: string | null;
  /** The "We've arrived" tap (ISO instant), if any. */
  arrivedAt: string | null;
  /** False while the trip is still a setup draft. */
  setupComplete: boolean;
};

export type PhaseWindow = {
  phase: Phase;
  /** ISO instants; null when the phase is open-ended. */
  startsAt: string | null;
  endsAt: string | null;
  /** The zone this phase is measured in. */
  tz: string;
  /** 1-based day inside the phase (in `tz`), null for open-ended phases. */
  dayIndex: number | null;
};

const DAY = 86_400_000;

function offsetMs(tz: string, at: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(new Date(at))
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? "");
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) * 60_000;
}

/** A local date + minutes past midnight in `tz`, as an instant. Matches Postgres's
 * `timestamp AT TIME ZONE tz`: a time inside a DST gap takes the offset from before the change, and
 * an ambiguous time takes the offset from after it (standard time in both cases). */
export function zonedInstant(date: string, minutes: number, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d) + minutes * 60_000;
  const before = offsetMs(tz, wall - DAY);
  const after = offsetMs(tz, wall + DAY);
  if (before === after) return wall - before;
  const a = wall - before;
  const b = wall - after;
  const aValid = offsetMs(tz, a) === before;
  const bValid = offsetMs(tz, b) === after;
  if (bValid) return b;
  if (aValid) return a;
  return a;
}

/** The local calendar date of an instant in `tz`, YYYY-MM-DD. */
export function localDate(at: number, tz: string): string {
  return new Date(at + offsetMs(tz, at)).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d) + days * DAY).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

const iso = (t: number) => new Date(t).toISOString();

/** Phase boundaries as instants, in order. Empty phases have start === end. */
export function phaseBoundaries(input: PhaseInput) {
  const room = rooms[input.room];
  const home = input.homeTz;
  const away = room.atHome ? home : (input.tripTz ?? home);
  const midnight = (date: string, tz: string) => zonedInstant(date, 0, tz);
  const preDays = input.preflightSkipped ? 0 : Math.max(0, input.preflightDays);

  if (room.atHome) {
    const takeoffDay = room.takeoff === "none" ? input.startDate : addDays(input.startDate, -1);
    const takeoffStart = midnight(takeoffDay, home);
    const seasonStart = midnight(input.startDate, home);
    const seasonEnd = midnight(addDays(input.endDate, 1), home);
    return {
      tz: { preflight: home, takeoff: home, trip_season: home, baggage_claim: home },
      preflight: [midnight(addDays(takeoffDay, -preDays), home), takeoffStart] as const,
      takeoff: [takeoffStart, seasonStart] as const,
      trip_season: [seasonStart, seasonEnd] as const,
      baggage_claim: [seasonEnd, midnight(addDays(input.endDate, 8), home)] as const,
      seasonStartDate: input.startDate,
    };
  }

  const takeoffStart = midnight(input.startDate, home);
  const seasonEnd = midnight(addDays(input.endDate, 1), away);
  const backup = zonedInstant(addDays(input.startDate, 1), 23 * 60 + 59, away);
  const arrived = input.arrivedAt ? Date.parse(input.arrivedAt) : null;
  let seasonStart = arrived === null ? backup : Math.min(arrived, backup);
  seasonStart = Math.min(Math.max(seasonStart, takeoffStart), Math.max(seasonEnd, takeoffStart));
  const bagEnd = Math.max(midnight(addDays(input.endDate, 8), home), seasonEnd);
  return {
    tz: { preflight: home, takeoff: home, trip_season: away, baggage_claim: home },
    preflight: [midnight(addDays(input.startDate, -preDays), home), takeoffStart] as const,
    takeoff: [takeoffStart, seasonStart] as const,
    trip_season: [seasonStart, Math.max(seasonEnd, seasonStart)] as const,
    baggage_claim: [Math.max(seasonEnd, seasonStart), bagEnd] as const,
    seasonStartDate: localDate(seasonStart, away),
  };
}

export function phaseAt(input: PhaseInput, at: Date | string | number): PhaseWindow {
  const t =
    typeof at === "number" ? at : Date.parse(String(at instanceof Date ? at.toISOString() : at));
  const home = input.homeTz;
  if (!input.setupComplete)
    return { phase: "setup", startsAt: null, endsAt: null, tz: home, dayIndex: null };
  const b = phaseBoundaries(input);
  const order = ["preflight", "takeoff", "trip_season", "baggage_claim"] as const;
  const first = order.map((p) => b[p]).find(([s, e]) => e > s);
  if (first && t < first[0])
    return { phase: "upcoming", startsAt: null, endsAt: iso(first[0]), tz: home, dayIndex: null };
  for (const p of order) {
    const [s, e] = b[p];
    if (e > s && t >= s && t < e) {
      const tz = b.tz[p];
      return {
        phase: p,
        startsAt: iso(s),
        endsAt: iso(e),
        tz,
        // Baggage Claim days count from the day after the trip, in home time (Day 7 locks, R-104).
        dayIndex:
          p === "baggage_claim"
            ? Math.max(1, daysBetween(input.endDate, localDate(t, home)))
            : daysBetween(localDate(s, tz), localDate(t, tz)) + 1,
      };
    }
  }
  const end = b.baggage_claim[1];
  return { phase: "archived", startsAt: iso(end), endsAt: null, tz: home, dayIndex: null };
}

type TripRow = {
  room: string;
  start_date: string;
  end_date: string;
  preflight_days: number;
  preflight_skipped: boolean;
  home_timezone: string;
  trip_timezone: string | null;
  arrived_at: string | null;
  setup_completed_at: string | null;
};
/** A trips row as engine input. */
export function tripPhaseInput(trip: TripRow): PhaseInput {
  return {
    room: (rooms[trip.room as RoomId] ? trip.room : "trip") as RoomId,
    startDate: trip.start_date,
    endDate: trip.end_date,
    preflightDays: trip.preflight_days,
    preflightSkipped: trip.preflight_skipped,
    homeTz: trip.home_timezone,
    tripTz: trip.trip_timezone,
    arrivedAt: trip.arrived_at,
    setupComplete: trip.setup_completed_at !== null,
  };
}
/** Pre-Flight exists only with at least one day and when it wasn't skipped (R-105). */
export function hasPreflight(trip: { preflight_days: number; preflight_skipped: boolean }) {
  return !trip.preflight_skipped && trip.preflight_days > 0;
}

/** The trip's phase now (or at `at`), for display. The server's trip_phase decides. */
export function tripPhase(trip: TripRow, at: number = Date.now()): PhaseWindow {
  return phaseAt(tripPhaseInput(trip), at);
}
