// "Report" on a crew photo (M6-02, R-905). A report sends the photo to the review queue; it doesn't
// hide it on its own. display-only; server: trip_private.report_proof_photo.
import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReportPhoto } from "@/data/moderation";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";

export function ReportPhoto({ proofId }: { proofId: string }) {
  const t = useT();
  const report = useReportPhoto();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (report.isSuccess)
    return (
      <p className="mt-1 text-xs" role="status">
        {t("moderation.reported")}
      </p>
    );
  if (!open)
    return (
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 min-h-11 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <Flag size={14} aria-hidden /> {t("moderation.report")}
      </Button>
    );
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        report.mutate({ proofId, reason });
      }}
    >
      <input
        className="min-h-11 flex-1 rounded-md border bg-background px-2 text-sm"
        aria-label={t("moderation.reason")}
        placeholder={t("moderation.reason")}
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button type="submit" variant="outline" className="min-h-11" disabled={report.isPending}>
        {t("moderation.send")}
      </Button>
      {report.error && (
        <p className="text-xs text-destructive" role="alert">
          {friendlyError(report.error)}
        </p>
      )}
    </form>
  );
}
