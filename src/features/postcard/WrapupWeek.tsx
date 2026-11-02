// Wrap-up week (M5-02, R-602 – R-604): Baggage Claim days 1–7. Heart the crew's Postcard Picks
// (not your own; counts stay hidden), answer 3 short questions in your own words (no AI rewriting),
// and download your photos before Day 7, when only the postcard's are kept (M5-05, Q11).
// display-only; server: trip_private.heart_photo / answer_wrapup check the phase and the answers.
import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAnswerWrapup,
  useHeartPhoto,
  useMyTripPhotos,
  useMyWrapupAnswers,
  usePostcardInfo,
  useWrapupBoard,
  type WrapupQuestion,
} from "@/data/postcard";
import { roomOf } from "@/features/trip/rooms";
import { ReportPhoto } from "@/features/moderation/ReportPhoto";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";
import { fmtWhen } from "@/lib/viewer-time";
import { MAX_ANSWER, answerLength, answerProblem } from "./wrapup";

export function WrapupWeek({
  trip,
  viewOnly,
}: {
  trip: TripWithRole;
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const info = usePostcardInfo(trip.id).data;
  const open = !trip.locked_at && roomOf(trip.room).pointsEnabled;
  const board = useWrapupBoard(trip.id, open).data ?? [];
  const heart = useHeartPhoto(trip.id);
  if (!open || !info) return null;
  const crew = board.filter((p) => !p.mine);
  return (
    <section className="app-card mt-3" aria-label={t("postcard.wrapupTitle")}>
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {t("postcard.wrapupTitle")}
      </p>
      {info.locks_at && (
        <p className="text-sm mt-1">
          {t("postcard.locks", { when: fmtWhen(info.locks_at, trip.home_timezone) })}
        </p>
      )}
      {!info.solo && (
        <>
          <h3 className="font-display text-lg font-extrabold mt-4">{t("postcard.heartTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("postcard.heartLine", { count: info.kept })}
          </p>
          {crew.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">{t("postcard.noCrewPicks")}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {crew.map((p) => (
                <li key={p.proof_id} className="relative">
                  {p.url ? (
                    <img
                      src={p.url}
                      alt=""
                      className="aspect-square w-full rounded-md object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="block aspect-square w-full rounded-md bg-muted" />
                  )}
                  <button
                    type="button"
                    aria-pressed={p.hearted}
                    aria-label={p.hearted ? t("postcard.unheart") : t("postcard.heart")}
                    disabled={viewOnly}
                    onClick={() => heart.mutate({ proofId: p.proof_id, on: !p.hearted })}
                    className="absolute bottom-1 right-1 grid h-11 w-11 place-items-center rounded-full bg-background/90"
                  >
                    <Heart
                      className={`h-6 w-6 ${p.hearted ? "fill-red-500 text-red-500" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {!viewOnly && <ReportPhoto proofId={p.proof_id} />}
                </li>
              ))}
            </ul>
          )}
          {heart.error && (
            <p className="text-xs text-destructive mt-2" role="alert">
              {friendlyError(heart.error)}
            </p>
          )}
        </>
      )}
      <h3 className="font-display text-lg font-extrabold mt-5">{t("postcard.questionsTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("postcard.questionsLine")}</p>
      <WrapupQuestions tripId={trip.id} questions={info.questions} viewOnly={viewOnly} />
      <DownloadMyPhotos trip={trip} />
    </section>
  );
}

function WrapupQuestions({
  tripId,
  questions,
  viewOnly,
}: {
  tripId: string;
  questions: WrapupQuestion[];
  viewOnly?: boolean | undefined;
}) {
  const saved = useMyWrapupAnswers(tripId).data ?? {};
  return (
    <div className="grid gap-3 mt-3">
      {questions.map((q) => (
        <QuestionField
          key={q.key}
          tripId={tripId}
          question={q}
          saved={saved[q.key] ?? ""}
          viewOnly={viewOnly}
        />
      ))}
    </div>
  );
}

function QuestionField({
  tripId,
  question,
  saved,
  viewOnly,
}: {
  tripId: string;
  question: WrapupQuestion;
  saved: string;
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const answer = useAnswerWrapup(tripId);
  const [text, setText] = useState<string | null>(null);
  const value = text ?? saved;
  const problem = value.trim() ? answerProblem(value, question.emoji) : null;
  const changed = text !== null && text !== saved;
  const id = `wrapup-${question.key}`;
  return (
    <form
      className="grid gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        answer.mutate({ key: question.key, answer: value }, { onSuccess: () => setText(null) });
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {question.question}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="min-h-11 flex-1 rounded-md border bg-background px-2 text-sm"
          value={value}
          disabled={viewOnly}
          // A little room over the limit so the counter can say so; the server is the judge.
          maxLength={MAX_ANSWER * 4}
          inputMode={question.emoji ? "text" : undefined}
          placeholder={question.emoji ? t("postcard.emojiPlaceholder") : undefined}
          aria-invalid={!!problem}
          aria-describedby={`${id}-hint`}
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          type="submit"
          className="min-h-11"
          disabled={viewOnly || !changed || !!problem || answer.isPending}
        >
          {t("postcard.saveAnswer")}
        </Button>
      </div>
      <p
        id={`${id}-hint`}
        className={`text-xs ${problem ? "text-destructive" : "text-muted-foreground"}`}
        role={problem ? "alert" : undefined}
      >
        {problem
          ? t(`postcard.problem.${problem}`, { max: MAX_ANSWER })
          : !changed && saved
            ? t("postcard.answerSaved")
            : t("postcard.count", { count: answerLength(value), max: MAX_ANSWER })}
      </p>
      {answer.error && (
        <p className="text-xs text-destructive" role="alert">
          {friendlyError(answer.error)}
        </p>
      )}
    </form>
  );
}

/** A zip of my own trip photos (Q11: "Download your photos" before the purge). */
function DownloadMyPhotos({ trip }: { trip: TripWithRole }) {
  const t = useT();
  const photos = useMyTripPhotos(trip.id).data ?? [];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!photos.length) return null;
  return (
    <div className="mt-5">
      <h3 className="font-display text-lg font-extrabold">{t("postcard.downloadTitle")}</h3>
      <p className="text-sm text-muted-foreground">{t("postcard.downloadLine")}</p>
      <Button
        variant="outline"
        className="mt-2 min-h-11"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            let n = 0;
            for (const p of photos) {
              if (!p.url) continue;
              const res = await fetch(p.url);
              if (!res.ok) continue;
              n += 1;
              zip.file(`${String(n).padStart(3, "0")}.jpg`, await res.blob());
            }
            const blob = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${trip.name.replace(/[^\p{L}\p{N}]+/gu, "-")}-photos.zip`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
            setMessage(t("postcard.downloaded", { count: n }));
          } catch (e) {
            setMessage(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("postcard.downloading") : t("postcard.downloadButton", { count: photos.length })}
      </Button>
      {message && (
        <p className="text-xs mt-1" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
