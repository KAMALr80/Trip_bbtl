// Captain tools, one tile per phase (M2-11, R-209 / R-210). Pre-Flight: days and call nights ·
// Takeoff: "We've arrived" · Trip Season: the crowning night · Baggage Claim: photo ties and
// the one swap (M5-06).
// The editors are the setup wizard's own screens and checks; the server checks again.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { rpc } from "@/data/rpc";
import { setCallNights, useCallNights } from "@/data/schedule";
import { PostcardCaptainTile } from "@/features/postcard/PostcardCaptainTile";
import { PreflightScreen, SeasonScreen } from "@/features/setup/WizardScreens";
import {
  problem,
  toSetupPayload,
  tripToDraft,
  type SetupDraft,
} from "@/features/setup/wizard-model";
import { phaseBoundaries, tripPhase, tripPhaseInput } from "@/features/trip/phase";
import { roomOf } from "@/features/trip/rooms";
import { useT } from "@/i18n";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole } from "@/lib/trips";
import { fmtWhen } from "@/lib/viewer-time";

const order = ["preflight", "takeoff", "trip_season", "baggage_claim"] as const;
type TileId = (typeof order)[number];

export function PhaseTiles({
  trip,
  onUpdated,
}: {
  trip: TripWithRole;
  onUpdated: () => Promise<void> | void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const nights = useCallNights(trip.id).data ?? [];
  const [open, setOpen] = useState<TileId | null>(null);
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const now = tripPhase(trip).phase;
  const b = phaseBoundaries(tripPhaseInput(trip));
  const ctx = { homeTz: trip.home_timezone, now: Date.now() };
  const room = roomOf(trip.room);
  const name = (id: TileId) =>
    id === "takeoff" && room.atHome ? t("phases.homeMissions") : t(`phases.${id}`);
  const status = (id: TileId) => {
    const i = order.indexOf(id);
    const current = order.indexOf(now as TileId);
    if (id === now) return t("tiles.now");
    if (now === "archived" || (current >= 0 && i < current)) return t("tiles.done");
    const [opens, ends] = b[id];
    return ends > opens
      ? t("tiles.opens", {
          date: new Date(opens).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        })
      : "";
  };
  const edit = (id: TileId) => {
    setMessage("");
    setOpen(open === id ? null : id);
    setDraft(tripToDraft(trip, nights));
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["trip", trip.id] });
    await queryClient.invalidateQueries({ queryKey: ["trips"] });
    await onUpdated();
  };
  async function save(step: 3 | 4) {
    if (!draft) return;
    const issue = problem(draft, step, ctx);
    if (issue)
      return setMessage(
        t(`setup.problem.${issue}`, { min: room.mainDays.min, max: room.mainDays.max }),
      );
    setBusy(true);
    setMessage("");
    try {
      const payload = toSetupPayload(draft, { ...ctx, destination: trip.destination });
      if (step === 3) {
        // Pre-Flight first, so nights in newly added days fit; if shrinking it would leave a night
        // outside, save the nights first and try again.
        const setDays = () =>
          rpc("set_preflight", {
            p_trip: trip.id,
            p_days: payload.preflightDays,
            p_skipped: payload.preflightSkipped,
          });
        const first = await setDays();
        if (first.error && !/outside Pre-Flight/.test(first.error.message)) throw first.error;
        await setCallNights(trip.id, payload.callNights);
        if (first.error) {
          const { error } = await setDays();
          if (error) throw error;
        }
      } else {
        const { error } = await rpc("set_crowning_night", {
          p_trip: trip.id,
          p_at: payload.crowningAt,
          p_place: payload.crowningPlace,
          p_call_link: payload.crowningCallLink,
        });
        if (error) throw error;
      }
      await refresh();
      setMessage(t("tiles.saved"));
    } catch (e) {
      setMessage(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const set = (patch: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <section className="mt-5" aria-label={t("tiles.title")}>
      <h2 className="font-display text-xl font-extrabold">{t("tiles.title")}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {order.map((id) => (
          <Button
            key={id}
            variant={id === now ? "subtle" : "outline"}
            aria-expanded={open === id}
            className="h-auto min-h-24 flex-col items-start justify-start whitespace-normal p-3 text-left"
            onClick={() => edit(id)}
          >
            <span className="text-xs font-extrabold uppercase tracking-wider">{status(id)}</span>
            <span className="font-display font-extrabold">{name(id)}</span>
            <span className="text-xs font-normal text-muted-foreground">{t(`tiles.${id}`)}</span>
          </Button>
        ))}
      </div>
      {open && draft && (
        <div className="app-card mt-4">
          <h3 className="font-display text-lg font-extrabold">{name(open)}</h3>
          {open === "preflight" && (
            <>
              <PreflightScreen draft={draft} set={set} ctx={ctx} />
              <Button className="mt-4 w-full" disabled={busy} onClick={() => void save(3)}>
                {t("tiles.save")}
              </Button>
            </>
          )}
          {open === "trip_season" && room.pointsEnabled && (
            <>
              <SeasonScreen draft={draft} set={set} ctx={ctx} />
              <Button className="mt-4 w-full" disabled={busy} onClick={() => void save(4)}>
                {t("tiles.save")}
              </Button>
            </>
          )}
          {open === "takeoff" &&
            (trip.arrived_at ? (
              <p className="mt-2">
                {t("tiles.arrivedAt", { when: fmtWhen(trip.arrived_at, trip.trip_timezone) })}
              </p>
            ) : now === "takeoff" && room.tripSeasonStart === "arrival_button" ? (
              <Button
                className="mt-3 w-full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const { error } = await rpc("mark_arrived", { p_trip: trip.id });
                  setBusy(false);
                  if (error) setMessage(friendlyError(error));
                  else await refresh();
                }}
              >
                {t("phases.arrived")}
              </Button>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {now === "trip_season" || now === "baggage_claim"
                  ? t("tiles.arrivalAuto")
                  : t("tiles.arrivalLater")}
              </p>
            ))}
          {open === "baggage_claim" && room.pointsEnabled && <PostcardCaptainTile trip={trip} />}
          {message && (
            <p role="status" className="mt-3 text-sm font-bold">
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
