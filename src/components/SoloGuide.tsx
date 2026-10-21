import { useEffect, useState } from "react";
import { Award, CalendarPlus, Clock3, Flame, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { friendlyError } from "@/lib/friendly-error";
import passArt from "@/assets/play-sealed-pass.webp";

const db = supabase as unknown as { rpc: (n: string, a?: object) => Promise<{ data: any; error: { message: string } | null }>; storage: typeof supabase.storage };

type Quest = { day: number; sealed: boolean; arrived: boolean; title: string | null; text: string | null; backstory: string | null; keywords: string[] | null; insight: string | null; budget: string | null; opened_at: string | null; finished_at: string | null; speed_bonus: boolean; photo: string | null; story: string | null };
type State = { today_day: number; days: number; start_date: string; points: number; available: number; fare: string; targets: Record<string, number>; streak: number; personal_best: number | null; stamps: { speed_runner: boolean; clean_sweep: boolean; local_tongue: boolean; destination: boolean }; quests: Quest[] };
export type SoloExp = { id: string; title: string; city: string | null; region: string | null; country: string; start_date: string; finished_at: string | null };

const FARES = ["Economy", "Business", "First Class"] as const;
const left = (ms: number) => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; };

function saveIcs(exp: SoloExp, place: string) {
  const d = exp.start_date.replace(/-/g, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TripJunkies//Solo//EN", "BEGIN:VEVENT", `UID:${exp.id}-solo@tripjunkies`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`, `DTSTART;VALUE=DATE:${d}`, `SUMMARY:TripJunkies · First solo quest unseals · ${place}`, "END:VEVENT", "END:VCALENDAR"];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "tripjunkies-solo.ics"; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Solo play: sealed quests on trip days, fare-class target, streak, stamps and the guide. Server decides everything. */
export function SoloGuide({ exp, userId, place }: { exp: SoloExp; userId: string; place: string }) {
  const [s, setS] = useState<State | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [now, setNow] = useState(Date.now());
  const [file, setFile] = useState<File | null>(null), [story, setStory] = useState(""), [urls, setUrls] = useState<Record<string, string>>({});
  async function call(action: string, p: object = {}) {
    setBusy(true); setError("");
    const r = await db.rpc("solo_action", { p_action: action, p_exp: exp.id, p });
    setBusy(false);
    if (r.error) { setError(friendlyError(r.error)); return; }
    const next = r.data as State; setS(next);
    const paths = next.quests.map((q) => q.photo).filter(Boolean) as string[];
    if (paths.length) { const { data } = await db.storage.from("culture-photos").createSignedUrls(paths, 3600); setUrls(Object.fromEntries((data ?? []).map((x) => [x.path ?? "", x.signedUrl ?? ""]))); }
  }
  useEffect(() => { void call("state"); const t = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(t); }, [exp.id]);
  if (!s) return error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null;
  const current = s.quests.find((q) => q.arrived && !q.finished_at) ?? null;
  const next = s.quests.find((q) => !q.arrived);
  const done = s.quests.filter((q) => q.finished_at);
  const goal = FARES.find((f) => s.points < (s.targets[f] ?? 0)) ?? null;
  async function finish(q: Quest) {
    if (!file) { setError("Add your photo first"); return; }
    setBusy(true); setError("");
    try {
      const small = await compressImage(file, 1600, 400_000);
      const path = `${exp.id}/${userId}/solo-${q.day}-${crypto.randomUUID()}.${small.type === "image/png" ? "png" : small.type === "image/webp" ? "webp" : "jpg"}`;
      const { error: up } = await db.storage.from("culture-photos").upload(path, small, { contentType: small.type });
      if (up) throw new Error(up.message);
      setBusy(false); setFile(null); setStory("");
      await call("finish", { day: q.day, photo: path, story });
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }
  const stamps: [boolean, string][] = [[s.stamps.speed_runner, "Speed Runner"], [s.stamps.clean_sweep, "Clean Sweep"], [s.stamps.local_tongue, "Local Tongue"], [s.stamps.destination, place]];
  return <div className="mt-4 space-y-4">
    <section className="flight-ticket" aria-label="Your fare class">
      <div className="flight-ticket-body">
        <p className="text-xs font-bold uppercase text-blue">Solo · your fare class</p>
        {exp.finished_at ? <h2 className="font-display text-2xl font-extrabold mt-2">You finished {s.fare === "Standby" ? "on Standby" : s.fare}</h2>
          : <h2 className="font-display text-xl font-extrabold mt-2">{goal ? `Reach ${s.targets[goal]} points for ${goal}` : "First Class reached"}</h2>}
        <p className="font-display text-3xl font-extrabold mt-2">{s.points} <small className="text-sm font-semibold">of {s.available} pts</small></p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold">{FARES.map((f) => <span key={f} className={`rounded-full border border-border px-2 py-2 ${s.points >= (s.targets[f] ?? 0) ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{f} · {s.targets[f]}</span>)}</div>
        <p className="mt-3 text-sm flex flex-wrap gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1"><Flame size={15}/> {s.streak}-day streak</span>{s.personal_best != null && <span>Personal best {s.personal_best} pts{s.points > s.personal_best ? " · new best" : ""}</span>}</p>
        <div className="mt-3 flex flex-wrap gap-2">{stamps.map(([on, name]) => <span key={name} className={`inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-bold ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground opacity-60"}`}><Award size={13}/> {name}</span>)}</div>
        <p className="mt-3 text-xs text-muted-foreground">Solo plays against your own target — no leaderboard, no crowning. Uploads count right away.</p>
      </div>
    </section>

    {current && !exp.finished_at && <section className="flight-ticket" aria-label="Solo quest">
      {current.sealed ? <div className="flight-ticket-art"><img src={passArt} width={780} height={390} loading="lazy" alt="A sealed boarding pass on an airplane tray" className="w-full h-full object-cover"/></div>
        : current.opened_at && <div className="flight-countdown" aria-label="Speed bonus"><span className="flight-countdown-label">DAY {current.day} QUEST</span><strong>{now < Date.parse(current.opened_at) + 3 * 3600000 ? left(Date.parse(current.opened_at) + 3 * 3600000 - now) : "Open"}</strong><span className="flight-countdown-speed">{now < Date.parse(current.opened_at) + 3 * 3600000 ? "left for +5" : "Speed bonus window closed"}</span></div>}
      <div className="flight-ticket-body">
        <p className="text-xs font-bold uppercase text-blue inline-flex items-center gap-1"><Ticket size={15}/> Sealed Quest · Day {current.day} · 10 pts</p>
        {current.sealed ? <><h2 className="font-display text-xl font-extrabold mt-3">Today's quest is sealed.</h2><p className="text-sm text-muted-foreground mt-2">Finish within 3 hours of opening for +5.</p><Button variant="playful" className="flight-action w-full min-h-11 mt-4" disabled={busy} onClick={() => void call("open", { day: current.day })}>Open quest</Button></>
          : <><h2 className="font-display text-xl font-extrabold mt-3">{current.title}</h2><p className="mt-2">{current.text}</p>{current.backstory && <p className="mt-2 text-sm text-muted-foreground">{current.backstory}</p>}{current.insight && <p className="mt-2 text-sm"><strong>The why:</strong> {current.insight}</p>}{current.budget && <p className="mt-1 text-xs text-muted-foreground">{current.budget}</p>}{!!current.keywords?.length && <p className="mt-2 text-xs text-muted-foreground">Search for: {current.keywords.join(" · ")}</p>}
            <p className="mt-4 text-sm font-bold">Your guide page</p>
            <input type="file" accept="image/*" aria-label="Quest photo" className="mt-2 block w-full text-sm min-h-11" onChange={(e) => setFile(e.target.files?.[0] ?? null)}/>
            <textarea aria-label="Your story" maxLength={600} value={story} onChange={(e) => setStory(e.target.value)} placeholder="What happened, what you learned, a tip for the next traveler" className="mt-2 w-full rounded-xl border border-border bg-card p-3 text-base min-h-24"/>
            <Button variant="playful" className="flight-action w-full min-h-11 mt-3" disabled={busy || !file || story.trim().length < 10} onClick={() => void finish(current)}>{busy ? "Saving…" : "Add to my guide"}</Button></>}
      </div>
    </section>}
    {!current && next && !exp.finished_at && <section className="app-card"><p className="flight-departure"><Clock3 size={16}/> Day {next.day} quest unseals on its trip day.</p>{s.today_day < 1 && <Button variant="outline" className="mt-3 w-full min-h-11" onClick={() => saveIcs(exp, place)}><CalendarPlus size={16}/> Add to calendar</Button>}</section>}

    {done.length > 0 && <section className="app-card" aria-label={`Your guide to ${place}`}>
      <p className="eyebrow text-orange">YOUR SHOWCASE</p><h2 className="font-display text-2xl font-extrabold mt-1">Your guide to {place}</h2>
      <div className="mt-3 space-y-4">{done.map((q) => <article key={q.day} className="min-w-0">{q.photo && urls[q.photo] && <img src={urls[q.photo]} alt={q.title ?? "Guide photo"} width={780} height={520} loading="lazy" className="w-full aspect-[3/2] object-cover rounded-2xl"/>}<h3 className="font-display text-lg font-extrabold mt-2">Day {q.day} · {q.title}</h3><p className="text-sm mt-1">{q.story}</p>{q.speed_bonus && <p className="text-xs font-bold text-blue mt-1">Speed bonus +5</p>}</article>)}</div>
    </section>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
