import { useCallback, useEffect, useState } from "react";
import { Check, LockKeyhole, ScanLine, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import { hapticTap } from "@/lib/haptics";
import { askCredits, creditError } from "./AiCredits";
import { moreMissions } from "@/lib/missions.functions";
import { PhaseCountdown } from "@/components/PhaseCountdown";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import heroArt from "@/assets/security-check.jpg";

export type Claim = {
  id: string;
  trip_id: string;
  user_id: string;
  slot: number;
  phase?: "takeoff" | "checkin";
  presented_at?: string | null;
  revealed_at?: string | null;
  created_at?: string | null;
  title?: string | null;
  category: string;
  mission_text: string;
  points: number;
  status: "revealed" | "pending" | "released" | "declined" | "skipped";
};
type MissionWindow = { opens_at: string; closes_at: string; proof_due_at: string | null };
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
            ) => PromiseLike<{ data: Claim[] | null; error: { message: string } | null }>;
          };
          order: (
            c: string,
          ) => PromiseLike<{ data: Claim[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
};
const MAX = 12;
const STATUS: Record<Claim["status"], string> = {
  revealed: "Your mission",
  pending: "Pending",
  released: "Released",
  declined: "Declined",
  skipped: "Not completed",
};

/** Security Check · Secret Missions — cinematic Takeoff / Home Missions page. Points and caps live on the server. */
export function AirportMissions({
  trip,
  userId,
  viewOnly,
  canPlay,
}: {
  trip: TripWithRole;
  userId: string;
  viewOnly: boolean;
  canPlay: boolean;
}) {
  const home = trip.kind === "at_home" || (trip.kind as string) === "cultural_inspiration";
  const leader = trip.myRole === "captain" || trip.myRole === "co_captain";
  const [claims, setClaims] = useState<Claim[]>([]),
    [windowState, setWindowState] = useState<MissionWindow | null>(null),
    [layover, setLayover] = useState(false),
    [busy, setBusy] = useState(false),
    [revealingSlot, setRevealingSlot] = useState<number | null>(null),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    const [{ data, error: e }, windowResult] = await Promise.all([
      db
        .from("mission_claims")
        .select("*")
        .eq("trip_id", trip.id)
        .eq("user_id", userId)
        .eq("phase", "takeoff")
        .order("slot"),
      db.rpc("mission_window", { p_trip: trip.id }),
    ]);
    if (e || windowResult.error) setError(friendlyError(e ?? windowResult.error));
    else {
      setClaims(data ?? []);
      setWindowState(
        (Array.isArray(windowResult.data)
          ? windowResult.data[0]
          : windowResult.data) as MissionWindow | null,
      );
      if ((data ?? []).some((c) => c.slot > 3)) setLayover(true);
      setNow(Date.now());
    }
  }, [trip.id, userId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  async function act(args: object) {
    setBusy(true);
    setError("");
    const { error: e } = await db.rpc("mission_action", { p_trip: trip.id, ...args });
    if (e) setError(friendlyError(e));
    await load();
    setBusy(false);
  }
  function reveal(slot: number) {
    setRevealingSlot(slot);
    hapticTap();
    window.setTimeout(() => {
      void act({ p_action: "reveal", p_slot: slot, p_layover: layover }).finally(() =>
        setRevealingSlot(null),
      );
    }, 600);
  }
  async function more() {
    if (!(await askCredits(trip.id, "mission_topup"))) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await moreMissions({ data: { tripId: trip.id } });
      setNote(
        r.added
          ? `${r.added} fresh missions added.`
          : "No new missions this time — try again later.",
      );
    } catch (e) {
      setError(creditError(e));
    }
    setBusy(false);
  }
  const released = Math.min(
    MAX,
    claims.filter((c) => c.status === "released").reduce((t, c) => t + c.points, 0),
  );
  const pending = claims.filter((c) => c.status === "pending").reduce((t, c) => t + c.points, 0);
  const slots = layover ? 5 : 3;
  const nextSlot = Array.from({ length: slots }, (_, i) => i + 1).find(
    (s) => !claims.some((c) => c.slot === s),
  );
  const open = claims.find((c) => c.status === "revealed");
  const beforeWindow = !!windowState && now < Date.parse(windowState.opens_at),
    afterWindow = !!windowState && now > Date.parse(windowState.closes_at),
    windowOpen = !!windowState && !beforeWindow && !afterWindow;
  const canReveal = canPlay && windowOpen && !viewOnly && !open && nextSlot !== undefined;
  const openDue = open ? (windowState?.proof_due_at ?? null) : null;
  const proofExpired = !!open && (!openDue || now >= Date.parse(openDue));

  return (
    <section className="sm-page mt-5" aria-label={home ? "Home Missions" : "Airport Missions"}>
      <div className="sm-hero">
        <img
          src={heroArt}
          alt="Glowing airport security scanner with a tray and suitcase on the belt"
          width={1536}
          height={768}
          sizes="(max-width: 520px) calc(100vw - 32px), 512px"
        />
        <div className="sm-scan" aria-hidden="true" />
      </div>
      <div className="sm-glass mt-4">
        <span className="eyebrow sm-eyebrow">
          <ScanLine size={14} className="inline mr-1" />
          SECURITY CHECK · TAKEOFF
        </span>
        <h2 className="font-display text-xl font-extrabold mt-2">
          {home ? "Home Missions" : "Airport Missions"}
        </h2>
        <h2 className="font-display text-2xl font-extrabold mt-2">
          {home ? "Clear Security At Home" : "Clear Security With Style"}
        </h2>
        <p className="text-sm mt-1 opacity-85">
          {home
            ? "Complete secret missions for bonus points. No flight needed."
            : "Complete secret missions for bonus points."}
        </p>
        {windowState && (
          <p className="text-sm mt-3 font-bold">
            {beforeWindow ? (
              <>
                Missions open{" "}
                {new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: trip.home_timezone,
                }).format(new Date(windowState.opens_at))}{" "}
                — your home time.
              </>
            ) : afterWindow ? (
              "The reveal window is closed. Unrevealed missions are Missed."
            ) : (
              <PhaseCountdown
                target={windowState.closes_at}
                prefix="Open ·"
                connector=" "
                suffix=" left to reveal"
                expired="Reveal window closed"
                timeZone={trip.home_timezone}
              />
            )}
          </p>
        )}
        <p className="sm-cap mt-3 font-bold">Up to 12 bonus points</p>
        <div
          className="sm-meter mt-3"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={MAX}
          aria-valuenow={released}
          aria-label="Bonus points released"
        >
          <div className="sm-meter-fill" style={{ width: `${(released / MAX) * 100}%` }} />
          <div
            className="sm-meter-pending"
            style={{
              left: `${(released / MAX) * 100}%`,
              width: `${(Math.min(pending, MAX - released) / MAX) * 100}%`,
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs font-bold">
          <span>{released} of 12 bonus points</span>
          {pending > 0 && <span className="sm-chip sm-chip-pending">Pending {pending}</span>}
          {released > 0 && <span className="sm-chip sm-chip-released">Released {released}</span>}
        </div>
        <label className="flex items-center justify-between gap-3 mt-4 text-sm font-bold">
          I have a layover or connection
          <Switch
            checked={layover}
            disabled={viewOnly || claims.some((c) => c.slot > 3)}
            onCheckedChange={setLayover}
            aria-label="I have a layover or connection"
          />
        </label>
      </div>

      <ol className="grid gap-3 mt-4">
        {Array.from({ length: slots }, (_, i) => i + 1).map((slot) => {
          const c = claims.find((x) => x.slot === slot),
            pts = slot <= 3 ? 2 : 3;
          return (
            <li
              key={slot}
              className={`sm-tray ${c ? `sm-${c.status}` : ""} ${revealingSlot === slot ? "mission-seal-breaking" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold tracking-wider">
                  MISSION {slot}
                  {slot > 3 ? " · LAYOVER" : ""}
                </span>
                <span className="sm-chip">{!c && afterWindow ? 0 : pts} pts</span>
              </div>
              {c ? (
                <>
                  <p className="text-[11px] uppercase font-bold opacity-70 mt-2">{c.category}</p>
                  <p className="font-display text-lg font-extrabold mt-1 break-words">
                    {c.mission_text}
                  </p>
                  {c.status === "revealed" ? (
                    <>
                      {openDue ? (
                        <p className="text-xs font-bold mt-2">
                          <PhaseCountdown
                            target={openDue}
                            prefix="Proof due"
                            expired="Proof deadline passed · mission locked"
                            timeZone={trip.home_timezone}
                          />
                        </p>
                      ) : (
                        <p className="text-xs font-bold mt-2">
                          Proof deadline passed · mission locked
                        </p>
                      )}
                      <p className="text-xs opacity-80 mt-2">
                        Upload your proof before Trip Season starts — and you always get at least 24
                        hours after you reveal.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <Button
                          className="sm-pill sm-pill-go"
                          disabled={busy || viewOnly || proofExpired}
                          onClick={() => void act({ p_action: "complete", p_claim: c.id })}
                        >
                          <Check size={16} /> Complete
                        </Button>
                        <Button
                          variant="ghost"
                          className="sm-pill"
                          disabled={busy || viewOnly || proofExpired}
                          onClick={() => void act({ p_action: "skip", p_claim: c.id })}
                        >
                          <X size={16} /> Not completed
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-3">
                      <span className={`sm-chip sm-chip-${c.status}`}>{STATUS[c.status]}</span>
                      {c.status === "pending" && (
                        <span className="text-xs opacity-80 ml-2">
                          Show your proof to the Captain or Co-Captain in person.
                        </span>
                      )}
                    </p>
                  )}
                </>
              ) : afterWindow ? (
                <div className="mission-sealed-copy">
                  <LockKeyhole size={22} />
                  <strong>Missed</strong>
                  <small>The reveal window has closed · 0 pts</small>
                </div>
              ) : slot === nextSlot ? (
                <>
                  <div className="mission-sealed-copy">
                    <LockKeyhole size={22} />
                    <strong>Mission {slot} is sealed</strong>
                    <small>Reveal now, then upload proof before its deadline</small>
                  </div>
                  <Button
                    className="sm-pill sm-pill-go w-full mt-3"
                    disabled={!canReveal || busy || revealingSlot !== null}
                    onClick={() => reveal(slot)}
                  >
                    <ScanLine size={16} /> {revealingSlot === slot ? "Opening…" : "Tap to reveal"}
                  </Button>
                </>
              ) : (
                <p className="text-sm opacity-60 mt-2">
                  Locked until the mission before is answered.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {beforeWindow && (
        <p className="text-xs mt-3 opacity-80">Airport Missions stay locked until departure day.</p>
      )}
      {leader && !viewOnly && windowOpen && canPlay && (
        <Button
          variant="ghost"
          className="sm-pill mt-4"
          disabled={busy}
          onClick={() => void more()}
        >
          <Sparkles size={16} /> More missions · 2 credits
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
      <p className="sm-safe mt-6 text-xs">
        <ShieldCheck size={14} className="inline mr-1" />
        Nothing here will keep you from clearing security. Stay safe, be kind, follow airport rules
        and staff instructions.
      </p>
    </section>
  );
}

/** Captain Tools: pending claims with Verify / Decline. Nobody verifies their own claim; a Co-Captain verifies the Captain's. */
export function PendingMissions({
  trip,
  members,
  cards,
  userId,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
}) {
  const [rows, setRows] = useState<Claim[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: e } = await db
      .from("mission_claims")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("status", "pending")
      .order("created_at");
    if (e) setError(friendlyError(e));
    else setRows(data ?? []);
  }, [trip.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const hasCo = members.some((m) => m.role === "co_captain" && m.user_id !== userId);
  const name = (id: string) =>
    cards.find((c) => c.user_id === id)?.game_name ||
    members.find((m) => m.user_id === id)?.display_name ||
    "Player";
  async function decide(c: Claim, action: "verify" | "decline") {
    if (c.user_id === userId) return;
    setBusy(true);
    setError("");
    const { error: e } = await db.rpc("mission_action", {
      p_trip: trip.id,
      p_action: action,
      p_claim: c.id,
    });
    if (e) setError(friendlyError(e));
    await load();
    setBusy(false);
  }
  return (
    <section className="app-card mt-5" aria-label="Pending missions">
      <h2 className="font-display text-xl font-extrabold">Pending Missions</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Takeoff missions and Early Check-In tasks. Check them in person or on the call, then approve
        to release the points.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm mt-3">No missions waiting.</p>
      ) : (
        <ul className="grid gap-2 mt-3">
          {rows.map((c) => {
            const own = c.user_id === userId,
              blocked = own;
            return (
              <li key={c.id} className="rounded-2xl border p-3">
                <p className="text-sm font-bold">
                  {name(c.user_id)} ·{" "}
                  {c.phase === "checkin"
                    ? `Early Check-In · Task ${c.slot} · ${c.points} pts`
                    : c.slot > 3
                      ? `Layover mission · ${c.points} pts`
                      : `${c.points} pts`}
                </p>
                <p className="text-sm mt-1 break-words">
                  {c.title ? <b>{c.title}: </b> : null}
                  {c.mission_text}
                </p>
                {c.phase === "checkin" && c.presented_at && (
                  <p className="text-xs font-bold mt-2">
                    Presented ✓{" "}
                    {new Date(c.presented_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                )}
                {blocked ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    {hasCo
                      ? "Your Co-Captain verifies your own missions."
                      : "Add a Co-Captain to verify your own missions"}
                  </p>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" disabled={busy} onClick={() => void decide(c, "verify")}>
                      <Check size={14} /> {c.phase === "checkin" ? "Approve" : "Verify"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void decide(c, "decline")}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive mt-2">
          {error}
        </p>
      )}
    </section>
  );
}
