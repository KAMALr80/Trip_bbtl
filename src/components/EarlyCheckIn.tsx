import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Search, Sparkles, Stamp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { askCredits, creditError } from "./AiCredits";
import { moreCheckinTasks } from "@/lib/missions.functions";
import type { TripWithRole } from "@/lib/trips";
import type { Claim } from "./SecretMissions";

type Task = Claim & { title: string | null; backstory: string | null; keywords: string[] | null };
const db = supabase as unknown as {
  rpc: (f: string, a: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        eq: (
          k: string,
          v: string,
        ) => {
          eq: (
            k: string,
            v: string,
          ) => {
            order: (
              c: string,
            ) => PromiseLike<{ data: Task[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
};
const MAX = 10;
const PTS = [4, 3, 3];

/** Glossy tile under the phase chips that opens the Early Check-In page. */
export function EarlyCheckInTile({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="ec-tile mt-4"
      onClick={onOpen}
      aria-label="Open Early Check-In"
    >
      <span className="ec-stamp" aria-hidden="true">
        10
      </span>
      <span className="min-w-0">
        <b className="font-display text-lg block">Early Check-In</b>
        <span className="text-xs opacity-80">3 culture tasks · up to 10 bonus points</span>
      </span>
      <span className="ml-auto text-lg" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** Early Check-In — 3 personal culture tasks (4/3/3). Caps, deadline and approvals live on the server. */
export function EarlyCheckIn({
  trip,
  userId,
  viewOnly,
  open,
  onBack,
}: {
  trip: TripWithRole;
  userId: string;
  viewOnly: boolean;
  open: boolean;
  onBack: () => void;
}) {
  const home = trip.kind === "at_home" || (trip.kind as string) === "cultural_inspiration";
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  const place = trip.destination || "your destination";
  const [tasks, setTasks] = useState<Task[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const load = useCallback(async () => {
    const { data, error: e } = await db
      .from("mission_claims")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("user_id", userId)
      .eq("phase", "checkin")
      .order("slot");
    if (e) setError(friendlyError(e));
    else setTasks(data ?? []);
  }, [trip.id, userId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(args: object) {
    setBusy(true);
    setError("");
    const { error: e } = await db.rpc("mission_action", {
      p_trip: trip.id,
      p_phase: "checkin",
      ...args,
    });
    if (e) setError(friendlyError(e));
    await load();
    setBusy(false);
  }
  async function more() {
    if (!(await askCredits(trip.id, "checkin_topup"))) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await moreCheckinTasks({ data: { tripId: trip.id } });
      setNote(
        r.added ? `${r.added} fresh tasks added.` : "No new tasks this time — try again later.",
      );
    } catch (e) {
      setError(creditError(e));
    }
    setBusy(false);
  }
  const released = Math.min(
    MAX,
    tasks.filter((t) => t.status === "released").reduce((s, t) => s + t.points, 0),
  );
  const pending = tasks.filter((t) => t.status === "pending").reduce((s, t) => s + t.points, 0);
  const nextSlot = [1, 2, 3].find((s) => !tasks.some((t) => t.slot === s));
  const revealedOpen = tasks.some((t) => t.status === "revealed");
  const deadline = home ? "before the experience ends" : "at any group call before Takeoff";

  return (
    <section className="mt-5" aria-label="Early Check-In">
      <Button variant="ghost" className="-ml-3 rounded-full" onClick={onBack}>
        <ArrowLeft size={16} /> Game Day
      </Button>
      <div className="ec-card mt-3">
        <span className="eyebrow text-primary">
          <Stamp size={14} className="inline mr-1" />
          EARLY CHECK-IN
        </span>
        <h2 className="font-display text-2xl font-extrabold mt-2 break-words">
          Get A Head Start On {place}
        </h2>
        <p className="font-bold mt-1">Up to 10 bonus points</p>
        <p className="text-sm mt-2 opacity-85">
          Reveal your 3 personal culture tasks one at a time. Do each one, then present it{" "}
          {deadline}.
        </p>
        <p className="text-sm mt-1 opacity-85">
          The Captain or Co-Captain approves it after you present, and your points release then.
        </p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs font-bold">
          <span className="ec-chip">{released} of 10 bonus points</span>
          {pending > 0 && <span className="ec-chip ec-chip-pending">Pending {pending}</span>}
        </div>
      </div>
      <ol className="grid gap-3 mt-4">
        {[1, 2, 3].map((slot) => {
          const t = tasks.find((x) => x.slot === slot),
            pts = PTS[slot - 1]!;
          const chip =
            !t || t.status === "revealed" ? (
              <span className="ec-chip">Open</span>
            ) : t.status === "pending" ? (
              <span className="ec-chip ec-chip-pending">Pending</span>
            ) : t.status === "released" ? (
              <span className="ec-chip ec-chip-released">Approved · {t.points} pts</span>
            ) : (
              <span className="ec-chip">
                {t.status === "declined" ? "Declined" : "Not completed"}
              </span>
            );
          return (
            <li key={slot} className={`ec-card ${t ? `ec-${t.status}` : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold tracking-wider">
                  TASK {slot} · {pts} PTS
                </span>
                {chip}
              </div>
              {t ? (
                <>
                  <p className="text-[11px] uppercase font-bold opacity-70 mt-2">{t.category}</p>
                  {t.title && (
                    <h3 className="font-display text-lg font-extrabold mt-1 break-words">
                      {t.title}
                    </h3>
                  )}
                  <p className="mt-1 break-words">{t.mission_text}</p>
                  {t.backstory && (
                    <p className="text-sm opacity-80 mt-2 break-words">{t.backstory}</p>
                  )}
                  {!!t.keywords?.length && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {t.keywords.map((k) => (
                        <a
                          key={k}
                          className="ec-chip"
                          href={`https://www.google.com/search?q=${encodeURIComponent(k)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Search size={11} className="mr-1" />
                          Search for {k}
                        </a>
                      ))}
                    </div>
                  )}
                  {t.status === "revealed" ? (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Button
                        className="ec-pill"
                        disabled={busy || viewOnly || !open}
                        onClick={() => void act({ p_action: "complete", p_claim: t.id })}
                      >
                        <Check size={16} /> Complete
                      </Button>
                      <Button
                        variant="ghost"
                        className="ec-pill"
                        disabled={busy || viewOnly}
                        onClick={() => void act({ p_action: "skip", p_claim: t.id })}
                      >
                        <X size={16} /> Not completed
                      </Button>
                    </div>
                  ) : (
                    t.status === "pending" && (
                      <p className="text-xs mt-3 opacity-85">Pending — present it {deadline}.</p>
                    )
                  )}
                </>
              ) : slot === nextSlot ? (
                <Button
                  className="ec-pill w-full mt-3"
                  disabled={!open || viewOnly || revealedOpen || busy}
                  onClick={() => void act({ p_action: "reveal", p_slot: slot })}
                >
                  <Stamp size={16} /> Reveal task
                </Button>
              ) : (
                <p className="text-sm opacity-60 mt-2">Opens after the task before it.</p>
              )}
            </li>
          );
        })}
      </ol>
      {!open && <p className="text-xs mt-3 opacity-80">Early Check-In has closed.</p>}
      {leader && !viewOnly && open && (
        <Button
          variant="ghost"
          className="ec-pill mt-4"
          disabled={busy}
          onClick={() => void more()}
        >
          <Sparkles size={16} /> More tasks · 2 credits
        </Button>
      )}
      {note && (
        <p role="status" className="text-sm mt-2">
          {note}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive mt-3">
          {error}
        </p>
      )}
    </section>
  );
}
