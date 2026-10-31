// "Offline · last synced 2h ago" (M4-03): shown while the app runs without a network, reading the
// trip from this phone's snapshot.
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { syncedAgo } from "@/data/offline/rules";
import { useOffline } from "@/data/offline/status";
import { i18n, useT } from "@/i18n";

export function OfflineBanner() {
  const t = useT();
  const { offline, syncedAt } = useOffline();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!offline) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [offline]);
  if (!offline) return null;
  return (
    <div
      role="status"
      className="mx-[18px] mb-3 flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
    >
      <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>{t("offline.title")}</strong>
        {" · "}
        {syncedAt
          ? t("offline.synced", { ago: syncedAgo(syncedAt, now, i18n.language) })
          : t("offline.never")}
        <span className="block text-xs text-muted-foreground">{t("offline.hint")}</span>
      </p>
    </div>
  );
}
