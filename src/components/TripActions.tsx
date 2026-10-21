import { tripDisplayName } from "@/lib/trip-display-name";
import { friendlyError } from "@/lib/friendly-error";
import { confirmInApp } from "@/lib/confirm";
import { useState } from "react";
import { MoreHorizontal, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoWall } from "@/components/Seasons";
import { permanentlyDeleteTrip } from "@/lib/delete-trip.functions";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

export function TripActions({
  trip,
  onDone,
  members = [],
  cards = [],
  userId = "",
  trigger = "icon",
}: {
  trip: TripWithRole;
  onDone: () => void | Promise<void>;
  members?: Member[];
  cards?: PlayerWithAvatar[];
  userId?: string;
  trigger?: "icon" | "button";
}) {
  const [open, setOpen] = useState(false),
    [stage, setStage] = useState(0),
    [typed, setTyped] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const owner = trip.myRole === "captain";
  const action = owner ? "Cancel trip" : "Leave trip";
  async function proceed() {
    setBusy(true);
    setError("");
    try {
      if (owner) await permanentlyDeleteTrip({ data: { tripId: trip.id, name: typed } });
      else {
        const r = await supabase.rpc("leave_trip", { p_trip: trip.id });
        if (r.error) throw r.error;
      }
      setOpen(false);
      setStage(0);
      await onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {trigger === "icon" ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0"
          aria-label={`Options for ${tripDisplayName(trip.name)}`}
          onClick={() => {
            setOpen(true);
            setStage(0);
            setTyped("");
            setError("");
          }}
        >
          <MoreHorizontal />
        </Button>
      ) : (
        <Button
          variant="ghost"
          className="w-full text-destructive"
          onClick={() => {
            setOpen(true);
            setStage(0);
            setTyped("");
            setError("");
          }}
        >
          {action}
        </Button>
      )}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center">
          <div className="absolute inset-0 bg-foreground/60" onClick={() => setOpen(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${tripDisplayName(trip.name)} options`}
            className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-card border border-border p-6 pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            <Button variant="ghost" onClick={() => (stage ? setStage(stage - 1) : setOpen(false))}>
              <ArrowLeft /> {stage ? "Back" : "Close"}
            </Button>
            <h2 className="font-display text-2xl font-extrabold mt-4">
              {stage ? action : trip.name}
            </h2>
            {stage === 0 ? (
              <Button
                variant="outline"
                className="mt-5 w-full text-destructive"
                onClick={async () => {
                  if (owner) {
                    setStage(1);
                    return;
                  }
                  if (
                    await confirmInApp(
                      `Leave ${tripDisplayName(trip.name)}? You can rejoin with the code.`,
                    )
                  )
                    await proceed();
                }}
              >
                {action}
              </Button>
            ) : owner ? (
              <>
                <p className="mt-3">
                  Once it's cancelled, it's gone — photos, games, scores and Wrapped.
                </p>
                {stage === 1 ? (
                  <>
                    <p className="text-sm text-muted-foreground mt-2">Download photos first.</p>
                    {trip.kind !== "at_home" && (
                      <>
                        <Button
                          variant="outline"
                          className="mt-4 w-full"
                          onClick={() =>
                            document
                              .getElementById(`delete-photo-download-${trip.id}`)
                              ?.scrollIntoView({ behavior: "smooth" })
                          }
                        >
                          Download photos first
                        </Button>
                        <div id={`delete-photo-download-${trip.id}`}>
                          <PhotoWall trip={trip} members={members} cards={cards} userId={userId} />
                        </div>
                      </>
                    )}
                    <Button variant="ghost" className="mt-3 w-full" onClick={() => setStage(2)}>
                      Continue to confirmation
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mt-4 text-sm">
                      This cancels {tripDisplayName(trip.name)} for everyone — game nights, points
                      and photos. Type DELETE to confirm.
                    </p>
                    <label className="block mt-4 text-sm font-bold">
                      Confirmation
                      <input
                        className="mt-2 w-full h-12 rounded-xl border border-border bg-background px-3"
                        autoComplete="off"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      className="mt-4 w-full text-destructive"
                      disabled={busy || typed.trim().toUpperCase() !== "DELETE"}
                      onClick={() => void proceed()}
                    >
                      Cancel trip
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="mt-3 text-sm">
                  Leave {tripDisplayName(trip.name)}? You can rejoin with the code.
                </p>
                <Button
                  variant="ghost"
                  className="mt-4 w-full text-destructive"
                  disabled={busy}
                  onClick={() => void proceed()}
                >
                  Leave trip
                </Button>
              </>
            )}
            {error && (
              <p role="alert" className="text-destructive text-sm mt-3">
                {error}
              </p>
            )}
            <Button variant="outline" className="mt-3 w-full" onClick={() => setOpen(false)}>
              Keep trip
            </Button>
          </section>
        </div>
      )}
    </>
  );
}
