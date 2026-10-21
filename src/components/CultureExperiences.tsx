import { useEffect, useRef, useState, type ReactNode } from "react";
import { PreviewShareToggle } from "./ExperiencePreviews";
import { RoomExperienceCard } from "@/components/RoomExperienceCard";
import { useLook } from "@/lib/look";
import cultureCollage from "@/assets/cinematic-culture-collage.jpg";
import homeRoomArt from "@/assets/travel-from-home-room.webp";
import { SAMPLE_EXPERIENCES } from "@/lib/inspiration-samples";
import { ArrowLeft, ArrowRight, Flag, EyeOff, Heart, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { friendlyError } from "@/lib/friendly-error";
import { confirmInApp } from "@/lib/confirm";
import { PlaceBrowser } from "@/components/PlaceBrowser";
import { PlacePicker } from "@/components/PlacePicker";
import { CountryFlag } from "@/components/CountryFlag";
import { Avatar } from "@/components/PlayerCards";
import { dicebearUrl } from "@/lib/player-cards";
import { showOutOfCredits, SOLO_WALLET_MESSAGE } from "@/components/AiCredits";
import { ReportSheet } from "@/components/ReportSheet";
import { countryName, placeLabel, type Place } from "@/lib/places";
import { poolCards, PLAN_QUESTIONS, type CultureCard } from "@/lib/culture-pool";
import { planCultureExperience, summarizeCultureTrip } from "@/lib/culture-exp.functions";
import type { TripWithRole } from "@/lib/trips";
import { SoloGuide } from "@/components/SoloGuide";
import { CultureA2eSetup, type A2eKind } from "@/components/CultureA2eSetup";
import { CULTURE_LAYERS } from "@/lib/culture-pool";
import { ShowcaseInvite } from "@/components/CultureShowcase";

type Track = "home" | "travel";
type Exp = { id: string; creator_id: string; track: Track; trip_id: string | null; title: string; country: string; region: string | null; city: string | null; start_date: string; days: number; prep_days: number | null; visibility: "private" | "squad" | "public"; summary: string | null; started_at: string | null; finished_at: string | null; unlisted_at: string | null; play_mode?: "group" | "solo"; vibe?: string | null; traveler_types?: string[]; a2e_kind?: A2eKind | null; culture_layer?: string | null; finale_format?: string | null; showcase_at?: string | null; showcase_place?: string | null; showcase_code?: string | null; showcase_presented_at?: string | null };
type Day = { id: string; day_number: number; title: string; what_to_do: string; backstory: string; keywords: string[]; points: number; source: string; done_at: string | null; note: string | null; photos: string[]; with_users: string[]; review_stars: number | null; review_text: string | null; place: string | null; fact: string | null; ref_url: string | null; confirmed_by: string | null };
type Shared = { id: string; track: Track; title: string; country: string; region: string | null; city: string | null; days: number; summary: string | null; visibility: string; creator_name: string; avatar_style: string; avatar_seed: string; likes: number; liked: boolean; mine: boolean };
const db = supabase as unknown as { from: (t: string) => any; rpc: (n: string, a?: object) => Promise<{ data: any; error: { message: string } | null }>; storage: typeof supabase.storage };
const TRAVELER_TYPES = [["foodie","Foodie"],["explorer","Explorer"],["culture","Culture buff"],["chill","Chill"],["photographer","Photographer"],["night_owl","Night owl"],["shopper","Shopper"]] as const;
const field = "mt-2 w-full rounded-xl border border-border bg-card p-3 text-base text-foreground outline-none focus:border-primary";
const act = async (action: string, exp: string | null, p: object = {}) => { const { data, error } = await db.rpc("culture_action", { p_action: action, p_exp: exp, p }); if (error) throw new Error(error.message); return data; };
const TRACK_LABEL: Record<Track, string> = { home: "From Home", travel: "On a Trip" };
const VIS: Record<Exp["visibility"], string> = { private: "Private", squad: "Squad", public: "TripJunkies" };

/** Full Travel From Home and Window Seat experiences. All writes go through culture_action. */
export function CultureExperiences({ trips, userId, isFounder, samples, track, initialTripId, canCreate = true, startCreating = false, creationKind, onExitCreate }: { trips: TripWithRole[]; userId: string; isFounder: boolean; samples?: ReactNode; track: Track; initialTripId?: string | undefined; canCreate?: boolean; startCreating?: boolean; creationKind?: A2eKind; onExitCreate?: () => void }) {
  const cinematic = useLook("culture") === "cinematic";
  const [mine, setMine] = useState<Exp[]>([]), [shared, setShared] = useState<Shared[]>([]), [badges, setBadges] = useState<Track[]>([]);
  const [open, setOpen] = useState<string | null>(null), [creating, setCreating] = useState<Track | null>(startCreating ? track : null), [error, setError] = useState("");
  useEffect(() => { if (startCreating) setCreating(track); }, [startCreating, track]);
  async function load() {
    const tripIds = trips.map(t => t.id);
    const [m, g, s, b] = await Promise.all([db.from("culture_experiences").select("*").eq("creator_id", userId).order("created_at", { ascending: false }), tripIds.length ? db.from("culture_experiences").select("*").in("trip_id", tripIds).not("a2e_kind", "is", null).eq("play_mode", "group") : Promise.resolve({ data: [] }), db.rpc("culture_shared", { p_scope: "all" }), db.rpc("culture_badges")]);
    setMine(Array.from(new Map(([...(m.data ?? []), ...(g.data ?? [])] as Exp[]).map(e => [e.id, e])).values())); setShared((s.data ?? []) as Shared[]); setBadges(((b.data ?? []) as { track: Track }[]).map((x) => x.track));
  }
  useEffect(() => { void load(); }, [userId, trips.map(t => t.id).join("|")]);
  if (creating) return creationKind ? <CultureA2eSetup kind={creationKind} onDone={(id) => { setCreating(null); setOpen(id); void load(); }} onBack={() => { setCreating(null); onExitCreate?.(); }} /> : <CreateFlow track={creating} trips={trips} initialTripId={initialTripId} onDone={(id) => { setCreating(null); void load(); if (id) setOpen(id); else onExitCreate?.(); }} />;
  if (open) return <ExperienceView id={open} userId={userId} trips={trips} isFounder={isFounder} onBack={() => { setOpen(null); void load(); if (startCreating) onExitCreate?.(); }} />;
  const like = async (s: Shared) => { try { await act(s.liked ? "unlike" : "like", s.id); void load(); } catch (e) { setError(friendlyError(e)); } };
  const board = (t: Track) => shared.filter((s) => s.track === t && s.likes > 0).sort((a, b) => b.likes - a.likes).slice(0, 10);
  return <section className={`mt-6 min-w-0 room-story-shell ${track === "travel" ? "window-seat-content window-room-scene" : "home-culture-content home-room-scene"}`} aria-label={`${track === "home" ? "Travel From Home" : "Window Seat"} experiences`}>
    {track === "home" && samples}
    {canCreate && <><h2 className="mt-7 font-display text-xl font-extrabold">{track === "home" ? "Show your culture" : "Your travel story"}</h2><Button variant="playful" className="mt-3 w-full min-h-14" onClick={() => setCreating(track)}>{track === "home" ? "Map out your culture" : "Add to Window Seat"} <ArrowRight size={18}/></Button></>}
     {mine.some(e => e.track === track) && <><h3 className="mt-6 font-display text-lg font-extrabold">Your experiences</h3>{mine.filter(e => e.track === track).map((e) => <Button key={e.id} variant="outline" className="mt-2 flex w-full h-auto min-h-14 items-center justify-between gap-2 p-3 text-left" onClick={() => setOpen(e.id)}><span className="min-w-0"><strong className="block truncate">{e.title}</strong><small className="text-muted-foreground"><CountryFlag code={e.country} /> {TRACK_LABEL[e.track]} · {e.days} days · {e.creator_id === userId ? VIS[e.visibility] : "Squad"}{e.finished_at ? " · Finished" : e.started_at ? " · In progress" : " · Planning"}</small></span><ArrowRight size={16} /></Button>)}</>}
    {cinematic && <div className="mt-6 border-t border-border" />}<h3 className="mt-6 font-display text-lg font-extrabold">My Culture Badges</h3>
    <div className="mt-2 flex flex-wrap gap-2"><span className={`rounded-full border border-border px-3 py-1 text-xs font-extrabold ${badges.includes(track) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground opacity-60"}`}>🏅 First Culture Share · {TRACK_LABEL[track]}</span></div>
    <div className="mt-2 flex flex-wrap gap-2 opacity-60" aria-disabled="true">{["Bronze", "Silver", "Gold"].map((t) => <span key={t} className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold">{t}</span>)}</div>
    <p className="mt-1 text-xs text-muted-foreground">Tiers unlock with likes and downloads · coming soon</p>
    <h3 className="mt-6 font-display text-lg font-extrabold">Shared with TripJunkies</h3>
    <PlaceBrowser items={shared.filter(s => s.track === track).map((s) => ({ ...s, id: s.id }))} headline="Explore shared experiences" renderItem={(s) => <SharedCard s={s} onOpen={() => setOpen(s.id)} onLike={() => void like(s)} />} />
    {!shared.some(s => s.track === track) && <p className="mt-2 text-sm text-muted-foreground">No shared experiences yet. Finish one and share it to be first.</p>}
    <div className="mt-6"><h3 className="font-display text-lg font-extrabold">Most Liked · {TRACK_LABEL[track]}</h3>{board(track).length ? <ol className="mt-2 space-y-1">{board(track).map((s, i) => <li key={s.id}><Button variant="ghost" className="flex w-full h-auto min-h-11 items-center gap-2 text-left" onClick={() => setOpen(s.id)}><strong className="w-6">{i + 1}</strong><Avatar url={dicebearUrl(s.avatar_style, s.avatar_seed || s.id)} name={s.creator_name} className="h-8 w-8" /><span className="min-w-0 flex-1 truncate">{s.title} · {s.creator_name}</span><span className="text-sm font-bold">♥ {s.likes}</span></Button></li>)}</ol> : <p className="mt-1 text-sm text-muted-foreground">No likes yet.</p>}</div>
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
  </section>;
}

function SharedCard({ s, onOpen, onLike }: { s: Shared; onOpen: () => void; onLike: () => void }) {
  return <article className="app-card mt-3 min-w-0">
    <div className="flex items-center gap-2"><Avatar url={dicebearUrl(s.avatar_style, s.avatar_seed || s.id)} name={s.creator_name} className="h-9 w-9" /><div className="min-w-0"><strong className="block truncate">{s.creator_name}</strong><small className="text-muted-foreground">{TRACK_LABEL[s.track]} · {placeLabel(s)}</small></div></div>
    <h4 className="mt-2 font-display text-lg font-extrabold">{s.title}</h4>
    {s.summary && <p className="mt-1 line-clamp-3 text-sm">{s.summary}</p>}
    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="playful" onClick={onOpen}>Open <ArrowRight size={14} /></Button><Button size="sm" variant={s.liked ? "green" : "outline"} disabled={s.mine} onClick={onLike}><Heart size={14} /> {s.likes}</Button></div>
  </article>;
}

function SwitchToGroup({ exp, trips, onDone }: { exp: Exp; trips: TripWithRole[]; onDone: () => Promise<void> | void }) {
  const mine = trips.filter((t) => t.myRole === "captain" && !t.is_sandbox);
  const [open, setOpen] = useState(false), [tripId, setTripId] = useState(mine[0]?.id ?? ""), [finale, setFinale] = useState<"two_nights" | "finale_only">("finale_only"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const home = exp.track === "home";
  async function go() {
    setBusy(true); setError("");
    const { error: e } = await db.rpc("culture_switch_group", { p_exp: exp.id, p_trip: tripId, p_format: home ? finale : null });
    setBusy(false); if (e) setError(friendlyError(e)); else { setOpen(false); await onDone(); }
  }
  if (!open) return <Button variant="outline" className="mt-3 w-full min-h-11" onClick={() => setOpen(true)}>Playing with people after all?</Button>;
  return <div className="app-card mt-3 min-w-0">
    <h2 className="font-display text-lg font-extrabold">Play with others</h2>
    <p className="mt-1 text-sm text-muted-foreground">You become the Captain. Your squad joins with your trip's join code, and you get game nights and a leaderboard. Quests you already have stay.</p>
    {mine.length ? <label className="mt-3 block font-bold">Your squad's trip<select className={field} value={tripId} onChange={(e) => setTripId(e.target.value)}>{mine.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      : <p className="mt-3 text-sm">Start a trip first (you'll be its Captain), then come back to switch.</p>}
    {home && <div className="mt-3 grid gap-3">
      <Button variant={finale === "two_nights" ? "playful" : "outline"} disabled={exp.days < 4} className="h-auto min-h-16 flex-col items-start p-4 text-left" onClick={() => setFinale("two_nights")}><strong className="text-lg">Two game nights</strong><span className="text-sm whitespace-normal opacity-80">A video call about halfway through, then an in-person finale and crowning on the last day.{exp.days < 4 ? " Needs 4 or more days." : ""}</span></Button>
      <Button variant={finale === "finale_only" ? "playful" : "outline"} className="h-auto min-h-16 flex-col items-start p-4 text-left" onClick={() => setFinale("finale_only")}><strong className="text-lg">Just the finale</strong><span className="text-sm whitespace-normal opacity-80">One in-person finale and crowning on the last day.</span></Button>
    </div>}
    <div className="mt-3 flex gap-2"><Button variant="playful" className="min-h-11 flex-1" disabled={busy || !tripId} onClick={() => void go()}>{busy ? "Switching…" : "Switch to With others"}</Button><Button variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>Cancel</Button></div>
    {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
  </div>;
}

function CreateFlow({ track, trips, onDone, initialTripId }: { track: Track; trips: TripWithRole[]; onDone: (id: string | null) => void; initialTripId?: string | undefined }) {
  const [step, setStep] = useState(0), [place, setPlace] = useState<Place>({ country: null, region: null, city: null });
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(""), [days, setDays] = useState(3), [prepDays, setPrepDays] = useState(0), [start, setStart] = useState(new Date().toLocaleDateString("en-CA")), [end, setEnd] = useState(""), [tripId, setTripId] = useState(initialTripId ?? ""), [who, setWho] = useState<"solo" | "group" | null>(null), [types, setTypes] = useState<string[]>([]), [vibe, setVibe] = useState("chill"), [finale, setFinale] = useState<"two_nights" | "finale_only">("finale_only"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const realTrips = trips.filter((t) => !t.is_sandbox);
  const travelDays = end ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 : 0;
  const n = track === "travel" ? travelDays : days;
  const minDays = track === "home" ? 2 : 1, maxDays = track === "home" ? 7 : 12;
  const finaleStep = track === "home" && who === "group";

  async function create() {
    setBusy(true); setError("");
    try {
      const label = place.city || place.region || countryName(place.country!);
      const typed = (titleRef.current?.value ?? title).trim();
      const r = await act("create", null, { track, trip_id: who === "solo" ? "" : tripId, title: typed || `${label} ${track === "home" ? "From Home" : "Trip"}`, country: place.country, region: place.region ?? "", city: place.city ?? "", start_date: start, days: n });
      const { error: modeError } = await db.rpc("set_culture_mode", { p_exp: (r as { id: string }).id, p_mode: who ?? "group", p_types: who === "solo" ? types : [], p_vibe: vibe }); if (modeError) throw new Error(modeError.message);
      if (track === "home") { const { error: fErr } = await db.rpc("set_culture_finale", { p_exp: (r as { id: string }).id, p_format: who === "solo" ? null : finale }); if (fErr) throw new Error(fErr.message); }
      if (track === "travel") { const { error: prepError } = await db.rpc("set_window_prep", { p_exp: (r as { id: string }).id, p_days: prepDays || null }); if (prepError) throw new Error(prepError.message); }
      onDone((r as { id: string }).id);
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return <section className={`mt-6 min-w-0 pb-8 ${track === "travel" ? "window-seat-content" : "home-culture-content"}`}>
    <Button variant="ghost" onClick={() => step ? setStep(step === 4 ? 1 : step === 2 && finaleStep ? 4 : step === 1 ? 3 : step === 3 ? 0 : step - 1) : who ? setWho(null) : onDone(null)}><ArrowLeft /> {step || who ? "Back" : track === "home" ? "Travel From Home" : "Window Seat"}</Button>
    <p className="eyebrow mt-3 text-blue">{TRACK_LABEL[track].toUpperCase()} · STEP {!who ? 1 : ({ 0: 2, 3: 3, 1: 4, 4: 5, 2: finaleStep ? 6 : 5 } as Record<number, number>)[step]} OF {finaleStep ? 6 : 5}</p>
    {!who ? <><h1 className="mt-2 font-display text-2xl font-extrabold">Who's playing?</h1>
      <div className="mt-4 grid gap-3"><Button variant="outline" className="h-auto min-h-16 flex-col items-start p-4 text-left" onClick={() => { setWho("solo"); setStep(0); }}><strong className="text-lg">Solo</strong><span className="text-sm text-muted-foreground whitespace-normal">Just you. Quests for one, a personal fare-class goal, no leaderboard. Your photos become your own guide.</span></Button>
      <Button variant="outline" className="h-auto min-h-16 flex-col items-start p-4 text-left" onClick={() => { setWho("group"); setStep(0); }}><strong className="text-lg">With others</strong><span className="text-sm text-muted-foreground whitespace-normal">Play with your squad: Captain, invite code, game nights, Show &amp; Tell, leaderboard and crowning.</span></Button></div></>
    : step === 0 ? <><h1 className="mt-2 font-display text-2xl font-extrabold">{track === "home" ? "Which culture?" : "Where are you going?"}</h1>
      <div className="mt-5"><PlacePicker value={place} onChange={setPlace} items={SAMPLE_EXPERIENCES} /></div>
      <Button variant="playful" className="mt-5 w-full" disabled={!place.country} onClick={() => setStep(3)}>Next <ArrowRight /></Button></>
    : step === 3 ? <><h1 className="mt-2 font-display text-2xl font-extrabold">{who === "solo" ? "What kind of traveler are you?" : "Pick your group vibe"}</h1>
      {who === "solo" && <><p className="mt-1 text-sm text-muted-foreground">Pick up to 2. Your quests follow your style.</p><div className="mt-4 grid grid-cols-2 gap-2">{TRAVELER_TYPES.map(([k, l]) => <Button key={k} variant={types.includes(k) ? "playful" : "outline"} className="min-h-11" disabled={!types.includes(k) && types.length >= 2} onClick={() => setTypes(types.includes(k) ? types.filter((x) => x !== k) : [...types, k])}>{l}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">Night owl is for travelers 21 and older.</p><p className="mt-5 font-bold">Your vibe</p></>}
      <div className="mt-3 grid grid-cols-3 gap-2">{([["family","Family"],["chill","Chill"],["party","Party (21+)"]] as const).map(([k, l]) => <Button key={k} variant={vibe === k ? "playful" : "outline"} className="min-h-11" onClick={() => setVibe(k)}>{l}</Button>)}</div>
      <Button variant="playful" className="mt-5 w-full" onClick={() => setStep(1)}>Next <ArrowRight /></Button></>
    : step === 1 ? <><h1 className="mt-2 font-display text-2xl font-extrabold">{track === "home" ? "How many days?" : "Your dates"}</h1>
      {track === "home" ? <><div className="mt-4 grid grid-cols-6 gap-2">{Array.from({ length: 6 }, (_, i) => i + 2).map((d) => <Button key={d} variant={days === d ? "playful" : "outline"} className="min-h-11" onClick={() => { setDays(d); if (d < 4) setFinale("finale_only"); }}>{d}</Button>)}</div><label className="mt-4 block font-bold">Start date<input type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></label></>
        : <><label className="mt-4 block font-bold">First day<input type="date" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></label><label className="mt-3 block font-bold">Last day<input type="date" className={field} value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label><label className="mt-3 block font-bold">Preparation before the trip (optional)<select className={field} value={prepDays} onChange={(e) => setPrepDays(Number(e.target.value))}><option value={0}>No preparation</option>{Array.from({length:10},(_,i) => <option key={i+1} value={i+1}>{i+1} {i ? "days" : "day"}</option>)}</select></label>{end && (travelDays < 1 || travelDays > 12) && <p className="mt-2 text-sm text-destructive">Pick 1–12 days.</p>}</>}
      <Button variant="playful" className="mt-5 w-full" disabled={n < minDays || n > maxDays} onClick={() => setStep(finaleStep ? 4 : 2)}>Next <ArrowRight /></Button></>
    : step === 4 ? <><h1 className="mt-2 font-display text-2xl font-extrabold">Finale format</h1>
      <div className="mt-4 grid gap-3">
        <Button variant={finale === "two_nights" ? "playful" : "outline"} disabled={days < 4} className="h-auto min-h-16 flex-col items-start p-4 text-left" onClick={() => setFinale("two_nights")}><strong className="text-lg">Two game nights</strong><span className="text-sm whitespace-normal opacity-80">A video call about halfway through, then an in-person finale and crowning on the last day.{days < 4 ? " Needs 4 or more days." : ""}</span></Button>
        <Button variant={finale === "finale_only" ? "playful" : "outline"} className="h-auto min-h-16 flex-col items-start p-4 text-left" onClick={() => setFinale("finale_only")}><strong className="text-lg">Just the finale</strong><span className="text-sm whitespace-normal opacity-80">One in-person finale and crowning on the last day. Best for short experiences.</span></Button>
      </div>
      <Button variant="playful" className="mt-5 w-full" onClick={() => setStep(2)}>Next <ArrowRight /></Button></>
    : <><h1 className="mt-2 font-display text-2xl font-extrabold">Name it</h1>
      <label className="mt-4 block font-bold">Title<input ref={titleRef} name="title" className={field} maxLength={120} placeholder={`${place.city || countryName(place.country!)} ${track === "home" ? "From Home" : "Trip"}`} value={title} onChange={(e) => setTitle(e.target.value)} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} /></label>
      {who === "group" && <><label className="mt-4 block font-bold">Your squad's trip<select className={field} value={tripId} onChange={(e) => setTripId(e.target.value)}><option value="">Choose a trip</option>{realTrips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <p className="mt-2 text-xs text-muted-foreground">{realTrips.length ? "Your squad sees it (if you choose Squad), confirms your cards and gets tagged. Captains and Co-Captains can use the trip's AI credits." : "Start a trip or join one with a code first, then come back to play with others."}</p></>}
      {who === "solo" && <p className="mt-3 text-sm text-muted-foreground">Solo: no Captain, no code. One sealed quest unseals on each trip day.</p>}
      <Button variant="playful" className="mt-5 w-full" disabled={busy || (who === "group" && !tripId)} onClick={() => void create()}>{busy ? "Creating…" : "Create and plan"} <ArrowRight /></Button></>}
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
  </section>;
}

function ExperienceView({ id, userId, trips, isFounder, onBack }: { id: string; userId: string; trips: TripWithRole[]; isFounder: boolean; onBack: () => void }) {
  const [exp, setExp] = useState<Exp | null>(null), [days, setDays] = useState<Day[]>([]), [urls, setUrls] = useState<Record<string, string>>({}), [people, setPeople] = useState<{ user_id: string; display_name: string }[]>([]);
  const [draft, setDraft] = useState<CultureCard[] | null>(null), [asking, setAsking] = useState(false), [answers, setAnswers] = useState<string[]>(PLAN_QUESTIONS.map(() => "")), [logging, setLogging] = useState<number | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [reporting, setReporting] = useState(false);
  const isCreator = exp?.creator_id === userId;
  async function load() {
    const [e, d] = await Promise.all([db.from("culture_experiences").select("*").eq("id", id).maybeSingle(), db.rpc("culture_days", { p_exp: id })]);
    setExp(e.data as Exp | null); const list = (d.data ?? []) as Day[]; setDays(list);
    const paths = list.flatMap((x) => x.photos); if (paths.length) { const { data } = await db.storage.from("culture-photos").createSignedUrls(paths, 3600); setUrls(Object.fromEntries((data ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""]))); }
  }
  useEffect(() => { void load(); }, [id]);
  useEffect(() => { if (exp?.trip_id && trips.some((t) => t.id === exp.trip_id)) void supabase.rpc("trip_roster", { p_trip: exp.trip_id }).then(({ data }) => setPeople(((data ?? []) as { user_id: string; display_name: string | null }[]).filter((p) => p.user_id !== userId).map((p) => ({ user_id: p.user_id, display_name: p.display_name ?? "Player" })))); }, [exp?.trip_id, userId, trips]);
  if (!exp) return <section className="mt-6"><Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button><p className="mt-4 text-sm">Loading…</p></section>;
  const label = exp.city || exp.region || countryName(exp.country);
  const trip = trips.find((t) => t.id === exp.trip_id);
  const canSpend = !!trip && ["captain", "co_captain"].includes(trip.myRole);
  const run = async (f: () => Promise<unknown>) => { setBusy(true); setError(""); try { await f(); await load(); } catch (e) { const m = friendlyError(e); if (String(e).includes("NO_TRIP_CREDITS")) showOutOfCredits(false, SOLO_WALLET_MESSAGE); else setError(m); } finally { setBusy(false); } };
  const planned = days.length >= exp.days;

  // Planning
  if (isCreator && !exp.started_at && (draft || !planned)) {
    const cards = draft ?? [];
    return <section className={`mt-6 min-w-0 pb-8 room-story-shell ${exp.track === "travel" ? "window-seat-content window-room-scene" : "home-culture-content home-room-scene"}`}>
      <Button variant="ghost" onClick={onBack}><ArrowLeft /> {exp.track === "home" ? "Travel From Home" : "Window Seat"}</Button>
      <RoomExperienceCard room={exp.track === "home" ? "home" : "window"}>
      {exp.play_mode === "solo" && <SwitchToGroup exp={exp} trips={trips} onDone={load} />}
      <p className="eyebrow mt-3 text-blue">PLAN · {exp.days} DAYS · {label.toUpperCase()}</p>
      <h1 className="mt-2 font-display text-2xl font-extrabold">{exp.title}</h1>
       {!draft && !asking && <div className="mt-4 grid gap-3">
         <Button variant="playful" size="lg" onClick={() => canSpend ? setAsking(true) : showOutOfCredits(false, SOLO_WALLET_MESSAGE)}><Sparkles /> {exp.track === "home" ? "Plan it for me" : "Create it for me"} · 2 AI credits</Button>
          <Button variant="outline" size="lg" onClick={() => setDraft(poolCards(exp.track, label, exp.a2e_kind === "inspire" ? Math.min(31, exp.days - days.length) : exp.days, exp.id, (exp.culture_layer ?? null) as Parameters<typeof poolCards>[4], exp.a2e_kind === "inspire" ? days.length + 1 : 1))}>I'll write it · free</Button>
        <p className="text-xs text-muted-foreground">"I'll write it" starts you with ready-made {label} cards you can edit or replace.</p></div>}
      {asking && !draft && <div className="app-card mt-4"><p className="eyebrow">A FEW QUICK QUESTIONS</p>{PLAN_QUESTIONS.map((qq, i) => <label key={qq} className="mt-3 block text-sm font-bold">{qq}<input className={field} maxLength={300} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => j === i ? e.target.value : a))} /></label>)}
         <Button variant="playful" className="mt-4 w-full" disabled={busy} onClick={() => void run(async () => { const r = await planCultureExperience({ data: { id: exp.id, answers: PLAN_QUESTIONS.map((qq, i) => ({ q: qq, a: answers[i] ?? "" })) } }); setDraft(r); setAsking(false); })}>{busy ? "Planning…" : "Build my plan"}</Button>
        <Button variant="ghost" className="mt-2" onClick={() => setAsking(false)}>Back</Button></div>}
      {draft && <>{cards.map((c, i) => <div key={c.day_number} className="app-card mt-3 min-w-0"><p className="eyebrow text-orange">DAY {c.day_number}</p>
        <input className={field} aria-label={`Day ${c.day_number} title`} maxLength={120} value={c.title} onChange={(e) => setDraft(cards.map((x, j) => j === i ? { ...x, title: e.target.value, source: x.source === "ai" ? "ai" : "manual" } : x))} />
        <textarea className={field} rows={2} aria-label="What to do" maxLength={600} value={c.what_to_do} onChange={(e) => setDraft(cards.map((x, j) => j === i ? { ...x, what_to_do: e.target.value } : x))} />
        <textarea className={field} rows={2} aria-label="Backstory" maxLength={600} value={c.backstory} onChange={(e) => setDraft(cards.map((x, j) => j === i ? { ...x, backstory: e.target.value } : x))} />
        <input className={field} aria-label="Search for keywords, comma separated" value={c.keywords.join(", ")} onChange={(e) => setDraft(cards.map((x, j) => j === i ? { ...x, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 4) } : x))} />
        <p className="mt-1 text-xs text-muted-foreground">{c.points} pts · {c.source === "ai" ? "AI plan" : c.source === "pool" ? "Ready-made" : "Your card"}</p></div>)}
         <Button variant="playful" size="lg" className="mt-4 w-full" disabled={busy || cards.some((c) => !c.title.trim() || !c.what_to_do.trim())} onClick={() => void run(async () => { if (exp.a2e_kind) { const { error: saveError } = await db.rpc("culture_a2e_action", { p_exp: exp.id, p_action: "save_days", p_cards: cards }); if (saveError) throw new Error(saveError.message); } else await act("save_days", exp.id, { days: cards }); if (exp.a2e_kind !== "inspire" || days.length + cards.length >= exp.days) await act("start", exp.id); setDraft(null); })}>{exp.a2e_kind === "inspire" && days.length + cards.length < exp.days ? "Save these days · plan more" : "Save and start"} <ArrowRight /></Button></>}
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}</RoomExperienceCard>
    </section>;
  }

  const done = days.filter((d) => d.done_at);
  return <section className={`mt-6 min-w-0 pb-8 room-story-shell ${exp.track === "travel" ? "window-seat-content window-room-scene" : "home-culture-content home-room-scene"}`}>
    <Button variant="ghost" onClick={onBack}><ArrowLeft /> {exp.track === "home" ? "Travel From Home" : "Window Seat"}</Button>
    <RoomExperienceCard room={exp.track === "home" ? "home" : "window"}>
    {exp.play_mode === "solo" && isCreator && !exp.started_at && <SwitchToGroup exp={exp} trips={trips} onDone={load} />}
     <p className="eyebrow mt-3 text-orange">{TRACK_LABEL[exp.track].toUpperCase()} · {placeLabel(exp).toUpperCase()}{exp.culture_layer ? ` · ${CULTURE_LAYERS.find(l => l.id === exp.culture_layer)?.label ?? ""}` : ""}</p>
    {exp.play_mode === "solo" && isCreator && <SoloGuide exp={exp} userId={userId} place={label} />}
    <h1 className="mt-2 font-display text-2xl font-extrabold">{exp.title}</h1>
    <p className="text-sm text-muted-foreground">{done.length} of {exp.days} days done · {done.reduce((s, d) => s + d.points, 0)} pts{exp.finished_at ? " · Wrapped" : ""}</p>
    {isCreator && !exp.started_at && <Button variant="playful" className="mt-3" onClick={() => void run(() => act("start", exp.id))}>Start</Button>}
    {exp.finished_at && <div className="app-card mt-4"><p className="eyebrow text-gold">WRAPPED</p><p className="mt-1 text-sm">{done.length} days · {done.reduce((s, d) => s + d.photos.length, 0)} photos · {done.filter((d) => d.note || d.review_text).length} notes</p>
      {exp.track === "travel" && <ol className="mt-2 space-y-1 text-sm">{done.map((d) => <li key={d.id}>Day {d.day_number}: {d.place || d.title}{d.fact ? ` — ${d.fact}` : ""}{d.ref_url && <> · <a className="text-primary underline" href={d.ref_url} target="_blank" rel="noopener noreferrer">source</a></>}</li>)}</ol>}
      {exp.summary && <p className="mt-3 whitespace-pre-line">{exp.summary}</p>}</div>}
    {days.map((d) => <article key={d.id} className="app-card mt-3 min-w-0">
      <p className="eyebrow text-blue">DAY {d.day_number} · {d.points} PTS</p>
      <h2 className="mt-1 font-display text-lg font-extrabold">{d.title}</h2>
      <p className="mt-1">{d.what_to_do}</p>
      {d.backstory && <p className="mt-2 text-sm text-muted-foreground">{d.backstory}</p>}
      {d.keywords.length > 0 && <p className="mt-2 text-xs">🔎 Search for: {d.keywords.map((k) => <a key={k} className="mr-2 text-primary underline" href={`https://www.google.com/search?q=${encodeURIComponent(k)}`} target="_blank" rel="noopener noreferrer">{k}</a>)}</p>}
      {d.done_at && <div className="mt-3 border-t border-border pt-3">
        {d.photos.length > 0 && <div className="grid grid-cols-3 gap-2">{d.photos.map((p) => urls[p] && <img key={p} src={urls[p]} alt={`Day ${d.day_number}`} width={300} height={300} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />)}</div>}
        {d.review_stars && <p className="mt-2 text-sm">{"★".repeat(d.review_stars)}{"☆".repeat(5 - d.review_stars)} {d.review_text}</p>}
        {d.place && <p className="text-sm">📍 {d.place}</p>}
        {d.note && <p className="mt-1 text-sm">{d.note}</p>}
        {d.with_users.length > 0 && <p className="text-xs text-muted-foreground">With {d.with_users.map((u) => people.find((p) => p.user_id === u)?.display_name ?? "a squadmate").join(", ")}</p>}
        <p className="mt-1 text-xs font-bold">{d.confirmed_by ? d.confirmed_by === exp.creator_id ? "✓ Self-confirmed" : `✓ Confirmed by ${people.find((p) => p.user_id === d.confirmed_by)?.display_name ?? "a squadmate"}` : "Not confirmed yet"}</p>
        {!d.confirmed_by && !exp.finished_at && (isCreator || (exp.track === "travel" && people.length > 0)) && <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => void run(() => act("confirm_day", exp.id, { day_number: d.day_number }))}>{isCreator ? "Confirm my card" : "Confirm their card"}</Button>}
      </div>}
      {isCreator && exp.started_at && !exp.finished_at && (logging === d.day_number ? <LogDay exp={exp} day={d} userId={userId} people={people} onDone={() => { setLogging(null); void load(); }} /> : <Button size="sm" variant={d.done_at ? "ghost" : "playful"} className="mt-3" onClick={() => setLogging(d.day_number)}>{d.done_at ? "Edit" : "I did it"}</Button>)}
    </article>)}
    {isCreator && <div className="app-card mt-5">
      {exp.track === "travel" && <><p className="eyebrow">YOUR SHARED PREVIEW</p><SummaryEditor exp={exp} canSpend={canSpend} onSaved={() => void load()} /></>}
         {!exp.finished_at && <Button variant="playful" className="mt-3 w-full" disabled={busy || !done.length} onClick={() => void run(async () => { if (exp.a2e_kind) { const { error: finishError } = await db.rpc("culture_a2e_action", { p_exp: exp.id, p_action: "finish" }); if (finishError) throw new Error(finishError.message); } else await act("finish", exp.id); })}>Finish · see Wrapped</Button>}
       {exp.a2e_kind === "show" && exp.play_mode === "solo" && <ShowcaseInvite id={exp.id} finished={!!exp.finished_at} at={exp.showcase_at ?? null} place={exp.showcase_place ?? null} code={exp.showcase_code ?? null} presented={exp.showcase_presented_at ?? null} onChanged={() => void load()} />}
       {exp.finished_at && !exp.a2e_kind && <><p className="eyebrow mt-3">WHO CAN SEE THIS</p><div className="mt-2 flex flex-wrap gap-2">{(["private", "squad", "public"] as const).map((v) => <Button key={v} size="sm" variant={exp.visibility === v ? "playful" : "outline"} disabled={busy || (v === "squad" && !exp.trip_id)} onClick={() => void run(() => act("visibility", exp.id, { visibility: v }))}>{VIS[v]}</Button>)}</div><p className="mt-1 text-xs text-muted-foreground">City level only — never exact addresses. TripJunkies sharing is 18+.</p><PreviewShareToggle expId={exp.id}/></>}
      <Button variant="ghost" className="mt-2 text-destructive" onClick={async () => { if (await confirmInApp("Delete this experience?")) await run(async () => { await act("delete", exp.id); onBack(); }); }}>Delete experience</Button>
    </div>}
    {!isCreator && <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" variant="ghost" onClick={() => void run(async () => { await act("hide", exp.id); onBack(); })}><EyeOff size={14} /> Hide</Button>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setReporting(true)}><Flag size={14} /> Report</Button>
      {isFounder && <Button size="sm" variant="outline" onClick={() => void run(() => act("unlist", exp.id))}>{exp.unlisted_at ? "Relist" : "Unlist"}</Button>}
    </div>}
    {reporting && <ReportSheet title="Report this experience" onClose={() => setReporting(false)} onSend={(reason) => run(async () => { await act("report", exp.id, { reason }); onBack(); })} />}
    {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}</RoomExperienceCard>
  </section>;
}

function SummaryEditor({ exp, canSpend, onSaved }: { exp: Exp; canSpend: boolean; onSaved: () => void }) {
  const [text, setText] = useState(exp.summary ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async (t: string) => { await act("set_summary", exp.id, { summary: t }); onSaved(); };
  return <div className="mt-2"><textarea className={field} rows={4} maxLength={1500} placeholder="Write your own preview, or let AI summarize your stops." value={text} onChange={(e) => setText(e.target.value)} />
    <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void save(text).catch((e) => setError(friendlyError(e)))}>Save preview</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (!canSpend) { showOutOfCredits(false, SOLO_WALLET_MESSAGE); return; } setBusy(true); setError(""); try { const s = await summarizeCultureTrip({ data: { id: exp.id } }); setText(s); await save(s); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); } }}><Sparkles size={14} /> {busy ? "Writing…" : "Summarize my trip · 2 AI credits"}</Button></div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}</div>;
}

function LogDay({ exp, day, userId, people, onDone }: { exp: Exp; day: Day; userId: string; people: { user_id: string; display_name: string }[]; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]), [note, setNote] = useState(day.note ?? ""), [withUsers, setWith] = useState<string[]>(day.with_users), [stars, setStars] = useState(day.review_stars ?? 0), [review, setReview] = useState(day.review_text ?? ""), [place, setPlace] = useState(day.place ?? ""), [fact, setFact] = useState(day.fact ?? ""), [ref, setRef] = useState(day.ref_url ?? ""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const travel = exp.track === "travel";
  async function save() {
    setBusy(true); setError("");
    try {
      const photos = [...day.photos];
      for (const f of files.slice(0, 3 - photos.length)) {
        const small = await compressImage(f, 1600, 400_000);
        const path = `${exp.id}/${userId}/${crypto.randomUUID()}.${small.type === "image/png" ? "png" : small.type === "image/webp" ? "webp" : "jpg"}`;
        const { error: up } = await db.storage.from("culture-photos").upload(path, small, { contentType: small.type });
        if (up) throw new Error(up.message); photos.push(path);
      }
      await act("log_day", exp.id, { day_number: day.day_number, photos, note, with_users: withUsers, review_stars: travel && stars ? stars : "", review_text: travel ? review : "", place: travel ? place : "", fact: travel ? fact : "", ref_url: travel ? ref : "" });
      onDone();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return <div className="mt-3 border-t border-border pt-3">
    <label className="block text-sm font-bold">Photos (up to 3){day.photos.length ? ` · ${day.photos.length} saved` : ""}<input type="file" multiple accept="image/jpeg,image/png,image/webp" className={field} onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 3))} /></label>
    {travel && <><p className="mt-3 text-sm font-bold">Review</p><div className="mt-1 flex gap-1">{[1, 2, 3, 4, 5].map((s) => <Button key={s} size="icon" variant="ghost" aria-label={`${s} stars`} onClick={() => setStars(s)}><Star size={20} className={s <= stars ? "fill-current text-gold" : ""} /></Button>)}</div>
      <textarea className={field} rows={2} maxLength={240} placeholder="Two lines about it" value={review} onChange={(e) => setReview(e.target.value)} />
      <input className={field} maxLength={120} placeholder="Place (name or neighborhood, no exact address)" value={place} onChange={(e) => setPlace(e.target.value)} />
      <input className={field} maxLength={200} placeholder="One-line fact about this stop" value={fact} onChange={(e) => setFact(e.target.value)} />
      <input className={field} type="url" maxLength={500} placeholder="https:// link where you learned it" value={ref} onChange={(e) => setRef(e.target.value)} /></>}
    <textarea className={field} rows={2} maxLength={500} placeholder="A short note" value={note} onChange={(e) => setNote(e.target.value)} />
    {people.length > 0 && <><p className="mt-3 text-sm font-bold">Who was with me</p><div className="mt-1 flex flex-wrap gap-2">{people.map((p) => <Button key={p.user_id} size="sm" variant={withUsers.includes(p.user_id) ? "playful" : "outline"} onClick={() => setWith(withUsers.includes(p.user_id) ? withUsers.filter((x) => x !== p.user_id) : [...withUsers, p.user_id])}>{p.display_name}</Button>)}</div></>}
    <Button variant="playful" className="mt-4 w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save day"}</Button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>;
}
