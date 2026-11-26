import { describe, expect, it } from "vitest";
import { finalStandings, rankSeason } from "./final-standings";

const me = "me";

describe("finalStandings", () => {
  it("uses Pre-Flight when it is the only season with points", () => {
    const s = finalStandings(
      [
        { user_id: "a", total: 15, rank: 2 },
        { user_id: me, total: 22, rank: 1 },
      ],
      [],
      me,
    );
    expect(s.races.map((r) => r.season)).toEqual(["preflight"]);
    expect(s.races[0]!.rows.map((r) => r.user_id)).toEqual([me, "a"]);
    expect(s.mine).toEqual({ season: "preflight", rank: 1, count: 2, points: 22 });
  });

  it("uses Trip Season when it is the only season with points", () => {
    const s = finalStandings([], [{ user_id: me, total: 31, rank: 1 }], me);
    expect(s.races.map((r) => r.season)).toEqual(["trip_season"]);
    expect(s.mine).toEqual({ season: "trip_season", rank: 1, count: 1, points: 31 });
  });

  it("keeps the two seasons apart and never adds them up", () => {
    const s = finalStandings(
      [
        { user_id: me, total: 22, rank: 1 },
        { user_id: "a", total: 15, rank: 2 },
      ],
      [
        { user_id: "a", total: 38, rank: 1 },
        { user_id: me, total: 31, rank: 2 },
      ],
      me,
    );
    // Trip Season (Jet Setter) first, then Pre-Flight (Early Bird).
    expect(s.races.map((r) => r.season)).toEqual(["trip_season", "preflight"]);
    // The card shows my Trip Season place and points: 31, not 31 + 22.
    expect(s.mine).toEqual({ season: "trip_season", rank: 2, count: 2, points: 31 });
    // Each list shows that season's points only.
    expect(s.races[0]!.rows.find((r) => r.user_id === me)!.total).toBe(31);
    expect(s.races[1]!.rows.find((r) => r.user_id === me)!.total).toBe(22);
  });

  it("orders several players by the server's place", () => {
    const s = finalStandings(
      [],
      [
        { user_id: "c", total: 10, rank: 3 },
        { user_id: "a", total: 40, rank: 1 },
        { user_id: me, total: 25, rank: 2 },
        { user_id: "d", total: 0, rank: 4 },
      ],
      me,
    );
    expect(s.races[0]!.rows.map((r) => [r.user_id, r.rank])).toEqual([
      ["a", 1],
      [me, 2],
      ["c", 3],
      ["d", 4],
    ]);
    expect(s.mine).toEqual({ season: "trip_season", rank: 2, count: 4, points: 25 });
  });

  it("gives me no place when I'm not on the board", () => {
    const s = finalStandings([], [{ user_id: "a", total: 5, rank: 1 }], me);
    expect(s.mine).toBeNull();
    expect(finalStandings([], [], me)).toEqual({ races: [], mine: null });
  });
});

describe("rankSeason ties", () => {
  it("keeps the server's tie-break order when points are equal (R-506)", () => {
    // Same points, but "b" had more Showcase points, so the server put "b" first.
    const rows = rankSeason([
      { user_id: "a", total: 20, rank: 2 },
      { user_id: "b", total: 20, rank: 1 },
    ]);
    expect(rows.map((r) => [r.user_id, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("shares a place when the server ranks a full tie the same", () => {
    const rows = rankSeason([
      { user_id: "a", total: 20, rank: 1 },
      { user_id: "b", total: 20, rank: 1 },
      { user_id: "c", total: 5, rank: 3 },
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("shares a place on equal points when there is no server place", () => {
    const rows = rankSeason([
      { user_id: "a", total: 10 },
      { user_id: "b", total: 30 },
      { user_id: "c", total: 30 },
      { user_id: "d", total: 5 },
    ]);
    expect(rows.map((r) => [r.user_id, r.rank])).toEqual([
      ["b", 1],
      ["c", 1],
      ["a", 3],
      ["d", 4],
    ]);
  });
});
