import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { legalLinks } from "@/lib/legal";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import founderHeadshot from "@/assets/founder-headshot.jpg.asset.json";

type Copy = { founder_intro: string; faq: { q: string; a: string }[] };
const fallback: Copy = { founder_intro: "I'm Tymeka Smith, an Army veteran and forever trip junkie. I built TripJunkies so every squad feels closer before takeoff.", faq: [
  { q: "How does it work?", a: "Game nights before departure, challenges during the trip, and a recap after." },
  { q: "What does it cost?", a: "Founding trips are free today, with no card needed. Your Captain sees the trip price before unlocking." },
  { q: "How do invites work?", a: "Your Captain sends a personal link or a join code. You choose when to join." },
  { q: "What does a Captain do?", a: "The Captain sets up the trip, invites the squad and keeps everything moving." },
  { q: "How do game nights work?", a: "Join the call, play together and vote in the app when the night is live." },
] };
export function useWelcomeCopy() {
  const [copy, setCopy] = useState<Copy>(fallback);
  const load = async () => { const { data } = await (supabase as any).rpc("welcome_copy"); if (data && Array.isArray(data.faq)) setCopy(data as Copy); };
  useEffect(() => { void load(); }, []);
  return { copy, reload: load };
}
export function WelcomeExtras({ onStory }: { onStory: () => void }) {
  const { copy } = useWelcomeCopy();
  return <section className="mt-8 space-y-3" aria-label="About TripJunkies">
    <details className="app-card group"><summary className="cursor-pointer list-none flex items-center gap-3 font-display font-extrabold text-lg"><img src={founderHeadshot.url} alt="Tymeka Smith" width={48} height={48} className="size-12 rounded-full object-cover"/><span>About the founder<small className="block text-xs font-normal text-muted-foreground">Tymeka Smith · Founder · Army Veteran</small></span><ChevronRight className="ml-auto size-5 group-open:rotate-90"/></summary><p className="text-sm text-muted-foreground mt-3">{copy.founder_intro}</p><Button variant="link" className="p-0 mt-2" onClick={onStory}>Read the story <ArrowRight size={16}/></Button></details>
    <details className="app-card group"><summary className="cursor-pointer list-none flex items-center justify-between font-display font-extrabold text-lg">FAQ<ChevronRight className="size-5 group-open:rotate-90"/></summary><div className="divide-y divide-border mt-2">{copy.faq.map((x,i) => <details key={i} className="py-3 group"><summary className="cursor-pointer font-bold text-sm list-none flex items-center justify-between">{x.q}<ChevronRight className="size-4 group-open:rotate-90"/></summary><p className="text-sm text-muted-foreground mt-2">{x.a}</p></details>)}</div><div className="border-t border-border pt-3 mt-3 text-sm"><h3 className="font-bold">Contact</h3><p>General questions: <a href="mailto:hello@tripjunkies.app" className="text-primary underline">hello@tripjunkies.app</a></p><p>Bug reports and account help: <a href="mailto:support@tripjunkies.app" className="text-primary underline">support@tripjunkies.app</a></p><p>Safety, harassment and copyright: <a href="mailto:safety@tripjunkies.app" className="text-primary underline">safety@tripjunkies.app</a></p><p className="mt-2">{legalLinks.map((item,i)=><span key={item.href}>{i>0 ? " · " : ""}<Link to="/legal/$document" params={{document:item.href.split("/").pop() || "terms"}} className="text-primary underline">{item.label}</Link></span>)}</p></div></details>
    <p className="text-xs text-center text-muted-foreground pt-4">Questions? <a href="mailto:hello@tripjunkies.app" className="text-primary underline">hello@tripjunkies.app</a></p>
  </section>;
}
export function FounderWelcomeEditor() {
  const { copy, reload } = useWelcomeCopy(); const [intro, setIntro] = useState(""); const [faq, setFaq] = useState<Copy["faq"]>([]); const [msg, setMsg] = useState("");
  useEffect(() => { setIntro(copy.founder_intro); setFaq(copy.faq); }, [copy]);
  return <section className="mt-5"><h2 className="font-display text-xl font-extrabold">Welcome wording</h2><p className="text-xs text-muted-foreground mt-1">Founder note and FAQ on the welcome page. Plain text only.</p><textarea className="w-full mt-3 rounded-2xl border border-border bg-card p-3" rows={4} maxLength={600} value={intro} onChange={e => setIntro(e.target.value)} aria-label="Founder introduction"/>{faq.map((x,i) => <div key={i} className="mt-3 space-y-2"><input className="w-full rounded-xl border border-border bg-card p-3" maxLength={120} value={x.q} onChange={e => setFaq(faq.map((item,j) => j===i ? {...item,q:e.target.value} : item))} aria-label={`Question ${i+1}`}/><textarea className="w-full rounded-xl border border-border bg-card p-3" rows={3} maxLength={500} value={x.a} onChange={e => setFaq(faq.map((item,j) => j===i ? {...item,a:e.target.value} : item))} aria-label={`Answer ${i+1}`}/></div>)}<Button variant="outline" disabled={faq.length>=6} className="mt-3" onClick={() => setFaq([...faq,{q:"",a:""}])}>Add FAQ</Button>{faq.length>5 && <Button variant="ghost" onClick={() => setFaq(faq.slice(0,-1))}>Remove last</Button>}<Button variant="playful" className="w-full mt-3" onClick={async () => { const r = await (supabase as any).rpc("set_welcome_copy",{p_intro:intro,p_faq:faq}); setMsg((r.error ? friendlyError(r.error) : null) ?? "Saved welcome wording."); if (!r.error) await reload(); }}>Save wording</Button>{msg && <p role="status" className="mt-2 text-sm">{msg}</p>}</section>;
}