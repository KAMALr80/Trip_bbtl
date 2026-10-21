import { tripDisplayName } from "@/lib/trip-display-name";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, MapPin, Plane, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/PlayerCards";
import { ComingSoon, useTripFeatures, type FeatureKey } from "@/lib/features";
import { loadItinerary, tripDates, tripToday, tripTz } from "@/lib/itinerary";
import { friendlyDate } from "@/lib/trip-dates";
import { fmtWhen } from "@/lib/viewer-time";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import iconSuitcase from "@/assets/icon-suitcase.webp";
import iconPostcard from "@/assets/icon-postcard.webp";
import journeyArt from "@/assets/cinematic-journey-map.jpg";
import journeyCoastTop from "@/assets/journey-coast-top.jpg";
import journeyCoastTopSmall from "@/assets/journey-coast-top-768.jpg";
import journeyCoastBottom from "@/assets/journey-coast-bottom.jpg";
import journeyCoastBottomSmall from "@/assets/journey-coast-bottom-768.jpg";
import { useLook } from "@/lib/look";
import { ROOM_COPY } from "@/lib/room-copy";
import { friendlyRange } from "@/lib/trip-dates";
import { TripList } from "./TripList";

type Stop = { id: string; type: "night" | "day" | "activity" | "crown" | "wrapped"; title: string; subtitle: string; date: string; status: "done" | "next" | "future" | "skipped"; winner?: string | null | undefined; week?: number; feature?: FeatureKey | undefined };
type Activity = { id: string; day_date: string; kind: string; title: string | null; released: boolean; revealed: boolean; winner_id: string | null; starts_at: string | null };
type JourneyData = { stops: Stop[]; photoDays: Set<string>; origin: string };
const atHomeNames: Record<string, string> = { takeoff: "Takeoff", call_night: "Call game night", cook: "Cook-off / order-in", build: "Make it challenge", drop: "Little drop", question: "Question vote", passport: "Passport Night" };
const atHomeFeature = (kind: string): FeatureKey | undefined => kind === "question" ? "qotw" : undefined;

export function JourneyMap({ trip, members, cards, onBack, onOpenStop, trips = [], onSelectTrip, onPlanTrip, onJoinTrip, onTripsChanged }: { onTripsChanged?: () => void | Promise<void>; trip: TripWithRole; members: Member[]; cards: PlayerWithAvatar[]; onBack: () => void; onOpenStop: (stop: Stop) => void; trips?: TripWithRole[]; onSelectTrip?: ((id: string) => void) | undefined; onPlanTrip?: (() => void) | undefined; onJoinTrip?: (() => void) | undefined }) {
  const cinematic = useLook("journey") === "cinematic";
  const { level, on } = useTripFeatures(trip.id);
  const [data, setData] = useState<JourneyData | null>(null);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const atHome = trip.kind === "at_home";
  const calendarOn = on("calendar"), photoOn = on("photo_wall"), wrappedOn = on("wrapped"), qotwOn = on("qotw"), atHomeOn = on("at_home");
  useEffect(() => {
    if (level === null || (atHome && !atHomeOn)) return;
    let live = true;
    setData(null); setError("");
    const load = async () => {
      const today = tripToday(tripTz(trip));
      const now = Date.now();
      const [nightRes, gameRes, scoreRes, planRes, photoRes] = await Promise.all([
        !atHome && calendarOn ? supabase.from("game_nights").select("week_number,starts_at,skipped,game_number,game_revealed").eq("trip_id", trip.id).order("starts_at") : Promise.resolve({ data: [], error: null }),
        !atHome && calendarOn ? supabase.from("game_catalog").select("number,name") : Promise.resolve({ data: [], error: null }),
        !atHome && calendarOn ? supabase.from("game_scores").select("week_number,user_id,won").eq("trip_id", trip.id).eq("won", true) : Promise.resolve({ data: [], error: null }),
        atHome ? supabase.rpc("at_home_plan", { p_trip: trip.id }) : loadItinerary(trip.id).then(r => ({ data: r.days, error: null })).catch(error => ({ data: [], error })),
        photoOn ? supabase.rpc("trip_photos", { p_trip: trip.id }) : Promise.resolve({ data: [], error: null }),
      ]);
      const failed = [nightRes, gameRes, scoreRes, planRes, photoRes].find(r => r.error);
      if (failed?.error) throw failed.error;
      const photoDays = new Set((photoRes.data ?? []).map(p => p.day_date));
      const itinerary = !atHome ? planRes.data as { date: string; city: string; note?: string; flights?: { from: string }[] }[] : [];
      const departureNote = itinerary.find(d => /\b(?:fly|flight|depart|travel)\b/i.test(d.note ?? ""))?.note ?? "";
      const fromNote = departureNote.match(/\b(?:out of|from)\s+([A-Z]{3}|[A-Za-z][A-Za-z .-]{2,35}?)(?=\s*(?:\(|to\b|,|$))/i)?.[1]?.trim();
      const firstFlight = itinerary.flatMap(d => d.flights ?? []).find(f => f.from?.trim() && !/\b(?:bangkok|bkk)\b/i.test(f.from));
      const origin = fromNote || firstFlight?.from?.trim() || "Home";
      let stops: Stop[] = [];
      if (atHome) {
        const homeToday = (planRes.data as (Activity & { today: string })[] | null)?.[0]?.today ?? today;
        stops = (planRes.data as Activity[] ?? []).filter(a => a.kind !== "question" || qotwOn).map(a => ({
          id: a.id, type: "activity", title: atHomeNames[a.kind] ?? "At Home stop",
          subtitle: a.released ? (a.title || atHomeNames[a.kind] || "At Home") : "Opens on this day",
          date: a.day_date, status: a.day_date < homeToday ? "done" : "future",
          winner: a.released && a.revealed ? a.winner_id : null, feature: atHomeFeature(a.kind),
        }));
      } else {
        const nights = nightRes.data ?? [];
        const games = gameRes.data ?? [];
        const scores = scoreRes.data ?? [];
        stops = nights.map((n, i) => ({ id: `night-${n.week_number}`, type: "night" as const,
          title: i === nights.length - 1 ? "Final Call Night" : `Week ${n.week_number}`,
          subtitle: n.game_revealed ? (games.find(g => g.number === n.game_number)?.name ?? "Game night") : "Mystery game",
          date: n.starts_at, week: n.week_number,
          status: n.skipped ? "skipped" as const : new Date(n.starts_at).getTime() + 3 * 3600000 < now ? "done" as const : "future" as const,
          winner: new Date(n.starts_at).getTime() + 3 * 3600000 < now ? scores.find(s => s.week_number === n.week_number && s.won)?.user_id : null,
          feature: "calendar" as const,
        }));
        stops.push(...tripDates(trip).map((date, i) => ({ id: `day-${date}`, type: "day" as const, title: `Trip day ${i + 1}`,
          subtitle: itinerary.find(d => d.date === date)?.city || trip.destination,
          date, status: date < today ? "done" as const : "future" as const,
        })));
        if (trip.season_scoring !== false) stops.push({ id: "crown", type: "crown", title: "Crowning", subtitle: "The season's champion", date: trip.end_date, status: trip.ended_at ? "done" : "future" });
      }
      if (wrappedOn) stops.push({ id: "wrapped", type: "wrapped", title: atHome ? "Destination postcard" : "Trip Wrapped", subtitle: atHome ? trip.destination : "The moments we made", date: trip.end_date, status: trip.ended_at ? "done" : "future", feature: "wrapped" });
      if (!atHome && !calendarOn) stops.unshift({ id: "calendar-soon", type: "night", title: "Game nights", subtitle: "Coming soon", date: trip.start_date, status: "future", feature: "calendar" });
      if (!wrappedOn) stops.push({ id: "wrapped-soon", type: "wrapped", title: atHome ? "Destination postcard" : "Trip Wrapped", subtitle: "Coming soon", date: trip.end_date, status: "future", feature: "wrapped" });
      const first = stops.findIndex(s => s.status === "future");
      if (first >= 0) { const next = stops[first]; if (next) stops[first] = { ...next, status: "next" }; }
      if (live) setData({ stops, photoDays, origin });
    };
    void load().catch(() => { if (live) setError("Couldn't open this journey. Try again."); });
    return () => { live = false; };
  }, [trip.id, trip.start_date, trip.end_date, trip.ended_at, level, calendarOn, photoOn, wrappedOn, qotwOn, atHomeOn, refreshKey, atHome]);
  const stops = data?.stops ?? [];
  const current = stops.findIndex(s => s.status === "next");
  const takeoff = stops.findIndex(s => s.title === "Final Call Night" || s.title === "Takeoff");
  const remaining = takeoff >= 0 ? stops.slice(Math.max(0, current), takeoff + 1).filter(s => s.status !== "skipped").length : 0;
  const chosen = stops.find(s => s.id === selected);
  const winnerCard = (id: string | null | undefined) => cards.find(c => c.user_id === id);
  return <section className={`journey-page pb-8 ${cinematic ? "cinematic-journey" : ""}`} aria-label={`${tripDisplayName(trip.name)} journey map`}>
    <div className="flex items-center justify-between"><Button variant="ghost" onClick={onBack}><ArrowLeft size={18}/> Back</Button><Button variant="ghost" size="icon" aria-label="Refresh journey" onClick={() => setRefreshKey(k => k + 1)}><RefreshCw size={18}/></Button></div>
    {cinematic ? <header className="cinematic-journey-heading"><p className="eyebrow text-gold">THE JOURNEY CONTINUES</p><h1 className="font-display text-4xl font-extrabold mt-2 break-words">Journey</h1><p className="text-sm mt-2">{ROOM_COPY.journey}</p><p className="text-sm mt-2">{tripDisplayName(trip.name)} · {trip.destination} · {friendlyRange(trip.start_date, trip.end_date)}</p><Button variant="outline" className="mt-4 border-gold text-gold" onClick={onBack}>✈ View trip details <ArrowRight size={16}/></Button></header> : <><p className="eyebrow text-blue mt-5">THE ROUTE · {atHome ? "AT HOME" : trip.destination.toUpperCase()}</p><h1 className="font-display text-3xl font-extrabold mt-1">Journey <span aria-hidden="true">🗺️</span></h1><p className="text-sm text-muted-foreground mt-2">{ROOM_COPY.journey}</p><p className="text-sm text-muted-foreground mt-2">{tripDisplayName(trip.name)} · {trip.destination}</p></>}
    {level !== null && atHome && !atHomeOn ? <ComingSoon title="At Home"/> : level === null || (!data && !error) ? <div className="mt-8 h-72 rounded-3xl bg-muted animate-pulse" aria-busy="true"/> : error ? <p role="alert" className="text-destructive mt-8">{error}</p> : <>
      {takeoff >= 0 && current >= 0 && current <= takeoff && <p className="journey-distance mt-6">✈ {remaining} {remaining === 1 ? "stop" : "stops"} to Takeoff</p>}
      <div className="journey-map mt-5">
        {cinematic && <div className="cinematic-journey-art" aria-hidden="true">{Array.from({ length: Math.max(2, Math.ceil((stops.length * 145 + 200) / 450)) }, (_, i) => {
          const full = i % 2 ? journeyCoastBottom : journeyCoastTop;
          const small = i % 2 ? journeyCoastBottomSmall : journeyCoastTopSmall;
          return <picture key={i}><img src={full} srcSet={`${small} 768w, ${full} 1536w`} sizes="(max-width: 520px) calc(100vw - 40px), 480px" alt="" loading="lazy" width={1536} height={1920}/></picture>;
        })}</div>}
        <div className="journey-terrain" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>
        <div className="journey-endpoint"><MapPin size={20}/><div><strong>{atHome ? "Your place" : data?.origin ?? "Home"}</strong><small>{atHome ? "Bags unpacked, imagination on" : "Squad's starting point"}</small></div></div>
        {stops.length ? stops.map((stop, i) => {
          const isCurrent = i === current;
          const winner = winnerCard(stop.winner);
          return <div className={`journey-leg ${i % 2 ? "journey-leg-right" : ""}`} key={stop.id}>
            <Button variant="ghost" className={`journey-stop ${stop.status === "skipped" ? "journey-skipped" : ""} ${isCurrent ? "journey-current" : ""}`} onClick={() => setSelected(stop.id)} aria-label={`${stop.title}, ${stop.subtitle}, ${stop.status}`}>
               <span className="journey-marker" aria-hidden="true">{cinematic ? String(i + 1).padStart(2, "0") : stop.status === "skipped" ? <X size={21}/> : stop.status === "done" ? <Check size={21}/> : stop.title === "Final Call Night" ? <Plane size={21}/> : stop.type === "wrapped" ? <img src={iconPostcard} alt=""/> : stop.type === "crown" ? "👑" : stop.type === "day" ? "📍" : "✦"}</span>
              {cinematic && <img src={journeyArt} alt="" className="cinematic-stop-photo" loading="lazy" width={1024} height={640}/>}
               <span className="journey-stop-copy"><strong>{stop.title}</strong><small>{stop.subtitle}</small><em>{stop.status === "skipped" ? "Skipped" : stop.feature && !on(stop.feature) ? "Coming soon" : stop.type === "night" ? fmtWhen(stop.date, trip.home_timezone || trip.trip_timezone) : friendlyDate(stop.date.slice(0,10))}</em></span>
              {stop.status === "done" && <span className="journey-stamp">{winner ? <Avatar url={winner.avatarUrl} name={winner.game_name || "Winner"} className="size-7"/> : "✓"}</span>}
            </Button>
            {isCurrent && <div className="journey-suitcase" aria-label="You are here"><img src={iconSuitcase} alt=""/><span>YOU ARE HERE</span><div className="flex -space-x-2" aria-hidden="true">{members.slice(0,3).map(m => { const c = winnerCard(m.user_id); return <Avatar key={m.user_id} name={c?.game_name || m.display_name || "Player"} url={c?.avatarUrl} className="size-6 border-2 border-background"/>; })}</div></div>}
          </div>;
        }) : <p className="text-sm text-muted-foreground px-5 py-8">The route will fill in as your squad plans the trip.</p>}
        <div className="journey-endpoint journey-arrival"><MapPin size={20}/><div><strong>{trip.destination}</strong><small>{atHome ? "Postcard destination" : "Arrivals & memories"}</small></div></div>
      </div>
      {chosen && <div role="dialog" aria-label={`${chosen.title} stop`} className="journey-detail mt-5"><div className="flex justify-between items-start gap-3"><div><p className="eyebrow text-orange">{chosen.status === "skipped" ? "SKIPPED STOP" : chosen.status === "done" ? "STAMPED STOP" : "UP AHEAD"}</p><h2 className="font-display text-xl font-extrabold mt-1">{chosen.title}</h2></div><Button variant="ghost" size="icon" aria-label="Close stop" onClick={() => setSelected(null)}><X size={18}/></Button></div>
        <p className="text-sm mt-2">{chosen.subtitle}</p><p className="text-xs text-muted-foreground mt-1">{chosen.type === "night" ? fmtWhen(chosen.date, trip.home_timezone || trip.trip_timezone) : friendlyDate(chosen.date.slice(0,10))}</p>
        {chosen.winner && <p className="text-sm font-semibold text-green mt-3 flex items-center gap-2"><Avatar url={winnerCard(chosen.winner)?.avatarUrl} name={winnerCard(chosen.winner)?.game_name || "Winner"} className="size-7"/> Night winner · {winnerCard(chosen.winner)?.game_name || "Player"}</p>}
        {data?.photoDays.has(chosen.date.slice(0,10)) && photoOn && <p className="text-sm text-blue mt-3">📸 Photos from this stop</p>}
        {chosen.feature && !on(chosen.feature) ? <ComingSoon title={chosen.title} compact/> : <Button variant="outline" className="mt-4 w-full justify-between" onClick={() => onOpenStop(chosen)}>{chosen.type === "night" ? "Open game night calendar" : chosen.type === "day" ? "Open day & photos" : chosen.type === "activity" ? "Open At Home Play" : chosen.type === "crown" ? "Open season results" : "Open Trip Wrapped"}<ArrowRight size={17}/></Button>}
      </div>}
    </>}
    {cinematic && <section className="mt-8 border-t border-border pt-6" aria-label="My Trips"><h2 className="font-display text-2xl font-extrabold">My Trips</h2><div className="mt-4"><TripList trips={trips} id="journey-trips" onSelect={(id) => onSelectTrip?.(id)} {...(onTripsChanged ? { onChanged: onTripsChanged } : {})}/></div><div className="grid grid-cols-2 gap-2 mt-4">{onPlanTrip && <Button variant="playful" onClick={onPlanTrip}>Plan a Trip</Button>}{onJoinTrip && <Button variant="outline" onClick={onJoinTrip}>Join with Code</Button>}</div></section>}
   </section>;
}
export type JourneyStop = Stop;
