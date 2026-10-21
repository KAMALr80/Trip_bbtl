import { tripDisplayName } from "@/lib/trip-display-name";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadItinerary, type ItineraryDay } from "@/lib/itinerary";
import { dayTag, EXPLORER_SQUARES, FALLBACK_QUESTS, PHOTO_THEMES, seededShuffle, tagEmoji } from "@/lib/trip-games";
import type { TripWithRole } from "@/lib/trips";

export function PracticeDay({ trip, onBack }: { trip: TripWithRole; onBack: () => void }) {
  const [plan, setPlan] = useState<ItineraryDay | null>(null);
  const [tag, setTag] = useState<"Explore" | "Party" | "Chill" | "Travel">("Explore");
  const [marks, setMarks] = useState<number[]>([]);
  const [quests, setQuests] = useState<number[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    loadItinerary(trip.id).then(({ days, tags }) => {
      if (!alive) return;
      const sample = days.find(d => d.date >= trip.start_date && d.date <= trip.end_date && dayTag(d.date, days, tags) !== "Travel") ?? days.find(d => d.date >= trip.start_date);
      setPlan(sample ?? { date: trip.start_date, city: trip.destination, stays: [], flights: [], spots: [] });
      if (sample) setTag(dayTag(sample.date, days, tags));
    }).catch(() => { if (alive) setError("Couldn't load your trip plan. Try again."); });
    return () => { alive = false; };
  }, [trip.id, trip.start_date, trip.end_date, trip.destination]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  const city = plan?.city || trip.destination;
  const squares = seededShuffle(EXPLORER_SQUARES, `${trip.id}-${plan?.date ?? trip.start_date}`).slice(0, 9);
  const tasks = plan?.spots?.length ? plan.spots.slice(0, 3).map(spot => `Explore ${spot.name} in ${city}`) : FALLBACK_QUESTS.map(q => `${q} in ${city}`);
  return <main className="pb-28"><Button variant="ghost" className="-ml-2" onClick={onBack}><ArrowLeft/> Captain Tools</Button>
    <p className="eyebrow mt-5 text-green">PRACTICE · NOTHING IS SAVED</p><h1 className="font-display text-3xl font-extrabold mt-2">{tagEmoji[tag]} {city} day</h1><p className="text-sm text-muted-foreground mt-2">{plan?.date ? new Date(`${plan.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "Sample day"} · {tag} day</p>
    {error && <p role="alert" className="text-destructive mt-4">{error}</p>}
    {!plan ? <p className="mt-8">Loading your trip day…</p> : <>
      <section className="mt-7"><h2 className="font-display text-xl font-extrabold">🎱 Daily Bingo</h2><p className="text-xs text-muted-foreground mt-1">Practice card · {marks.length}/9 squares</p><div className="grid grid-cols-3 gap-2 mt-4">{squares.map((square, i) => <Button key={i} variant="outline" aria-pressed={marks.includes(i)} onClick={() => setMarks(current => current.includes(i) ? current.filter(n => n !== i) : [...current, i])} className={`aspect-square h-auto w-full whitespace-normal rounded-2xl p-2 text-[11px] leading-tight ${marks.includes(i) ? "bg-green text-primary-foreground border-green" : "bg-card border-2 border-border"}`}>{marks.includes(i) && <Check className="size-4 mx-auto"/>}{square}</Button>)}</div></section>
      <section className="mt-8"><h2 className="font-display text-xl font-extrabold">🗺️ Daily challenges</h2><div className="mt-3 space-y-2">{tasks.map((task, i) => <Button key={i} variant="outline" aria-pressed={quests.includes(i)} onClick={() => setQuests(current => current.includes(i) ? current.filter(n => n !== i) : [...current, i])} className="w-full h-auto min-h-14 whitespace-normal justify-start text-left bg-card"><span className="shrink-0">{quests.includes(i) ? "✅" : "◯"}</span>{task}</Button>)}</div></section>
      <section className="mt-8"><h2 className="font-display text-xl font-extrabold">📸 Photo challenge</h2><p className="text-sm text-muted-foreground mt-1">{seededShuffle(PHOTO_THEMES, `${trip.id}-${plan.date}`)[0]}</p><label className="mt-3 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-blue bg-card font-bold text-blue"><Camera className="size-5"/> Choose a practice photo<input type="file" accept="image/*" className="sr-only" onChange={e => { if (photo) URL.revokeObjectURL(photo); setPhoto(e.target.files?.[0] ? URL.createObjectURL(e.target.files[0]) : null); }}/></label>{photo && <img src={photo} alt="Practice photo" className="mt-3 aspect-square w-full rounded-2xl object-cover"/>}</section>
      <p className="mt-8 text-center text-xs text-muted-foreground">Practice stays on this screen only. No stamps, scores, photos or memories are saved.</p>
    </>}
  </main>;
}