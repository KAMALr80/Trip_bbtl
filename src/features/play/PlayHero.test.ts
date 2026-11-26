import { describe, expect, it } from "vitest";
import { countdownParts, nextStop } from "./PlayHero";

const DAY = 86_400_000;
const bounds = {
  preflight: [10 * DAY, 20 * DAY] as const,
  takeoff: [20 * DAY, 21 * DAY] as const,
  trip_season: [21 * DAY, 28 * DAY] as const,
  baggage_claim: [28 * DAY, 35 * DAY] as const,
};

describe("nextStop", () => {
  it("counts down to Pre-Flight before the trip's first phase opens", () => {
    expect(nextStop(bounds, null, true, 5 * DAY)).toEqual({ stop: "preflight", at: 10 * DAY });
  });
  it("skips Pre-Flight on a trip without one", () => {
    expect(nextStop(bounds, null, false, 5 * DAY)).toEqual({ stop: "takeoff", at: 20 * DAY });
  });
  it("counts down to the phase after the current one", () => {
    expect(nextStop(bounds, "preflight", true, 12 * DAY)).toEqual({
      stop: "takeoff",
      at: 20 * DAY,
    });
    expect(nextStop(bounds, "trip_season", true, 22 * DAY)).toEqual({
      stop: "baggage_claim",
      at: 28 * DAY,
    });
  });
  it("has nothing left once Baggage Claim is under way", () => {
    expect(nextStop(bounds, "baggage_claim", true, 30 * DAY)).toBeNull();
  });
  it("never counts down to a stop that has already opened", () => {
    expect(nextStop(bounds, "takeoff", true, 21.5 * DAY)).toEqual({
      stop: "baggage_claim",
      at: 28 * DAY,
    });
  });
});

describe("countdownParts", () => {
  it("splits into days, hours and minutes", () => {
    expect(countdownParts(81 * DAY + 14 * 3_600_000 + 5 * 60_000)).toEqual({ d: 81, h: 14, m: 5 });
  });
  it("never goes below zero", () => {
    expect(countdownParts(-5000)).toEqual({ d: 0, h: 0, m: 0 });
  });
});
