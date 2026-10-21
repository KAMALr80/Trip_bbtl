import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "./trips";

export type Stay = { name: string; checkIn: string; checkOut: string };
export type Flight = { date: string; from: string; to: string };
export type Spot = { name: string; address?: string | undefined; link?: string | undefined };
export type DayTag = "Party" | "Explore" | "Chill" | "Travel";
export type ItineraryDay = {
  date: string;
  city: string;
  stays: Stay[];
  flights: Flight[];
  spots: Spot[];
  note?: string;
};
export type DayTags = Record<string, DayTag>;

export function tripDates(trip: Pick<TripWithRole, "start_date" | "end_date">) {
  const dates: string[] = [];
  let date = new Date(`${trip.start_date}T12:00:00Z`);
  const end = new Date(`${trip.end_date}T12:00:00Z`);
  while (date <= end && dates.length < 90) {
    dates.push(date.toISOString().slice(0, 10));
    date = new Date(date.getTime() + 86400000);
  }
  return dates;
}
export function blankDays(trip: TripWithRole): ItineraryDay[] {
  return tripDates(trip).map((date) => ({ date, city: "", stays: [], flights: [], spots: [] }));
}
export function normalizeDays(trip: TripWithRole, incoming: ItineraryDay[]): ItineraryDay[] {
  return blankDays(trip).map((day) => {
    const found = incoming.find((d) => d.date === day.date);
    return found
      ? {
          ...day,
          city: String(found.city ?? "").slice(0, 120),
          note: String(found.note ?? "").slice(0, 240),
          stays: (found.stays ?? []).slice(0, 12),
          flights: (found.flights ?? []).slice(0, 12),
          spots: (found.spots ?? []).slice(0, 3),
        }
      : day;
  });
}
export async function loadItinerary(
  tripId: string,
): Promise<{ days: ItineraryDay[]; tags: DayTags; saved: boolean }> {
  const [plan, tags] = await Promise.all([
    supabase.from("trip_itineraries").select("days").eq("trip_id", tripId).maybeSingle(),
    supabase.from("trip_day_tags").select("day_date,tag").eq("trip_id", tripId),
  ]);
  if (plan.error) throw plan.error;
  if (tags.error) throw tags.error;
  return {
    days: Array.isArray(plan.data?.days) ? (plan.data.days as ItineraryDay[]) : [],
    tags: Object.fromEntries((tags.data ?? []).map((t) => [t.day_date, t.tag as DayTag])),
    saved: Boolean(plan.data),
  };
}
export async function saveItinerary(tripId: string, days: ItineraryDay[]) {
  const { error } = await supabase
    .from("trip_itineraries")
    .upsert({ trip_id: tripId, days: days as never });
  if (error) throw error;
}
export async function saveDayTag(tripId: string, date: string, tag: DayTag) {
  const { error } = await supabase
    .from("trip_day_tags")
    .upsert({ trip_id: tripId, day_date: date, tag });
  if (error) throw error;
}
export function mapsLink(name: string, city: string, address?: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((address?.trim() ? `${name} ${address}` : `${name} ${city}`).trim())}`;
}
export const safeLink = (url?: string) =>
  url && /^https:\/\/[^\s]+$/i.test(url.trim()) ? url.trim() : undefined;
export const tripTz = (t: { trip_timezone?: string | null; home_timezone: string }) =>
  t.trip_timezone || t.home_timezone;
export const localToday = () =>
  tripToday(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
export function tripToday(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
