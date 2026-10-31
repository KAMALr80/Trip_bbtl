// The install prompt (M4-01). Chrome and friends fire `beforeinstallprompt` once, early, so it is
// caught when this module loads (imported by the root route) and kept for the install card.
import { useSyncExternalStore } from "react";
import { installPlatform, type InstallPlatform } from "./install-rules";

type PromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: PromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own card at a better moment
    deferred = event as PromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

/** Running as the installed app (Home Screen / app window), not a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    installed ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function snapshot(): string {
  return `${deferred ? 1 : 0}${isStandalone() ? 1 : 0}`;
}

export function useInstall(): {
  platform: InstallPlatform;
  standalone: boolean;
  /** Opens the browser's install prompt; true if the player accepted. */
  prompt: () => Promise<boolean>;
} {
  const key = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => "00",
  );
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    platform: installPlatform(ua, key[0] === "1"),
    standalone: key[1] === "1",
    prompt: async () => {
      const event = deferred;
      if (!event) return false;
      deferred = null;
      notify();
      await event.prompt();
      return (await event.userChoice).outcome === "accepted";
    },
  };
}
