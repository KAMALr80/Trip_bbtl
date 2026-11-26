import { describe, expect, it } from "vitest";
import { COUNTRIES, placeName } from "./places";

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

describe("COUNTRIES", () => {
  it("leaves out browser test locales and unions (founder review: 'Pseudo-Accents')", () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names.some((n) => /pseudo/i.test(n))).toBe(false);
    expect(COUNTRIES.some((c) => c.code === "EU")).toBe(false);
    expect(names).toContain("Portugal");
  });
});
