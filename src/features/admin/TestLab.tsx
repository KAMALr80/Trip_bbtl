import { rpc, rpcByName } from "@/data/rpc";
import { tripDisplayName } from "@/lib/trip-display-name";
import { countPendingBingo } from "@/lib/pending-bingo";
import { confirmInApp } from "@/lib/confirm";
import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  createAtHomeSandbox,
  createSandbox,
  deleteSandbox,
  prepareLateBot,
  resetSandbox,
} from "@/lib/lab.functions";
import type { TripWithRole } from "@/lib/trips";
import { savePendingCode, clearPendingCode } from "@/lib/pending-code";
import { setLabView, useLabView, VIEW_LABELS } from "@/lib/lab-mode";
import { EngineLab } from "./EngineLab";
type Tab = "Home" | "Play" | "Trip" | "Me";
type Props = {
  trips: TripWithRole[];
  activeId?: string | undefined;
  selectTrip: (id: string) => void;
  refresh: (id?: string) => Promise<void>;
  onBack: () => void;
  goTab: (t: Tab) => void;
  openTools: () => void;
  previewLock?: () => void;
};

function Pick<T extends number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <div className="mt-1 flex gap-2">
        {options.map((o) => (
          <Button
            key={o}
            size="sm"
            variant={o === value ? "playful" : "outline"}
            className="flex-1"
            onClick={() => onChange(o)}
          >
            {o}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function LabViewBanner({ refresh }: { refresh: (id?: string) => Promise<void> }) {
  const { founder, view } = useLabView();
  useEffect(() => {
    if (founder)
      void rpc("my_lab_view").then((r) => {
        const row = (r.data as { trip_id: string; view: string }[] | null)?.[0];
        setLabView(row ?? null);
      });
  }, [founder]);
  if (!founder || !view) return null;
  return (
    <div className="sticky top-0 z-40 bg-blue text-primary-foreground px-[18px] py-2 text-xs font-bold flex items-center justify-between">
      👀 Viewing as {VIEW_LABELS[view.view] ?? view.view} (sandbox)
      <Button
        variant="ghost"
        className="h-8 text-primary-foreground underline"
        onClick={async () => {
          await rpc("lab_view", { p_trip: view.trip_id, p_view: "exit" });
          clearPendingCode();
          setLabView(null);
          await refresh(view.trip_id);
        }}
      >
        Exit
      </Button>
    </div>
  );
}

export function SandboxBanner() {
  return (
    <div
      className="sticky top-0 z-40 text-center text-xs font-extrabold py-1.5 text-primary-foreground"
      style={{
        background:
          "repeating-linear-gradient(45deg, var(--orange), var(--orange) 10px, var(--pink) 10px, var(--pink) 20px)",
      }}
    >
      🧪 SANDBOX · test data only · Me › Test Lab
    </div>
  );
}

export function TestLab({
  trips,
  activeId,
  selectTrip,
  refresh,
  onBack,
  goTab,
  openTools,
  previewLock,
}: Props) {
  const create = useServerFn(createSandbox),
    del = useServerFn(deleteSandbox),
    reset = useServerFn(resetSandbox),
    lateBot = useServerFn(prepareLateBot),
    createHome = useServerFn(createAtHomeSandbox);
  const [hPack, setHPack] = useState<"thailand" | "mexico" | "japan">("thailand");
  const [hLen, setHLen] = useState<"weekend" | "week" | "two_weeks">("weekend");
  const [size, setSize] = useState<4 | 10 | 15 | 25>(4);
  const [days, setDays] = useState<3 | 7 | 21>(7);
  const [win, setWin] = useState<1 | 10 | 45 | 84>(45);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [failedProofs, setFailedProofs] = useState<number | null>(null);
  const [view, setView] = useState<"lab" | "checklist">("lab");
  const [hidden, setHidden] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  useEffect(() => {
    void (supabase as any)
      .from("sandbox_trips")
      .select("trip_id")
      .then((r: { data: { trip_id: string }[] | null }) =>
        setHidden(
          (r.data ?? []).map((x) => x.trip_id).filter((id) => !trips.some((t) => t.id === id)),
        ),
      );
  }, [trips]);
  const sandboxes = [
    ...trips.filter((t) => (t as { is_sandbox?: boolean }).is_sandbox),
    ...hidden.map(
      (id) =>
        ({
          id,
          name: "🧪 Sandbox (you're waiting for approval)",
          myRole: "pending",
          start_date: "",
          end_date: "",
          ended_at: null,
        }) as unknown as TripWithRole,
    ),
  ];
  const [sel, setSel] = useState<string | undefined>(
    sandboxes.find((t) => t.id === activeId)?.id ?? sandboxes[0]?.id,
  );
  useEffect(() => {
    if (!sel || !sandboxes.some((t) => t.id === sel)) setSel(sandboxes[0]?.id);
  }, [trips.length]);
  useEffect(() => {
    let live = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => data.user && countPendingBingo(data.user.id))
      .then((count) => {
        if (live) setFailedProofs(typeof count === "number" ? count : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sel]);
  const trip = sandboxes.find((t) => t.id === sel);
  const tripDays = trip
    ? Math.round((Date.parse(trip.end_date) - Date.parse(trip.start_date)) / 86400000) + 1
    : 0;

  async function run(label: string, fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fn();
      setMsg(`${label} ✓${typeof r === "string" ? ` · ${r}` : ""}`);
      after?.();
    } catch (e) {
      setMsg(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const rpc = async (n: string, a: object) => {
    const r = await rpcByName(n, a);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const shift = (target: string, day: number | null, tab: Tab) =>
    run(
      "Time travel",
      async () => {
        await rpc("lab_shift", { p_trip: trip!.id, p_target: target, p_day: day });
        await refresh(trip!.id);
      },
      () => {
        selectTrip(trip!.id);
        goTab(tab);
      },
    );
  const bot = (action: string, label: string) =>
    run(label, async () => {
      if (action === "join") await lateBot();
      const r = await rpc("lab_as", { p_trip: trip!.id, p_action: action });
      await refresh(trip!.id);
      return r;
    });
  const r17 = (action: string, label: string, tab?: string) =>
    run(label, async () => {
      const r = await rpc("lab_r17", { p_trip: trip!.id, p_action: action });
      await refresh(trip!.id);
      if (tab) {
        selectTrip(trip!.id);
        goTab(tab as Tab);
      }
      return r;
    });
  const extra = (action: string, label: string, arg: string | null = null) =>
    run(label, async () => {
      if (["teen", "pending"].includes(action)) await lateBot();
      const r = await rpc("lab_extra", { p_trip: trip!.id, p_action: action, p_arg: arg });
      await refresh(trip!.id);
      if (action === "invite") {
        const url = `${window.location.origin}/join/${r}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* ignore */
        }
        return `${url} (copied)`;
      }
      return r;
    });
  const viewAs = (v: string) =>
    run(
      `Viewing as ${VIEW_LABELS[v] ?? "Captain"}`,
      async () => {
        const r = await rpc("lab_view", { p_trip: trip!.id, p_view: v });
        if (v === "invitee" && typeof r === "string") {
          savePendingCode(r);
          window.location.assign("/");
          return;
        }
        setLabView(v === "captain" ? null : { trip_id: trip!.id, view: v });
        await refresh(trip!.id);
      },
      () => {
        selectTrip(trip!.id);
        goTab("Home");
      },
    );
  const role = (r: string, label: string, tab: Tab = "Home") =>
    run(
      label,
      async () => {
        await rpc("lab_role", { p_trip: trip!.id, p_role: r });
        await refresh(trip!.id);
      },
      () => {
        selectTrip(trip!.id);
        goTab(tab);
      },
    );

  if (view === "checklist" && trip)
    return (
      <ScreenChecklist
        trip={trip}
        tripDays={tripDays}
        onBack={() => setView("lab")}
        shift={shift}
        open={(t) => {
          selectTrip(trip.id);
          goTab(t);
        }}
        openTools={() => {
          selectTrip(trip.id);
          openTools();
        }}
      />
    );

  return (
    <div className="pb-8">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> Back
      </Button>
      <h1 className="font-display text-3xl font-extrabold mt-2">Test Lab 🧪</h1>
      <p className="text-sm text-muted-foreground">
        Founder only. Sandbox trips use the real screens and rules, but stay hidden from everyone
        else and out of your stats.
      </p>
      {msg && (
        <p role="status" className="mt-3 text-sm font-bold text-green">
          {msg}
        </p>
      )}

      <EngineLab
        trips={trips}
        activeId={activeId}
        selectTrip={selectTrip}
        refresh={refresh}
        goPlay={() => goTab("Play")}
      />

      <section className="mt-5 bg-card rounded-[1.5rem] p-4 border border-border">
        <h2 className="font-display font-extrabold text-lg">Create sandbox trip (older rules)</h2>
        <Pick label="Group size" value={size} options={[4, 10, 15, 25]} onChange={setSize} />
        <Pick label="Trip length (days)" value={days} options={[3, 7, 21]} onChange={setDays} />
        <Pick
          label="Days until departure"
          value={win}
          options={[1, 10, 45, 84]}
          onChange={setWin}
        />
        <Button
          className="mt-4 w-full"
          disabled={busy}
          onClick={() =>
            run("Sandbox created", async () => {
              const r = await create({ data: { size, days, window: win } });
              await refresh(r.tripId);
              setSel(r.tripId);
            })
          }
        >
          {busy ? "Working…" : "Create sandbox 🧪"}
        </Button>
      </section>

      <section className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
        <h2 className="font-display font-extrabold text-lg">At Home sandbox</h2>
        <p className="text-xs text-muted-foreground mt-1">
          You + 3 bots, starting now so today's drops are live.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["thailand", "mexico", "japan"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={hPack === p ? "playful" : "outline"}
              onClick={() => setHPack(p)}
            >
              {p[0]!.toUpperCase() + p.slice(1)}
            </Button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(
            [
              ["weekend", "Weekend"],
              ["week", "1 week"],
              ["two_weeks", "2 weeks"],
            ] as const
          ).map(([k, l]) => (
            <Button
              key={k}
              size="sm"
              variant={hLen === k ? "playful" : "outline"}
              onClick={() => setHLen(k)}
            >
              {l}
            </Button>
          ))}
        </div>
        <Button
          className="mt-3 w-full"
          disabled={busy}
          onClick={() =>
            run("At Home sandbox created", async () => {
              const r = await createHome({ data: { pack: hPack, length: hLen } });
              await refresh(r.tripId);
              setSel(r.tripId);
            })
          }
        >
          Create At Home sandbox
        </Button>
      </section>

      {sandboxes.length > 0 && (
        <section className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
          <h2 className="font-display font-extrabold text-lg">Your sandboxes</h2>
          <div className="mt-2 space-y-2">
            {sandboxes.map((t) => (
              <Button
                key={t.id}
                variant={t.id === sel ? "subtle" : "outline"}
                className="w-full justify-between"
                onClick={() => setSel(t.id)}
              >
                <span className="truncate">{tripDisplayName(t.name)}</span>
                {t.id === sel && <Check />}
              </Button>
            ))}
          </div>
        </section>
      )}

      {trip && (
        <>
          <section className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
            <p className="text-xs text-muted-foreground">
              You're{" "}
              {trip.myRole === "captain"
                ? "Captain"
                : trip.myRole === "co_captain"
                  ? "Co-Captain"
                  : "a player"}{" "}
              · {trip.start_date} → {trip.end_date}
              {trip.ended_at ? " · ended" : ""}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  selectTrip(trip.id);
                  goTab("Home");
                }}
              >
                Open sandbox
              </Button>
              <Button variant="outline" onClick={() => setView("checklist")}>
                Screen checklist ✅
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Proofs waiting on this device: {failedProofs ?? "—"}. Open a live trip day to preview
              cleared and pending Bingo squares.
            </p>
            <h3 className="mt-4 font-display font-extrabold">Role switcher</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => role("captain", "You're Captain")}
              >
                👑 Captain
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => role("host", "You host the next night")}
              >
                🎤 Host
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => role("player", "You're a player")}
              >
                🙋 Player
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => role("late", "You rejoined late")}
              >
                ⏰ Late joiner
              </Button>
            </div>
          </section>

          <section className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
            <h3 className="font-display font-extrabold">👀 View the app as…</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Applies to every screen for this sandbox. A banner shows with one-tap exit.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["co_captain", "player", "waiting", "teen", "invitee"] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => viewAs(v)}
                >
                  {VIEW_LABELS[v]}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => viewAs("captain")}>
                👑 Captain (exit)
              </Button>
            </div>
            <h3 className="mt-4 font-display font-extrabold">⏩ Jump to…</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Sandbox only: schedules, countdowns and live-night windows are skipped for you.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {!((trip as { kind?: string }).kind === "at_home") && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => shift("kickoff", null, "Play")}
                  >
                    🎡 Warm-up
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => shift("kickoff", null, "Play")}
                  >
                    🃏 Card rounds
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => shift("takeoff", null, "Play")}
                  >
                    🗳️ Finale vote
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(
                        "QOTW reveal",
                        async () => {
                          await rpc("lab_shift", {
                            p_trip: trip.id,
                            p_target: "qotw",
                            p_day: null,
                          });
                          await rpc("lab_as", { p_trip: trip.id, p_action: "qotw" });
                          await refresh(trip.id);
                        },
                        () => {
                          selectTrip(trip.id);
                          goTab("Home");
                        },
                      )
                    }
                  >
                    ❓ QOTW reveal
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => shift("day", 1, "Play")}
                  >
                    🗺️ Trip day 1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => shift("takeoff", null, "Play")}
                  >
                    👑 Crowning
                  </Button>
                </>
              )}
              {(trip as { kind?: string }).kind === "at_home" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      selectTrip(trip.id);
                      goTab("Play");
                    }}
                  >
                    At Home day 1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      selectTrip(trip.id);
                      goTab("Play");
                    }}
                  >
                    🛂 Passport Night
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("wrapped", null, "Trip")}
              >
                🎬 Wrapped
              </Button>
            </div>
          </section>

          <section className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
            <h3 className="font-display font-extrabold">Bots 🤖</h3>
            {(trip as { kind?: string }).kind === "at_home" && (
              <Button
                size="sm"
                className="mt-2 w-full"
                disabled={busy}
                onClick={() =>
                  run("At Home bots", async () => {
                    const r = await rpc("lab_at_home_bots", { p_trip: trip.id });
                    await refresh(trip.id);
                    return r;
                  })
                }
              >
                Bots answer + vote on today's questions
              </Button>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["qotw", "Answer QOTW"],
                  ["vote", "Vote"],
                  ["tie", "Vote (force tie)"],
                  ["turn", "Take turn"],
                  ["swap_accept", "Accept host swap"],
                  ["swap_decline", "Decline host swap"],
                  ["skip", "Use skip pass"],
                  ["noshow", "No-show as host"],
                  ["paid", "Tap I paid"],
                  ["join", "Join late"],
                  ["feedback", "Submit feedback"],
                ] as const
              ).map(([a, l]) => (
                <Button
                  key={a}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => bot(a, l)}
                >
                  {l}
                </Button>
              ))}
            </div>
          </section>

          <section className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
            <h3 className="font-display font-extrabold">Vibes, ages & invites</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("vibe", "Family vibe", "family")}
              >
                👨‍👩‍👧 Family
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("vibe", "Chill vibe", "chill")}
              >
                😎 Chill
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("vibe", "Party vibe", "party")}
              >
                🎉 Party
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("teen", "Teen bot")}
              >
                🧒 Teen bot joins
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("noalcohol", "No-alcohol bot")}
              >
                🧃 No-alcohol bot
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("pending", "Waiting bot")}
              >
                ⏳ Bot waits for approval
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("tz", "Trip time zone", "Asia/Bangkok")}
              >
                🌏 Trip time zone: Bangkok
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("tz", "Trip time zone", "Pacific/Honolulu")}
              >
                🌺 Trip time zone: Honolulu
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("checkin", "Host check-in")}
              >
                ✅ Host checks in
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => extra("invite", "Invite link")}
              >
                💌 Personal invite link
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="col-span-2"
                disabled={busy}
                onClick={() => r17("co_captain_try", "Co-Captain limits")}
              >
                ⭐ Co-Captain limits test
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => r17("takeover_setup", "Takeover ready", "Trip")}
              >
                👑 Captain idle 15 days
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => r17("reclaim_setup", "Reclaim ready", "Trip")}
              >
                ↩️ Bot took over (reclaim)
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => r17("teams_pick", "Teams filled", "Trip")}
              >
                🚩 Bots pick teams
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void role("captain", "You're Captain", "Play")}
              >
                🎮 Game Day as Captain
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void role("host", "You host the next night", "Play")}
              >
                🎮 Game Day as host
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void role("player", "You're a player", "Play")}
              >
                🎮 Game Day as player
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="col-span-2"
                disabled={busy}
                onClick={() => previewLock?.()}
              >
                🔒 Preview private beta lock
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Approve waiting bots in Captain Tools › Invites & approval. To see the waiting screen
              yourself, use Late joiner after turning approval on there.
            </p>
          </section>

          <section className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
            <h3 className="font-display font-extrabold">Time travel ⏳</h3>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("before", null, "Play")}
              >
                Before kickoff
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("kickoff", null, "Play")}
              >
                Kickoff night
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("qotw", null, "Home")}
              >
                QOTW open ❓
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("buildup", null, "Play")}
              >
                Build-up night
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("takeoff", null, "Play")}
              >
                Final Call Night 👑
              </Button>
              {Array.from({ length: tripDays }, (_, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => shift("day", i + 1, "Play")}
                >
                  Trip day {i + 1}
                  {i === 0 || i === tripDays - 1 ? " ✈️" : ""}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("rest", 2, "Play")}
              >
                Rest day 😴
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("surprise", 2, "Play")}
              >
                Surprise mode 🎲
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("end", null, "Home")}
              >
                End trip
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("feedback", null, "Home")}
              >
                Feedback form
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => shift("wrapped", null, "Home")}
              >
                Trip Wrapped 🎬
              </Button>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                if (
                  await confirmInApp(
                    "Reset this sandbox? All its data and photos are rebuilt from scratch.",
                  )
                )
                  void run("Sandbox reset", async () => {
                    const r = await reset({ data: { tripId: trip.id } });
                    await refresh(r.tripId);
                    setSel(r.tripId);
                  });
              }}
            >
              ↺ Reset
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              disabled={busy}
              onClick={() => {
                setDeleteTarget({ id: trip.id, name: tripDisplayName(trip.name) });
                setDeleteTyped("");
              }}
            >
              🗑 Delete sandbox
            </Button>
          </section>
        </>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center">
          <div
            className="absolute inset-0 bg-foreground/60"
            onClick={() => {
              if (!busy) setDeleteTarget(null);
            }}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-delete-title"
            className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-border bg-card p-6 pb-[max(2rem,env(safe-area-inset-bottom))]"
          >
            <h2 id="lab-delete-title" className="font-display text-2xl font-extrabold">
              Delete sandbox
            </h2>
            <p className="mt-4 text-sm">
              This cancels {deleteTarget.name} for everyone — game nights, points and photos. Type
              DELETE to confirm.
            </p>
            <label className="mt-4 block text-sm font-bold">
              Confirmation
              <input
                className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3"
                autoComplete="off"
                value={deleteTyped}
                onChange={(e) => setDeleteTyped(e.target.value)}
              />
            </label>
            <Button
              variant="ghost"
              className="mt-4 w-full min-h-11 text-destructive"
              disabled={busy || deleteTyped.trim().toUpperCase() !== "DELETE"}
              onClick={() =>
                void run(
                  "Sandbox deleted",
                  async () => {
                    await del({ data: { tripId: deleteTarget.id } });
                    await refresh();
                  },
                  () => {
                    setDeleteTarget(null);
                    setDeleteTyped("");
                  },
                )
              }
            >
              Delete sandbox
            </Button>
            <Button
              variant="outline"
              className="mt-3 w-full min-h-11"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              Keep sandbox
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}

type Item = { id: string; label: string; go: () => void };
function ScreenChecklist({
  trip,
  tripDays,
  onBack,
  shift,
  open,
  openTools,
}: {
  trip: TripWithRole;
  tripDays: number;
  onBack: () => void;
  shift: (t: string, d: number | null, tab: Tab) => void;
  open: (t: Tab) => void;
  openTools: () => void;
}) {
  const key = `tripjunkie-lab-checklist`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = (id: string) => {
    const next = done.includes(id) ? done.filter((x) => x !== id) : [...done, id];
    setDone(next);
    safeSetItem(key, JSON.stringify(next));
  };
  const groups: [string, Item[]][] = [
    [
      "Tabs",
      (["Home", "Play", "Trip", "Me"] as Tab[]).map((t) => ({
        id: `tab-${t}`,
        label: `${t} tab`,
        go: () => open(t),
      })),
    ],
    [
      "Access & vibes",
      [
        { id: "invites", label: "Invites & approval (Captain Tools)", go: openTools },
        { id: "vibe", label: "Trip vibe picker + header badge", go: openTools },
        { id: "noalc", label: "No alcohol switch (Edit my player card)", go: () => open("Me") },
      ],
    ],
    [
      "Captain",
      [
        {
          id: "tools",
          label: "Captain Tools (checklist, unlock, costs, plan picker, teams, hosts)",
          go: openTools,
        },
        { id: "unlock", label: "Unlock screen + badges", go: openTools },
        { id: "costs", label: "Trip costs (Captain + player view)", go: () => open("Trip") },
        { id: "squad", label: "Player cards + teams", go: () => open("Trip") },
      ],
    ],
    [
      "Pre-trip season",
      [
        {
          id: "before",
          label: "Before kickoff · countdown + plan",
          go: () => shift("before", null, "Play"),
        },
        {
          id: "kickoff",
          label: "Kickoff night · warm-up spin, cards, finale",
          go: () => shift("kickoff", null, "Play"),
        },
        {
          id: "qotw",
          label: "Question of the Week open · answer card",
          go: () => shift("qotw", null, "Home"),
        },
        {
          id: "buildup",
          label: "Build-up night · QOTW read, live votes, stamps + leaderboard",
          go: () => shift("buildup", null, "Play"),
        },
        {
          id: "score100",
          label:
            "Score /100 · compare a 10-day-window sandbox (≈1–3 nights) with an 84-day one (12 nights): same attendance = same score",
          go: () => open("Trip"),
        },
        {
          id: "captainpass",
          label:
            "Captain pass on a hosted night (2 if ≤8 nights, 3 if 9–12) + “How scoring works” sheet",
          go: () => open("Play"),
        },
        {
          id: "takeoff",
          label: "Final Call Night · crowning",
          go: () => shift("takeoff", null, "Play"),
        },
        {
          id: "checkin",
          label: "Host check-in · tap ✅ Host checks in, then no-show: no -5",
          go: () => open("Play"),
        },
        {
          id: "pending",
          label:
            "Pending member · ⏳ waiting bot is left out of turns, stamps, costs and price until approved",
          go: () => open("Trip"),
        },
      ],
    ],
    [
      "Trip days",
      [
        ...Array.from({ length: tripDays }, (_, i) => ({
          id: `day-${i + 1}`,
          label: `Trip day ${i + 1}${i === 0 || i === tripDays - 1 ? " · travel day" : " · bingo + challenges"}`,
          go: () => shift("day", i + 1, "Play"),
        })),
        {
          id: "bingo-proof",
          label: "Bingo photo proof · Snap it, cleared and Proof pending (try offline)",
          go: () => shift("day", 2, "Play"),
        },
        { id: "rest", label: "Rest day · empty state", go: () => shift("rest", 2, "Play") },
        { id: "surprise", label: "Surprise mode", go: () => shift("surprise", 2, "Play") },
        {
          id: "tz",
          label: "Trip time zone · 🌏/🌺 buttons change which day is today",
          go: () => shift("day", 2, "Play"),
        },
      ],
    ],
    [
      "After the trip",
      [
        { id: "end", label: "End trip", go: () => shift("end", null, "Home") },
        { id: "feedback", label: "Feedback form", go: () => shift("feedback", null, "Home") },
        { id: "wrapped", label: "Trip Wrapped", go: () => shift("wrapped", null, "Home") },
      ],
    ],
    [
      "Passport & games",
      [
        {
          id: "passport",
          label: "Passport inner pages · sample stamp and corkboard",
          go: () => open("Home"),
        },
        { id: "wheel", label: "Live spinning wheel", go: () => open("Play") },
        { id: "privacy", label: "Leaderboard privacy · Captain Tools", go: () => openTools() },
        { id: "passes", label: "Boarding… passes · Home", go: () => open("Home") },
      ],
    ],
    [
      "Me",
      [
        { id: "tour", label: "How it works tour", go: () => open("Me") },
        { id: "help", label: "Help, About, Report a bug", go: () => open("Me") },
      ],
    ],
  ];
  return (
    <div className="pb-8">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft /> Test Lab
      </Button>
      <h1 className="font-display text-3xl font-extrabold mt-2">Screen checklist ✅</h1>
      <p className="text-sm text-muted-foreground">
        {tripDisplayName(trip.name)} · tap a row to open it, tick it when it looks right.
      </p>
      {groups.map(([title, items]) => (
        <section key={title} className="mt-4 bg-card rounded-[1.5rem] p-4 border border-border">
          <h2 className="font-display font-extrabold">{title}</h2>
          <div className="mt-2 space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex gap-2 items-center">
                <Button
                  size="icon"
                  variant={done.includes(it.id) ? "green" : "outline"}
                  aria-label={`Mark ${it.label} checked`}
                  aria-pressed={done.includes(it.id)}
                  onClick={() => toggle(it.id)}
                >
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 justify-start h-auto min-h-11 text-left whitespace-normal"
                  onClick={it.go}
                >
                  {it.label}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
