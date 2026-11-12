import { describe, expect, it } from "vitest";
import { preflightSummary } from "./phase";

const trip = {
  room: "trip",
  start_date: "2026-11-14",
  end_date: "2026-11-18",
  preflight_days: 7,
  preflight_skipped: false,
  home_timezone: "UTC",
  trip_timezone: "Europe/Lisbon",
  arrived_at: null,
  setup_completed_at: "2026-11-01T00:00:00Z",
};

describe("preflightSummary (QA-11)", () => {
  it("says when Pre-Flight opens, counted back from the start date", () => {
    expect(preflightSummary(trip)).toEqual({ kind: "opens", date: "2026-11-07" });
  });
  it("says there is no Pre-Flight when it was skipped or has no days", () => {
    expect(preflightSummary({ ...trip, preflight_skipped: true })).toEqual({
      kind: "none",
      takeoff: "2026-11-14",
    });
    expect(preflightSummary({ ...trip, preflight_days: 0 }).kind).toBe("none");
  });
});
