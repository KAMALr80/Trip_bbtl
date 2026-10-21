import type { TripWithRole } from "@/lib/trips";
import { tripDisplayName } from "@/lib/trip-display-name";

/** Calendar stores UTC instants; the viewer's calendar converts them to their own zone. */
export function saveFlightEvent(trip: TripWithRole, title: string, startIso: string, durationMinutes: number, suffix: string) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return;
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "CALSCALE:GREGORIAN", "PRODID:-//TripJunkies//Flight Calendar//EN", "BEGIN:VEVENT", `UID:${trip.id}-${suffix}@tripjunkies`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + durationMinutes * 60000))}`, `SUMMARY:${escape(`${tripDisplayName(trip.name)} · ${title}`)}`, "END:VEVENT", "END:VCALENDAR"];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `tripjunkies-${suffix}.ics`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}