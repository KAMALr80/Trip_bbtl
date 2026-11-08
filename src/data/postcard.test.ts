import { describe, expect, it } from "vitest";
import { postcardCrown } from "./postcard";

const crown = { season: "trip_season", name: "Casey", points: 40, solo: false };

describe("postcard crown", () => {
  it("reads a crown with a winner", () => {
    expect(postcardCrown.parse({ ...crown, user_id: "u1" }).user_id).toBe("u1");
  });
  it("reads a crown whose winner deleted their account, so the postcard still opens", () => {
    const parsed = postcardCrown.parse({ ...crown, user_id: null, name: "Former player" });
    expect(parsed.user_id).toBeNull();
    expect(parsed.name).toBe("Former player");
  });
});
