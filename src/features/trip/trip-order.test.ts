import { describe, expect, it } from "vitest";
import { orderTrips, pickActiveTrip, tripStatus, tripIsOver } from "./trip-order";

const AT = new Date("2026-11-06T12:00:00Z");
const trip = (id: string, start: string, end: string, extra: object = {}) => ({
  id,
  start_date: start,
  end_date: end,
  home_timezone: "UTC",
  ...extra,
});
const finished = trip("finished", "2026-10-31", "2026-11-03");
const live = trip("live", "2026-11-05", "2026-11-08");
const soon = trip("soon", "2026-11-07", "2026-11-11");
const later = trip("later", "2027-01-01", "2027-01-05");

describe("tripStatus", () => {
  it("names the three states in home time", () => {
    expect(tripStatus(finished, AT)).toBe("Completed");
    expect(tripStatus(live, AT)).toBe("Active");
    expect(tripStatus(soon, AT)).toBe("Upcoming");
    expect(tripStatus({ ...live, ended_at: "2026-11-05T00:00:00Z" }, AT)).toBe("Completed");
  });
});

describe("pickActiveTrip (QA-03)", () => {
  it("opens the upcoming trip, not the older finished one", () => {
    expect(pickActiveTrip([finished, soon], {}, AT)).toBe("soon");
  });

  it("opens the trip in progress before an upcoming one", () => {
    expect(pickActiveTrip([finished, soon, live], {}, AT)).toBe("live");
  });

  it("opens the nearest of several upcoming trips", () => {
    expect(pickActiveTrip([later, soon], {}, AT)).toBe("soon");
  });

  it("keeps the trip open right now, even a finished one the player chose", () => {
    expect(pickActiveTrip([finished, soon], { current: "finished" }, AT)).toBe("finished");
  });

  it("returns to the trip last opened on this device", () => {
    expect(pickActiveTrip([soon, later], { saved: "later" }, AT)).toBe("later");
  });

  it("a remembered finished trip gives way to a live one", () => {
    expect(pickActiveTrip([finished, soon], { saved: "finished" }, AT)).toBe("soon");
  });

  it("with only finished trips, the remembered one still opens", () => {
    const older = trip("older", "2026-01-01", "2026-01-05");
    expect(pickActiveTrip([older, finished], { saved: "finished" }, AT)).toBe("finished");
  });

  it("ignores a trip the player is no longer in", () => {
    expect(pickActiveTrip([soon], { current: "gone", saved: "gone2" }, AT)).toBe("soon");
  });

  it("has nothing to open with no trips", () => {
    expect(pickActiveTrip([], { saved: "x" }, AT)).toBeNull();
  });

  it("puts a real trip before at-home rooms and sandboxes", () => {
    const home = trip("home", "2026-11-06", "2026-11-07", { kind: "at_home" });
    const sandbox = trip("sandbox", "2026-11-05", "2026-11-09", { is_sandbox: true });
    expect(orderTrips([sandbox, home, soon], AT).map((t) => t.id)).toEqual([
      "soon",
      "home",
      "sandbox",
    ]);
  });
});

describe("tripIsOver (QA-17)", () => {
  const trip = {
    start_date: "2026-11-01",
    end_date: "2026-11-05",
    ended_at: null,
    home_timezone: "UTC",
  };
  it("is over the day after the last day, or once ended early", () => {
    expect(tripIsOver(trip, new Date("2026-11-05T12:00:00Z"))).toBe(false);
    expect(tripIsOver(trip, new Date("2026-11-06T12:00:00Z"))).toBe(true);
    expect(
      tripIsOver({ ...trip, ended_at: "2026-11-03T00:00:00Z" }, new Date("2026-11-03T12:00:00Z")),
    ).toBe(true);
  });
  it("isn't over before or during the trip", () => {
    expect(tripIsOver(trip, new Date("2026-10-20T12:00:00Z"))).toBe(false);
  });
});
