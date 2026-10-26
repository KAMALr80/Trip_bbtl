import { describe, expect, it } from "vitest";
import { tabOf, tripIdOf } from "./nav";

describe("tabOf", () => {
  it("matches whole path segments", () => {
    expect(tabOf("/trip")).toBe("Trip");
    expect(tabOf("/trips/new")).toBe("Home"); // the setup wizard isn't the Trip tab
    expect(tabOf("/t/abc/play")).toBe("Play");
    expect(tabOf("/me")).toBe("Me");
    expect(tabOf("/menu")).toBe("Home");
    expect(tripIdOf("/t/abc/trip")).toBe("abc");
  });
});
