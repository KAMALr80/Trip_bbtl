// Is the app offline, and when was its data last synced (M4-03)? Read by the offline banner.
import { useSyncExternalStore } from "react";

let syncedAt: number | null = null;
/** True when the app started from the snapshot because the network was down. */
let fromSnapshot = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setSyncedAt(at: number | null) {
  syncedAt = at;
  notify();
}

export function markStartedOffline(value: boolean) {
  fromSnapshot = value;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onOnline = () => {
    // Back online: the screens refetch (TanStack Query resumes paused queries) and the banner goes.
    fromSnapshot = false;
    notify();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", notify);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", notify);
  };
}

const isOffline = () => fromSnapshot || (typeof navigator !== "undefined" && !navigator.onLine);

export function useOffline(): { offline: boolean; syncedAt: number | null } {
  const offline = useSyncExternalStore(subscribe, isOffline, () => false);
  const at = useSyncExternalStore(
    subscribe,
    () => syncedAt,
    () => null,
  );
  return { offline, syncedAt: at };
}
