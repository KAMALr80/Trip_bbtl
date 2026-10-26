// Captain setup wizard (M2-05, M2-07; R-201 – R-207). "Who's playing?" first (Q2), then Where to? ·
// Basics · Pre-Flight · Trip Season · Invite, one screen at a time. The draft is saved to the server
// after each Next, so a refresh keeps every answer; the trip is created after Trip Season, and the
// invite screen shows its code. Done opens Play for the new trip.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTrip, discardDraft, loadDraft, saveDraft } from "@/data/setup";
import { queryKeys, useTrips } from "@/data/queries";
import { InviteCode } from "@/features/trip/InviteCode";
import { rooms, type RoomId } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { useAuth } from "@/lib/auth-context";
import { friendlyError } from "@/lib/friendly-error";
import { readOfflineRoster, saveOfflineRoster } from "@/lib/play-arrangement";
import { shareInvite } from "@/lib/trips";
import { deviceZone } from "@/lib/viewer-time";
import {
  BasicsScreen,
  destinationOf,
  PreflightScreen,
  SeasonScreen,
  WhereScreen,
  WhoScreen,
} from "./WizardScreens";
import {
  nextStep,
  prevStep,
  problem,
  stepsFor,
  toSetupPayload,
  type SetupDraft,
  type Step,
} from "./wizard-model";

export type WizardSearch = {
  step?: Step | undefined;
  room?: RoomId | undefined;
  trip?: string | undefined;
};

export function TripWizard({ search }: { search: WizardSearch }) {
  const t = useT();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const homeTz = useRef(deviceZone()).current;
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showProblem, setShowProblem] = useState(false);
  const step: Step = search.step ?? 0;
  const ctx = { homeTz, now: Date.now() };

  // Load the saved draft once; a room picked on Home starts a fresh one.
  useEffect(() => {
    if (!user || draft) return;
    void loadDraft(user.id)
      .catch(() => null)
      .then((saved) => {
        const fresh = search.room && saved?.room !== search.room;
        setDraft(fresh || !saved ? { room: search.room, reached: 0 } : saved);
      });
  }, [user?.id]);

  const go = (to: Step, replace = false, extra: Partial<WizardSearch> = {}) => {
    setShowProblem(false);
    setError("");
    window.scrollTo({ top: 0 });
    void navigate({
      to: "/trips/new",
      search: { ...search, ...extra, step: to } as never,
      replace,
    });
  };
  // A refresh or link can't jump past the furthest screen reached.
  useEffect(() => {
    if (!draft || search.trip) return;
    const reached = draft.reached ?? 0;
    if (step > reached) go(reached, true);
  }, [draft, step]);

  const set = (patch: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...patch }));

  if (!user) return null;
  if (!draft)
    return (
      <main className="grid min-h-dvh place-items-center text-muted-foreground">
        {t("setup.loadingDraft")}
      </main>
    );

  const steps = stepsFor(draft);
  const visible: Step[] = steps.filter((s) => s !== 0 && s !== 5);
  const issue = step < 5 ? problem(draft, step, ctx) : null;
  const room = draft.room ? rooms[draft.room] : null;
  const createsNow = nextStep(draft, step) === 5 && step !== 5;

  async function next() {
    if (!draft) return;
    if (issue) {
      setShowProblem(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const to = nextStep(draft, step);
      if (createsNow) {
        const id = await createTrip(
          toSetupPayload(draft, {
            ...ctx,
            destination: destinationOf(draft, t("rooms.game_night.name")),
          }),
        );
        await queryClient.invalidateQueries({ queryKey: queryKeys.trips(user!.id) });
        go(5, true, { trip: id });
      } else {
        const saved = { ...draft, reached: Math.max(draft.reached ?? 0, to) as Step };
        setDraft(saved);
        await saveDraft(saved);
        go(to);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Step, string> = {
    0: t("setup.who.title"),
    1: room?.atHome
      ? t(draft.room === "show_culture" ? "setup.where.showTitle" : "setup.where.cultureTitle")
      : t("setup.where.title"),
    2: t("setup.basics.title"),
    3: t("setup.preflight.title"),
    4: t("setup.season.title"),
    5:
      draft.playMode === "solo"
        ? t("setup.invite.soloTitle")
        : draft.playMode === "offline"
          ? t("setup.invite.offlineTitle")
          : t("setup.invite.title"),
  };
  const problemText = issue
    ? t(`setup.problem.${issue}`, room ? { min: room.mainDays.min, max: room.mainDays.max } : {})
    : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center gap-2">
        {step > 0 && step < 5 ? (
          <Button
            variant="ghost"
            className="-ml-3 min-h-11"
            onClick={() => go(prevStep(draft, step))}
          >
            <ArrowLeft /> {t("setup.back")}
          </Button>
        ) : (
          <span className="min-h-11" />
        )}
        {visible.includes(step) && (
          <p className="ml-auto text-sm font-bold text-muted-foreground">
            {t("setup.stepOf", { n: visible.indexOf(step) + 1, total: visible.length })}
          </p>
        )}
        {step < 5 && (
          <Button
            variant="ghost"
            size="icon"
            className={`min-h-11 min-w-11 ${visible.includes(step) ? "" : "ml-auto"}`}
            aria-label={t("setup.close")}
            onClick={() => {
              void saveDraft(draft).catch(() => undefined);
              void navigate({ to: "/home" });
            }}
          >
            <X />
          </Button>
        )}
      </header>
      <h1 className="mt-2 font-display text-3xl font-extrabold">{titles[step]}</h1>
      {room && step > 0 && (
        <p className="text-sm text-muted-foreground">{t(`rooms.${draft.room!}.name`)}</p>
      )}

      <div className="mt-4 flex-1 pb-6">
        {step === 0 && <WhoScreen draft={draft} set={set} ctx={ctx} fixedRoom={!!search.room} />}
        {step === 1 && <WhereScreen draft={draft} set={set} ctx={ctx} />}
        {step === 2 && <BasicsScreen draft={draft} set={set} ctx={ctx} />}
        {step === 3 && <PreflightScreen draft={draft} set={set} ctx={ctx} />}
        {step === 4 && <SeasonScreen draft={draft} set={set} ctx={ctx} />}
        {step === 5 && search.trip && (
          <InviteScreen tripId={search.trip} mode={draft.playMode ?? "crew"} />
        )}
      </div>

      <footer className="sticky bottom-0 -mx-4 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {(showProblem && problemText) || error ? (
          <p role="alert" className="mb-2 text-sm font-bold text-destructive">
            {error || problemText}
          </p>
        ) : null}
        {step < 5 ? (
          <Button
            variant="playful"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => void next()}
          >
            {busy
              ? t(createsNow ? "setup.creating" : "setup.saving")
              : t(createsNow ? "setup.create" : "setup.next")}
          </Button>
        ) : (
          <Button
            variant="playful"
            size="lg"
            className="w-full"
            onClick={() => {
              void discardDraft();
              void navigate({ to: "/t/$tripId/play", params: { tripId: search.trip! } });
            }}
          >
            {t("setup.done")}
          </Button>
        )}
      </footer>
    </main>
  );
}

/** 5 · Invite: the code and Share for a crew, first names for off-app friends (kept on this
 * device only, R-006), nothing for solo. */
function InviteScreen({ tripId, mode }: { tripId: string; mode: string }) {
  const t = useT();
  const { user } = useAuth();
  const trips = useTrips(user?.id);
  const trip = trips.data?.find((x) => x.id === tripId);
  const [shared, setShared] = useState("");
  const [names, setNames] = useState<string[]>(() => readOfflineRoster(tripId));
  const [typed, setTyped] = useState("");
  const keep = (list: string[]) => {
    setNames(list);
    saveOfflineRoster(tripId, list);
  };
  if (mode === "solo") return <p className="text-lg">{t("setup.invite.soloLine")}</p>;
  if (mode === "offline")
    return (
      <>
        <p className="text-muted-foreground">{t("setup.invite.offlineHint")}</p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = typed.trim().slice(0, 30);
            if (n && names.length < 10 && !names.includes(n)) keep([...names, n]);
            setTyped("");
          }}
        >
          <input
            className="h-12 min-w-0 flex-1 rounded-2xl border-2 border-border bg-background px-4 text-base outline-none focus:border-primary"
            aria-label={t("setup.invite.offlineName")}
            placeholder={t("setup.invite.offlineName")}
            value={typed}
            maxLength={30}
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            className="min-h-12"
            disabled={!typed.trim() || names.length >= 10}
          >
            <Plus /> {t("setup.invite.addName")}
          </Button>
        </form>
        <ul className="mt-4 grid gap-2">
          {names.map((n) => (
            <li
              key={n}
              className="flex items-center justify-between rounded-2xl border border-border px-4 py-2"
            >
              {n}
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label={t("setup.invite.removeName", { name: n })}
                onClick={() => keep(names.filter((x) => x !== n))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      </>
    );
  if (!trip) return null;
  return (
    <>
      <p className="text-sm font-bold">{t("setup.invite.code")}</p>
      <div className="mt-3">
        <InviteCode code={trip.join_code} />
      </div>
      <Button
        variant="outline"
        size="lg"
        className="mt-6 w-full"
        onClick={async () => {
          const r = await shareInvite(trip.join_code, trip.name);
          setShared(
            r === "copied"
              ? t("setup.invite.copied")
              : r === "shared"
                ? t("setup.invite.shared")
                : "",
          );
        }}
      >
        <Share2 /> {t("setup.invite.share")}
      </Button>
      {shared && (
        <p role="status" className="mt-2 text-center text-sm text-muted-foreground">
          {shared}
        </p>
      )}
    </>
  );
}
