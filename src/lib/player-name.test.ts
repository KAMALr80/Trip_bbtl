import { describe, expect, it } from "vitest";
import { playerName } from "./player-name";

const cards = [{ user_id: "a", game_name: "Ace" }];
const members = [
  { user_id: "a", display_name: "Roster A" },
  { user_id: "b", display_name: "Bea" },
  { user_id: "c", display_name: null },
];

describe("playerName", () => {
  it("prefers the player card", () => {
    expect(playerName(cards, members, "a", "Former player")).toBe("Ace");
  });
  it("uses the roster name when there is no card", () => {
    expect(playerName(cards, members, "b", "Former player")).toBe("Bea");
  });
  it("labels someone who is on neither list as a former player", () => {
    expect(playerName(cards, members, "gone", "Former player")).toBe("Former player");
    expect(playerName(cards, members, null, "Former player")).toBe("Former player");
  });
  it("treats an empty name as no name", () => {
    expect(playerName([{ user_id: "c", game_name: "" }], members, "c", "Former player")).toBe(
      "Former player",
    );
  });
});
