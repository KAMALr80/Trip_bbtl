// The quest card on Play's "Up now" list: my own open, unanswered quest. The Showcase is one of
// these (one task each in Pre-Flight, 20 pts), so it shows here too (N-3).
export const UP_NOW_QUEST_KINDS = [
  "sealed_quest",
  "showcase",
  "airport_mission",
  "home_mission",
  "trip_quest",
] as const;

type Item = {
  user_id: string | null;
  kind: string;
  is_open: boolean | null;
  body: string | null;
  closes_at: string | null;
};

export function upNowQuest<T extends Item>(schedule: readonly T[], userId: string, now: number) {
  return schedule.find(
    (i) =>
      i.user_id === userId &&
      (UP_NOW_QUEST_KINDS as readonly string[]).includes(i.kind) &&
      !!i.is_open &&
      i.body == null &&
      (!i.closes_at || Date.parse(i.closes_at) > now),
  );
}
