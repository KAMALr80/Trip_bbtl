/** A quiet, optional tap for supported phones; never blocks the action. */
export function hapticTap() {
  if (
    typeof navigator !== "undefined" &&
    navigator.vibrate &&
    typeof window !== "undefined" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    navigator.vibrate(10);
  }
}
