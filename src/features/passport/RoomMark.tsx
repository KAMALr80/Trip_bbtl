// The room a stamp came from, as a small icon with its name for screen readers (founder review:
// the stamp picker didn't say which room a trip was).
import { useT } from "@/i18n";
import { roomIds, type RoomId } from "@/features/trip/rooms";

const ICON: Record<RoomId, string> = {
  trip: "✈️",
  window_seat: "🪟",
  explore_culture: "🧭",
  show_culture: "🎎",
  game_night: "🎲",
};

export const roomOf = (room: string | null | undefined): RoomId =>
  roomIds.find((r) => r === room) ?? "trip";

export function RoomMark({ room }: { room: string | null | undefined }) {
  const t = useT();
  const id = roomOf(room);
  return (
    <span role="img" aria-label={t(`rooms.${id}.name`)} title={t(`rooms.${id}.name`)}>
      {ICON[id]}
    </span>
  );
}
