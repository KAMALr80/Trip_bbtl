// Registers the service worker (M4-02) when the build turns it on (VITE_SERVICE_WORKER=true, set by
// scripts/deploy.sh for staging and production). Local dev, tests and preview builds run without
// one, and remove any worker a browser still has from an earlier visit.
import { flags } from "@/lib/flags";
import { SKIP_WAITING } from "./sw-plan";

let registration: Promise<ServiceWorkerRegistration | null> | undefined;

export function serviceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return registration;
  registration = start().catch((error: unknown) => {
    console.warn("Service worker registration failed", error);
    return null;
  });
  return registration;
}

async function start(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (!flags.serviceWorker) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) await reg.unregister();
    if (typeof caches !== "undefined") {
      for (const key of await caches.keys()) if (key.startsWith("tj-")) await caches.delete(key);
    }
    return null;
  }
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** A new build is installed and waiting. Only true when an older build controls this page. */
export function updateWaiting(reg: ServiceWorkerRegistration): boolean {
  return Boolean(reg.waiting && navigator.serviceWorker.controller);
}

/** Calls `onReady` whenever a new build finishes installing and waits behind the current one. */
export function watchForUpdates(reg: ServiceWorkerRegistration, onReady: () => void): () => void {
  const onFound = () => {
    const next = reg.installing;
    next?.addEventListener("statechange", () => {
      if (next.state === "installed" && navigator.serviceWorker.controller) onReady();
    });
  };
  reg.addEventListener("updatefound", onFound);
  if (updateWaiting(reg)) onReady();
  return () => reg.removeEventListener("updatefound", onFound);
}

/** Lets the waiting build take over, then reloads once it controls the page. */
export function applyUpdate(reg: ServiceWorkerRegistration) {
  const waiting = reg.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waiting.postMessage({ type: SKIP_WAITING });
}
