import { useEffect } from "react";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/app-version";
import { applyUpdate, serviceWorkerRegistration, watchForUpdates } from "@/pwa/register";

const DISMISS_KEY = "tj-update-dismissed";

function dismissed() {
  try {
    return Boolean(sessionStorage.getItem(DISMISS_KEY));
  } catch {
    return false; /* storage unavailable */
  }
}

function prompt(onRefresh: () => void) {
  if (dismissed()) return;
  toast("New version available", {
    id: "tj-update",
    duration: Infinity,
    closeButton: true,
    action: { label: "Refresh", onClick: onRefresh },
    onDismiss: () => {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    },
  });
}

/**
 * Tells the player a new version is out. Prompts; never forces a reload.
 * With the service worker (M4-02): asks for an update when the app becomes visible and prompts once
 * the new build is installed and waiting; Refresh lets it take over. Without one: compares
 * /api/public/version with this build's APP_VERSION.
 */
export function UpdatePrompt() {
  useEffect(() => {
    let shown = false;
    let active = true;
    let stopWatching: (() => void) | undefined;
    let reg: ServiceWorkerRegistration | null = null;

    const checkVersion = async () => {
      if (shown || dismissed()) return;
      try {
        const res = await fetch("/api/public/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version || version === APP_VERSION || shown) return;
        shown = true;
        prompt(() => window.location.reload());
      } catch {
        /* offline — try next time */
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (reg) void reg.update().catch(() => undefined);
      else void checkVersion();
    };

    void serviceWorkerRegistration().then((r) => {
      if (!active) return;
      reg = r;
      if (!r) {
        void checkVersion();
        return;
      }
      stopWatching = watchForUpdates(r, () => {
        if (shown) return;
        shown = true;
        prompt(() => applyUpdate(r));
      });
    });

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      stopWatching?.();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
