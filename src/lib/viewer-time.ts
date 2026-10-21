// Display-only: every time shows in the viewer's own zone, with the trip's zone as a second label when different.
// Server logic never reads this; it keeps using the trip's home/trip time zones.
let viewer: string | null = null;

export const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
const valid = (z: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; } };

export function setViewerZone(zone: string | null | undefined) { viewer = zone && valid(zone) ? zone : null; }
export function viewerZone() { return viewer ?? deviceZone(); }

export function zoneLabel(zone: string) {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longGeneric" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
    if (name && !/^GMT/.test(name)) return name.replace(/ Time$/, "");
  } catch { /* fall through */ }
  return zone.split("/").pop()!.replace(/_/g, " ");
}

const offset = (zone: string, at: Date) => new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;

/** "Sun, Oct 4, 6:00 PM" — plus "your time · 6:00 PM Pacific" when the viewer is elsewhere. */
export function fmtWhen(value: string | number | Date, tripZone: string, opts: { date?: boolean } = {}) {
  const at = new Date(value), mine = viewerZone();
  const base: Intl.DateTimeFormatOptions = opts.date === false ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  try {
    const own = new Intl.DateTimeFormat(undefined, { ...base, timeZone: mine }).format(at);
    if (!tripZone || offset(mine, at) === offset(tripZone, at)) return own;
    const theirs = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: tripZone }).format(at);
    return `${own} your time · ${theirs} ${zoneLabel(tripZone)}`;
  } catch { return at.toLocaleString(); }
}

export function allZones() {
  const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return Array.from(new Set([deviceZone(), ...list]));
}
