import { describe, expect, it } from "vitest";
import { countCountries, levelFor } from "./levels";

describe("levelFor (R-703)", () => {
  it("has no level before the first stamp", () => {
    expect(levelFor(0)).toBeNull();
  });

  it.each([
    [1, "Tourist"],
    [2, "Tourist"],
    [3, "Explorer"],
    [5, "Voyager"],
    [7, "Globetrotter"],
    [9, "Globetrotter"],
    [10, "Passport Junkie"],
    [15, "Passport Junkie ★"],
    [20, "Passport Junkie ★★"],
    [30, "Passport Junkie ★★★"],
    [99, "Passport Junkie ★★★"],
  ])("%i countries is %s", (countries, name) => {
    expect(levelFor(countries)?.name).toBe(name);
  });

  it("names the next level and when it comes", () => {
    expect(levelFor(4)?.next).toEqual({ name: "Voyager", at: 5 });
    expect(levelFor(30)?.next).toBeNull();
  });
});

describe("countCountries", () => {
  it("counts distinct countries, ignoring case and spacing", () => {
    expect(
      countCountries([{ country: "Thailand" }, { country: " thailand" }, { country: "Japan" }]),
    ).toBe(2);
    expect(countCountries([])).toBe(0);
  });
});
