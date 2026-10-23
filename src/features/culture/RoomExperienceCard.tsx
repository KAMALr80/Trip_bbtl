import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import homeRoomArt from "@/assets/travel-from-home-room.webp";
import windowRoomArt from "@/assets/window-seat-room.webp";

/** Shared presentation for samples, personal experiences, guides and recipes. */
export function RoomExperienceCard({
  room,
  children,
  className = "",
  showSave = true,
}: {
  room: "home" | "window";
  children: ReactNode;
  className?: string;
  showSave?: boolean;
}) {
  const [notice, setNotice] = useState(false);
  return (
    <div className={`room-experience-scene room-experience-${room} ${className}`}>
      <figure className="room-experience-placeholder">
        <img
          src={room === "home" ? homeRoomArt : windowRoomArt}
          alt={
            room === "home"
              ? "Friends sharing a lamp-lit culture night at home"
              : "A sunset view through an airplane window with travel gear nearby"
          }
          width={1536}
          height={1024}
          sizes="(max-width: 720px) calc(100vw - 48px), 670px"
        />
        <figcaption>Existing image placeholder · final art pending approval</figcaption>
      </figure>
      <div className="room-experience-paper">
        <div className="room-experience-stamp" aria-hidden="true" />
        <div className="room-experience-writing">{children}</div>
        {showSave && (
          <div className="room-experience-footer">
            <Button variant="outline" className="min-h-11" onClick={() => setNotice(true)}>
              <Download size={17} /> Save
            </Button>
            {notice && <p role="status">Downloads coming soon</p>}
          </div>
        )}
      </div>
    </div>
  );
}
