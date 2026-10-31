// Tonight's journal (M3-12, R-351, R-352): one prompt tied to the day, with two others to swap
// to; type or dictate with the keyboard's mic. 2 points the first time it's saved. Solo at-home
// rooms use the same card for their daily showcase note (M3-13, R-365).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openItem, useMySchedule } from "@/data/daily";
import { useJournalOptions, useMyJournal, useWriteJournal } from "@/data/guide";
import { useMinute } from "@/features/play/PhaseNotice";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";

export function JournalPrompt({
  trip,
  userId,
  viewOnly,
}: {
  trip: TripWithRole;
  userId: string;
  viewOnly?: boolean | undefined;
}) {
  const now = useMinute();
  const schedule = useMySchedule(trip.id).data;
  const item = openItem(
    schedule?.filter((i) => i.user_id === userId),
    "journal_prompt",
    now,
  );
  if (!item || viewOnly) return null;
  return (
    <JournalCard
      key={item.id}
      trip={trip}
      itemId={item.id}
      showcase={item.variant === "showcase"}
    />
  );
}

function JournalCard({
  trip,
  itemId,
  showcase,
}: {
  trip: TripWithRole;
  itemId: string;
  showcase: boolean;
}) {
  const t = useT();
  const options = useJournalOptions(itemId).data ?? [];
  const entry = useMyJournal(trip.id).data?.find((e) => e.schedule_id === itemId);
  const write = useWriteJournal(trip.id);
  const [choice, setChoice] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const title = showcase ? t("journal.showcaseTitle") : t("journal.title");
  const prompt = options.find((o) => o.idx === choice)?.prompt ?? options[0]?.prompt ?? "";
  const body = text ?? entry?.body ?? "";
  return (
    <section className="app-card mt-3" aria-label={title}>
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {title} · {t("journal.points")}
      </p>
      {entry && !editing ? (
        <>
          <p className="text-sm font-semibold mt-2">{entry.prompt}</p>
          <p className="text-sm mt-1 whitespace-pre-wrap">{entry.body}</p>
          <p className="text-xs font-bold mt-2" role="status">
            {t("journal.saved")}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 min-h-11"
            onClick={() => setEditing(true)}
          >
            {t("journal.edit")}
          </Button>
        </>
      ) : (
        <form
          className="grid gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            write.mutate(
              { item: itemId, body, choice },
              { onSuccess: () => (setEditing(false), setText(null)) },
            );
          }}
        >
          <p className="text-sm font-semibold">{prompt}</p>
          {options.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start min-h-11"
              onClick={() => setChoice((c) => (c + 1) % options.length)}
            >
              {t("journal.swap")}
            </Button>
          )}
          <label className="text-sm font-semibold">
            {t("journal.label")}
            <textarea
              className="block w-full mt-1 rounded-md border bg-background p-2 text-sm"
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">{t("journal.hint")}</p>
          <Button type="submit" className="min-h-11" disabled={write.isPending || !body.trim()}>
            {write.isPending ? t("journal.saving") : t("journal.save")}
          </Button>
          {write.error && (
            <p className="text-xs text-destructive" role="alert">
              {t("journal.error", { reason: friendlyError(write.error) })}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
