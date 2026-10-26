import { describe, expect, it } from "vitest";
import data from "./places-data.json";
import { guessZone, regionsOf, searchCities, utcOffsetLabel, type PlacesData } from "./place-zones";

const places = data as unknown as PlacesData;
const zone = (country: string, region: string | null, city: string | null) => {
  const g = guessZone(places, { country, region, city });
  return g.zone ?? g.candidates;
};

describe("automatic trip time zone (M2-04)", () => {
  it("Bali → Asia/Makassar (beta note: not New York)", () => {
    expect(zone("ID", "Bali", null)).toBe("Asia/Makassar");
    expect(zone("ID", "Bali", "Ubud")).toBe("Asia/Makassar"); // not a listed city: the region decides
    expect(zone("ID", null, "Denpasar")).toBe("Asia/Makassar");
  });
  it("New York → America/New_York", () => {
    expect(zone("US", "New York", "New York")).toBe("America/New_York");
    expect(zone("US", "New York", null)).toBe("America/New_York");
  });
  it("Hawaii and Lisbon", () => {
    expect(zone("US", "Hawaii", null)).toBe("Pacific/Honolulu");
    expect(zone("PT", null, "Lisbon")).toBe("Europe/Lisbon");
  });
  it("one-zone countries need no city", () => {
    expect(zone("JP", null, null)).toBe("Asia/Tokyo");
    expect(zone("TH", null, null)).toBe("Asia/Bangkok");
  });
  it("multi-zone countries without a city ask the Captain", () => {
    const us = zone("US", null, null);
    expect(
      Array.isArray(us) && us.includes("America/New_York") && us.includes("America/Los_Angeles"),
    ).toBe(true);
  });
  it("suggests cities as you type, accents folded", () => {
    expect(searchCities(places, "MX", null, "canc")[0]?.name).toMatch(/Canc[uú]n/);
    expect(searchCities(places, "PT", null, "lis").map((c) => c.name)).toContain("Lisbon");
    expect(regionsOf(places, "ID")).toContain("Bali");
  });
  it("formats the offset", () => {
    expect(utcOffsetLabel("Asia/Makassar")).toBe("UTC+8");
    expect(utcOffsetLabel("UTC")).toBe("UTC+0");
  });
});
