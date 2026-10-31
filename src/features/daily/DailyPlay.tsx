// Daily Discovery on Home and Daily Card on Play (M3-04, R-311 – R-313, R-341). Both show today's
// item from the schedule; a question takes one tap, anything else is "Done it". The server scores
// it (1 for answering, +1 if right, Q4) and refuses a second answer.
import { Button } from "@/components/ui/button";
import {
  openItem,
  useAnswerDaily,
  useDailyAnswers,
  useMySchedule,
  type ScheduleItem,
} from "@/data/daily";
import { useMinute } from "@/features/play/PhaseNotice";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";

type Props = { trip: TripWithRole; viewOnly?: boolean | undefined };

export function DailyDiscovery({ trip, viewOnly }: Props) {
  return <DailyItem trip={trip} viewOnly={viewOnly} kind="daily_discovery" />;
}

export function DailyCard({ trip, viewOnly }: Props) {
  return <DailyItem trip={trip} viewOnly={viewOnly} kind="daily_card" />;
}

function DailyItem({ trip, viewOnly, kind }: Props & { kind: "daily_discovery" | "daily_card" }) {
  const t = useT();
  const now = useMinute();
  const schedule = useMySchedule(trip.id);
  const answers = useDailyAnswers(trip.id);
  const answer = useAnswerDaily(trip.id);
  const item = openItem(schedule.data, kind, now);
  if (!item) return null;
  const mine = answers.data?.find((a) => a.schedule_id === item.id);
  const label =
    kind === "daily_card"
      ? t("daily.card")
      : item.variant === "question"
        ? `${t("daily.discovery")} · ${t("daily.questionDay")}`
        : `${t("daily.discovery")} · ${t("daily.tip")}`;
  const result = answer.data;
  const played = !!mine || !!result;
  const points = result?.points ?? mine?.points ?? 0;
  const rightAnswer = result?.answer ?? null;

  return (
    <section className="app-card mt-3" aria-label={label}>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      {item.title && <h2 className="font-display text-lg font-extrabold mt-1">{item.title}</h2>}
      {item.body && <p className="text-sm mt-1">{item.body}</p>}
      {item.insight && <p className="text-xs text-muted-foreground mt-1">{item.insight}</p>}
      {!played && !viewOnly && <Choices item={item} busy={answer.isPending} onPick={pick} />}
      {!played && viewOnly && <p className="text-xs mt-3">{t("daily.viewOnly")}</p>}
      {played && (
        <p className="text-sm font-bold mt-3" role="status">
          {(result?.correct ?? mine?.correct) && `${t("daily.right")} `}
          {points > 0 ? t("daily.earned", { count: points }) : t("daily.noPoints")}
          {rightAnswer !== null && result?.correct === false && item.choices?.[rightAnswer] && (
            <span className="block font-normal">
              {t("daily.answerWas", { answer: item.choices[rightAnswer] })}
            </span>
          )}
          <span className="block text-xs font-normal text-muted-foreground">
            {t("daily.played")}
          </span>
        </p>
      )}
      {answer.error && (
        <p className="text-xs text-destructive mt-2" role="alert">
          {t("daily.error", { reason: friendlyError(answer.error) })}
        </p>
      )}
    </section>
  );

  function pick(choice: number | null) {
    answer.mutate({ item: item!.id, choice });
  }
}

function Choices({
  item,
  busy,
  onPick,
}: {
  item: ScheduleItem;
  busy: boolean;
  onPick: (choice: number | null) => void;
}) {
  const t = useT();
  // Fact days have nothing to answer; their tip is just read.
  if (item.kind === "daily_discovery" && item.variant !== "question") return null;
  const choices = item.choices ?? [];
  if (!choices.length)
    return (
      <Button className="mt-3 w-full min-h-11" disabled={busy} onClick={() => onPick(null)}>
        {t("daily.done")}
      </Button>
    );
  return (
    <div className="grid gap-2 mt-3" role="group" aria-label={t("daily.answers")}>
      {choices.map((c, i) => (
        <Button
          key={c}
          variant="outline"
          className="min-h-11 justify-start"
          disabled={busy}
          onClick={() => onPick(i)}
        >
          {c}
        </Button>
      ))}
    </div>
  );
}
