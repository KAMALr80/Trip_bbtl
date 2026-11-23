import { describe, expect, it } from "vitest";
import { matches, SEARCH_GAMES } from "./HomeSearch";

describe("Home search matching", () => {
  it("matches every word typed, in any order, ignoring case and accents", () => {
    expect(matches("Never Have I Ever", "ever never")).toBe(true);
    expect(matches("Côte d'Ivoire", "cote")).toBe(true);
    expect(matches("Portugal", "PORT")).toBe(true);
    expect(matches("Portugal", "spain")).toBe(false);
  });
  it("finds a game by part of its name", () => {
    expect(SEARCH_GAMES.filter((g) => matches(g, "draw"))).toEqual(["30-sec Draw"]);
  });
});
