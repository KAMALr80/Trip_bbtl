// Pre-trip season sizing. The Captain's game start date defines the window; every screen
// derives mode, countdown and stages from it so they never disagree.
const dayOf = (iso: string, zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export type SeasonMode = "Takeoff Mode" | "Sprint Season" | "Short Season" | "Full Season";
const PLAN_NAMES: Record<string, string> = { recommended: "Recommended plan", short: "Short & Sweet plan", custom: "Custom plan" };

/** Start date = saved game start, else the later of today or 12 weeks before departure. */
export function gameStart(trip: { start_date: string; home_timezone: string; game_start?: string | null }) {
  const today = dayOf(new Date().toISOString(), trip.home_timezone);
  if (trip.game_start) return trip.game_start;
  const earliest = addDays(trip.start_date, -84);
  return today > earliest ? today : earliest;
}

export function seasonMode(windowDays: number): SeasonMode {
  return windowDays <= 2 ? "Takeoff Mode" : windowDays <= 13 ? "Sprint Season" : windowDays <= 55 ? "Short Season" : "Full Season";
}

export function skipPasses(nights: number) { return Math.min(3, Math.max(1, Math.floor(nights / 4))); }
export function questionRhythm(windowDays: number, nights: number) { return nights <= 1 ? "no weekly questions" : windowDays < 14 ? "a question every 2 days" : "weekly questions"; }

export function seasonPlan(trip: { start_date: string; home_timezone: string; game_start?: string | null; game_plan?: string | null }, nightCount: number) {
  const today = dayOf(new Date().toISOString(), trip.home_timezone);
  const start = gameStart(trip);
  const windowDays = Math.max(0, diff(start, trip.start_date));
  const mode = seasonMode(windowDays);
  const toGo = Math.max(0, diff(today, trip.start_date));
  const kickoffIn = diff(today, start);
  const nights = nightCount <= 1 ? "Meet the Squad" : `${nightCount} game nights`;
  const plan = PLAN_NAMES[trip.game_plan ?? ""] ?? "Recommended plan";
  if (kickoffIn > 0) return { mode, toGo, kickoffIn, label: `Kickoff in ${kickoffIn} day${kickoffIn === 1 ? "" : "s"} · ${plan} · ${nights}` };
  return { mode, toGo, kickoffIn, label: `${mode} · ${nights} · ${toGo === 0 ? "takeoff today ✈️" : `${toGo} day${toGo === 1 ? "" : "s"} to takeoff`}` };
}

export function groupTier(size: number, bigGroup: boolean) {
  if (size <= 12) return { tier: "One room", teams: "optional" as const, locked: false };
  if (size <= 20) return { tier: "Team rooms", teams: "required" as const, locked: false };
  return { tier: "Big Group", teams: "required" as const, locked: !bigGroup };
}
