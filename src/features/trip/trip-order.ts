// Which trip comes first (QA-03). The trips list and the trip a player lands on share one order:
// live trips before finished ones, sandboxes last.
type OrderTrip = {
  id: string;
  start_date: string;
  end_date: string;
  ended_at?: string | null;
  home_timezone?: string | null;
  kind?: string | null;
  is_sandbox?: boolean | null;
};

export const dayIn = (tz?: string | null, at: Date = new Date()) => {
  try {
    return at.toLocaleDateString("en-CA", { timeZone: tz || "UTC" });
  } catch {
    return at.toISOString().slice(0, 10);
  }
};

/** Upcoming / Active / Completed, judged in the trip's home time zone. */
/** A finished trip: setup prompts (game nights, prizes, invites, a first card) no longer apply
 * (QA-17). */
export const tripIsOver = (
  t: Pick<OrderTrip, "start_date" | "end_date" | "ended_at" | "home_timezone">,
  at = new Date(),
) => tripStatus(t, at) === "Completed";

export function tripStatus(
  t: Pick<OrderTrip, "start_date" | "end_date" | "ended_at" | "home_timezone">,
  at?: Date,
) {
  const today = dayIn(t.home_timezone, at);
  return t.ended_at || t.end_date < today
    ? "Completed"
    : t.start_date > today
      ? "Upcoming"
      : "Active";
}

export function orderTrips<T extends OrderTrip>(trips: readonly T[], at?: Date): T[] {
  const rank = (t: T) =>
    t.is_sandbox ? 3 : tripStatus(t, at) === "Completed" ? 2 : t.kind === "at_home" ? 1 : 0;
  return [...trips].sort((a, b) => rank(a) - rank(b) || a.start_date.localeCompare(b.start_date));
}

/**
 * The trip to open: the one open now, then the one last opened on this device, then the first in
 * the shared order. A remembered trip that has finished gives way to a live one, so last month's
 * trip doesn't keep opening over next week's.
 */
export function pickActiveTrip<T extends OrderTrip>(
  trips: readonly T[],
  choice: { current?: string | null | undefined; saved?: string | null | undefined },
  at?: Date,
): string | null {
  if (choice.current && trips.some((t) => t.id === choice.current)) return choice.current;
  const first = orderTrips(trips, at)[0] ?? null;
  const saved = trips.find((t) => t.id === choice.saved);
  // A sandbox the founder was testing stays open on reload even once its dates are past
  // (Test Lab jumps to Baggage Claim and lock by moving them), so the lab keeps it (STG-07).
  if (
    saved &&
    (saved.is_sandbox ||
      tripStatus(saved, at) !== "Completed" ||
      tripStatus(first!, at) === "Completed")
  )
    return saved.id;
  return first?.id ?? null;
}
