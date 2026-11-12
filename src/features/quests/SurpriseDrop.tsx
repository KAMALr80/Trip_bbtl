// Today's Surprise Drop (M3-09, R-342, R-343): the same game for the whole crew, open 24 hours.
// Bingo and Scavenger take a photo per square / find; Speed and Photo take one. The crew (and the
// AI check, Q3) approve the photos, and the points are written when the drop closes (10–33, Q4).
// Instead of photos a player can present it live at the next Game Night Live: a 👍 there = 10.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openItem, useMySchedule, type ScheduleItem } from "@/data/daily";
import { usePendingAction } from "@/data/offline/outbox";
import { useClaimDropLive, useMyProofs, useSubmitDropProof, type Proof } from "@/data/proofs";
import { useMinute } from "@/features/play/PhaseNotice";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";

type Game = "bingo" | "scavenger" | "speed" | "photo";

const endsAt = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

export function SurpriseDrop({
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
  const claim = useClaimDropLive(trip.id);
  const drop = openItem(schedule.data, "surprise_drop", now);
  if (!drop) return null;
  const game = (drop.variant ?? "photo") as Game;
  const mine = (proofs.data ?? []).filter((p) => p.schedule_id === drop.id);
  const live = mine.find((p) => p.live);
  const parts = game === "bingo" || game === "scavenger" ? (drop.items ?? []) : [drop.body ?? ""];
  const label = `${t("drops.title")} · ${t(`drops.games.${game}`)}`;
  if (live)
    return (
      <section className="app-card mt-3" aria-label={label}>
        <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
        {drop.title && <h3 className="font-display text-lg font-extrabold mt-1">{drop.title}</h3>}
        <p className="text-sm mt-2" role="status">
          {live.crew_status === "approved"
            ? t("drops.liveApproved")
            : live.crew_status === "expired"
              ? t("drops.liveExpired")
              : t("drops.liveWaiting")}
        </p>
      </section>
    );
  return (
    <section className="app-card mt-3" aria-label={label}>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      {drop.title && <h3 className="font-display text-lg font-extrabold mt-1">{drop.title}</h3>}
      {drop.body && <p className="text-sm mt-1">{drop.body}</p>}
      {drop.closes_at && (
        <p className="text-xs mt-1">{t("drops.points", { time: endsAt(drop.closes_at) })}</p>
      )}
      <ul
        className={`mt-3 grid gap-2 ${game === "bingo" ? (parts.length === 16 ? "grid-cols-4" : "grid-cols-3") : ""}`}
      >
        {parts.map((label, part) => (
          <DropPart
            key={part}
            trip={trip}
            userId={userId}
            drop={drop}
            part={part}
            label={label}
            game={game}
            proof={mine.find((p) => p.part === part)}
            viewOnly={viewOnly}
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground mt-2">{t("drops.scored")}</p>
      {!viewOnly && trip.play_mode !== "solo" && mine.length === 0 && (
        <div className="mt-2">
          <Button
            variant="outline"
            className="min-h-11 w-full"
            disabled={claim.isPending}
            onClick={() => claim.mutate(drop.id)}
          >
            {t("drops.presentLive")}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">{t("drops.presentLiveHint")}</p>
          {claim.error && (
            <p className="text-xs text-destructive mt-1" role="alert">
              {t("drops.error", { reason: friendlyError(claim.error) })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DropPart({
  trip,
  userId,
  drop,
  part,
  label,
  game,
  proof,
  viewOnly,
}: {
  trip: TripWithRole;
  userId: string;
  drop: ScheduleItem;
  part: number;
  label: string;
  game: Game;
  proof: Proof | undefined;
  viewOnly?: boolean | undefined;
}) {
  const t = useT();
  const submit = useSubmitDropProof(trip.id, userId);
  const [text, setText] = useState("");
  const many = game === "bingo" || game === "scavenger";
  const send = (photo: File | null) => submit.mutate({ item: drop.id, part, photo, text });
  // A photo sent offline, waiting in the outbox (M4-04).
  const pending = usePendingAction(`submit_drop_proof:${drop.id}:${part}`);
  if (pending && !proof)
    return (
      <li className="rounded-md border p-2 text-xs" role="status">
        {many && <span className="block font-semibold">{label}</span>}
        {t("offline.waiting")}
      </li>
    );
  if (proof)
    return (
      <li className="rounded-md border p-2 text-xs">
        {many && <span className="block font-semibold">{label}</span>}
        {proof.crew_status === "waiting" ? t("drops.sent") : t("drops.approved")}
      </li>
    );
  return (
    <li className="rounded-md border p-2 text-xs">
      <label className="block font-semibold">
        {many ? t("drops.square", { item: label }) : t("drops.proof")}
        {!viewOnly && (
          <input
            type="file"
            accept="image/*"
            className="block mt-1 w-full"
            disabled={submit.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) send(file);
            }}
          />
        )}
      </label>
      {game === "speed" && !viewOnly && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(null);
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-md border bg-background p-2"
            aria-label={t("drops.speedDone")}
            maxLength={200}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" size="sm" className="min-h-11" disabled={!text.trim()}>
            {t("drops.send")}
          </Button>
        </form>
      )}
      {submit.error && (
        <p className="text-destructive mt-1" role="alert">
          {t("drops.error", { reason: friendlyError(submit.error) })}
        </p>
      )}
    </li>
  );
}
