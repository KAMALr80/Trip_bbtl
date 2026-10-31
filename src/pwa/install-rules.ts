// When to offer "Install TripJunkies" (M4-01). Pure, so it is unit-tested.

export type InstallPlatform =
  /** Chrome, Edge, Samsung Internet…: the browser has its own install prompt we can open. */
  | "prompt"
  /** Safari on iPhone / iPad: no prompt, so we explain Share → Add to Home Screen. */
  | "ios"
  /** A browser that can't install web apps (or already has): offer nothing. */
  | "none";

/** The platform from the user agent, and whether the browser fired `beforeinstallprompt`. */
export function installPlatform(ua: string, hasPrompt: boolean): InstallPlatform {
  if (hasPrompt) return "prompt";
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));
  // Only Safari can add to the Home Screen on older iOS; other iOS browsers say CriOS/FxiOS/EdgiOS.
  if (ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA\//.test(ua)) return "ios";
  return "none";
}

const DAY = 86_400_000;
/** "Install so games work on the plane": asked again this close to the next trip. */
export const BEFORE_TAKEOFF_DAYS = 3;

/**
 * Offer the install card? Only to a player in a trip (after joining, not on first visit), never in
 * the installed app, and not again after "Not now" until the days before their next trip starts.
 */
export function shouldOfferInstall(o: {
  platform: InstallPlatform;
  standalone: boolean;
  inATrip: boolean;
  /** When the player tapped "Not now", if ever (ms). */
  dismissedAt: number | null;
  /** The next trip's first day (ms, start of day), if any. */
  nextTripStart: number | null;
  now: number;
}): boolean {
  if (o.platform === "none" || o.standalone || !o.inATrip) return false;
  if (o.dismissedAt === null) return true;
  if (o.nextTripStart === null) return false;
  const windowOpens = o.nextTripStart - BEFORE_TAKEOFF_DAYS * DAY;
  return o.now >= windowOpens && o.now < o.nextTripStart + DAY && o.dismissedAt < windowOpens;
}
