import { useState } from "react";
import { Button } from "@/components/ui/button";

/** In-app glass sheet for reporting shared content: reason, Send / Back. */
export function ReportSheet({
  title,
  onSend,
  onClose,
}: {
  title: string;
  onSend: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="av-glass-card w-full max-w-lg rounded-t-[24px] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="eyebrow text-orange">REPORT</p>
        <h2 className="font-display text-2xl font-extrabold mt-1">{title}</h2>
        <label className="mt-4 block text-sm font-bold">
          Reason
          <textarea
            className="mt-2 w-full rounded-xl border border-border bg-card p-3 text-base text-foreground outline-none focus:border-primary"
            rows={4}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Tell us briefly what's wrong"
          />
        </label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="min-h-12 rounded-full"
            onClick={onClose}
            disabled={busy}
          >
            Back
          </Button>
          <Button
            variant="playful"
            className="min-h-12 rounded-full"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSend(reason.trim());
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
