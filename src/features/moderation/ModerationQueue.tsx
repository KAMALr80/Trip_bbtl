// The review queue (M6-02, M6-05): photos the AI safety check flagged (hidden from the crew until
// reviewed) and photos players reported. Approve (visible again), remove (hidden for good, no
// points; never deleted) or warn (a note on the uploader's record). Admins only, on the server too;
// every decision is logged (moderation_log).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useModerate, useModerationQueue, type QueueItem } from "@/data/moderation";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";

export function ModerationQueue() {
  const t = useT();
  const [closed, setClosed] = useState(false);
  const queue = useModerationQueue(closed);
  const rows = queue.data ?? [];
  return (
    <section className="mt-4" aria-label={t("moderation.queueTitle")}>
      <p className="text-sm text-muted-foreground">{t("moderation.queueIntro")}</p>
      <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
        {t("moderation.showClosed")}
      </label>
      {queue.error && (
        <p className="text-sm text-destructive" role="alert">
          {friendlyError(queue.error)}
        </p>
      )}
      {!queue.isPending && rows.length === 0 && (
        <p className="mt-3 text-sm">{t("moderation.empty")}</p>
      )}
      <ul className="mt-3 grid gap-3">
        {rows.map((r) => (
          <QueueRow key={r.id} item={r} />
        ))}
      </ul>
    </section>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
  const t = useT();
  const act = useModerate();
  const [note, setNote] = useState("");
  return (
    <li className="app-card">
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {t(
          `moderation.status.${item.status === "flagged" ? "flagged" : item.status === "reported" ? "reported" : item.status === "approved" ? "approved" : "removed"}`,
        )}
        {item.has_minors ? ` · ${t("moderation.minors")}` : ""}
      </p>
      {item.url ? (
        <img src={item.url} alt="" className="mt-2 max-h-72 w-full rounded-md object-contain" />
      ) : (
        <span className="mt-2 block h-40 w-full rounded-md bg-muted" />
      )}
      <p className="mt-2 text-sm">
        <strong>{item.uploader_name}</strong> · {item.trip_name}
      </p>
      {item.challenge && (
        <p className="text-sm">{t("moderation.challenge", { text: item.challenge })}</p>
      )}
      {item.body && <p className="text-sm">“{item.body}”</p>}
      {item.ai_flags.length > 0 && (
        <p className="text-sm text-destructive">
          {t("moderation.aiFlags", { flags: item.ai_flags.join(", ") })}
        </p>
      )}
      {item.reports > 0 && (
        <p className="text-sm">
          {t("moderation.reports", { count: item.reports })}
          {item.report_reasons.length ? `: ${item.report_reasons.join(" · ")}` : ""}
        </p>
      )}
      <input
        className="mt-2 min-h-11 w-full rounded-md border bg-background px-2 text-sm"
        aria-label={t("moderation.note")}
        placeholder={t("moderation.note")}
        maxLength={500}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["approve", "remove", "warn"] as const).map((action) => (
          <Button
            key={action}
            variant={action === "remove" ? "destructive" : "outline"}
            className="min-h-11"
            disabled={act.isPending}
            onClick={() => act.mutate({ id: item.id, action, note })}
          >
            {t(`moderation.${action}`)}
          </Button>
        ))}
      </div>
      {act.error && (
        <p className="text-xs text-destructive" role="alert">
          {friendlyError(act.error)}
        </p>
      )}
    </li>
  );
}
