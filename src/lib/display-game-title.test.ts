import { describe, expect, it } from "vitest";
import { arcadeGameType } from "./display-game-title";

// Founder review: the boarding pass tag on a game's detail screen must match the tag on its grid tile.
describe("arcadeGameType", () => {
  it("gives each arcade game the same type as its tile", () => {
    expect(arcadeGameType("30-Sec Draw")).toBe("Draw It");
    expect(arcadeGameType("Guess the Song")).toBe("Sing It");
    expect(arcadeGameType("Vote Showdown")).toBe("Vote It");
    expect(arcadeGameType(" Bingo ")).toBe("Find It");
    expect(arcadeGameType("Two Truths & Lie")).toBe("Know Each Other");
  });
  it("falls back to Team Up for anything else", () => {
    expect(arcadeGameType("Something new")).toBe("Team Up");
  });
});
