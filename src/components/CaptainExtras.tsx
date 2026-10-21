import { confirmInApp } from "@/lib/confirm";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState, type ReactNode } from "react";
import { Copy, Pencil, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Member, TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Bottom sheet used by inline edit pencils and the call panel. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-card rounded-t-3xl w-full max-w-lg p-6 pb-10 max-h-[88dvh] overflow-y-auto"
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4"
          onClick={onClose}
          aria-label="Close"
        >
          <X />
        </Button>
        <h2 className="font-display text-2xl font-extrabold pr-10">{title}</h2>
        {children}
      </section>
    </div>
  );
}

/** Small pencil shown to the Captain next to editable Trip-tab items. */
export function EditPencil({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 text-muted-foreground"
      aria-label={`Edit ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Pencil size={16} />
    </Button>
  );
}

/** Call panel: link, copy, 3 join steps, back to game. No in-app camera. */
export function CallPanel({
  link,
  backup,
  onClose,
}: {
  link: string;
  backup?: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  const steps = [
    "iPhone: tap Open call — FaceTime opens the link.",
    "Android or computer: it opens in Chrome — type your name and tap Join.",
    "Allow camera + mic, then come back here with Back to game.",
  ];
  return (
    <Sheet title="Game night call 📞" onClose={onClose}>
      <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-3 text-xs break-all">
        {link}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button asChild variant="playful">
          <a href={link} target="_blank" rel="noopener noreferrer">
            <Video /> Open call
          </a>
        </Button>
        <Button variant="outline" onClick={() => void copy()}>
          <Copy /> {copied ? "Copied ✓" : "Copy link"}
        </Button>
      </div>
      {backup && (
        <a
          href={backup}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 text-sm font-bold text-blue underline underline-offset-4"
        >
          Backup link
        </a>
      )}
      <ol className="mt-5 space-y-2">
        {steps.map((s, i) => (
          <li
            key={s}
            className="flex gap-3 items-start bg-card border border-border rounded-2xl p-3"
          >
            <span className="grid place-items-center shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground font-extrabold text-sm">
              {i + 1}
            </span>
            <span className="text-sm font-bold pt-1">{s}</span>
          </li>
        ))}
      </ol>
      <Button variant="green" className="w-full mt-5" onClick={onClose}>
        Back to game
      </Button>
    </Sheet>
  );
}

type TeamRow = { id: string; name: string; color: string; capacity: number | null };
type Cap = { team_id: string; capacity: number; taken: number };

/** Team cards: players pick (spots left, full disabled); Captain chooses mode + capacity. */
export function TeamPicker({
  trip,
  userId,
  members,
  cards,
  onEdit,
}: {
  trip: TripWithRole;
  userId: string;
  members: Member[];
  cards: PlayerWithAvatar[];
  onEdit?: (() => void) | undefined;
}) {
  const [teams, setTeams] = useState<TeamRow[]>([]),
    [caps, setCaps] = useState<Cap[]>([]),
    [roster, setRoster] = useState<{ user_id: string; team_id: string }[]>([]);
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false),
    [started, setStarted] = useState(false);
  const mode = (trip as TripWithRole & { team_mode?: string }).team_mode ?? "assign";
  const captain = trip.myRole === "captain";
  const leader = captain || trip.myRole === "co_captain";
  async function load() {
    const [t, c, r, n] = await Promise.all([
      db
        .from("trip_teams")
        .select("id,name,color,capacity")
        .eq("trip_id", trip.id)
        .order("created_at"),
      db.rpc("team_capacities", { p_trip: trip.id }),
      db.from("trip_team_members").select("user_id,team_id").eq("trip_id", trip.id),
      db
        .from("game_nights")
        .select("starts_at")
        .eq("trip_id", trip.id)
        .eq("skipped", false)
        .lte("starts_at", new Date().toISOString())
        .limit(1),
    ]);
    setTeams(t.data ?? []);
    setCaps(c.data ?? []);
    setRoster(r.data ?? []);
    setStarted((n.data ?? []).length > 0);
  }
  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`teams-${trip.id}-${Math.random()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_team_members",
          filter: `trip_id=eq.${trip.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [trip.id]);
  const name = (id: string) =>
    cards.find((c) => c.user_id === id)?.game_name ||
    members.find((m) => m.user_id === id)?.display_name ||
    "Player";
  const mine = roster.find((r) => r.user_id === userId)?.team_id;
  async function pick(id: string) {
    setBusy(true);
    setMsg("");
    const { error } = await db.rpc("pick_team", { p_trip: trip.id, p_team: id });
    setBusy(false);
    if (error) setMsg(friendlyError(error));
    await load();
  }
  async function setMode(m: string, capOverrides: Record<string, number | ""> = {}) {
    setBusy(true);
    setMsg("");
    const { error } = await db.rpc("set_team_mode", {
      p_trip: trip.id,
      p_mode: m,
      p_caps: capOverrides,
    });
    setBusy(false);
    setMsg(error ? friendlyError(error) : "Saved ✓");
    await load();
  }
  const canPick = mode === "pick" && (!started || leader);
  return (
    <div className="mt-2">
      {teams.length === 0 ? (
        <div className="app-card mt-2">
          <p className="font-bold">No teams yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length >= 13
              ? "13+ players play in teams."
              : "Teams are optional for groups up to 12."}
          </p>
          {captain && onEdit && (
            <Button variant="playful" size="sm" className="mt-3" onClick={onEdit}>
              Set up teams
            </Button>
          )}
        </div>
      ) : (
        <>
          {captain && (
            <div className="flex gap-2 mt-2">
              {(["assign", "pick"] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? "playful" : "outline"}
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void setMode(m)}
                >
                  {m === "assign" ? "I'll assign" : "Players pick"}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            {mode === "pick"
              ? started
                ? "Teams are locked now that game nights have started — ask your Captain to move you."
                : "Pick a team. You can switch until the first game night starts."
              : "Your Captain assigns teams."}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {teams.map((t) => {
              const c = caps.find((x) => x.team_id === t.id);
              const left = c ? c.capacity - c.taken : 0;
              const full = left <= 0 && mine !== t.id;
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border-2 p-3 ${mine === t.id ? "border-primary" : "border-border"} bg-card`}
                >
                  <p className="font-display font-extrabold truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {mine === t.id
                      ? "Your team"
                      : full
                        ? "Full"
                        : `${left} spot${left === 1 ? "" : "s"} left`}
                  </p>
                  <p className="text-[11px] mt-1 line-clamp-2">
                    {roster
                      .filter((r) => r.team_id === t.id)
                      .map((r) => name(r.user_id))
                      .join(", ") || "Nobody yet"}
                  </p>
                  {captain && (
                    <label className="block text-[11px] font-bold mt-2">
                      Capacity
                      <input
                        type="number"
                        min={1}
                        max={30}
                        defaultValue={c?.capacity ?? ""}
                        className="ml-1 w-14 h-8 rounded-lg border border-border bg-card px-1"
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (String(c?.capacity ?? "") !== v)
                            void setMode(mode, { [t.id]: v === "" ? "" : Number(v) });
                        }}
                      />
                    </label>
                  )}
                  {canPick && mine !== t.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2"
                      disabled={busy || full}
                      onClick={() => void pick(t.id)}
                    >
                      {full ? "Full" : "Join"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
    </div>
  );
}

/** Takeover banner: Co-Captain can take over after 14 idle days; old Captain can reclaim for 7 days. */
export function CaptainTakeover({
  trip,
  onChanged,
}: {
  trip: TripWithRole;
  onChanged: () => void | Promise<void>;
}) {
  const [s, setS] = useState<{
      can_take_over: boolean;
      can_reclaim: boolean;
      reclaim_until: string | null;
    } | null>(null),
    [msg, setMsg] = useState("");
  useEffect(() => {
    void db
      .rpc("captain_status", { p_trip: trip.id })
      .then(({ data }: { data: (typeof s)[] | null }) => setS(data?.[0] ?? null));
  }, [trip.id, trip.myRole]);
  async function act(fn: string, confirmText: string) {
    if (!(await confirmInApp(confirmText))) return;
    const { error } = await db.rpc(fn, { p_trip: trip.id });
    setMsg(error ? friendlyError(error) : "Done ✓");
    if (!error) await onChanged();
  }
  if (!s || (!s.can_take_over && !s.can_reclaim)) return null;
  return (
    <section className="app-card mt-4 bg-orange-soft">
      {s.can_take_over ? (
        <>
          <p className="font-display font-extrabold">Your Captain has been away 14+ days</p>
          <p className="text-sm text-ink-soft mt-1">
            You can take over so the trip keeps moving. They can reclaim it within 7 days.
          </p>
          <Button
            variant="playful"
            className="w-full mt-3"
            onClick={() => void act("take_over_captain", "Take over as Captain?")}
          >
            👑 Take over as Captain
          </Button>
        </>
      ) : (
        <>
          <p className="font-display font-extrabold">Your Co-Captain took over</p>
          <p className="text-sm text-ink-soft mt-1">
            You can reclaim Captain
            {s.reclaim_until
              ? ` until ${new Date(s.reclaim_until).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : ""}
            .
          </p>
          <Button
            variant="playful"
            className="w-full mt-3"
            onClick={() => void act("reclaim_captain", "Reclaim Captain?")}
          >
            👑 Reclaim Captain
          </Button>
        </>
      )}
      {msg && (
        <p role="status" className="text-sm mt-2">
          {msg}
        </p>
      )}
    </section>
  );
}

/** Captain picks/replaces the Co-Captain, or steps down to someone. */
export function CoCaptainPicker({
  trip,
  members,
  cards,
  onChanged,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  onChanged: () => void | Promise<void>;
}) {
  const [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false),
    [to, setTo] = useState("");
  if (trip.myRole !== "captain") return null;
  const name = (id: string) =>
    cards.find((c) => c.user_id === id)?.game_name ||
    members.find((m) => m.user_id === id)?.display_name ||
    "Player";
  const co = members.find((m) => m.role === "co_captain");
  const others = members.filter((m) => m.role !== "captain");
  async function rpc(fn: string, args: object, done: string) {
    setBusy(true);
    setMsg("");
    const { error } = await db.rpc(fn, args);
    setBusy(false);
    setMsg(error ? friendlyError(error) : done);
    if (!error) await onChanged();
  }
  async function promote(v: string) {
    setBusy(true);
    setMsg("");
    let { error } = await db.rpc("manage_trip_member", {
      p_trip: trip.id,
      p_user: v,
      p_action: "promote",
    });
    if (error?.message.includes("UNDER_21")) {
      if (await confirmInApp(`Make ${name(v)} Co-Captain? They're under 21.`))
        ({ error } = await db.rpc("manage_trip_member", {
          p_trip: trip.id,
          p_user: v,
          p_action: "promote_under21",
        }));
      else {
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setMsg(error ? friendlyError(error) : `${name(v)} is Co-Captain ⭐`);
    if (!error) await onChanged();
  }
  return (
    <div className="mt-3 space-y-4">
      <div>
        <p className="text-sm font-bold">
          Co-Captain ⭐{" "}
          <span className="font-normal text-muted-foreground">— runs game nights with you</span>
        </p>
        <select
          aria-label="Pick Co-Captain"
          className="w-full mt-2 h-12 rounded-2xl border-2 border-border bg-card px-3"
          value={co?.user_id ?? ""}
          disabled={busy}
          onChange={(e) => {
            const v = e.target.value;
            if (!v && co)
              void rpc(
                "manage_trip_member",
                { p_trip: trip.id, p_user: co.user_id, p_action: "demote" },
                "Co-Captain removed",
              );
            else if (v) void promote(v);
          }}
        >
          <option value="">No Co-Captain</option>
          {others.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {name(m.user_id)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <p className="text-sm font-bold">Step down</p>
        <p className="text-xs text-muted-foreground">
          Pick who takes over as Captain. You become a player.
        </p>
        <div className="flex gap-2 mt-2">
          <select
            aria-label="New Captain"
            className="flex-1 h-12 rounded-2xl border-2 border-border bg-card px-3"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          >
            <option value="">Choose someone</option>
            {others.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {name(m.user_id)}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!to || busy}
            onClick={async () => {
              if (await confirmInApp(`Make ${name(to)} Captain and step down?`))
                void rpc("step_down", { p_trip: trip.id, p_to: to }, "You stepped down");
            }}
          >
            Step down
          </Button>
        </div>
      </div>
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}
