import { describe, expect, it } from "vitest";
import { upNowQuest } from "./up-now";

const now = Date.parse("2026-11-08T12:00:00Z");
const item = (over: Partial<Parameters<typeof upNowQuest>[0][number]> & { id: string }) => ({
  user_id: "me",
  kind: "sealed_quest",
  is_open: true,
  body: null,
  closes_at: "2026-11-09T00:00:00Z",
  ...over,
});

describe("upNowQuest", () => {
  it("shows an open Showcase that I haven't done (N-3)", () => {
    expect(upNowQuest([item({ id: "s", kind: "showcase" })], "me", now)?.id).toBe("s");
  });
  it("shows the open Showcase even though its text is already visible (STG-02)", () => {
    const showcase = item({ id: "s", kind: "showcase", body: "Show the crew your packing hack" });
    expect(upNowQuest([showcase], "me", now)?.id).toBe("s");
  });
  it("still shows the other quest kinds until they're opened", () => {
    for (const kind of ["sealed_quest", "airport_mission", "home_mission", "trip_quest"])
      expect(upNowQuest([item({ id: kind, kind })], "me", now)?.id).toBe(kind);
  });
  it("skips someone else's, closed, done, not yet open, and shared items", () => {
    const list = [
      item({ id: "other", user_id: "you", kind: "showcase" }),
      item({ id: "closed", kind: "showcase", closes_at: "2026-11-08T11:00:00Z" }),
      item({ id: "done", kind: "showcase", body: "Show the crew your packing hack" }),
      item({ id: "opened", kind: "sealed_quest", body: "Find a blue door" }),
      item({ id: "later", kind: "showcase", is_open: false }),
      item({ id: "daily", kind: "daily_discovery" }),
    ];
    expect(upNowQuest(list, "me", now, new Set(["done"]))).toBeUndefined();
  });
});
