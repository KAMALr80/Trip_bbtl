import iconHome from "@/assets/icon-at-home.webp";
import iconMap from "@/assets/icon-map.webp";
import iconPostcard from "@/assets/icon-postcard.webp";
import iconTrophy from "@/assets/icon-trophy.webp";
import type { TripWithRole } from "@/lib/trips";

/** The same artwork used by the Home orbit, sized for inline trip titles. */
export function TripSectionIcon({ trip }: { trip: TripWithRole }) {
  const src = trip.kind === "at_home" ? iconHome : trip.room_listed ? iconTrophy : trip.kind === "cultural_inspiration" ? iconPostcard : iconMap;
  return <img src={src} alt="" aria-hidden="true" width={20} height={20} className="inline-block size-5 shrink-0 align-middle object-contain" />;
}