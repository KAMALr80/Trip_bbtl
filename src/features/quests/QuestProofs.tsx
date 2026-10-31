// The new engine's quests on Play (M3-05 / M3-06): my sealed quests, Showcase, missions, trip quest
// and Window Seat quests from the schedule, each with its proof, plus the Crew Check card (R-411 –
// R-414). Sealed items show only when they open; the server hides their text until then.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMySchedule, type ScheduleItem } from "@/data/daily";
import {
  useApproveProof,
  useCrewCheck,
  useMyProofs,
  useOpenItem,
  useShareTripQuest,
  useSubmitProof,
  type CrewProof,
  type Proof,
} from "@/data/proofs";
import { useMinute } from "@/features/play/PhaseNotice";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { Member, TripWithRole } from "@/lib/trips";

const PROOF_KINDS = [
  "sealed_quest",
  "showcase",
  "airport_mission",
  "home_mission",
  "trip_quest",
  "ws_quest",
] as const;
type ProofKind = (typeof PROOF_KINDS)[number];
const isProofKind = (k: string): k is ProofKind => (PROOF_KINDS as readonly string[]).includes(k);
/** Cards the player taps open before they see the text (M3-05, M3-08). */
const SEALED_KINDS: readonly string[] = [
  "sealed_quest",
  "airport_mission",
  "home_mission",
  "trip_quest",
];

const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/** My quests that are open now or still sealed, soonest first. */
export function QuestProofs({
  trip,
  userId,
  viewOnly,
}: {
  trip: TripWithRole;
  userId: string;
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const now = useMinute();
  const schedule = useMySchedule(trip.id);
  const proofs = useMyProofs(trip.id);
  const items = (schedule.data ?? []).filter(
    (i) =>
      isProofKind(i.kind) &&
      i.user_id === userId &&
      (!i.closes_at || new Date(i.closes_at).getTime() > now),
  );
  if (!items.length) return null;
  return (
    <section className="grid gap-3 mt-3" aria-label={t("quests.title")}>
      {items.map((item) => (
        <QuestCard
          key={item.id}
          trip={trip}
          userId={userId}
          item={item}
          proof={proofs.data?.find((p) => p.schedule_id === item.id && p.part === 0)}
          viewOnly={viewOnly}
        />
      ))}
    </section>
  );
}

function QuestCard({
  trip,
  userId,
  item,
  proof,
  viewOnly,
}: {
  trip: TripWithRole;
  userId: string;
  item: ScheduleItem;
  proof: Proof | undefined;
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const submit = useSubmitProof(trip.id, userId);
  const reveal = useOpenItem(trip.id);
  const share = useShareTripQuest(trip.id);
  const [photo, setPhoto] = useState<File | null>(null);
  const [text, setText] = useState("");
  const kind = item.kind as ProofKind;
  const label = `${t(`quests.kinds.${kind}`)}${item.points ? ` · ${t("quests.points", { count: item.points })}` : ""}`;
  return (
    <article className="app-card" aria-label={label}>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      {!item.is_open ? (
        <p className="text-sm mt-1">{t("quests.sealed", { time: when(item.opens_at) })}</p>
      ) : SEALED_KINDS.includes(item.kind) && item.body == null ? (
        <>
          <p className="text-sm mt-1">{t("quests.sealedNow")}</p>
          {item.kind === "sealed_quest" && (
            <p className="text-xs text-muted-foreground">{t("quests.speedHint")}</p>
          )}
          {!viewOnly && (
            <Button
              className="mt-3 w-full min-h-11"
              disabled={reveal.isPending}
              onClick={() => reveal.mutate(item.id)}
            >
              {reveal.isPending ? t("quests.opening") : t("quests.open")}
            </Button>
          )}
          {reveal.error && (
            <p className="text-xs text-destructive mt-2" role="alert">
              {t("quests.error", { reason: friendlyError(reveal.error) })}
            </p>
          )}
        </>
      ) : (
        <>
          {item.title && <h3 className="font-display text-lg font-extrabold mt-1">{item.title}</h3>}
          {item.body && <p className="text-sm mt-1">{item.body}</p>}
          {item.insight && <p className="text-xs text-muted-foreground mt-1">{item.insight}</p>}
          {item.closes_at && (
            <p className="text-xs mt-2">{t("quests.dueBy", { time: when(item.closes_at) })}</p>
          )}
          {item.kind === "trip_quest" && !viewOnly && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 min-h-11"
              aria-pressed={share.data ?? false}
              disabled={share.isPending}
              onClick={() => share.mutate({ item: item.id, shared: !(share.data ?? false) })}
            >
              {share.data ? t("quests.keepSecret") : t("quests.share")}
            </Button>
          )}
          {proof ? (
            <p className="text-sm font-bold mt-3" role="status">
              {proof.crew_status === "waiting"
                ? t("quests.waiting")
                : proof.crew_status === "approved"
                  ? t("quests.approved")
                  : proof.crew_status === "expired"
                    ? t("quests.expired")
                    : t("quests.selfHonor")}
            </p>
          ) : (
            !viewOnly && (
              <form
                className="grid gap-2 mt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit.mutate({ item: item.id, photo, text });
                }}
              >
                <label className="text-sm font-semibold">
                  {t("quests.photo")}
                  <input
                    type="file"
                    accept="image/*"
                    className="block mt-1 text-sm"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="text-sm font-semibold">
                  {t("quests.words")}
                  <textarea
                    className="block w-full mt-1 rounded-md border bg-background p-2 text-sm"
                    maxLength={500}
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={submit.isPending || (!photo && !text.trim())}
                >
                  {submit.isPending ? t("quests.sending") : t("quests.send")}
                </Button>
                {submit.error && (
                  <p className="text-xs text-destructive" role="alert">
                    {t("quests.error", { reason: friendlyError(submit.error) })}
                  </p>
                )}
              </form>
            )
          )}
        </>
      )}
    </article>
  );
}

/** The one Crew Check card on Play (R-412): "3 to check", each with a 👍. Hidden when empty. */
export function CrewCheck({
  trip,
  members,
  viewOnly,
}: {
  trip: TripWithRole;
  members: Member[];
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const crew = useCrewCheck(trip.id);
  const approve = useApproveProof(trip.id);
  const rows = crew.data ?? [];
  if (!rows.length) return null;
  const nameOf = (id: string) =>
    members.find((m) => m.user_id === id)?.display_name ?? t("crewCheck.someone");
  return (
    <section className="app-card mt-3" aria-label={t("crewCheck.title")}>
      <p className="text-xs font-bold uppercase text-muted-foreground">
        {t("crewCheck.title")} · {t("crewCheck.toCheck", { count: rows.length })}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{t("crewCheck.intro")}</p>
      <ul className="grid gap-3 mt-3">
        {rows.map((p) => (
          <CrewProofRow
            key={p.id}
            proof={p}
            name={nameOf(p.user_id)}
            busy={approve.isPending}
            viewOnly={viewOnly}
            onApprove={() => approve.mutate(p.id)}
          />
        ))}
      </ul>
      {approve.error && (
        <p className="text-xs text-destructive mt-2" role="alert">
          {t("crewCheck.error", { reason: friendlyError(approve.error) })}
        </p>
      )}
    </section>
  );
}

function CrewProofRow({
  proof,
  name,
  busy,
  viewOnly,
  onApprove,
}: {
  proof: CrewProof;
  name: string;
  busy: boolean;
  viewOnly?: boolean | undefined;
  onApprove: () => void;
}) {
  const t = useT();
  const kind = isProofKind(proof.kind) ? t(`quests.kinds.${proof.kind}`) : proof.kind;
  return (
    <li className="rounded-md border p-3">
      <p className="text-sm font-bold">{t("crewCheck.by", { name, what: proof.title ?? kind })}</p>
      {proof.photoUrl ? (
        <img
          src={proof.photoUrl}
          alt={t("crewCheck.photoAlt", { name })}
          className="mt-2 w-full max-h-64 object-cover rounded-md"
        />
      ) : (
        !proof.body && <p className="text-xs mt-2">{t("crewCheck.photoHidden")}</p>
      )}
      {proof.body && <p className="text-sm mt-2">{proof.body}</p>}
      {proof.ai_status === "fail" && (
        <p className="text-xs font-bold text-destructive mt-1">{t("crewCheck.aiFlag")}</p>
      )}
      <p className="text-xs text-muted-foreground mt-1">
        {t("crewCheck.needsBy", { time: when(proof.expires_at) })}
      </p>
      {!viewOnly && (
        <Button
          className="mt-2 min-h-11 w-full"
          disabled={busy}
          aria-label={t("crewCheck.approveLabel", { name })}
          onClick={onApprove}
        >
          {t("crewCheck.approve")}
        </Button>
      )}
    </li>
  );
}
