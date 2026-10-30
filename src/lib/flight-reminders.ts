import { useMySchedule } from "@/data/daily";
import { useLiveSession } from "@/data/live";
import type { TripWithRole } from "@/lib/trips";

/** The Home reminder dot: Game Night Live is open, or a sealed quest has dropped and its 3-hour
 * speed bonus (R-322) is still there to take. Reads the schedule (M3-03), not the older quests. */
export function useFlightReminders(trip: TripWithRole | null, userId: string) {
  const schedule = useMySchedule(trip?.id).data ?? [];
  const session = useLiveSession(trip?.id ?? "").data;
  const now = Date.now();
  return (
    session?.status === "open" ||
    schedule.some(
      (i) =>
        i.kind === "sealed_quest" &&
        i.user_id === userId &&
        i.is_open &&
        i.body == null &&
        now < Date.parse(i.opens_at) + 3 * 3_600_000,
    )
  );
}
