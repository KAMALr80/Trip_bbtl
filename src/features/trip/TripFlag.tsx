import { CountryFlag } from "@/components/CountryFlag";
import { COUNTRIES, US_STATES } from "@/lib/places";
import { PACKS } from "@/features/at-home/AtHome";
import type { TripWithRole } from "@/lib/trips";
import az from "@/assets/state-flags/az.png.asset.json";
import ca from "@/assets/state-flags/ca.png.asset.json";
import co from "@/assets/state-flags/co.png.asset.json";
import fl from "@/assets/state-flags/fl.png.asset.json";
import ga from "@/assets/state-flags/ga.png.asset.json";
import hi from "@/assets/state-flags/hi.png.asset.json";
import il from "@/assets/state-flags/il.png.asset.json";
import nv from "@/assets/state-flags/nv.png.asset.json";
import ny from "@/assets/state-flags/ny.png.asset.json";
import tx from "@/assets/state-flags/tx.png.asset.json";
import wa from "@/assets/state-flags/wa.png.asset.json";

const stateFlags: Record<string, string> = {
  az: az.url,
  ca: ca.url,
  co: co.url,
  fl: fl.url,
  ga: ga.url,
  hi: hi.url,
  il: il.url,
  nv: nv.url,
  ny: ny.url,
  tx: tx.url,
  wa: wa.url,
};

export function TripFlag({
  trip,
  className = "h-4 w-6",
}: {
  trip: TripWithRole;
  className?: string;
}) {
  const pack = trip.kind === "at_home" ? PACKS.find((p) => p.key === trip.at_home_pack) : undefined;
  const country = pack?.code ?? trip.passport_country ?? trip.destination;
  const state =
    trip.passport_state ||
    (US_STATES.find((s) => trip.destination.toLowerCase().includes(s.toLowerCase())) ?? "");
  const stateCode = {
    Nevada: "nv",
    California: "ca",
    Arizona: "az",
    Florida: "fl",
    Texas: "tx",
    "New York": "ny",
    Hawaii: "hi",
    Washington: "wa",
    Georgia: "ga",
    Illinois: "il",
    Colorado: "co",
  }[
    state as
      | "Nevada"
      | "California"
      | "Arizona"
      | "Florida"
      | "Texas"
      | "New York"
      | "Hawaii"
      | "Washington"
      | "Georgia"
      | "Illinois"
      | "Colorado"
  ];
  const code =
    COUNTRIES.find(
      (c) => c.code === country?.toUpperCase() || c.name.toLowerCase() === country?.toLowerCase(),
    )?.code ?? (country?.toLowerCase().includes("united states") || state ? "US" : "");
  if (code === "US" && stateCode && stateFlags[stateCode])
    return (
      <img
        src={stateFlags[stateCode]}
        alt={`${state} flag`}
        className={`${className} inline-block shrink-0 align-middle object-contain`}
      />
    );
  return code ? (
    <CountryFlag code={code} className={`${className} inline-block shrink-0 align-middle`} />
  ) : null;
}
