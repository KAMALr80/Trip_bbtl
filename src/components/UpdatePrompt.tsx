import { useEffect } from "react";
import { toast } from "sonner";
import { APP_VERSION } from "@/lib/app-version";

const DISMISS_KEY = "tj-update-dismissed";

/** Checks the live version on mount and when the app becomes visible. Prompts; never forces a reload. */
export function UpdatePrompt() {
  useEffect(() => {
    let shown = false;
    const check = async () => {
      if (shown || document.visibilityState !== "visible") return;
      try {
        if (sessionStorage.getItem(DISMISS_KEY)) return;
      } catch {
        /* storage unavailable */
      }
      try {
        const res = await fetch("/api/public/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!version || version === APP_VERSION || shown) return;
        shown = true;
        toast("New version available", {
          id: "tj-update",
          duration: Infinity,
          closeButton: true,
          action: { label: "Refresh", onClick: () => window.location.reload() },
          onDismiss: () => {
            try {
              sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
          },
        });
      } catch {
        /* offline — try next time */
      }
    };
    void check();
    const onVis = () => {
      void check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return null;
}
