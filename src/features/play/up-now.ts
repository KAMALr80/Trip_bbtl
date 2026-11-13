// The quest card on Play's "Up now" list: my own open quest that I haven't done yet. The Showcase is
// one of these (one task each in Pre-Flight, 20 pts), so it shows here too (N-3).
export const UP_NOW_QUEST_KINDS = [
  "sealed_quest",
  "showcase",
  "airport_mission",
  "home_mission",
  "trip_quest",
] as const;

// my_schedule hides the text of these until the player opens them (revealed_at); the Showcase's
// text shows as soon as it opens, so `body` can't tell whether it was done (STG-02).
const REVEAL_KINDS = new Set(["sealed_quest", "airport_mission", "home_mission", "trip_quest"]);

type Item = {
  id: string;
  user_id: string | null;
  kind: string;
  is_open: boolean | null;
  body: string | null;
  closes_at: string | null;
};

/** `done`: schedule ids I've already sent a proof for. */
export function upNowQuest<T extends Item>(
  schedule: readonly T[],
  userId: string,
  now: number,
  done: ReadonlySet<string> = new Set(),
) {
  return schedule.find(
    (i) =>
      i.user_id === userId &&
      (UP_NOW_QUEST_KINDS as readonly string[]).includes(i.kind) &&
      !!i.is_open &&
      !done.has(i.id) &&
      (!REVEAL_KINDS.has(i.kind) || i.body == null) &&
      (!i.closes_at || Date.parse(i.closes_at) > now),
  );
}
