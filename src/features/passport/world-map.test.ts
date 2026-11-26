import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/places";
import { clusterPins, countryCode, landPath, pinPlace, project } from "./world-map";

const names = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;

describe("countryCode", () => {
  it("knows every country in the country list", () => {
    expect(COUNTRIES.filter((c) => !countryCode(c.code)).map((c) => c.code)).toEqual([]);
    expect(COUNTRIES.filter((c) => !countryCode(c.name)).map((c) => c.name)).toEqual([]);
  });
  it("reads names, codes and common aliases", () => {
    expect(countryCode("Portugal")).toBe("PT");
    expect(countryCode("pt")).toBe("PT");
    expect(countryCode("USA")).toBe("US");
    expect(countryCode("UK")).toBe("GB");
    expect(countryCode("Narnia")).toBeNull();
    expect(countryCode("")).toBeNull();
  });
});

describe("pinPlace", () => {
  const trip = { country: "United States", state: "Texas", culture: null, kind: "road_trip" };
  it("pins a country at its centre", () => {
    expect(pinPlace({ ...trip, country: "Japan", state: null }, false, names)).toMatchObject({
      key: "JP",
      label: "Japan",
    });
  });
  it("splits the US into states only when zoomed in (R-721)", () => {
    expect(pinPlace(trip, false, names)?.key).toBe("US");
    expect(pinPlace(trip, true, names)).toMatchObject({ key: "US-Texas", label: "Texas" });
  });
  it("pins an at-home experience to its culture's country (R-721)", () => {
    expect(
      pinPlace(
        { country: "United States", state: null, culture: "Japan", kind: "postcard" },
        false,
        names,
      )?.key,
    ).toBe("JP");
  });
  it("leaves an unknown place off the map", () => {
    expect(pinPlace({ ...trip, country: "Atlantis" }, false, names)).toBeNull();
  });
});

describe("clusterPins", () => {
  const at = (lat: number, lng: number, label: string) => ({ key: label, label, lat, lng });
  it("merges nearby pins into one numbered bubble and keeps far ones apart", () => {
    const clusters = clusterPins(
      [
        { place: at(39.6, -8, "Portugal"), item: "a" },
        { place: at(40.2, -3.7, "Spain"), item: "b" },
        { place: at(36.5, 138.5, "Japan"), item: "c" },
      ],
      8,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.items.length === 2)?.places).toEqual(["Portugal", "Spain"]);
  });
  it("splits them again when zoomed in", () => {
    const pins = [
      { place: at(39.6, -8, "Portugal"), item: "a" },
      { place: at(40.2, -3.7, "Spain"), item: "b" },
    ];
    expect(clusterPins(pins, 2)).toHaveLength(2);
  });
});

describe("projection and outline", () => {
  it("maps longitude and latitude onto the board", () => {
    expect(project(0, 0)).toEqual({ x: 180, y: 90 });
    expect(project(90, -180)).toEqual({ x: 0, y: 0 });
  });
  it("draws closed rings", () => {
    expect(landPath.startsWith("M")).toBe(true);
    expect(landPath.split("Z").length).toBeGreaterThan(20);
  });
});
