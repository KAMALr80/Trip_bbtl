import { describe, expect, it } from "vitest";
import { chooseTripPhase } from "./phase";

describe("chooseTripPhase (QA-02)", () => {
  it("the server's answer wins over the device for every phase", () => {
    for (const phase of [
      "setup",
      "upcoming",
      "preflight",
      "takeoff",
      "trip_season",
      "baggage_claim",
      "archived",
    ])
      expect(chooseTripPhase(phase, phase === "takeoff" ? "preflight" : "takeoff")).toBe(phase);
  });

  it("uses the mirror until the server answers, or when it can't", () => {
    expect(chooseTripPhase(undefined, "preflight")).toBe("preflight");
    expect(chooseTripPhase(null, "trip_season")).toBe("trip_season");
    expect(chooseTripPhase("not-a-phase", "takeoff")).toBe("takeoff");
  });
});
