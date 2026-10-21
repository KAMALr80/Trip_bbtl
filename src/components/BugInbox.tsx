import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { deviceLabel } from "@/lib/app-version";
import { suggestSimilarReports } from "@/lib/bug-ai.functions";
import type { TripWithRole } from "@/lib/trips";

const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };

export const STATUS: Record<string, string> = { new: "🆕 New", looking: "🔎 Looking into it", fixed: "✅ Fixed", wont_fix: "🚫 Won't fix", need_info: "❓ Need more info" };
const OPEN = ["new", "looking", "need_info"];

type Report = { id: string; created_at: string; page: string; description: string; screenshot_path: string | null; user_agent: string | null; app_version: string | null; trip_id: string | null; trip_name: string | null; reporter: string; status: string; founder_note: string | null; issue_id: string | null; issue_title: string | null; issue_count: number | null };
type Summary = { issue_id: string | null; title: string; page: string; status: string; people: number; reports: number; last_at: string };
type CheckIn = { id: string; created_at: string; trip_name: string; reporter: string; context: string; context_key: string; answers: Record<string, string> };

const screenOf = (p: string) => p.replace(/\s*\(.*\)$/, "");

/* ---------- Founder inbox (server refuses non-founders) ---------- */
export function FounderReports({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Report[] | null>(null), [err, setErr] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<Summary[]>([]), [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [view, setView] = useState<"reports" | "summary" | "checkins">("reports");
  const [fStatus, setFStatus] = useState("open"), [fScreen, setFScreen] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<{ tier: string; people: number }[]>([]);
  useEffect(() => { void db.rpc("founder_age_tiers").then((r: { data: { tier: string; people: number }[] | null }) => setTiers(r.data ?? [])); }, []);
  async function load() {
    const r = await db.rpc("founder_bug_reports");
    if (r.error) { setErr("Founder only."); setRows([]); return; }
    const data = (r.data ?? []) as Report[]; setRows(data);
    const paths = data.map((x) => x.screenshot_path).filter((p): p is string => !!p);
    if (paths.length) { const { data: s } = await supabase.storage.from("bug-screenshots").createSignedUrls(paths, 3600); setUrls(Object.fromEntries((s ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]))); }
    const [s, c] = await Promise.all([db.rpc("founder_open_summary"), db.rpc("founder_checkins")]);
    setSummary(s.data ?? []); setCheckins(c.data ?? []);
  }
  useEffect(() => { void load(); }, []);
  const screens = useMemo(() => [...new Set((rows ?? []).map((r) => screenOf(r.page)))].sort(), [rows]);
  const issues = useMemo(() => { const m = new Map<string, string>(); (rows ?? []).forEach((r) => { if (r.issue_id && r.issue_title) m.set(r.issue_id, r.issue_title); }); return [...m].map(([id, title]) => ({ id, title })); }, [rows]);
  const shown = (rows ?? []).filter((r) => (fStatus === "all" || (fStatus === "open" ? OPEN.includes(r.status) : r.status === fStatus)) && (fScreen === "all" || screenOf(r.page) === fScreen));
  const tab = (k: typeof view, l: string) => <Button size="sm" variant={view === k ? "green" : "outline"} aria-pressed={view === k} onClick={() => setView(k)}>{l}</Button>;
  return <div className="pb-10">
    <Button variant="ghost" data-view-navigation="true" className="-ml-2" onClick={onBack}><ArrowLeft /> Me</Button>
    <h1 className="font-display text-2xl font-extrabold mt-4">Reports 🐞</h1>
    <AiDailyCounts/>
    <div className="mt-3 flex flex-wrap gap-2">{tab("reports", "Inbox")}{tab("summary", `Open summary (${summary.length})`)}{tab("checkins", `Check-ins (${checkins.length})`)}</div>
    {err && <p role="alert" className="mt-3 text-sm text-destructive">{err}</p>}
    {tiers.length > 0 && <div className="app-card mt-4"><p className="font-display font-extrabold">Accounts by age tier</p><div className="mt-2 flex flex-wrap gap-2">{tiers.map(t => <span key={t.tier} className="rounded-full bg-muted px-3 py-1 text-sm font-bold">{t.tier}: {t.people}</span>)}</div><p className="mt-1 text-xs text-muted-foreground">Counts only — birthdays are never shown.</p></div>}
    {rows === null ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : view === "summary" ? <OpenSummary rows={summary} /> : view === "checkins" ? <CheckInList rows={checkins} /> : <>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <select aria-label="Filter by status" className="h-11 rounded-xl border border-border bg-card px-3 text-base" value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="open">Open</option><option value="all">All statuses</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Filter by screen" className="h-11 rounded-xl border border-border bg-card px-3 text-base" value={fScreen} onChange={(e) => setFScreen(e.target.value)}><option value="all">All screens</option>{screens.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{shown.length} report{shown.length === 1 ? "" : "s"}</p>
      <div className="mt-2 space-y-2">{shown.map((r) => <ReportCard key={r.id} r={r} url={r.screenshot_path ? urls[r.screenshot_path] : undefined} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} issues={issues} all={rows} onChanged={load} />)}</div>
      {!shown.length && <p className="mt-4 text-sm text-muted-foreground">Nothing here. 🎉</p>}
    </>}
  </div>;
}

function AiDailyCounts() {
  const [rows,setRows]=useState<{day:string;user_id:string;calls:number}[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{void db.rpc('ai_daily_counts').then((r:{data:{day:string;user_id:string;calls:number}[]|null;error:{message:string}|null})=>{if(r.error)setError('AI usage is unavailable.');else setRows(r.data??[]);});},[]);
  const daily=Object.entries(rows.reduce<Record<string,number>>((acc,row)=>{acc[row.day]=(acc[row.day]??0)+Number(row.calls);return acc;},{}));
  return <details className="mt-4 border border-border rounded-lg p-4"><summary className="cursor-pointer font-bold">AI usage · last 30 days</summary>{error && <p role="alert" className="text-sm text-destructive mt-2">{error}</p>}{!error && <><p className="text-xs text-muted-foreground mt-2">Counts only; no prompts.</p><div className="mt-3 space-y-3 text-base">{daily.map(([day,count])=><div key={day}><strong>{day} · {count} calls</strong><ul className="mt-1 text-xs text-muted-foreground">{rows.filter(row=>row.day===day).map(row=><li key={row.user_id} className="break-all">{row.user_id} · {row.calls}</li>)}</ul></div>)}{!daily.length && <p>No AI calls yet.</p>}</div></>}</details>;
}

function ReportCard({ r, url, open, onToggle, issues, all, onChanged }: { r: Report; url?: string | undefined; open: boolean; onToggle: () => void; issues: { id: string; title: string }[]; all: Report[]; onChanged: () => Promise<void> }) {
  const [status, setStatus] = useState(r.status), [note, setNote] = useState(r.founder_note ?? ""), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const [newTitle, setNewTitle] = useState(""), [similar, setSimilar] = useState<string[] | null>(null);
  const suggest = useServerFn(suggestSimilarReports);
  useEffect(() => { setStatus(r.status); setNote(r.founder_note ?? ""); }, [r.status, r.founder_note]);
  async function run(f: () => Promise<{ error: { message: string } | null }>, ok: string) { setBusy(true); setMsg(""); const { error } = await f(); setBusy(false); if (error) setMsg(friendlyError(error)); else { setMsg(ok); await onChanged(); } }
  const save = () => run(() => db.rpc("founder_update_report", { p_report: r.id, p_status: status, p_note: note.trim() || null }), "Saved ✓");
  const link = (issue: string | null, title: string | null, id = r.id) => run(() => db.rpc("founder_link_report", { p_report: id, p_issue: issue, p_title: title }), "Linked ✓");
  async function ai() { setBusy(true); setMsg(""); try { const res = await suggest({ data: { reportId: r.id } }); setSimilar(res.ids); } catch (e) { setMsg(friendlyError(e)); } setBusy(false); }
  return <div className="app-card text-base">
    <button type="button" className="w-full text-left" aria-expanded={open} onClick={onToggle}>
      <div className="flex items-center justify-between gap-2"><span className="neon-chip text-blue">{STATUS[r.status] ?? r.status}</span><span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span></div>
      <p className="mt-2 font-bold">{screenOf(r.page)}{r.issue_title ? <span className="font-normal text-muted-foreground"> · 🔗 {r.issue_title} ({r.issue_count ?? 1} people)</span> : null}</p>
      <p className={`mt-1 whitespace-pre-wrap ${open ? "" : "line-clamp-2"}`}>{r.description}</p>
    </button>
    {open && <div className="mt-3 space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-muted-foreground">Reporter</dt><dd>{r.reporter}</dd><dt className="text-muted-foreground">Trip</dt><dd>{r.trip_name ?? "—"}</dd><dt className="text-muted-foreground">Screen</dt><dd>{r.page}</dd><dt className="text-muted-foreground">Device</dt><dd>{deviceLabel(r.user_agent)}</dd><dt className="text-muted-foreground">Version</dt><dd>{r.app_version ?? "before r23"}</dd></dl>
      {url && <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Bug screenshot" className="max-h-64 rounded-xl" /></a>}
      <div><p className="font-bold">Status{r.issue_id ? " (applies to the whole issue)" : ""}</p><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(STATUS).map(([k, v]) => <Button key={k} size="sm" variant={status === k ? "playful" : "outline"} aria-pressed={status === k} onClick={() => setStatus(k)}>{v}</Button>)}</div>
        <textarea className="text-base mt-2 w-full rounded-xl border border-border bg-background p-3" rows={2} maxLength={500} placeholder="Short founder note (reporter sees it for Fixed / Need more info)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" variant="green" disabled={busy} onClick={() => void save()}>Save status</Button></div>
      <div><p className="font-bold">Group duplicates</p>
        {r.issue_id ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => void link(null, null)}>Unlink from “{r.issue_title}”</Button> : <>
          {issues.length > 0 && <select aria-label="Link to issue" className="text-base mt-2 h-10 w-full rounded-xl border border-border bg-background px-3" defaultValue="" onChange={(e) => e.target.value && void link(e.target.value, null)}><option value="">Link to an existing issue…</option>{issues.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</select>}
          <div className="mt-2 flex gap-2"><input className="text-base h-10 flex-1 rounded-xl border border-border bg-background px-3" maxLength={140} placeholder="New issue title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /><Button size="sm" variant="outline" disabled={busy || !newTitle.trim()} onClick={() => void link(null, newTitle.trim())}>Create</Button></div></>}
        <Button size="sm" variant="subtle" className="mt-2" disabled={busy} onClick={() => void ai()}>✨ AI suggest similar</Button>
        <p className="mt-1 text-xs text-muted-foreground">Sends report text and screen only — never screenshots, names or emails.</p>
        {similar && (similar.length === 0 ? <p className="mt-2 text-xs">No similar reports found.</p> : <div className="mt-2 space-y-1.5">{similar.map((id) => { const o = all.find((x) => x.id === id); if (!o) return null; return <div key={id} className="rounded-xl border border-border p-2 text-xs"><p className="font-bold">{screenOf(o.page)} · {STATUS[o.status]}</p><p className="line-clamp-2">{o.description}</p>{r.issue_id && o.issue_id !== r.issue_id && <Button size="sm" variant="outline" className="mt-1" disabled={busy} onClick={() => void link(r.issue_id, null, id)}>Add to this issue</Button>}{!r.issue_id && o.issue_id && <Button size="sm" variant="outline" className="mt-1" disabled={busy} onClick={() => void link(o.issue_id, null)}>Join “{o.issue_title}”</Button>}</div>; })}</div>)}
      </div>
      {msg && <p role="status" className="text-xs">{msg}</p>}
    </div>}
  </div>;
}

function OpenSummary({ rows }: { rows: Summary[] }) {
  const byScreen = rows.reduce<Record<string, number>>((a, r) => { const s = screenOf(r.page); a[s] = (a[s] ?? 0) + r.people; return a; }, {});
  return <div className="mt-4 space-y-3">
    <div className="app-card"><p className="eyebrow text-muted-foreground">OPEN BY SCREEN</p>{Object.entries(byScreen).sort((a, b) => b[1] - a[1]).map(([s, n]) => <div key={s} className="mt-2 flex justify-between text-base"><span>{s}</span><b>{n}</b></div>)}{!rows.length && <p className="mt-2 text-sm text-muted-foreground">No open issues. 🎉</p>}</div>
    {rows.map((r, i) => <div key={r.issue_id ?? `${r.title}-${i}`} className="app-card text-base"><div className="flex justify-between gap-2"><b className="min-w-0 truncate">{r.issue_id ? "🔗 " : ""}{r.title}</b><span className="shrink-0 font-display font-extrabold">{r.people} 👤</span></div><p className="mt-1 text-xs text-muted-foreground">{screenOf(r.page)} · {STATUS[r.status]} · {r.reports} report{r.reports === 1 ? "" : "s"} · last {new Date(r.last_at).toLocaleDateString()}</p></div>)}
  </div>;
}

function CheckInList({ rows }: { rows: CheckIn[] }) {
  if (!rows.length) return <p className="mt-4 text-sm text-muted-foreground">No check-ins yet.</p>;
  return <div className="mt-4 space-y-2">{rows.map((c) => <div key={c.id} className="app-card text-base"><p className="text-xs text-muted-foreground">{c.trip_name} · {c.context === "game_night" ? `Game night ${c.context_key}` : `Trip day ${c.context_key}`} · {c.reporter} · {new Date(c.created_at).toLocaleDateString()}</p>{Object.entries(c.answers ?? {}).map(([q, a]) => <p key={q} className="mt-1"><span className="text-muted-foreground">{q}</span> <b>{a}</b></p>)}</div>)}</div>;
}

/* ---------- Reporter notes in Me ---------- */
type Update = { id: string; page: string; status: string; founder_note: string | null };
export function BugUpdates() {
  const [rows, setRows] = useState<Update[]>([]);
  useEffect(() => { void db.rpc("my_bug_updates").then((r: { data: Update[] | null }) => setRows(r.data ?? [])); }, []);
  if (!rows.length) return null;
  const dismiss = async (id: string) => { setRows((x) => x.filter((r) => r.id !== id)); await db.rpc("dismiss_bug_update", { p_report: id }); };
  return <div className="mt-4 space-y-2">{rows.map((r) => <div key={r.id} role="status" className="flex items-start gap-3 rounded-2xl border border-border bg-green-soft p-3 text-base"><span aria-hidden>{r.status === "fixed" ? "✅" : "❓"}</span><div className="min-w-0 flex-1"><p>{r.status === "fixed" ? <>Thanks — the bug you reported on <b>{screenOf(r.page)}</b> is fixed.</> : <>About the bug you reported on <b>{screenOf(r.page)}</b>: we need a bit more info. Send another report with details.</>}</p>{r.founder_note && <p className="mt-1 text-xs text-ink-soft">“{r.founder_note}”</p>}</div><button type="button" aria-label="Dismiss" className="shrink-0 p-1" onClick={() => void dismiss(r.id)}><X size={16} /></button></div>)}</div>;
}

/* ---------- Optional quick check-in after a game night or trip day ---------- */
const QUESTIONS: { q: string; kind: "yn" | "text" }[] = [
  { q: "Was it clear what to do next?", kind: "yn" },
  { q: "Were the games fun?", kind: "yn" },
  { q: "Did points update correctly?", kind: "yn" },
  { q: "Did anything break?", kind: "yn" },
  { q: "What made you want to keep going?", kind: "text" },
];
function pick(key: string) { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; const start = h % QUESTIONS.length; return [0, 1, 2].map((i) => QUESTIONS[(start + i) % QUESTIONS.length]!); }
const dayIn = (tz: string | null | undefined, offsetDays = 0) => new Date(Date.now() - offsetDays * 86400000).toLocaleDateString("en-CA", tz ? { timeZone: tz } : undefined);

export function QuickCheckIn({ trip }: { trip: TripWithRole }) {
  const [target, setTarget] = useState<{ context: "game_night" | "trip_day"; key: string; label: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({}), [done, setDone] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { void (async () => {
    setTarget(null); setDone(false); setAnswers({});
    const t = trip as TripWithRole & { trip_timezone?: string | null; is_sandbox?: boolean };
    let found: { context: "game_night" | "trip_day"; key: string; label: string } | null = null;
    const now = Date.now();
    const { data: auth } = await supabase.auth.getUser();
    const { data: me } = await db.from("trip_members").select("status").eq("trip_id", trip.id).eq("user_id", auth.user?.id ?? "").maybeSingle();
    if ((me as { status?: string } | null)?.status !== "approved") return;
    const { data: nights } = await db.from("game_nights").select("week_number,starts_at,skipped").eq("trip_id", trip.id).lte("starts_at", new Date(now - 2 * 3600000).toISOString()).gte("starts_at", new Date(now - 36 * 3600000).toISOString()).order("starts_at", { ascending: false }).limit(1);
    const n = (nights ?? [])[0] as { week_number: number; skipped: boolean } | undefined;
    if (n && !n.skipped) found = { context: "game_night", key: `week-${n.week_number}`, label: "last night's game night" };
    if (!found && trip.start_date && trip.end_date) { const y = dayIn(t.trip_timezone, 1); if (y >= trip.start_date && y <= trip.end_date) found = { context: "trip_day", key: y, label: "yesterday's trip day" }; }
    if (!found) return;
    if (localStorage.getItem(`tj-checkin:${trip.id}:${found.context}:${found.key}`)) return;
    const { data: mine } = await db.from("checkin_responses").select("id").eq("trip_id", trip.id).eq("context", found.context).eq("context_key", found.key).limit(1);
    if ((mine ?? []).length) return;
    setTarget(found);
  })(); }, [trip]);
  if (!target) return null;
  const storeKey = `tj-checkin:${trip.id}:${target.context}:${target.key}`;
  const qs = pick(`${trip.id}:${target.key}`);
  const skip = () => { safeSetItem(storeKey, "1"); setTarget(null); };
  async function send() { setBusy(true); const { error } = await db.rpc("submit_checkin", { p_trip: trip.id, p_context: target!.context, p_key: target!.key, p_answers: answers }); setBusy(false); if (!error) { safeSetItem(storeKey, "1"); setDone(true); } }
  if (done) return <div role="status" className="mb-4 rounded-2xl border border-border bg-green-soft p-4 text-base">🙏 Thanks — that really helps.</div>;
  return <section className="mb-4 app-card" aria-label="Quick check-in">
    <div className="flex items-start justify-between gap-2"><div><p className="eyebrow text-primary">QUICK CHECK-IN · OPTIONAL</p><p className="mt-1 font-display font-extrabold">How was {target.label}?</p></div><button type="button" aria-label="Skip check-in" className="p-1" onClick={skip}><X size={18} /></button></div>
    {qs.map(({ q, kind }) => <div key={q} className="mt-3"><p className="text-sm font-bold">{q}</p>{kind === "yn" ? <div className="mt-2 flex gap-2">{["Yes", "Kind of", "No"].map((a) => <Button key={a} size="sm" variant={answers[q] === a ? "playful" : "outline"} aria-pressed={answers[q] === a} onClick={() => setAnswers({ ...answers, [q]: a })}>{a}</Button>)}</div> : <input className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base" maxLength={300} value={answers[q] ?? ""} onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })} />}</div>)}
    <div className="mt-4 flex gap-2"><Button variant="green" size="sm" disabled={busy || !Object.values(answers).some((v) => v.trim())} onClick={() => void send()}>Send</Button><Button variant="ghost" size="sm" onClick={skip}>Not now</Button></div>
  </section>;
}
