import { describe, expect, it } from "vitest";
import { roomOf } from "./RoomMark";

describe("roomOf", () => {
  it("keeps known rooms and falls back to a trip", () => {
    expect(roomOf("window_seat")).toBe("window_seat");
    expect(roomOf("game_night")).toBe("game_night");
    expect(roomOf("legacy")).toBe("trip");
    expect(roomOf(null)).toBe("trip");
  });
});
