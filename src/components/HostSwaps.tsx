import { confirmInApp } from "@/lib/confirm";
import { friendlyError } from "@/lib/friendly-error";
import { fmtWhen } from "@/lib/viewer-time";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";

type Swap = {
  id: string;
  trip_id: string;
  week_number: number;
  from_user: string;
  to_user: string | null;
  status: string;
  accepted_by: string | null;
  created_at: string;
};
type Penalty = {
  trip_id: string;
  week_number: number;
  user_id: string;
  stamps: number;
  created_at: string;
};
type Person = { user_id: string; name: string };
type NightLite = {
  week_number: number;
  starts_at: string;
  host_id: string | null;
  host_checked_in_at?: string | null;
  skipped?: boolean;
};

// New tables aren't in the generated types yet; keep the cast in one place.
const db = supabase as unknown as {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        k: string,
        v: string,
      ) => {
        order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null }>;
      };
    };
  };
  rpc: (f: string, a: object) => PromiseLike<{ error: { message: string } | null }>;
};
const fmt = (iso: string, tz: string) => fmtWhen(iso, tz);

function useHostData(tripId: string) {
  const [swaps, setSwaps] = useState<Swap[]>([]),
    [penalties, setPenalties] = useState<Penalty[]>([]),
    [nights, setNights] = useState<NightLite[]>([]);
  const refresh = useCallback(async () => {
    const [s, p, n] = await Promise.all([
      db
        .from("host_swaps")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false }),
      db
        .from("host_penalties")
        .select("*")
        .eq("trip_id", tripId)
        .order("week_number", { ascending: true }),
      db
        .from("game_nights")
        .select("week_number,starts_at,host_id,host_checked_in_at,skipped")
        .eq("trip_id", tripId)
        .order("week_number", { ascending: true }),
    ]);
    setSwaps((s.data ?? []) as Swap[]);
    setPenalties((p.data ?? []) as Penalty[]);
    setNights((n.data ?? []) as NightLite[]);
  }, [tripId]);
  useEffect(() => {
    void refresh();
    const ch = supabase
      .channel(`host-swaps-${tripId}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "host_swaps", filter: `trip_id=eq.${tripId}` },
        () => void refresh(),
      )
      .subscribe();
    const t = window.setInterval(() => void refresh(), 30000);
    return () => {
      window.clearInterval(t);
      void supabase.removeChannel(ch);
    };
  }, [tripId, refresh]);
  return { swaps, penalties, nights, refresh };
}

/** Home: swap requests sent to me (or the whole group). */
export function HostSwapInbox({
  trip,
  userId,
  people,
  viewOnly = false,
}: {
  trip: TripWithRole;
  userId: string;
  people: Person[];
  viewOnly?: boolean;
}) {
  const { swaps, nights, refresh } = useHostData(trip.id);
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  const nameOf = (id: string) => people.find((p) => p.user_id === id)?.name || "A player";
  const open = swaps
    .filter(
      (s) =>
        s.status === "open" &&
        s.from_user !== userId &&
        (s.to_user === null || s.to_user === userId),
    )
    .filter((s) => {
      const n = nights.find((x) => x.week_number === s.week_number);
      return n && new Date(n.starts_at).getTime() - 2 * 3600000 > Date.now();
    });
  if (!open.length) return null;
  async function accept(id: string) {
    setBusy(true);
    setMsg("");
    const r = await db.rpc("respond_host_swap", { p_swap: id, p_action: "accept" });
    setBusy(false);
    if (r.error) setMsg(friendlyError(r.error));
    else {
      setMsg("You're hosting that night now ✓");
      await refresh();
    }
  }
  return (
    <section className="app-card mt-[14px]" aria-label="Host swap requests">
      <p className="eyebrow text-orange">HOST SWAP 🔁</p>
      {open.map((s) => {
        const n = nights.find((x) => x.week_number === s.week_number)!;
        const mine = nights.find(
          (x) =>
            x.host_id === userId &&
            new Date(x.starts_at) > new Date() &&
            x.week_number !== s.week_number,
        );
        return (
          <div key={s.id} className="mt-3">
            <p className="text-sm font-bold">
              {nameOf(s.from_user)} needs a host for Week {s.week_number} ·{" "}
              {fmt(n.starts_at, trip.home_timezone)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {mine
                ? `You'd trade: they take your Week ${mine.week_number}.`
                : "You'd take this night. No pass used, no penalty."}
            </p>
            {!viewOnly && (
              <Button
                size="sm"
                variant="playful"
                className="mt-2"
                disabled={busy}
                onClick={() => void accept(s.id)}
              >
                Accept
              </Button>
            )}
          </div>
        );
      })}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
    </section>
  );
}

/** Play: host-only actions on the next game night, plus a player skip pass. */
export function HostNightActions({
  trip,
  userId,
  night,
  people,
  viewOnly = false,
}: {
  trip: TripWithRole;
  userId: string;
  night: NightLite;
  people: Person[];
  viewOnly?: boolean;
}) {
  const { swaps, penalties, nights: hostNights, refresh } = useHostData(trip.id);
  const [pick, setPick] = useState(""),
    [openSheet, setOpenSheet] = useState(false),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(""),
    [passUsed, setPassUsed] = useState(false);
  const start = new Date(night.starts_at).getTime();
  const isHost = night.host_id === userId;
  const swapOpen = start - 2 * 3600000 > Date.now();
  const pending = swaps.find(
    (s) => s.status === "open" && s.week_number === night.week_number && s.from_user === userId,
  );
  const myMisses = penalties.filter(
    (p) =>
      p.user_id === userId && !hostNights.find((n) => n.week_number === p.week_number)?.skipped,
  );
  const checkedIn = !!hostNights.find((n) => n.week_number === night.week_number)
    ?.host_checked_in_at;
  const checkInOpen = Date.now() >= start - 2 * 3600000 && Date.now() <= start + 3 * 3600000;
  const nameOf = (id: string) => people.find((p) => p.user_id === id)?.name || "Player";
  async function run(f: string, a: object, ok: string) {
    setBusy(true);
    setMsg("");
    const r = await db.rpc(f, a);
    setBusy(false);
    if (r.error) {
      setMsg(friendlyError(r.error));
      return false;
    }
    setMsg(ok);
    await refresh();
    return true;
  }
  return (
    <>
      {!viewOnly &&
        isHost &&
        checkInOpen &&
        (checkedIn ? (
          <p className="mt-3 neon-chip text-green inline-block">✅ You're checked in as host</p>
        ) : (
          <Button
            size="sm"
            variant="green"
            className="mt-3"
            disabled={busy}
            onClick={() =>
              void run(
                "host_check_in",
                { p_trip: trip.id, p_week: night.week_number },
                "You're checked in ✅ No missed-hosting penalty tonight.",
              )
            }
          >
            ✅ I'm here
          </Button>
        ))}
      {!viewOnly && start > Date.now() && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isHost && swapOpen && !pending && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpenSheet(true)}>
              🔁 Swap my host night
            </Button>
          )}
          {isHost && pending && (
            <>
              <span className="neon-chip text-orange">
                Swap offered to {pending.to_user ? nameOf(pending.to_user) : "the squad"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    "respond_host_swap",
                    { p_swap: pending.id, p_action: "cancel" },
                    "Swap cancelled",
                  )
                }
              >
                Cancel
              </Button>
            </>
          )}
          {isHost && trip.myRole !== "captain" && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirmInApp(
                    "Use a skip pass? The Captain hosts this night and you lose nothing.",
                  )
                )
                  void run(
                    "use_host_pass",
                    { p_trip: trip.id, p_week: night.week_number },
                    "Pass used — the Captain has it covered ✓",
                  );
              }}
            >
              🎟️ Use a skip pass
            </Button>
          )}
          {isHost && trip.myRole === "captain" && !passUsed && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirmInApp(
                    "Use a Captain pass? No penalty, and this night won't count against your score. (2 passes for seasons up to 8 nights, 3 for 9–12.)",
                  )
                )
                  void run(
                    "use_captain_pass",
                    { p_trip: trip.id, p_week: night.week_number },
                    "Captain pass used — night excused ✓",
                  ).then((ok) => ok && setPassUsed(true));
              }}
            >
              🎟️ Use a Captain pass
            </Button>
          )}
          {!isHost && !passUsed && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirmInApp(
                    "Can't make it? A skip pass keeps your attendance streak. You won't earn stamps that night.",
                  )
                )
                  void run(
                    "use_night_pass",
                    { p_trip: trip.id, p_week: night.week_number },
                    "Pass used — your streak is safe ✓",
                  ).then((ok) => ok && setPassUsed(true));
              }}
            >
              🎟️ Can't make it? Use a pass
            </Button>
          )}
        </div>
      )}
      {isHost && !swapOpen && start > Date.now() && (
        <p className="text-xs text-muted-foreground mt-2">
          Swaps close {fmtWhen(start - 2 * 3600 * 1000, trip.home_timezone)}. The Captain is your
          backup host.
        </p>
      )}
      {myMisses.length > 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          {myMisses.map((p) => (
            <p key={p.week_number}>
              Week {p.week_number} · Missed hosting · −{p.stamps} points
            </p>
          ))}
        </div>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
      {openSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-background/80" onClick={() => setOpenSheet(false)} />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Swap my host night"
            className="relative w-full max-w-lg rounded-t-3xl bg-card p-6 pb-10"
          >
            <h2 className="font-display text-2xl font-extrabold">Swap my host night 🔁</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Week {night.week_number} · {fmt(night.starts_at, trip.home_timezone)}. Whoever accepts
              trades host weeks with you. No pass, no penalty.
            </p>
            <label className="block text-sm font-bold mt-4">
              Ask
              <select
                className="w-full h-12 rounded-xl bg-card border-2 border-border px-3 mt-1"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="">The whole squad</option>
                {people
                  .filter((p) => p.user_id !== userId)
                  .map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <Button
              variant="playful"
              className="w-full mt-5"
              disabled={busy}
              onClick={() =>
                void run(
                  "request_host_swap",
                  { p_trip: trip.id, p_week: night.week_number, p_to: pick || null },
                  "Swap request sent ✓",
                ).then((ok) => ok && setOpenSheet(false))
              }
            >
              Send request
            </Button>
            <Button variant="ghost" className="w-full mt-2" onClick={() => setOpenSheet(false)}>
              Cancel
            </Button>
          </section>
        </div>
      )}
    </>
  );
}

/** Captain Tools: every swap request and hosting miss. */
export function HostSwapsAdmin({ trip, people }: { trip: TripWithRole; people: Person[] }) {
  const { swaps, penalties, refresh } = useHostData(trip.id);
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  const nameOf = (id: string | null) =>
    id ? people.find((p) => p.user_id === id)?.name || "Player" : "the squad";
  async function cancel(id: string) {
    setBusy(true);
    const r = await db.rpc("respond_host_swap", { p_swap: id, p_action: "cancel" });
    setBusy(false);
    setMsg(r.error ? friendlyError(r.error) : "");
    await refresh();
  }
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-ink-soft">
        You're the automatic backup host. Hosts can swap up to 2 hours before start or use a skip
        pass. If a host doesn't start within 15 minutes, you can start it and they lose 5 stamps.
      </p>
      {swaps.length === 0 && <p className="text-sm text-muted-foreground">No swap requests yet.</p>}
      {swaps.slice(0, 12).map((s) => (
        <div
          key={s.id}
          className="text-sm bg-card rounded-xl p-3 border border-border flex items-center justify-between gap-2"
        >
          <span>
            Week {s.week_number}: {nameOf(s.from_user)} →{" "}
            {s.status === "accepted" ? `${nameOf(s.accepted_by)} ✓` : nameOf(s.to_user)}
            {s.status === "cancelled" ? " · cancelled" : s.status === "open" ? " · waiting" : ""}
          </span>
          {s.status === "open" && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void cancel(s.id)}>
              Cancel
            </Button>
          )}
        </div>
      ))}
      {penalties.length > 0 && (
        <>
          <p className="font-bold text-sm mt-3">Missed hosting</p>
          {penalties.map((p) => (
            <p key={p.week_number} className="text-sm">
              Week {p.week_number} · {nameOf(p.user_id)} · -{p.stamps}
            </p>
          ))}
        </>
      )}
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}
