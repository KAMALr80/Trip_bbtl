import { describe, expect, it } from "vitest";
import {
  callNightDates,
  nextStep,
  problem,
  stepsFor,
  suggestedName,
  toSetupPayload,
  type SetupDraft,
} from "./wizard-model";

const ctx = { homeTz: "America/New_York", now: Date.parse("2026-06-01T16:00:00Z") };
const trip: SetupDraft = {
  room: "trip",
  playMode: "crew",
  country: "ID",
  region: "Bali",
  city: "Ubud",
  name: "Bali Crew",
  startDate: "2026-06-10",
  endDate: "2026-06-14",
  vibe: "chill",
  tripTz: "Asia/Makassar",
  preflightDays: 5,
  callNights: [
    { date: "2026-06-07", time: "19:00", callLink: "https://meet.example/x", secondLink: "" },
  ],
  crowningDate: "2026-06-13",
  crowningTime: "20:00",
  crowningPlace: "The villa",
};

describe("setup wizard model (M2-05, M2-07)", () => {
  it("asks Who's playing first, then the five screens (Q2 default)", () => {
    expect(stepsFor(trip)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(stepsFor({ room: "game_night" })).toEqual([0, 5]);
    expect(nextStep({ room: "game_night" }, 0)).toBe(5);
  });
  it("a complete trip passes every screen", () => {
    for (const step of [0, 1, 2, 3, 4] as const)
      expect(problem(trip, step, ctx), `step ${step}`).toBeNull();
  });
  it("checks each room's modes (R-004: no solo Game Night; Explore can be solo)", () => {
    expect(problem({ room: "game_night", playMode: "solo" }, 0, ctx)).toBe("mode");
    expect(problem({ room: "explore_culture", playMode: "solo" }, 0, ctx)).toBeNull();
    expect(problem({ room: "window_seat", playMode: "offline" }, 0, ctx)).toBe("mode");
  });
  it("checks dates and lengths (R-110, R-112)", () => {
    expect(problem({ ...trip, endDate: "2026-06-24" }, 2, ctx)).toBe("tooLong");
    expect(
      problem(
        { ...trip, room: "explore_culture", startDate: "2026-06-01", endDate: "2026-06-03" },
        2,
        ctx,
      ),
    ).toBe("atHomeTomorrow");
    expect(problem({ ...trip, startDate: "2026-05-20", endDate: "2026-05-25" }, 2, ctx)).toBe(
      "datesPast",
    );
    expect(problem({ ...trip, hasMinors: true, vibe: "party" }, 2, ctx)).toBe("minorsParty");
    expect(problem({ ...trip, tripTz: null }, 2, ctx)).toBe("tripTz");
  });
  it("call nights sit inside Pre-Flight, up to 4 (R-204)", () => {
    expect(callNightDates(trip, ctx.homeTz)).toEqual([
      "2026-06-05",
      "2026-06-06",
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
    ]);
    expect(
      problem({ ...trip, callNights: [{ ...trip.callNights![0]!, date: "2026-06-10" }] }, 3, ctx),
    ).toBe("callNightWindow");
    expect(problem({ ...trip, preflightSkipped: true }, 3, ctx)).toBe("callNightWindow");
    expect(problem({ ...trip, callNights: Array(5).fill(trip.callNights![0]) }, 3, ctx)).toBe(
      "tooManyCallNights",
    );
    expect(
      problem(
        { ...trip, callNights: [{ ...trip.callNights![0]!, callLink: "meet.example" }] },
        3,
        ctx,
      ),
    ).toBe("link");
    expect(
      problem(
        { ...trip, playMode: "solo", callNights: Array(5).fill(trip.callNights![0]) },
        3,
        ctx,
      ),
    ).toBeNull();
  });
  it("the crowning night is on a trip day, with a place for groups (R-205)", () => {
    expect(problem({ ...trip, crowningDate: "2026-06-15" }, 4, ctx)).toBe("crowningDay");
    expect(problem({ ...trip, crowningPlace: "" }, 4, ctx)).toBe("crowningPlace");
    expect(problem({ ...trip, crowningPlace: "", playMode: "solo" }, 4, ctx)).toBeNull();
  });
  it("turns local times into instants in the right zone (R-108)", () => {
    const p = toSetupPayload(trip, { ...ctx, destination: "Ubud, Bali, Indonesia" });
    expect(p.callNights[0]!.startsAt).toBe("2026-06-07T23:00:00.000Z"); // 19:00 New York
    expect(p.crowningAt).toBe("2026-06-13T12:00:00.000Z"); // 20:00 Bali
    expect(p.tripTz).toBe("Asia/Makassar");
    expect(p.cultures).toEqual(["ID"]);
  });
  it("at-home rooms use home time; solo has no call nights", () => {
    const p = toSetupPayload(
      { ...trip, room: "explore_culture", playMode: "solo", tripTz: "Asia/Tokyo" },
      { ...ctx, destination: "Japan" },
    );
    expect(p.tripTz).toBe("America/New_York");
    expect(p.callNights).toEqual([]);
    expect(p.crowningAt).toBe("2026-06-14T00:00:00.000Z"); // 20:00 New York
  });
  it("Game Night is tonight, without a crowning night", () => {
    const p = toSetupPayload(
      { room: "game_night", playMode: "offline" },
      { ...ctx, destination: "Game Night" },
    );
    expect([p.startDate, p.endDate, p.crowningAt]).toEqual(["2026-06-01", "2026-06-01", null]);
  });
  it("suggests a name from the place", () => {
    expect(suggestedName(trip, "Ubud")).toBe("Ubud Crew");
    expect(suggestedName({ room: "explore_culture" }, "Japan")).toBe("Exploring Japan");
  });
});

describe("tripToDraft (Captain tools reuse the wizard screens)", () => {
  it("round-trips the zones", async () => {
    const { tripToDraft } = await import("./wizard-model");
    const d = tripToDraft(
      {
        room: "trip",
        play_mode: "crew",
        start_date: "2026-06-10",
        end_date: "2026-06-14",
        preflight_days: 5,
        preflight_skipped: false,
        trip_timezone: "Asia/Makassar",
        home_timezone: "America/New_York",
        crowning_at: "2026-06-13T12:00:00.000Z",
        crowning_place: "The villa",
        crowning_call_link: null,
      },
      [
        {
          starts_at: "2099-06-07T23:00:00.000Z",
          call_link: "https://meet.example/x",
          second_link: null,
        },
      ],
    );
    expect([d.crowningDate, d.crowningTime]).toEqual(["2026-06-13", "20:00"]);
    expect(d.callNights?.[0]).toMatchObject({ date: "2099-06-07", time: "19:00" });
  });
});
