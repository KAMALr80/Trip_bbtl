import { Plane } from "lucide-react";
import { BrandLockup } from "./BrandLockup";

/** The welcome-only flight joins the brand once, then stays parked beside it. */
export function WelcomeLockup() {
  return (
    <div
      className="welcome-lockup"
      aria-label="TripJunkies trademark. Collect the world with your squad."
    >
      <span className="welcome-lockup-plane" aria-hidden="true">
        <span className="welcome-lockup-trail" />
        <Plane size={20} fill="currentColor" />
      </span>
      <BrandLockup className="welcome-lockup-brand" />
    </div>
  );
}
