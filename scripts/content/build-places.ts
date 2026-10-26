// Builds src/lib/places-data.json (M2-04): ~7,300 cities with region, coordinates and IANA time
// zone, from the city-timezones package (MIT; Natural Earth populated places, public domain).
// The app loads it only when someone searches for a destination. No API key and no per-search
// cost; a paid places API can replace it later behind src/lib/place-zones.ts.
//   bun scripts/content/build-places.ts
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

type Row = {
  city: string;
  lat: number;
  lng: number;
  pop: number;
  iso2: string;
  province: string;
  timezone: string;
};
const rows = (createRequire(import.meta.url)("city-timezones/data/cityMap.json") as Row[]).filter(
  (r) => /^[A-Z]{2}$/.test(r.iso2) && r.timezone && r.city,
);
const zones = [...new Set(rows.map((r) => r.timezone))].sort();
const seen = new Set<string>();
const cities = rows
  .sort((a, b) => b.pop - a.pop)
  .filter((r) => {
    const key = `${r.iso2}|${r.province}|${r.city}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .map((r) => [
    r.city,
    r.iso2,
    r.province ?? "",
    Math.round(r.lat * 1000) / 1000,
    Math.round(r.lng * 1000) / 1000,
    zones.indexOf(r.timezone),
  ]);
writeFileSync(
  new URL("../../src/lib/places-data.json", import.meta.url),
  JSON.stringify({ source: "city-timezones 1.3.4 (Natural Earth)", zones, cities }) + "\n",
);
console.log(`Wrote ${cities.length} cities, ${zones.length} zones`);
