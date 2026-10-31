// "Offline · last synced 2h ago" (M4-03), what is waiting to send, and anything the server refused
// once it was sent (M4-04).
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { dismissRejected, useOutbox } from "@/data/offline/outbox";
import { syncedAgo } from "@/data/offline/rules";
import { useOffline } from "@/data/offline/status";
import { i18n, useT } from "@/i18n";

export function OfflineBanner() {
  const t = useT();
  const { offline, syncedAt } = useOffline();
  const outbox = useOutbox();
  const queued = outbox.filter((e) => e.status === "queued").length;
  const rejected = outbox.filter((e) => e.status === "rejected");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!offline) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [offline]);
  if (!offline && !queued && !rejected.length) return null;
  return (
    <div className="mx-[18px] mb-3 grid gap-2">
      {(offline || queued > 0) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <WifiOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>
            {offline && (
              <>
                <strong>{t("offline.title")}</strong>
                {" · "}
                {syncedAt
                  ? t("offline.synced", { ago: syncedAgo(syncedAt, now, i18n.language) })
                  : t("offline.never")}
                <span className="block text-xs text-muted-foreground">{t("offline.hint")}</span>
              </>
            )}
            {queued > 0 && (
              <span className="block text-xs font-bold">
                {t("offline.queued", { count: queued })}
              </span>
            )}
          </p>
        </div>
      )}
      {rejected.map((e) => (
        <div
          key={e.id}
          role="alert"
          className="flex items-start justify-between gap-2 rounded-xl border border-destructive px-3 py-2 text-sm"
        >
          <p>
            {t("offline.refused", {
              what: t(`offline.what.${e.action.kind}`),
              reason: e.error ?? "",
            })}
          </p>
          <Button size="sm" variant="outline" onClick={() => void dismissRejected(e.id)}>
            {t("offline.dismiss")}
          </Button>
        </div>
      ))}
    </div>
  );
}
