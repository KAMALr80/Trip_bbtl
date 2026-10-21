import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";

const db = supabase as unknown as { rpc: (n: string, a?: object) => Promise<{ data: unknown; error: { message: string } | null }> };
type Totals = { calls: number; credits: number; input: number; output: number };
type Report = {
  settings: { enabled: boolean; global_cap: number; user_cap: number; updated_at: string | null };
  today: Totals; week: Totals;
  top_trips: { trip_id: string; name: string | null; calls: number }[];
  top_users: { user_id: string; name: string | null; calls: number }[];
  recent: { kind: string; trip: string | null; name: string | null; input_tokens: number | null; output_tokens: number | null; credits: number | null; created_at: string }[];
};
const field = "min-h-11 w-24 rounded-full border border-border bg-background px-3 text-center";

async function loadReport() { const r = await db.rpc("ai_guard_report"); if (r.error) throw new Error(r.error.message); return r.data as Report; }

/** Founder-only (server-checked) AI cost guard: on/off, daily caps, usage. */
export function AiGuardDoor() {
  const [rep, setRep] = useState<Report | null>(null);
  const [g, setG] = useState(150), [u, setU] = useState(15);
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const load = () => loadReport().then((r) => { setRep(r); setG(r.settings.global_cap); setU(r.settings.user_cap); }).catch((e) => setMsg(friendlyError(e)));
  useEffect(() => { void load(); }, []);
  const save = async (enabled: boolean | null, gc: number | null, uc: number | null, done: string) => {
    setBusy(true); setMsg("");
    const r = await db.rpc("set_ai_guard", { p_enabled: enabled, p_global_cap: gc, p_user_cap: uc });
    setBusy(false); setMsg(r.error ? friendlyError(r.error) : done); await load();
  };
  if (!rep) return <p className="text-sm text-muted-foreground mt-4">{msg || "Loading…"}</p>;
  const t = (x: Totals, label: string) => <div className="rounded-2xl bg-muted p-3"><p className="eyebrow">{label}</p><p className="text-sm mt-1"><b>{x.calls}</b> calls · <b>{x.credits}</b> credits</p><p className="text-xs text-muted-foreground">{x.input.toLocaleString()} in · {x.output.toLocaleString()} out tokens</p></div>;
  return <>
    <section className="app-card mt-5 space-y-3"><p className="eyebrow text-primary">AI SWITCH</p>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-muted p-3"><span><span className="block font-bold">AI ideas {rep.settings.enabled ? "on" : "paused"}</span><span className="block text-xs text-muted-foreground">When paused, pre-written content keeps playing and nobody is charged.</span></span><input type="checkbox" aria-label="AI on" className="size-6 accent-[var(--primary)]" disabled={busy} checked={rep.settings.enabled} onChange={(e) => void save(e.target.checked, null, null, e.target.checked ? "AI is on ✓" : "AI paused")} /></label>
      <label className="flex items-center justify-between gap-3 text-sm font-bold">Daily calls, whole app<input type="number" min={0} className={field} value={g} onChange={(e) => setG(Math.max(0, Number(e.target.value) || 0))} /></label>
      <label className="flex items-center justify-between gap-3 text-sm font-bold">Daily calls per person<input type="number" min={0} className={field} value={u} onChange={(e) => setU(Math.max(0, Number(e.target.value) || 0))} /></label>
      <Button variant="playful" className="w-full" disabled={busy} onClick={() => void save(null, g, u, "Caps saved ✓")}>Save caps</Button>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </section>
    <section className="app-card mt-5 space-y-2"><p className="eyebrow text-blue">USAGE</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{t(rep.today, `TODAY · ${rep.today.calls}/${rep.settings.global_cap}`)}{t(rep.week, "LAST 7 DAYS")}</div>
      <p className="font-bold text-sm pt-2">Top trips today</p>
      {rep.top_trips.length ? <ul className="text-sm space-y-1">{rep.top_trips.map((x) => <li key={x.trip_id}>{x.name ?? "Trip"} · {x.calls}</li>)}</ul> : <p className="text-xs text-muted-foreground">None yet.</p>}
      <p className="font-bold text-sm pt-2">Top people today</p>
      {rep.top_users.length ? <ul className="text-sm space-y-1">{rep.top_users.map((x) => <li key={x.user_id}>{x.name ?? "Player"} · {x.calls}</li>)}</ul> : <p className="text-xs text-muted-foreground">None yet.</p>}
    </section>
    <section className="app-card mt-5"><p className="eyebrow">LAST 20 CALLS</p>
      {rep.recent.length ? <ul className="mt-2 space-y-1 text-xs">{rep.recent.map((r, i) => <li key={i}><span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span> · {r.kind} · {r.trip ?? "—"} · {r.name ?? "app"} · {(r.input_tokens ?? 0) + (r.output_tokens ?? 0)} tokens</li>)}</ul> : <p className="text-sm text-muted-foreground mt-2">No calls yet.</p>}
    </section>
  </>;
}

/** Founder-only banner when today's AI calls reach 80% of the global cap. */
export function AiCapBanner({ onOpen }: { onOpen?: () => void }) {
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => { loadReport().then(setR).catch(() => {}); }, []);
  if (!r || r.settings.global_cap <= 0 || r.today.calls < 0.8 * r.settings.global_cap) return null;
  return <button type="button" onClick={onOpen} className="mt-4 w-full min-h-11 rounded-2xl border border-border bg-card p-3 text-left text-sm"><b>AI use is high today:</b> {r.today.calls} of {r.settings.global_cap} calls. Open AI ›</button>;
}
