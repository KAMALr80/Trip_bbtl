// Destination → coordinates and trip time zone (M2-04, R-108). Pure lookups over
// src/lib/places-data.json, which loadPlaces() fetches on first use (it is not in the main bundle).
// Order: a known city gives its own zone; otherwise the region's zone if the region has one;
// otherwise the country's if it has one. Countries with several zones and no city or region
// (the US, Indonesia, Brazil, …) return candidates so the Captain picks.
import type { Place } from "./places";

export type PlacesData = {
  zones: string[];
  /** [name, ISO country, region, lat, lng, zone index], most populous first. */
  cities: [string, string, string, number, number, number][];
};
export type CityMatch = {
  name: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  zone: string;
};
export type ZoneGuess =
  | { zone: string; from: "city" | "region" | "country"; city?: CityMatch }
  | { zone: null; candidates: string[] };

let loading: Promise<PlacesData> | null = null;
export function loadPlaces(): Promise<PlacesData> {
  loading ??= import("./places-data.json").then((m) => (m.default ?? m) as unknown as PlacesData);
  return loading;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function rows(data: PlacesData) {
  return data.cities.map(([name, country, region, lat, lng, z]) => ({
    name,
    country,
    region,
    lat,
    lng,
    zone: data.zones[z]!,
  }));
}
const cache = new WeakMap<PlacesData, CityMatch[]>();
const all = (data: PlacesData) => {
  let list = cache.get(data);
  if (!list) cache.set(data, (list = rows(data)));
  return list;
};

/** Regions (states, provinces) of a country that have known cities. */
export function regionsOf(data: PlacesData, country: string): string[] {
  return [
    ...new Set(
      all(data)
        .filter((c) => c.country === country && c.region)
        .map((c) => c.region),
    ),
  ].sort();
}

/** City suggestions for what the Captain typed, most populous first. */
export function searchCities(
  data: PlacesData,
  country: string | null,
  region: string | null,
  typed: string,
  limit = 8,
): CityMatch[] {
  const q = fold(typed);
  return all(data)
    .filter(
      (c) =>
        (!country || c.country === country) &&
        (!region || fold(c.region) === fold(region)) &&
        (!q || fold(c.name).startsWith(q) || fold(c.name).includes(` ${q}`)),
    )
    .slice(0, limit);
}

function zonesBy(list: CityMatch[]): string[] {
  const weight = new Map<string, number>();
  list.forEach((c, i) => weight.set(c.zone, (weight.get(c.zone) ?? 0) + 1 / (i + 1)));
  return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([z]) => z);
}

export function guessZone(data: PlacesData, place: Place): ZoneGuess {
  if (!place.country) return { zone: null, candidates: [] };
  const inCountry = all(data).filter((c) => c.country === place.country);
  const inRegion = place.region
    ? inCountry.filter((c) => fold(c.region) === fold(place.region!))
    : [];
  if (place.city) {
    const pool = inRegion.length ? inRegion : inCountry;
    const city = pool.find((c) => fold(c.name) === fold(place.city!));
    if (city) return { zone: city.zone, from: "city", city };
  }
  const regionZones = zonesBy(inRegion);
  if (regionZones.length === 1) return { zone: regionZones[0]!, from: "region" };
  const countryZones = zonesBy(inCountry);
  if (countryZones.length === 1) return { zone: countryZones[0]!, from: "country" };
  return { zone: null, candidates: regionZones.length ? regionZones : countryZones };
}

/** "UTC+8" for a zone at a moment (the trip's first day, for example). */
export function utcOffsetLabel(zone: string, at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  return (name ?? "GMT").replace("GMT", "UTC").replace(/^UTC$/, "UTC+0");
}
