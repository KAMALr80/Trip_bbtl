import crownArt from "@/assets/captain-crown.webp";

/** Presentation only: callers use the trip's approved Captain role, never a profile badge. */
export function CaptainCrown({ badge = false }: { badge?: boolean }) {
  return (
    <img
      src={crownArt}
      alt=""
      aria-hidden="true"
      width={128}
      height={128}
      loading="lazy"
      className={badge ? "captain-crown-badge" : "captain-crown-heading"}
    />
  );
}
