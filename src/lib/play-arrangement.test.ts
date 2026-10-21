// M0-11 characterisation: the client's phase guess and banner copy, before the M2 phase engine
// replaces them (R-101 – R-107). These pin today's behaviour; they are not the target rules.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { datePhase, phaseBanner, readOfflineRoster, saveOfflineRoster } from "./play-arrangement";
import type { TripWithRole } from "./trips";

// datePhase only reads these fields; the cast keeps fixtures short.
const trip = (fields: Partial<TripWithRole>) =>
  ({
    play_arrangement: "online",
    kind: "trip",
    a2e_room: null,
    start_date: "2026-06-10",
    home_timezone: "America/New_York",
    trip_timezone: null,
    ...fields,
  }) as TripWithRole;

describe("datePhase", () => {
  it("has no phase until the Captain picks who is playing", () => {
    expect(
      datePhase(trip({ play_arrangement: null }), false, new Date("2026-06-01T12:00:00Z")),
    ).toBeNull();
  });

  it("is Pre-Flight before the first trip day and Takeoff from it", () => {
    expect(datePhase(trip({}), false, new Date("2026-06-09T12:00:00Z"))).toBe("preflight");
    expect(datePhase(trip({}), false, new Date("2026-06-10T12:00:00Z"))).toBe("airport");
  });

  it("leaves Trip Season to the server flag", () => {
    expect(datePhase(trip({}), true, new Date("2026-06-01T12:00:00Z"))).toBe("trip");
    expect(datePhase(trip({}), false, new Date("2026-06-14T12:00:00Z"))).toBe("airport");
  });

  it("counts the day in TRIP time, while the server opens Airport Missions in HOME time", () => {
    // 18:00 UTC on Jun 9 is 14:00 Jun 9 in New York (home) but 02:00 Jun 10 in Bali (trip).
    // The client already says Takeoff; mission_action still answers "open on departure day"
    // until 04:00 UTC (midnight New York). Deck R-102: Takeoff is home time. Fixed by M2-03.
    const bali = trip({ trip_timezone: "Asia/Makassar" });
    expect(datePhase(bali, false, new Date("2026-06-09T18:00:00Z"))).toBe("airport");
    expect(datePhase(trip({}), false, new Date("2026-06-09T18:00:00Z"))).toBe("preflight");
  });
});

describe("phaseBanner", () => {
  const takeoff = new Date("2026-06-10T15:00:00Z");

  it("uses flight copy for trips and start-day copy for rooms without a flight", () => {
    expect(phaseBanner(trip({}), false, takeoff)).toBe(
      "Takeoff is underway. Airport Missions are available on departure day.",
    );
    expect(phaseBanner(trip({ kind: "at_home" }), false, takeoff)).toBe(
      "Your start-day missions are open.",
    );
  });

  it("shows nothing in Pre-Flight (deck R-107 wants a banner there too)", () => {
    expect(phaseBanner(trip({}), false, new Date("2026-06-01T12:00:00Z"))).toBeNull();
    expect(phaseBanner(trip({}), true)).toBe("Trip Season is open.");
  });
});

describe("offline roster", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("keeps names on this device only, capped at 10", () => {
    const names = Array.from({ length: 12 }, (_, i) => `Friend ${i + 1}`);
    expect(saveOfflineRoster("t1", names)).toBe(true);
    expect(readOfflineRoster("t1")).toEqual(names.slice(0, 10));
    expect(readOfflineRoster("other")).toEqual([]);
  });

  it("ignores corrupt storage", () => {
    store.set("tj-offline-roster:t1", JSON.stringify(["Ana", 7, null, "Bo"]));
    expect(readOfflineRoster("t1")).toEqual(["Ana", "Bo"]);
    store.set("tj-offline-roster:t1", "{not json");
    expect(readOfflineRoster("t1")).toEqual([]);
  });
});
