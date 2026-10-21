import { confirmInApp } from "@/lib/confirm";
import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { Check, ChevronRight, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useLook } from "@/lib/look";
import type { Member, TripWithRole } from "@/lib/trips";
import { usePendingCount } from "@/components/BetaCodes";

export type CheckKey = "dates" | "itinerary" | "nights" | "prizes" | "invite";
type Status = Record<CheckKey, boolean>;

/** Opens a remembered accordion by id and scrolls to it. */
export function openSection(id: string) {
  safeSetItem(`tripjunkie-section-${id}`, "true");
  window.dispatchEvent(new CustomEvent("tripjunkie-open-section", { detail: id }));
  window.setTimeout(
    () =>
      document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    60,
  );
}

export function useCaptainStatus(trip: TripWithRole, members: Member[]) {
  const [s, setS] = useState<Omit<Status, "dates" | "invite"> | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      supabase.from("trip_itineraries").select("days").eq("trip_id", trip.id).maybeSingle(),
      supabase
        .from("game_nights")
        .select("week_number", { count: "exact", head: true })
        .eq("trip_id", trip.id),
      supabase.rpc("season_info", { p_trip: trip.id }),
    ]).then(([it, gn, si]) => {
      if (!live) return;
      const days = Array.isArray(it.data?.days)
        ? (it.data.days as {
            city?: string;
            spots?: unknown[];
            stays?: unknown[];
            flights?: unknown[];
            note?: string;
          }[])
        : [];
      setS({
        itinerary: days.some(
          (d) =>
            d.city?.trim() ||
            d.note?.trim() ||
            d.spots?.length ||
            d.stays?.length ||
            d.flights?.length,
        ),
        nights: (gn.count ?? 0) > 0,
        prizes: (si.data ?? []).some((r: { prize: string | null }) => !!r.prize?.trim()),
      });
    });
    return () => {
      live = false;
    };
  }, [trip.id, trip.updated_at]);
  if (!s) return null;
  return {
    dates: !!trip.start_date && !!trip.end_date,
    invite: members.length > 1,
    ...s,
  } as Status;
}

const items: { key: CheckKey; label: string; fix: string; section: string }[] = [
  { key: "dates", label: "Trip dates", fix: "Set dates", section: "captain-details" },
  { key: "itinerary", label: "Itinerary", fix: "Add the plan", section: "captain-itinerary" },
  { key: "nights", label: "Game night times", fix: "Pick times", section: "captain-nights" },
  { key: "prizes", label: "Prizes", fix: "Add a prize", section: "captain-prizes" },
  { key: "invite", label: "Invite friends", fix: "Share code", section: "captain-members" },
];

export function CaptainChecklist({ trip, members }: { trip: TripWithRole; members: Member[] }) {
  const status = useCaptainStatus(trip, members);
  if (!status) return null;
  const done = items.filter((i) => status[i.key]).length;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-muted-foreground">
        {done === items.length
          ? "All set — your squad is ready 🎉"
          : `${done} of ${items.length} done. Tap anything unticked to fix it.`}
      </p>
      {items.map((i) => (
        <button
          key={i.key}
          type="button"
          disabled={status[i.key]}
          onClick={() => openSection(`${trip.id}-${i.section}`)}
          className="w-full min-h-12 flex items-center gap-3 rounded-xl bg-card border border-border px-3 text-left disabled:opacity-80"
        >
          <span
            className={`grid place-items-center h-7 w-7 rounded-full shrink-0 ${status[i.key] ? "bg-green text-primary-foreground" : "border-2 border-border"}`}
          >
            {status[i.key] && <Check size={16} />}
          </span>
          <span
            className={`flex-1 font-bold ${status[i.key] ? "line-through text-muted-foreground" : ""}`}
          >
            {i.label}
          </span>
          {!status[i.key] && (
            <span className="text-xs font-bold text-primary flex items-center">
              {i.fix}
              <ChevronRight size={14} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Gentle banner for leaders on Home when setup is missing. */
export function CaptainNudge({
  trip,
  members,
  onOpenTools,
}: {
  trip: TripWithRole;
  members: Member[];
  onOpenTools: () => void;
}) {
  const cinematic = useLook("home-top") === "cinematic";
  const status = useCaptainStatus(trip, members);
  const waiting = usePendingCount(trip.id, true);
  const key = `tripjunkie-nudge-${trip.id}`;
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setHidden(sessionStorage.getItem(key) === "1");
  }, [key]);
  const waitingRow = waiting > 0 && (
    <button
      type="button"
      onClick={onOpenTools}
      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl bg-card px-3 py-2 text-left text-sm font-bold"
    >
      <span>
        {waiting} {waiting === 1 ? "person" : "people"} waiting to join
      </span>
      <span className="flex items-center text-primary">
        Approve
        <ChevronRight size={14} />
      </span>
    </button>
  );
  if (waiting > 0 && (!status || hidden))
    return (
      <div
        className={`mb-4 rounded-2xl bg-orange-soft p-4 ${cinematic ? "cinematic-captain-nudge" : ""}`}
        role="status"
      >
        <p className="font-bold text-sm mb-2">Quick Captain to-do</p>
        {waitingRow}
      </div>
    );
  if (!status || hidden) return null;
  const missing = [
    !status.nights && "no game night times yet",
    !status.prizes && "no prize yet",
    !status.invite && "nobody invited yet",
  ].filter(Boolean) as string[];
  if (!missing.length && !waiting) return null;
  return (
    <div
      className={`mb-4 rounded-2xl bg-orange-soft p-4 flex gap-3 items-start ${cinematic ? "cinematic-captain-nudge" : ""}`}
      role="status"
    >
      <Crown className="text-orange shrink-0 mt-0.5" size={20} />
      <div className="flex-1">
        <p className="font-bold text-sm">Quick Captain to-do</p>
        {waitingRow && <div className="mt-2">{waitingRow}</div>}
        {missing.length > 0 && (
          <p className="text-xs text-ink-soft mt-0.5">Heads up: {missing.join(" · ")}.</p>
        )}
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="playful" onClick={onOpenTools}>
            Fix it
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              sessionStorage.setItem(key, "1");
              setHidden(true);
            }}
          >
            Later
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Hand the Captain role to another member. */
export function HandOffCaptain({
  trip,
  members,
  onDone,
}: {
  trip: TripWithRole;
  members: Member[];
  onDone: () => Promise<void>;
}) {
  const others = members.filter((m) => m.role !== "captain");
  const [pick, setPick] = useState(""),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  if (trip.myRole !== "captain")
    return (
      <p className="text-sm text-muted-foreground mt-3">Only the Captain can hand off the crown.</p>
    );
  if (!others.length)
    return (
      <p className="text-sm text-muted-foreground mt-3">
        Invite someone first — then you can hand off the crown.
      </p>
    );
  const who = others.find((m) => m.user_id === pick);
  async function go() {
    if (
      !who ||
      !(await confirmInApp(
        `Hand off Captain to ${who.display_name || "this player"}? You'll become a regular member.`,
      ))
    )
      return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("manage_trip_member", {
      p_trip: trip.id,
      p_user: who.user_id,
      p_action: "pass_crown",
    });
    setBusy(false);
    if (error) setErr(friendlyError(error));
    else await onDone();
  }
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">
        The new Captain gets every tool here. You become a regular member.
      </p>
      <select
        aria-label="New Captain"
        className="w-full h-12 rounded-xl bg-card border-2 border-border px-3"
        value={pick}
        onChange={(e) => setPick(e.target.value)}
      >
        <option value="">Choose a member</option>
        {others.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.display_name || "Player"}
          </option>
        ))}
      </select>
      <Button
        variant="playful"
        className="w-full"
        disabled={!who || busy}
        onClick={() => void go()}
      >
        <Crown /> Hand off Captain
      </Button>
      {err && (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      )}
    </div>
  );
}
