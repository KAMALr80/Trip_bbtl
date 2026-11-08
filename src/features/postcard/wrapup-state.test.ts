import { describe, expect, it } from "vitest";
import { wrapupState } from "./wrapup";

const LOCKS = "2026-11-11T05:00:00Z";
const base = {
  locksAt: LOCKS,
  questionKeys: ["a", "b", "c"],
  answers: {},
  now: Date.parse("2026-11-08T12:00:00Z"),
};

describe("wrapupState (QA-08)", () => {
  it("before Baggage Claim it's closed", () => {
    for (const phase of ["upcoming", "preflight", "takeoff", "trip_season"])
      expect(wrapupState({ ...base, phase })).toEqual({ open: false, remaining: 0, total: 3 });
  });

  it("stays open from day 1 up to the lock, not just the first two days", () => {
    for (const at of ["2026-11-04T06:00:00Z", "2026-11-06T00:00:00Z", "2026-11-11T04:59:59Z"])
      expect(wrapupState({ ...base, phase: "baggage_claim", now: Date.parse(at) })).toEqual({
        open: true,
        remaining: 3,
        total: 3,
      });
  });

  it("counts real answers only", () => {
    const answers = { a: "Tacos", b: "   " };
    expect(wrapupState({ ...base, phase: "baggage_claim", answers }).remaining).toBe(2);
    const all = { a: "1", b: "2", c: "3" };
    expect(wrapupState({ ...base, phase: "baggage_claim", answers: all })).toEqual({
      open: true,
      remaining: 0,
      total: 3,
    });
  });

  it("closes at the lock time, when the trip locks, and once archived", () => {
    const closed = { open: false, remaining: 0, total: 3 };
    expect(wrapupState({ ...base, phase: "baggage_claim", now: Date.parse(LOCKS) })).toEqual(
      closed,
    );
    expect(wrapupState({ ...base, phase: "baggage_claim", lockedAt: LOCKS })).toEqual(closed);
    expect(wrapupState({ ...base, phase: "archived" })).toEqual(closed);
  });
});
