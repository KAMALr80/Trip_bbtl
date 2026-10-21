import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole, Member } from "@/lib/trips";

type Birthday = { user_id: string; birthday: string };
const api = supabase as unknown as { from: (table: string) => any; rpc: (name: string, args: object) => PromiseLike<{ error: { message: string } | null }> };

export function AdultControls({ trip, members }: { trip: TripWithRole; members: Member[] }) {
  const [enabled, setEnabled] = useState(false);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [approved, setApproved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    const [settings, dates, approvals] = await Promise.all([
      api.from("trip_adult_settings").select("enabled").eq("trip_id", trip.id).maybeSingle(),
      api.rpc("member_age_ranges", { p_trip: trip.id }),
      api.from("trip_adult_approvals").select("user_id").eq("trip_id", trip.id),
    ]);
    for (const result of [settings,dates,approvals]) if (result.error) console.error("21+ controls load failed",result.error);
    setEnabled((trip as { vibe?: string }).vibe === "party");
    setBirthdays(((((dates as unknown) as { data?: unknown }).data ?? []) as { user_id: string; age_range: string }[]).map(d => ({ user_id: d.user_id, birthday: d.age_range })) as never);
    setApproved((approvals.data ?? []).map((a: { user_id: string }) => a.user_id));
  };
  useEffect(() => { if (trip.myRole === "captain") void refresh(); }, [trip.id, members.length]);
  if (trip.myRole !== "captain") return null;
  const rangeOf = (id: string) => (birthdays.find(b => b.user_id === id) as { birthday?: string } | undefined)?.birthday ?? "Unknown";
  const adult = (id: string) => rangeOf(id) === "21+";
  async function change(name: string, args: object) {
    setBusy(true); setError("");
    const { error: failure } = await api.rpc(name, args);
    if (failure) { console.error("Adult cards update failed", failure); setError("Couldn't update 21+ cards. Try again."); }
    else await refresh();
    setBusy(false);
  }
  return <section className="mt-9 app-card"><div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-xl font-extrabold">21+ cards</h2><p className="text-xs text-muted-foreground mt-1">{enabled ? "Party vibe · sip or skip" : "Only in the Party 🎉 vibe — change it under Trip vibe"}</p></div></div>
    {enabled && <div className="mt-5 border-t border-border pt-4"><p className="eyebrow">Captain approval</p><p className="text-xs text-muted-foreground mt-2">A birthday is private. Approval unlocks optional activities for that player only.</p><div className="mt-3 space-y-2">{members.map(m => { const eligible = adult(m.user_id); const isApproved = approved.includes(m.user_id); return <div key={m.user_id} className="flex items-center justify-between gap-2 py-2 border-b border-border"><span className="min-w-0"><span className="block font-bold truncate">{m.display_name || "Player"}</span><span className="text-xs text-muted-foreground">{eligible ? "21+ eligible" : rangeOf(m.user_id) === "Unknown" ? "Age not added" : `${rangeOf(m.user_id)} · alternatives`}</span></span>{eligible && <Button variant={isApproved ? "outline" : "green"} size="sm" disabled={busy} onClick={() => void change("approve_adult_player", { p_trip: trip.id, p_user: m.user_id, p_approve: !isApproved })}>{isApproved ? "Remove" : "Approve"}</Button>}</div>; })}</div></div>}
    {error && <p role="alert" className="text-destructive text-sm mt-3">{error}</p>}
  </section>;
}