// Environment-level switches for unfinished features (M1-10). One value per deployment, never per
// trip: set VITE_FEATURE_<NAME>=true in the build environment to turn a feature on. Remove a flag
// once its feature ships.
const on = (value: string | undefined) => value === "true";

export const flags = {
  /** The world map (deck slide 15, LATER). */
  map: on(import.meta.env["VITE_FEATURE_MAP"]),
  /** The offline service worker (M4-02). scripts/deploy.sh turns it on for staging and production. */
  serviceWorker: on(import.meta.env["VITE_SERVICE_WORKER"]),
} as const;
