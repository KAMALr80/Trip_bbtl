import windowSeatArt from "@/assets/window-seat-room.webp";

/** The same unfiltered cabin view across the room and its introduction. */
export function WindowSeatView() {
  return (
    <div className="window-seat-view" aria-label="View through the airplane window">
      <img
        src={windowSeatArt}
        alt="Sunset lagoon through an airplane window, with a camera and backpack beside it"
        width={1536}
        height={1024}
        sizes="(max-width: 600px) calc(100vw - 72px), 660px"
      />
    </div>
  );
}
