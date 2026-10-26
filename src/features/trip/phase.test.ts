import { describe, expect, it } from "vitest";
import fixtures from "../../../supabase/tests/fixtures/phases.json";
import roomsFixture from "../../../supabase/tests/fixtures/rooms.json";
import { phaseAt, zonedInstant, type PhaseInput } from "./phase";
import { rooms } from "./rooms";

type Case = { name: string; input: PhaseInput; at: string; expect: Record<string, unknown> };

describe("phase engine (shared fixtures)", () => {
  for (const c of fixtures.cases as Case[]) {
    it(c.name, () => {
      const got = phaseAt(c.input, c.at);
      const picked = Object.fromEntries(
        Object.keys(c.expect).map((k) => [k, got[k as keyof typeof got]]),
      );
      expect(picked).toEqual(c.expect);
    });
  }
});

describe("zonedInstant matches Postgres for DST edges", () => {
  it("a time in the spring-forward gap takes the offset from before", () => {
    expect(new Date(zonedInstant("2026-03-08", 150, "America/New_York")).toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });
  it("an ambiguous fall-back time takes the offset from after", () => {
    expect(new Date(zonedInstant("2026-11-01", 90, "America/New_York")).toISOString()).toBe(
      "2026-11-01T06:30:00.000Z",
    );
  });
});

describe("room config", () => {
  it("matches supabase/tests/fixtures/rooms.json (which the SQL room_rules is tested against)", () => {
    expect(JSON.parse(JSON.stringify(rooms))).toEqual(roomsFixture);
  });
});

describe("generated pgTAP fixture tests", () => {
  it("are up to date (run: bun scripts/db/fixture-tests.ts)", async () => {
    const { readFileSync } = await import("node:fs");
    const { generated } = await import("../../../scripts/db/fixture-tests");
    for (const [path, make] of Object.entries(generated))
      expect(readFileSync(path, "utf8"), path).toBe(make());
  });
});
