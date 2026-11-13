import { CountryFlag } from "@/components/CountryFlag";
import { COUNTRIES, US_STATES } from "@/lib/places";
import { PACKS } from "@/features/at-home/AtHome";
import type { TripWithRole } from "@/lib/trips";
import az from "@/assets/state-flags/az.png";
import ca from "@/assets/state-flags/ca.png";
import co from "@/assets/state-flags/co.png";
import fl from "@/assets/state-flags/fl.png";
import ga from "@/assets/state-flags/ga.png";
import hi from "@/assets/state-flags/hi.png";
import il from "@/assets/state-flags/il.png";
import nv from "@/assets/state-flags/nv.png";
import ny from "@/assets/state-flags/ny.png";
import tx from "@/assets/state-flags/tx.png";
import wa from "@/assets/state-flags/wa.png";

const stateFlags: Record<string, string> = {
  az,
  ca,
  co,
  fl,
  ga,
  hi,
  il,
  nv,
  ny,
  tx,
  wa,
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
