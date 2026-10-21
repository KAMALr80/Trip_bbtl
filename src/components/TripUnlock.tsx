import { tripDisplayName } from "@/lib/trip-display-name";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/Season";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";
import { Checkout } from "@/components/Checkout";

type Price = { days: number; base_cents: number; addon_cents: number; total_cents: number; headcount: number; unlocked: boolean };
const db = supabase as unknown as { rpc: (f: string, a?: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Unlock status comes only from the server; the client can never set it. */
export const isUnlocked = (trip: TripWithRole) => !!(trip as { unlocked_at?: string | null }).unlocked_at;

export function LockedNote({ trip, what = "this" }: { trip: TripWithRole; what?: string }) {
  return <div className="app-card mt-5 flex items-start gap-3" aria-label="Locked"><span className="bg-orange-soft text-orange rounded-2xl p-2"><Lock size={20} /></span><div><p className="font-display font-extrabold">Unlock {what} 🔓</p><p className="text-sm text-muted-foreground mt-1">{trip.myRole === "captain" ? "Unlock the full trip in Captain Tools — free for Founding Members." : "Your Captain can unlock the full trip."}</p></div></div>;
}

export function TripUnlock({ trip, memberCount, onUnlocked }: { trip: TripWithRole; memberCount: number; onUnlocked: () => void | Promise<void> }) {
  const [head, setHead] = useState(memberCount), [price, setPrice] = useState<Price | null>(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [burst, setBurst] = useState(0);
  const captain = trip.myRole === "captain";
  useEffect(() => { const n = Math.max(1, Math.min(30, head || 1)); void db.rpc("trip_price", { p_trip: trip.id, p_headcount: n }).then((r) => { const row = (r.data as Price[] | null)?.[0]; if (row) setPrice(row); }); }, [trip.id, head]);
  if (isUnlocked(trip)) return <p className="text-sm text-green font-bold mt-2">✓ Full trip unlocked</p>;
  if (!captain) return <LockedNote trip={trip} what="the full trip" />;
  void busy; void setBusy; void msg; void setMsg; void burst; void setBurst; void Confetti;
  const each = price ? price.total_cents / Math.max(1, price.headcount) : 0;
  return <div className="mt-3">
    <p className="text-sm text-muted-foreground">Try the first game night and Question of the Week for free. Unlock everything else for your whole squad.</p>
    {price && <div className="mt-4 rounded-2xl bg-orange-soft p-4">
      <p className="font-display text-2xl font-extrabold">Free during beta</p>
      <p className="text-sm mt-1">Later: {usd(price.total_cents)} total · about {usd(Math.ceil(each))} each for {price.headcount} {price.headcount === 1 ? "person" : "people"}</p>
      <p className="text-xs text-ink-soft mt-2">{price.days}-day trip · {usd(price.base_cents)} {trip.play_arrangement ? "covers up to 6 players" : "covers up to 20 players"}{price.addon_cents ? ` · ${trip.play_arrangement ? "+6 seats" : "Big Group add-on (21–30)"} +${usd(price.addon_cents)}` : ""}</p>
    </div>}
    <label className="block text-sm font-bold mt-3">How many people are splitting it?<input type="number" min={1} max={30} inputMode="numeric" className="w-full mt-1 h-12 rounded-xl bg-card border-2 border-border px-3" value={head} onChange={(e) => setHead(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /></label>
    <Checkout trip={trip} compact onDone={onUnlocked} />
  </div>;
}

const TIERS = [{ n: 10, name: "Platinum", e: "💎" }, { n: 6, name: "Gold", e: "🥇" }, { n: 3, name: "Silver", e: "🥈" }, { n: 1, name: "Bronze", e: "🥉" }];
export function CaptainBadge() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { void db.rpc("my_unlocked_trips").then((r) => setCount(typeof r.data === "number" ? r.data : 0)); }, []);
  if (!count) return null;
  const tier = TIERS.find((t) => count >= t.n)!; const next = [...TIERS].reverse().find((t) => t.n > count);
  return <div className="app-card mt-4" aria-label="Captain badge"><p className="eyebrow text-orange">CAPTAIN BADGE</p><p className="font-display text-xl font-extrabold mt-1">{tier.e} {tier.name} Captain</p><p className="text-sm text-muted-foreground mt-1">{count} unlocked trip{count === 1 ? "" : "s"}{next ? ` · ${next.n - count} more for ${next.name}` : ""}</p></div>;
}
