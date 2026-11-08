import { countries as flagCodes } from "country-flag-icons";

export type Place = { country: string | null; region: string | null; city: string | null };

const names =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
export const countryName = (code: string) => {
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** A culture or place for display: trips store a culture as its country code ("PT"), so that
 * reads as the country's name ("Portugal") (N-7). Anything else is shown as given. */
export const placeName = (value: string) => (/^[A-Z]{2}$/.test(value) ? countryName(value) : value);

/** Searchable country list (ISO codes that have an SVG flag), sorted by English name. */
export const COUNTRIES = flagCodes
  .filter((c) => /^[A-Z]{2}$/.test(c))
  .map((code) => ({ code, name: countryName(code) }))
  .filter((c) => c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name));

export const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Puerto Rico",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

/** "Experience Georgia" — US states read better than "United States" at the region level. */
export const placeLabel = (p: Place) =>
  [p.city, p.region, p.country ? countryName(p.country) : null].filter(Boolean).join(", ");
