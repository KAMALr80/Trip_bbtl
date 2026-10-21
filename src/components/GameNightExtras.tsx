import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Video, Vote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import type { Tables } from "@/integrations/supabase/types";
import { Confetti, VoteCard, useSeason } from "./Season";
import { CallPanel } from "./CaptainExtras";

type Night = Tables<"game_nights">;
type TripX = TripWithRole & { motto?: string | null; call_link?: string | null; backup_call_link?: string | null };
const MIN = 60000;

export const CALL_HELP_STEPS = ["Tap Join the call.", "It opens in your web browser (use Chrome).", "Type your name and tap Continue.", "Allow your camera and microphone.", "Wait for the host to let you in."];
export const CALL_HELP_NOTE = "You can see and talk, but screen sharing only works on iPhone, iPad or Mac.";
export const HOST_STEPS = ["Start the FaceTime call", "Tap Share Screen and open TripJunkies (the Play tab)", "Spin for next week before you hang up"];
export const ROLE_TIPS: Record<"captain" | "co_captain" | "host", { title: string; emoji: string; tips: string[] }> = {
  captain: { title: "You're the Captain!", emoji: "👑", tips: ["Add the itinerary in Captain Tools.", "Set the game night time with a quick vote.", "Paste the game night call link.", "Set the mystery prizes for each season."] },
  co_captain: { title: "You're a Co-Captain!", emoji: "⭐", tips: ["You run game nights with the Captain and back up the host.", "Help run game nights when the host needs a hand.", "Setup like dates, invites and costs stays with the Captain."] },
  host: { title: "You're hosting a game night!", emoji: "🎤", tips: [...HOST_STEPS.map((s, i) => `${i + 1}. ${s}.`), "Post votes and tap End voting when everyone's in."] },
};

export function Motto({ text, className = "" }: { text?: string | null | undefined; className?: string }) {
  if (!text) return null;
  return <p className={`italic text-green ${className}`}>“{text}”</p>;
}

function BottomSheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[60] flex items-end justify-center"><div className="absolute inset-0 bg-foreground/50" onClick={onClose} /><section role="dialog" aria-modal="true" aria-label={label} className="relative w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-card rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft"><div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-5" /><Button variant="ghost" size="icon" className="absolute right-5 top-5" aria-label="Close" onClick={onClose}><X /></Button>{children}</section></div>;
}

export function CallHelpSheet({ onClose }: { onClose: () => void }) {
  return <BottomSheet label="Joining from Android or a computer" onClose={onClose}><span className="text-4xl">💻</span><h2 className="font-display text-2xl font-extrabold mt-2">On Android or a computer?</h2><ol className="mt-4 space-y-2">{CALL_HELP_STEPS.map((s, i) => <li key={s} className="flex gap-3 items-start"><span className="grid place-items-center shrink-0 w-7 h-7 rounded-full bg-blue-soft text-blue font-extrabold text-sm">{i + 1}</span><span className="pt-0.5">{s}</span></li>)}</ol><p className="mt-4 text-sm text-muted-foreground">{CALL_HELP_NOTE}</p><Button variant="playful" className="w-full mt-6" onClick={onClose}>Got it</Button></BottomSheet>;
}

function useNights(tripId: string) {
  const [nights, setNights] = useState<Night[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => void supabase.from("game_nights").select("*").eq("trip_id", tripId).order("week_number").then(({ data }) => { if (alive) setNights(data ?? []); });
    load();
    const poll = window.setInterval(load, 5 * MIN), clock = window.setInterval(() => tick((t) => t + 1), MIN);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(clock); };
  }, [tripId]);
  return nights;
}

/** Join-the-call button + host checklist, shown on Home and Play around game night. */
export function GameNightCall({ trip, userId, viewOnly = false, compact = false }: { trip: TripWithRole; userId: string; viewOnly?: boolean; compact?: boolean }) {
  const [panel, setPanel] = useState(false);
  const [teamCall, setTeamCall] = useState<string | null>(null);
  useEffect(() => { void supabase.from("trip_team_members").select("team_id").eq("trip_id", trip.id).eq("user_id", userId).maybeSingle().then(async ({ data }) => { if (!data) return; const r = await supabase.from("trip_teams").select("*").eq("id", data.team_id).maybeSingle(); setTeamCall((r.data as { call_link?: string | null } | null)?.call_link ?? null); }); }, [trip.id, userId]);
  const t = { ...(trip as TripX), call_link: teamCall || (trip as TripX).call_link };
  const nights = useNights(trip.id);

  const [help, setHelp] = useState(false);
  const now = Date.now();
  const live = nights.find((n) => { const s = new Date(n.starts_at).getTime(); return !n.skipped && now >= s - 15 * MIN && now <= s + 180 * MIN; });
  const hosting = !viewOnly && nights.find((n) => { const s = new Date(n.starts_at).getTime(); return !n.skipped && n.host_id === userId && now >= s - 12 * 60 * MIN && now <= s + 180 * MIN; });
  if (compact) return live && t.call_link ? <><Button variant="playful" size="lg" className="w-full mt-4 tap-bounce" onClick={() => setPanel(true)}><Video /> Join call</Button>{panel && <CallPanel link={t.call_link} backup={t.backup_call_link} onClose={() => setPanel(false)} />}</> : null;
  if (!(live && t.call_link) && !hosting) return null;
  return <div className="mt-6 space-y-4">
    {live && t.call_link && <section className="rounded-[1.75rem] bg-green-soft p-5 text-center"><p className="text-xs font-extrabold tracking-widest text-green">🎉 GAME NIGHT IS ON</p><Button variant="playful" size="lg" className="w-full mt-3 tap-bounce" onClick={() => setPanel(true)}><Video /> Join call</Button>{t.backup_call_link && <a href={t.backup_call_link} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-sm font-bold text-blue underline underline-offset-4">Backup link</a>}<div><button type="button" className="mt-2 text-xs text-muted-foreground underline underline-offset-4" onClick={() => setHelp(true)}>On Android or a computer?</button></div></section>}
    {hosting && <section className="rounded-[1.75rem] bg-orange-soft p-5"><p className="text-xs font-extrabold tracking-widest text-orange">🎤 HOST DUTY</p><h3 className="font-display text-2xl font-extrabold mt-1">You're hosting tonight</h3><ol className="mt-3 space-y-2">{HOST_STEPS.map((s, i) => <li key={s} className="flex gap-3 items-start bg-card rounded-2xl p-3"><span className="grid place-items-center shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground font-extrabold text-sm">{i + 1}</span><span className="font-bold text-sm pt-1">{s}</span></li>)}</ol></section>}
    {help && <CallHelpSheet onClose={() => setHelp(false)} />}
    {panel && t.call_link && <CallPanel link={t.call_link} backup={t.backup_call_link} onClose={() => setPanel(false)} />}
  </div>;
}

/** One-time tips the first time someone becomes Captain, Co-Captain or a host. */
export function RoleTips({ trip, userId }: { trip: TripWithRole; userId: string }) {
  const nights = useNights(trip.id);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => { void supabase.from("profiles").select("seen_tips").eq("id", userId).maybeSingle().then(({ data }) => setSeen((data as { seen_tips?: string[] } | null)?.seen_tips ?? [])); }, [userId]);
  const isHost = nights.some((n) => !n.skipped && n.host_id === userId && new Date(n.starts_at).getTime() > Date.now() - 180 * MIN);
  const roles: ("captain" | "co_captain" | "host")[] = [];
  if (trip.myRole === "captain") roles.push("captain");
  if (trip.myRole === "co_captain") roles.push("co_captain");
  if (isHost) roles.push("host");
  const role = seen ? roles.find((r) => !seen.includes(r) && !hidden.includes(r)) : undefined;
  if (!role) return null;
  const tip = ROLE_TIPS[role];
  async function done() {
    if (!role) return;
    const next = [...(seen ?? []), role];
    setHidden((h) => [...h, role]); setSeen(next);
    await supabase.from("profiles").update({ seen_tips: next } as never).eq("id", userId);
  }
  return <BottomSheet label={tip.title} onClose={() => void done()}><span className="text-5xl">{tip.emoji}</span><h2 className="font-display text-3xl font-extrabold mt-2">{tip.title}</h2><p className="text-muted-foreground mt-1">A few quick tips:</p><ul className="mt-4 space-y-2">{tip.tips.map((s) => <li key={s} className="rounded-2xl bg-blue-soft p-3 text-sm font-bold">{s}</li>)}</ul><p className="text-xs text-muted-foreground mt-4">You can find these anytime in Help → Roles.</p><Button variant="playful" className="w-full mt-5" onClick={() => void done()}>Got it</Button></BottomSheet>;
}

/** Pops open live votes for everyone and shows a "Vote now" banner. */
export function VoteNow({ trip, userId, cards, isPlay, onGoPlay }: { trip: TripWithRole; userId: string; cards: PlayerWithAvatar[]; isPlay: boolean; onGoPlay: () => void }) {
  const { votes, mine, nights, refresh } = useSeason(trip.id, "popup");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [burst, setBurst] = useState(0);
  const auto = useRef<Set<string>>(new Set());
  const open = useMemo(() => votes.filter((v) => v.status === "open"), [votes]);
  const canRun = (v: (typeof votes)[number]) => trip.myRole === "captain" || trip.myRole === "co_captain" || nights.find((n) => n.week_number === v.week_number)?.host_id === userId || v.created_by === userId;
  const pending = open.find((v) => mine[v.id] === undefined && !canRun(v));
  useEffect(() => {
    if (!isPlay || openId || !pending || auto.current.has(pending.id) || dismissed.includes(pending.id)) return;
    auto.current.add(pending.id); setOpenId(pending.id);
  }, [pending?.id, openId, isPlay]);
  const current = votes.find((v) => v.id === openId);
  // Close for members once voting ends; host keeps the reveal on screen.
  useEffect(() => { if (current && current.status !== "open" && !canRun(current)) setOpenId(null); }, [current?.status]);
  async function act(run: () => PromiseLike<{ error: { message: string } | null }>) { setBusy(true); setError(""); const r = await run(); setBusy(false); if (r.error) setError(friendlyError(r.error)); else await refresh(); return !r.error; }
  const banner = (pending ?? open.find((v) => canRun(v))) && !openId;
  const target = pending ?? open.find((v) => canRun(v));
  return <>
    {!isPlay && target && <div className="px-[18px] pb-2"><Button type="button" variant="ghost" className="h-auto min-h-11 px-2 text-xs font-medium text-muted-foreground" onClick={() => { setOpenId(target.id); onGoPlay(); }}>Vote open — go to Play</Button></div>}
    {isPlay && banner && target && <Button type="button" onClick={() => setOpenId(target.id)} className="fixed left-1/2 -translate-x-1/2 bottom-[var(--nav-clearance)] z-40 rounded-full bg-blue text-primary-foreground px-5 py-3 font-extrabold shadow-soft tap-bounce"><Vote size={18} aria-hidden="true" /> {pending ? "Vote now" : "Vote in progress"} →</Button>}
    {/* Open vote shows for everyone; a closed one stays up for whoever can run it, so the host sees the reveal they just triggered. */}
    {isPlay && current && (current.status === "open" || canRun(current)) && <BottomSheet label="Live vote" onClose={() => { setDismissed((d) => [...d, current.id]); setOpenId(null); }}>
      <Confetti burst={burst} />
      <VoteCard vote={current} myOption={mine[current.id]} userId={userId} cards={cards} canRun={canRun(current)} busy={busy} onVote={(i) => void act(() => supabase.rpc("cast_live_vote", { p_vote: current.id, p_option: i }))} onReveal={() => void act(() => supabase.rpc("reveal_live_vote", { p_vote: current.id })).then((ok) => { if (ok) setBurst((b) => b + 1); })} />
      {current.status === "open" && mine[current.id] !== undefined && <p className="mt-3 text-sm text-center text-green font-bold">✓ Vote in! You can change it until voting ends.</p>}
      {error && <p role="alert" className="text-destructive text-sm mt-3">{error}</p>}
    </BottomSheet>}
  </>;
}
