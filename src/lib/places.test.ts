import { describe, expect, it } from "vitest";
import { placeName } from "./places";

describe("placeName", () => {
  it("shows a culture's country code as the country name (N-7)", () => {
    expect(placeName("PT")).toBe("Portugal");
    expect(placeName("MX")).toBe("Mexico");
  });
  it("leaves places and culture names that aren't codes as they are", () => {
    expect(placeName("Lisbon, Portugal")).toBe("Lisbon, Portugal");
    expect(placeName("Japanese")).toBe("Japanese");
  });
});
