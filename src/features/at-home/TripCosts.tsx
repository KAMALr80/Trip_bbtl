import { confirmInApp } from "@/lib/confirm";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import { tripToday } from "@/lib/itinerary";
import { t as translate } from "@/i18n";
import { playerName } from "@/lib/player-name";

type Item = Tables<"cost_items"> & { is_estimate?: boolean; custom_category?: string | null };
type Share = Tables<"cost_shares">;
type Note = { id: string; message: string; created_at: string };
type Pot = {
  total: number;
  collected: number;
  has_estimates: boolean;
  pay_note: string | null;
  categories: { category: string; total: number; estimate: boolean }[];
};
const CATS: Record<string, string> = {
  flight: "✈️ Flight",
  stay: "🏨 Hotel/Stay",
  transport: "🚐 Transportation",
  excursion: "🎟️ Excursion",
  food: "🍜 Food",
  other: "🧾 Other",
};
const catLabel = (i: Pick<Item, "category" | "custom_category">) =>
  i.category === "other" && i.custom_category
    ? `🧾 ${i.custom_category}`
    : (CATS[i.category] ?? "🧾 Other");
const field = "mt-1 w-full h-12 rounded-xl border border-border bg-card px-3 text-base";
const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
const toCents = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
const friendlyDue = (d: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T12:00:00Z`));
const friendly = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? "";
  return m && !/permission|violates|syntax|function/i.test(m)
    ? m
    : "Something went wrong. Try again.";
};
const rpc = (name: string, args: Record<string, unknown>) =>
  supabase.rpc(name as never, args as never);
const isLeader = (t: TripWithRole) => t.myRole === "captain" || t.myRole === "co_captain";
const NO_HOLD = "Pay your Captain directly. TripJunkies never holds money.";
const emptyPot = (trip: TripWithRole) =>
  isLeader(trip) ? "Add shared costs here." : "Your Captain will add shared costs here.";

export function costStatus(s: Pick<Share, "share_cents" | "paid_cents">) {
  if (s.paid_cents >= s.share_cents) return { label: "Paid", cls: "bg-green-soft text-green" };
  if (s.paid_cents > 0) return { label: "Partial", cls: "bg-orange-soft text-ink" };
  return { label: "Owed", cls: "bg-orange-soft text-ink" };
}

function useCosts(tripId: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const [i, s] = await Promise.all([
      supabase
        .from("cost_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("due_date", { nullsFirst: false })
        .order("created_at"),
      supabase.from("cost_shares").select("*").eq("trip_id", tripId),
    ]);
    if (i.error || s.error) {
      setError("Could not load trip costs. Try again later.");
      return;
    }
    setItems((i.data ?? []) as Item[]);
    setShares(s.data ?? []);
    setError("");
  }, [tripId]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(t);
  }, [load]);
  return { items, shares, error, load };
}

function usePot(tripId: string, version = 0) {
  const [pot, setPot] = useState<Pot | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const r = await rpc("trip_pot", { p_trip: tripId });
      if (alive && !r.error) setPot(r.data as Pot | null);
    };
    void load();
    const t = window.setInterval(() => void load(), 30000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [tripId, version]);
  return pot;
}

/** Group pot: totals only — never names, shares or individual amounts. */
export function GroupPot({
  trip,
  version = 0,
  compact = false,
}: {
  trip: TripWithRole;
  version?: number;
  compact?: boolean;
}) {
  const pot = usePot(trip.id, version);
  if (!pot || !pot.total)
    return (
      <div className="app-card mt-3">
        <p className="eyebrow text-primary">TRIP POT 💰</p>
        <p className="text-sm text-muted-foreground mt-2">{emptyPot(trip)}</p>
        <p className="mt-2 text-xs text-muted-foreground">{NO_HOLD}</p>
      </div>
    );
  const remaining = Math.max(pot.total - pot.collected, 0);
  const pct = Math.min(100, Math.round((remaining / pot.total) * 100));
  return (
    <div className="app-card mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow text-primary">TRIP POT 💰</p>
        {pot.has_estimates && (
          <span className="text-xs text-muted-foreground">includes estimates</span>
        )}
      </div>
      <p className="font-display text-2xl font-extrabold mt-1">
        {money(remaining)}{" "}
        <span className="text-sm font-bold text-muted-foreground">left to collect</span>
      </p>
      <div
        className="mt-3 h-3 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-label="Remaining to collect"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div>
          <p className="text-muted-foreground">Total</p>
          <p className="font-bold">{money(pot.total)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Collected</p>
          <p className="font-bold">{money(pot.collected)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Remaining</p>
          <p className="font-bold">{money(remaining)}</p>
        </div>
      </div>
      {!compact && pot.categories.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {pot.categories.map((c) => (
            <li key={c.category} className="flex justify-between gap-2">
              <span>
                {CATS[c.category] ?? c.category}
                {c.estimate ? " · est." : ""}
              </span>
              <span className="font-bold">{money(c.total)}</span>
            </li>
          ))}
        </ul>
      )}
      {pot.pay_note && (
        <p className="mt-3 text-sm">
          <b>How to pay the Captain:</b> {pot.pay_note}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{NO_HOLD}</p>
    </div>
  );
}

/** Private notes, e.g. when a leader undoes a payment. Only the owner can read them. */
function MyCostNotes({
  trip,
  userId,
  onChange,
}: {
  trip: TripWithRole;
  userId: string;
  onChange?: () => void;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const load = useCallback(async () => {
    const r = await supabase
      .from("cost_notes" as never)
      .select("id,message,created_at")
      .eq("trip_id", trip.id)
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false });
    if (!r.error) setNotes((r.data ?? []) as Note[]);
  }, [trip.id, userId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!notes.length) return null;
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <div
          key={n.id}
          role="status"
          className="rounded-2xl border border-border bg-orange-soft p-3 text-sm"
        >
          <p>⚠️ {n.message}</p>
          <Button
            variant="ghost"
            className="mt-1 -ml-3 h-10"
            onClick={async () => {
              await rpc("dismiss_cost_note", { p_note: n.id });
              await load();
              onChange?.();
            }}
          >
            Got it
          </Button>
        </div>
      ))}
    </div>
  );
}

/** Gentle due-date reminder for the signed-in player's unpaid shares (due within 7 days or overdue). */
export function CostReminder({ trip, userId }: { trip: TripWithRole; userId: string }) {
  const { items, shares } = useCosts(trip.id);
  const [hidden, setHidden] = useState(false);
  const today = tripToday(trip.home_timezone);
  const soon = new Date(`${today}T12:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 7);
  const limit = soon.toISOString().slice(0, 10);
  const due = items.filter(
    (i) =>
      i.due_date &&
      i.due_date <= limit &&
      shares.some(
        (s) =>
          s.item_id === i.id &&
          s.user_id === userId &&
          s.paid_cents < s.share_cents &&
          !s.reported_cents,
      ),
  );
  const first = due[0];
  if (hidden || !first) return null;
  return (
    <div role="status" className="mt-4 rounded-2xl border border-border bg-orange-soft p-4 text-sm">
      <p className="font-bold">💸 Friendly reminder</p>
      <p className="mt-1">
        {due.length === 1
          ? `${first.title} ${first.due_date! < today ? "was due" : "is due"} ${friendlyDue(first.due_date!)}.`
          : `${due.length} trip costs are due soon, starting ${friendlyDue(first.due_date!)}.`}{" "}
        Open Trip pot below to tap “I've paid”.
      </p>
      <Button variant="ghost" className="mt-1 -ml-3 h-10" onClick={() => setHidden(true)}>
        Later
      </Button>
    </div>
  );
}

/** Player view: group pot + private "My share". Never shows other players' balances. */
export function TripCostsPlayer({ trip, userId }: { trip: TripWithRole; userId: string }) {
  const { items, shares, error, load } = useCosts(trip.id);
  const [paying, setPaying] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [v, setV] = useState(0);
  const pot = usePot(trip.id, v);
  const mine = (id: string) => shares.find((s) => s.item_id === id && s.user_id === userId);
  const myTotal = items.reduce((a, i) => a + (mine(i.id)?.share_cents ?? 0), 0);
  const myPaid = items.reduce(
    (a, i) => a + Math.min(mine(i.id)?.paid_cents ?? 0, mine(i.id)?.share_cents ?? 0),
    0,
  );
  const myEst = items.some((i) => i.is_estimate && mine(i.id));
  async function report(e: FormEvent, id: string) {
    e.preventDefault();
    const cents = amount.trim() ? toCents(amount) : null;
    if (amount.trim() && !cents) {
      setMsg("Enter an amount like 120 or 120.50.");
      return;
    }
    setBusy(true);
    const r = await supabase.rpc("report_cost_payment", {
      p_item: id,
      p_amount_cents: cents as number,
      p_note: note,
    });
    setBusy(false);
    if (r.error) {
      setMsg(friendly(r.error));
      return;
    }
    setPaying(null);
    setAmount("");
    setNote("");
    setMsg("Sent! Waiting for your Captain to confirm.");
    await load();
    setV((x) => x + 1);
  }
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive mt-3">
        {error}
      </p>
    );
  if (!items.length)
    return (
      <div className="mt-3">
        <MyCostNotes trip={trip} userId={userId} />
        <p className="text-sm text-muted-foreground mt-2">{emptyPot(trip)}</p>
        <p className="mt-2 text-xs text-muted-foreground">{NO_HOLD}</p>
      </div>
    );
  return (
    <div className="mt-3 space-y-3">
      <MyCostNotes trip={trip} userId={userId} onChange={() => void load()} />
      <GroupPot trip={trip} version={v} />
      <div className="app-card">
        <div className="flex items-baseline justify-between gap-2">
          <p className="eyebrow text-primary">MY SHARE 🔒</p>
          {myEst && <span className="text-xs text-muted-foreground">includes estimates</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Only you and your Captain/Co-Captain can see this.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-muted-foreground">Your share</p>
            <p className="font-bold">{money(myTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Confirmed</p>
            <p className="font-bold">{money(myPaid)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Remaining</p>
            <p className="font-bold">{money(Math.max(myTotal - myPaid, 0))}</p>
          </div>
        </div>
        {pot?.pay_note && (
          <p className="mt-3 text-sm">
            <b>How to pay the Captain:</b> {pot.pay_note}
          </p>
        )}
      </div>
      {items.map((i) => {
        const s = mine(i.id);
        const st = s ? costStatus(s) : null;
        return (
          <div key={i.id} className="app-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  {catLabel(i)} · {i.is_estimate ? "Estimate" : "Confirmed"}
                </p>
                <p className="font-bold">{i.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {i.split === "even" ? "Split evenly" : "Custom split"}
                  {i.due_date ? ` · due ${friendlyDue(i.due_date)}` : ""}
                </p>
              </div>
              {st && (
                <span
                  className={`neon-chip shrink-0 rounded-full px-3 py-1 text-xs font-bold ${st.cls}`}
                >
                  {st.label}
                </span>
              )}
            </div>
            {s ? (
              <>
                <p className="mt-2 text-sm">
                  Your share <b>{money(s.share_cents)}</b>
                  {s.paid_cents > 0 && s.paid_cents < s.share_cents
                    ? ` · confirmed ${money(s.paid_cents)}`
                    : ""}
                </p>
                {s.reported_cents ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    ⏳ Waiting for confirmation — you reported {money(s.reported_cents)}
                    {s.report_note ? ` (${s.report_note})` : ""}.
                  </p>
                ) : null}
                {s.paid_cents < s.share_cents &&
                  (paying === i.id ? (
                    <form className="mt-3 space-y-2" onSubmit={(e) => void report(e, i.id)}>
                      <label className="block text-sm font-bold">
                        Amount{" "}
                        <span className="font-normal text-muted-foreground">
                          (blank means the rest)
                        </span>
                        <input
                          className={field}
                          inputMode="decimal"
                          maxLength={12}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder={((s.share_cents - s.paid_cents) / 100).toFixed(2)}
                        />
                      </label>
                      <label className="block text-sm font-bold">
                        How you paid{" "}
                        <span className="font-normal text-muted-foreground">(optional)</span>
                        <input
                          className={field}
                          maxLength={120}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Zelle, Cash App, Venmo, cash…"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button type="submit" variant="playful" className="flex-1" disabled={busy}>
                          Send
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setPaying(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      variant="outline"
                      className="mt-3 w-full"
                      onClick={() => {
                        setPaying(i.id);
                        setMsg("");
                      }}
                    >
                      💸 I've paid
                    </Button>
                  ))}
              </>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">You're not part of this split.</p>
            )}
          </div>
        );
      })}
      {msg && (
        <p role="status" className="text-sm text-green">
          {msg}
        </p>
      )}
    </div>
  );
}

/** Small read-only pot card for the Game Day page. */
export function PotCard({ trip }: { trip: TripWithRole }) {
  return <GroupPot trip={trip} compact />;
}

function PayNoteEditor({ trip, onSaved }: { trip: TripWithRole; onSaved: () => void }) {
  const [note, setNote] = useState((trip as { pay_note?: string | null }).pay_note ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="app-card space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await rpc("set_pay_note", { p_trip: trip.id, p_note: note });
        setBusy(false);
        setMsg(r.error ? friendly(r.error) : "Saved.");
        if (!r.error) onSaved();
      }}
    >
      <label className="block text-sm font-bold">
        How to pay the Captain <span className="font-normal text-muted-foreground">(optional)</span>
        <input
          className={field}
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Zelle: name@email · Cash App: $handle"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Shown on the pot and everyone's My share. Handles only — never card or bank numbers.
      </p>
      <Button type="submit" variant="outline" disabled={busy}>
        Save
      </Button>
      {msg && <span className="ml-2 text-sm text-green">{msg}</span>}
    </form>
  );
}

/** Leader view (Captain or Co-Captain): add/edit items, confirm, adjust or undo payments. */
export function TripCostsCaptain({
  trip,
  members,
  cards,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
}) {
  const { items, shares, error, load } = useCosts(trip.id);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState(0);
  const name = (id: string) => playerName(cards, members, id, translate("player.former"));
  const after = async (r: { error: unknown }, ok: string) => {
    setMsg(r.error ? friendly(r.error) : ok);
    await load();
    setV((x) => x + 1);
  };
  async function setPaid(item: string, user: string, cents: number) {
    setBusy(true);
    const r = await supabase.rpc("confirm_cost_payment", {
      p_item: item,
      p_user: user,
      p_paid_cents: cents,
    });
    setBusy(false);
    await after(r, "Saved.");
  }
  async function undo(item: string, s: Share) {
    const v = window.prompt(
      `Undo how much of ${name(s.user_id)}'s confirmed ${money(s.paid_cents)}?`,
      (s.paid_cents / 100).toFixed(2),
    );
    if (v === null) return;
    const cents = toCents(v);
    if (!cents) {
      setMsg("Enter an amount like 50 or 50.25.");
      return;
    }
    const reason = window.prompt("Reason (e.g. card declined, payment reversed)");
    if (!reason?.trim()) {
      setMsg("A short reason is needed to undo a payment.");
      return;
    }
    setBusy(true);
    const r = await rpc("undo_cost_payment", {
      p_item: item,
      p_user: s.user_id,
      p_amount_cents: cents,
      p_reason: reason,
    });
    setBusy(false);
    await after(r, `Undone. ${name(s.user_id)} gets a private note.`);
  }
  async function remove(id: string) {
    if (!(await confirmInApp("Delete this cost and everyone's balance for it?"))) return;
    const r = await supabase.rpc("delete_cost_item", { p_item: id });
    await after(r, "Deleted.");
  }
  if (!isLeader(trip))
    return (
      <p className="text-sm text-muted-foreground mt-3">
        Only the Captain or Co-Captain manages trip costs.
      </p>
    );
  if (editing)
    return (
      <CostEditor
        trip={trip}
        members={members}
        name={name}
        item={editing === "new" ? null : editing}
        shares={editing === "new" ? [] : shares.filter((s) => s.item_id === editing.id)}
        onDone={async () => {
          setEditing(null);
          await load();
          setV((x) => x + 1);
        }}
      />
    );
  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Tracking only. Check your own Zelle/Cash App/bank before confirming. Never enter card or
        bank details here. Every change is logged.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {items.length ? (
        <GroupPot trip={trip} version={v} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{emptyPot(trip)}</p>
          <p className="text-xs text-muted-foreground">{NO_HOLD}</p>
        </>
      )}
      <PayNoteEditor trip={trip} onSaved={() => setV((x) => x + 1)} />
      <Button variant="playful" className="w-full" onClick={() => setEditing("new")}>
        + Add a cost
      </Button>
      {items.map((i) => {
        const rows = shares
          .filter((s) => s.item_id === i.id)
          .sort(
            (a, b) =>
              Number(!!b.reported_cents) - Number(!!a.reported_cents) ||
              name(a.user_id).localeCompare(name(b.user_id)),
          );
        const paid = rows.reduce((a, s) => a + Math.min(s.paid_cents, s.share_cents), 0);
        return (
          <div key={i.id} className="app-card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  {catLabel(i)} · {i.is_estimate ? "Estimate" : "Confirmed"}
                </p>
                <p className="font-bold">{i.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {money(paid)} of {money(i.total_cents)} collected
                  {i.due_date ? ` · due ${friendlyDue(i.due_date)}` : ""}
                </p>
                {i.needs_review && (
                  <p className="mt-1 text-xs font-bold text-primary">
                    👀 Someone new joined — review this custom split (tap Edit, then Save).
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" className="h-10 px-2" onClick={() => setEditing(i)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  className="h-10 px-2 text-destructive"
                  onClick={() => void remove(i.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {rows.map((s) => {
                const st = costStatus(s);
                return (
                  <div
                    key={s.user_id}
                    className="rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold truncate">{name(s.user_id)}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Share {money(s.share_cents)} · confirmed {money(s.paid_cents)}
                    </p>
                    {s.reported_cents ? (
                      <p className="text-xs mt-1">
                        ⏳ Says they paid {money(s.reported_cents)}
                        {s.report_note ? ` · ${s.report_note}` : ""}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.reported_cents ? (
                        <Button
                          variant="playful"
                          className="h-10"
                          disabled={busy}
                          onClick={() =>
                            void setPaid(
                              i.id,
                              s.user_id,
                              Math.min(s.paid_cents + s.reported_cents!, s.share_cents * 10),
                            )
                          }
                        >
                          Confirm {money(s.reported_cents)}
                        </Button>
                      ) : null}
                      {s.paid_cents < s.share_cents && (
                        <Button
                          variant="outline"
                          className="h-10"
                          disabled={busy}
                          onClick={() => void setPaid(i.id, s.user_id, s.share_cents)}
                        >
                          Mark paid
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="h-10"
                        disabled={busy}
                        onClick={() => {
                          const v = window.prompt(
                            `How much has ${name(s.user_id)} paid in total? (0 to reset)`,
                            (s.paid_cents / 100).toFixed(2),
                          );
                          if (v === null) return;
                          const n = Number(v.replace(/[$,\s]/g, ""));
                          if (!Number.isFinite(n) || n < 0) {
                            setMsg("Enter an amount like 50 or 50.25.");
                            return;
                          }
                          void setPaid(i.id, s.user_id, Math.round(n * 100));
                        }}
                      >
                        Partial…
                      </Button>
                      {s.paid_cents > 0 && (
                        <Button
                          variant="ghost"
                          className="h-10 text-destructive"
                          disabled={busy}
                          onClick={() => void undo(i.id, s)}
                        >
                          Undo payment
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {msg && (
        <p role="status" className="text-sm text-green">
          {msg}
        </p>
      )}
    </div>
  );
}

function CostEditor({
  trip,
  members,
  name,
  item,
  shares,
  onDone,
}: {
  trip: TripWithRole;
  members: Member[];
  name: (id: string) => string;
  item: Item | null;
  shares: Share[];
  onDone: () => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState(item?.category ?? "stay");
  const [customCat, setCustomCat] = useState(item?.custom_category ?? "");
  const [estimate, setEstimate] = useState(item?.is_estimate ?? false);
  const [total, setTotal] = useState(item ? (item.total_cents / 100).toFixed(2) : "");
  const [split, setSplit] = useState(item?.split ?? "even");
  const [due, setDue] = useState(item?.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => {
        const s = shares.find((x) => x.user_id === m.user_id);
        return [m.user_id, s ? (s.share_cents / 100).toFixed(2) : ""];
      }),
    ),
  );
  const totalCents = toCents(total) ?? 0;
  const customSum = Object.values(custom).reduce(
    (a, v) => a + (v.trim() ? Math.round(Number(v) * 100) || 0 : 0),
    0,
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (!title.trim()) {
      setErr("Give this cost a name.");
      return;
    }
    if (!totalCents) {
      setErr("Enter a total like 1200 or 1200.50.");
      return;
    }
    if (split === "custom" && customSum !== totalCents) {
      setErr(
        `Custom shares add up to ${money(customSum)} — they need to equal ${money(totalCents)}.`,
      );
      return;
    }
    const rows =
      split === "custom"
        ? Object.entries(custom)
            .filter(([, v]) => v.trim() && Number(v) > 0)
            .map(([user_id, v]) => ({ user_id, share_cents: Math.round(Number(v) * 100) }))
        : [];
    setBusy(true);
    const r = await rpc("save_cost_item", {
      p_trip: trip.id,
      p_item: item?.id ?? null,
      p_title: title,
      p_category: category,
      p_custom: category === "other" ? customCat : null,
      p_estimate: estimate,
      p_total_cents: totalCents,
      p_split: split,
      p_shares: rows,
      p_due: due || null,
    });
    setBusy(false);
    if (r.error) {
      setErr(friendly(r.error));
      return;
    }
    await onDone();
  }
  return (
    <form className="mt-3 space-y-4" onSubmit={(e) => void save(e)}>
      <p className="font-display text-lg font-extrabold">{item ? "Edit cost" : "Add a cost"}</p>
      <label className="block text-sm font-bold">
        Name
        <input
          className={field}
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Phuket villa"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(CATS).map(([k, v]) => (
          <Button
            key={k}
            type="button"
            variant={category === k ? "playful" : "outline"}
            onClick={() => setCategory(k)}
          >
            {v}
          </Button>
        ))}
      </div>
      {category === "other" && (
        <label className="block text-sm font-bold">
          Category name <span className="font-normal text-muted-foreground">(optional)</span>
          <input
            className={field}
            maxLength={40}
            value={customCat}
            onChange={(e) => setCustomCat(e.target.value)}
            placeholder="Tips, visas…"
          />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={!estimate ? "playful" : "outline"}
          onClick={() => setEstimate(false)}
        >
          ✅ Confirmed
        </Button>
        <Button
          type="button"
          variant={estimate ? "playful" : "outline"}
          onClick={() => setEstimate(true)}
        >
          ≈ Estimate
        </Button>
      </div>
      <label className="block text-sm font-bold">
        Total (USD)
        <input
          className={field}
          required
          inputMode="decimal"
          maxLength={12}
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="1200.00"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={split === "even" ? "playful" : "outline"}
          onClick={() => setSplit("even")}
        >
          Split evenly
        </Button>
        <Button
          type="button"
          variant={split === "custom" ? "playful" : "outline"}
          onClick={() => setSplit("custom")}
        >
          Custom
        </Button>
      </div>
      {split === "even" ? (
        <p className="text-xs text-muted-foreground">
          {members.length} members · about{" "}
          {money(Math.floor(totalCents / Math.max(members.length, 1)))} each. New members are added
          automatically when they join.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <label
              key={m.user_id}
              className="flex items-center justify-between gap-3 text-sm font-bold"
            >
              <span className="truncate">{name(m.user_id)}</span>
              <input
                className="h-11 w-32 rounded-xl border border-border bg-card px-3 text-base"
                inputMode="decimal"
                maxLength={12}
                value={custom[m.user_id] ?? ""}
                onChange={(e) => setCustom((c) => ({ ...c, [m.user_id]: e.target.value }))}
                placeholder="0.00"
              />
            </label>
          ))}
          <p
            className={`text-xs ${customSum === totalCents ? "text-green" : "text-muted-foreground"}`}
          >
            {money(customSum)} of {money(totalCents)} assigned. Leave blank for people not in this
            cost.
          </p>
        </div>
      )}
      <label className="block text-sm font-bold">
        Due date <span className="font-normal text-muted-foreground">(optional)</span>
        <input type="date" className={field} value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      {err && (
        <p role="alert" className="text-sm text-destructive">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="playful" className="flex-1" disabled={busy}>
          Save cost
        </Button>
        <Button type="button" variant="outline" onClick={() => void onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
