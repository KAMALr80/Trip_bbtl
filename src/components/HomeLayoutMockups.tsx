import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Bell, CalendarDays, Check, Home, MapPinned, Plane, Play, QrCode, Search, SlidersHorizontal, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import iconMap from "@/assets/icon-map.webp";
import iconPassport from "@/assets/icon-passport.webp";
import iconBoarding from "@/assets/icon-boarding-pass.webp";
import iconHome from "@/assets/icon-at-home.webp";
import iconCompass from "@/assets/icon-compass.webp";
import iconTrophy from "@/assets/icon-trophy.webp";
import gameOptionA from "@/assets/game-tile-option-a.webp";
import windowSeatArt from "@/assets/window-seat-room.webp";
import welcomeLetter from "@/assets/welcome-letter.webp";
import heroStandIn from "@/assets/passport-seaside.jpg";
import airportSignoff from "@/assets/home-airport-signoff-diverse.jpg";
import airportSignoffSmall from "@/assets/home-airport-signoff-diverse-768.webp";
import travelerOne from "@/assets/avatars/traveler-01.webp";
import travelerTwo from "@/assets/avatars/traveler-02.webp";
import travelerThree from "@/assets/avatars/traveler-03.webp";
import { BrandLockup } from "@/components/BrandLockup";

type State = "scheduled" | "welcome" | "quest";
type Layout = "classic" | "one" | "two" | "three" | "four" | "five" | "six" | "seven";
const states: { id: State; label: string }[] = [
  { id: "scheduled", label: "Game night scheduled" },
  { id: "welcome", label: "No game night (Welcome Letter)" },
  { id: "quest", label: "Active quest" },
];
const layouts: { id: Layout; label: string; desc: string }[] = [
  { id: "classic", label: "Classic (circle)", desc: "Today's Home: glowing bubbles circling the next game night." },
  { id: "one", label: "Option 1 · Trips first", desc: "Big Going on a Trip photo card first, then game night and more ways to play." },
  { id: "two", label: "Option 2 · Compact hero", desc: "Shorter trip banner so game night and Discovery fit without scrolling." },
  { id: "three", label: "Option 3 · Split hero", desc: "Plan a trip and Join with code as two halves of one photo card." },
  { id: "four", label: "Option 4 · Departure Board", desc: "A departures board where each row is a way to play, with live status." },
  { id: "five", label: "Option 5 · Reference Home", desc: "Ty's reference: search, photo hero, glowing game night card, four bubbles." },
  { id: "six", label: "Option 6 · Reference Home + board", desc: "The reference layout with a photographic departures board as the hero." },
  { id: "seven", label: "Option 7 · Blend", desc: "Photo hero with a slim departures strip showing only what needs you now." },
];
const orbitItems = [
  { label: "My trips", subtitle: "Where we're headed", img: iconMap },
  { label: "Passport Junkie", subtitle: "Collect your stamps", img: iconPassport },
  { label: "Join with Code", subtitle: "Your Captain's code", img: iconBoarding },
  { label: "Travel From Home", subtitle: "Your couch, any country", img: iconHome },
  { label: "Explore the App", subtitle: "See what's inside", img: iconCompass },
  { label: "Games on Flight", subtitle: "Free to play, no account", img: gameOptionA },
  { label: "Leaderboards", subtitle: "Find a squad", img: iconTrophy },
  { label: "Window Seat", subtitle: "Bring the trip to them", img: windowSeatArt },
];
const moreWays = [
  { label: "Explore a Culture", img: iconHome },
  { label: "Inspire Someone", img: windowSeatArt },
  { label: "Game Night", img: gameOptionA },
  { label: "Passport Junkie", img: iconPassport },
];

export function HomeLayoutMockups({ onBack, standalone = false }: { onBack?: () => void; standalone?: boolean }) {
  const [state, setState] = useState<State>("scheduled");
  const [focused, setFocused] = useState<Layout>("classic");
  const [opened, setOpened] = useState("");
  const visit = (label: string) => setOpened(`${label} · sample only`);
  return <main className="home-mock-page pb-8">
    {onBack && <Button variant="ghost" onClick={onBack}><ArrowLeft /> Test Lab</Button>}
    <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-blue">FOUNDER PREVIEW · SAMPLE ONLY</p><h1 className="font-display text-3xl font-extrabold">Home layouts</h1></div><p className="text-sm text-muted-foreground">Current Home stays Classic.</p></div>
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Home sample state">{states.map(option => <Button key={option.id} variant={state === option.id ? "playful" : "outline"} aria-pressed={state === option.id} className="min-h-11" onClick={() => { setState(option.id); setOpened(""); }}>{option.label}</Button>)}</div>
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Focus layout">{layouts.map(option => <Button key={option.id} variant={focused === option.id ? "secondary" : "ghost"} aria-pressed={focused === option.id} className="min-h-11" onClick={() => { setFocused(option.id); if (!standalone) document.getElementById(`home-mock-${option.id}`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }}>{option.label}</Button>)}</div>
    {opened && <p role="status" className="mt-3 text-sm text-blue">{opened}</p>}
    <div className={standalone ? "mt-5 flex justify-center" : "home-mock-gallery mt-5"} aria-label="Eight Home layout comparisons">{layouts.filter(l => !standalone || l.id === focused).map(({ id, label, desc }) => <div key={id} id={`home-mock-${id}`} className="home-mock-column" style={standalone ? { margin: "0 auto" } : undefined}><h2 className="font-display text-lg font-bold">{label}</h2><p className="text-sm text-muted-foreground mb-3 max-w-[390px]">{desc}</p><div className="home-mock-phone"><div className="home-mock-content">{["five", "six", "seven"].includes(id) ? <ReferenceHeader visit={visit}/> : <><p className="eyebrow text-blue">YOUR DEPARTURE LOUNGE</p><h3 className="font-display text-3xl font-extrabold mt-2">Where to, Ty?</h3></>}{id === "classic" ? <Classic state={state} visit={visit} /> : id === "four" ? <DepartureBoard state={state} visit={visit}/> : id === "five" || id === "six" || id === "seven" ? <ReferenceHome layout={id} state={state} visit={visit}/> : <TripsFirst layout={id} state={state} visit={visit}/>}</div><nav className="home-mock-tabs" aria-label={`${label} sample tabs`}>{[Home, Play, CalendarDays, Users, UserRound].map((Icon, i) => <Button key={i} variant="ghost" className="home-mock-tab" aria-label={["Home","Play","Trip","Squad","Me"][i]} onClick={() => visit(["Home","Play","Trip","Squad","Me"][i] ?? "Home")}><Icon size={20}/><small>{["Home","Play","Trip","Squad","Me"][i]}</small></Button>)}</nav></div></div>)}</div>
    <p className="mt-5 text-xs text-muted-foreground">All top photos are existing placeholders. Commission a separate sunset-coastline departure scene for the trip hero and a photographic airport departures board with travelers for the board, matching the existing airport sign-off’s gold, magenta and deep-blue grade. The sign-off photo stays.</p>
  </main>;
}

function NightOrLetter({ state, visit }: { state: State; visit: (label: string) => void }) {
  if (state === "welcome") return <div className="home-mock-info"><img src={welcomeLetter} alt="Welcome letter" width={256} height={256} className="size-16 object-contain"/><div className="min-w-0 flex-1"><p className="eyebrow text-blue">WELCOME ABOARD</p><strong className="block font-display text-lg">Your welcome letter</strong><Button size="sm" variant="link" onClick={() => visit("Welcome Letter")}>Open letter <ArrowRight size={15}/></Button></div></div>;
  return <div className="home-mock-info"><div className="min-w-0 flex-1"><p className="eyebrow text-blue">{state === "quest" ? "GAME NIGHT · LIVE" : "NEXT GAME NIGHT"}</p><strong className="block font-display text-lg">{state === "quest" ? "Tonight · 7:00 PM" : "Friday · 7:00 PM"}</strong><p className="text-xs text-muted-foreground">Week 2 · Sample trip</p></div><Button variant="secondary" className="min-h-11" onClick={() => visit("Check in")}>Check in</Button></div>;
}

function Discovery({ state, visit }: { state: State; visit: (label: string) => void }) {
  return <div className="home-mock-info"><img src={state === "quest" ? iconBoarding : iconCompass} alt="" width={104} height={104} className="size-12 object-contain"/><div className="min-w-0 flex-1"><p className="eyebrow text-orange">{state === "quest" ? "CURRENT QUEST" : "TODAY'S DISCOVERY · ROUND B"}</p><strong className="block font-display text-base">{state === "quest" ? "Discover a local flavor" : "A new place to explore"}</strong><p className="text-xs text-muted-foreground">{state === "quest" ? "Find the story behind a dish." : "A sample of what's coming next."}</p></div><Button variant="ghost" size="icon" aria-label={state === "quest" ? "Open quest" : "Open discovery"} onClick={() => visit(state === "quest" ? "Quest" : "Today's Discovery")}><ArrowRight size={18}/></Button></div>;
}

function Classic({ state, visit }: { state: State; visit: (label: string) => void }) {
  return <><Button variant="link" className="mt-2 min-h-11 px-0 text-sm text-blue" onClick={() => visit("Welcome Letter")}>Where should I start? <ArrowRight size={15}/></Button><div className="home-orbit mt-5" aria-label="Classic travel shortcuts"><div className="home-orbit-track" aria-hidden="true"/><div className="home-orbit-core">{state === "welcome" ? <Button variant="ghost" className="home-welcome-letter h-full w-full flex-col p-1" onClick={() => visit("Welcome Letter")}><img src={welcomeLetter} alt="" width={256} height={256} className="w-[min(75%,120px)] aspect-square object-contain"/><strong className="text-sm">New here?</strong></Button> : <><p className="eyebrow text-blue">NEXT GAME NIGHT</p><strong className="home-orbit-count font-display">2 days</strong><p className="home-orbit-title text-xs font-semibold text-muted-foreground">Week 2 · Friday</p><Button variant="secondary" className="home-spin mt-3" onClick={() => visit("Check in")}>Check in</Button></>}</div>{orbitItems.map((item, index) => <div key={item.label} className={`home-orbit-stop home-orbit-stop-${index}`}><Button variant="ghost" className="home-orbit-link" onClick={() => visit(item.label)} title={item.subtitle}><img src={item.img} alt="" width={104} height={104}/><span>{item.label}<small>{item.subtitle}</small></span></Button></div>)}</div><div className="home-trip-line mt-5"><Button variant="ghost" className="w-full justify-between min-h-14" onClick={() => visit("Current trip")}>CURRENT TRIP · SAMPLE <ArrowRight size={18}/></Button></div>{state === "quest" && <Discovery state={state} visit={visit}/>}<div className="home-action-grid mt-6"><Button variant="outline" className="home-journey-action" onClick={() => visit("Journey")}><MapPinned size={22}/><span><strong>Journey</strong><small>Open the route</small></span><ArrowRight size={18}/></Button></div></>;
}

function TripsFirst({ layout, state, visit }: { layout: "one" | "two" | "three"; state: State; visit: (label: string) => void }) {
  return <>
    <div className={`home-mock-hero home-mock-hero-${layout}`}>
       <img src={heroStandIn} alt="Photographic placeholder of a sunny coastline" width={1280} height={512} className="home-mock-hero-image"/>
       <span className="home-mock-placeholder">EXISTING PHOTO · PLACEHOLDER</span>
    </div>
    <div className="home-mock-hero-copy">
      <strong className="font-display text-xl block">{layout === "three" ? "Your trip starts here" : "Going on a Trip"}</strong>
      <p className="text-sm font-bold">Turn your trip into a game</p>
      <p className="text-xs text-muted-foreground mt-1">Game nights before you go · missions at the airport · challenges when you land</p>
      {layout === "three" ? <div className="home-mock-split"><Button variant="playful" onClick={() => visit("Plan a trip")}>Plan a trip</Button><Button variant="secondary" onClick={() => visit("Join with code")}>Join with code</Button></div> : <div className="flex gap-2 mt-3"><Button variant="playful" className="flex-1 min-w-0" onClick={() => visit("Plan a trip")}>Plan a trip</Button><Button variant="outline" className="flex-1 min-w-0" onClick={() => visit("Join with code")}>Join with code</Button></div>}
    </div>
    <NightOrLetter state={state} visit={visit}/>
    <Discovery state={state} visit={visit}/>
    <h4 className="font-display text-lg font-bold mt-5">More ways to play</h4>
    <div className={`home-mock-more home-mock-more-${layout}`}>{moreWays.map(item => <Button key={item.label} variant="ghost" className="home-mock-bubble" onClick={() => visit(item.label)}><span className="home-door-medallion"><img src={item.img} alt="" width={104} height={104}/></span><span>{item.label}</span></Button>)}</div>
     <MockLinks visit={visit}/>
     <AirportSignoff/>
   </>;
}

function MockLinks({ visit }: { visit: (label: string) => void }) {
  return <div className="home-mock-links">{["Journey", "Leaderboards", "Explore the App"].map(label => <Button key={label} variant="link" onClick={() => visit(label)}>{label} <ArrowRight size={15}/></Button>)}</div>;
}

function AirportSignoff() {
  return <>
    <div className="home-mock-stamp-space" aria-hidden="true"><span className="home-mock-stamp">PASSPORT<br/>JUNKIE</span></div>
    <div className="cinematic-home-bottom home-mock-signoff">
      <div className="cinematic-home-signoff">
        <img src={airportSignoff} srcSet={`${airportSignoffSmall} 768w, ${airportSignoff} 1536w`} sizes="(max-width: 430px) 390px, 390px" alt="Friends walking through the airport with their bags at sunset" loading="lazy" width={1536} height={1024}/>
        <BrandLockup className="home-signoff text-[clamp(28px,8vw,44px)]"/>
      </div>
    </div>
  </>;
}

const departures = [
  { label: "GOING ON A TRIP", target: "Plan a trip", gate: "A1", img: iconMap },
  { label: "EXPLORE A CULTURE", target: "Travel From Home", gate: "B2", img: iconHome },
  { label: "INSPIRE SOMEONE", target: "Window Seat", gate: "C3", img: windowSeatArt },
  { label: "GAME NIGHT", target: "Games on Flight", gate: "D4", img: gameOptionA },
  { label: "PASSPORT JUNKIE", target: "Passport Junkie", gate: "—", img: iconPassport },
] as const;

function DepartureBoard({ state, visit }: { state: State; visit: (label: string) => void }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const clock = now?.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) ?? "--:--";
  const today = now?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) ?? "—";
  return <>
    <section className="home-mock-board-scene" aria-label="Departure Board sample">
      <img src={heroStandIn} alt="Photographic coastline placeholder behind the departures board" width={1280} height={512} className="home-mock-board-photo"/>
      <span className="home-mock-placeholder">EXISTING PHOTO · PLACEHOLDER</span>
      <div className="home-mock-board">
        <div className="home-mock-board-top"><strong>DEPARTURES</strong><time dateTime={now?.toISOString()}>{clock}</time><span>{today}</span></div>
        <div className="home-mock-board-labels" aria-hidden="true"><span>DESTINATION</span><span>GATE</span><span>STATUS</span></div>
        <div className="home-mock-board-rows" key={state}>
          {departures.map((item, index) => {
            const status = index === 4 ? "COLLECTING" : index === 0 && state === "quest" ? "FINAL CALL" : index === 3 && state === "scheduled" ? "BOARDING" : index === 3 && state === "quest" ? "GATE OPEN" : "ON TIME";
            return <Button key={item.gate} variant="ghost" className="home-mock-board-row" onClick={() => visit(item.target)} aria-label={`${item.label}, gate ${item.gate}, ${status}${status === "BOARDING" ? ", 2 days until game night" : status === "FINAL CALL" ? ", quest closes in 2 hours" : ""}`}>
              <img src={item.img} alt="" width={104} height={104}/><span className="home-mock-board-destination">{item.label}</span><span className="home-mock-board-gate">{item.gate}</span><span className={`home-mock-board-status ${status === "GATE OPEN" ? "is-open" : status === "FINAL CALL" ? "is-final" : status === "BOARDING" ? "is-boarding" : ""}`}>{status}{status === "BOARDING" && <small>2 days</small>}{status === "FINAL CALL" && <small>2h left</small>}</span>
            </Button>;
          })}
        </div>
      </div>
    </section>
    <NightOrLetter state={state} visit={visit}/>
    <Discovery state={state} visit={visit}/>
    <MockLinks visit={visit}/>
    <AirportSignoff/>
  </>;
}

function ReferenceHeader({ visit }: { visit: (label: string) => void }) {
  return <>
    <div className="home-ref-header"><BrandLockup compact className="home-ref-wordmark"/><Plane size={17} strokeWidth={1.5} aria-hidden="true"/><div className="home-ref-header-actions"><Button size="icon" variant="ghost" className="home-ref-icon-button" aria-label="Notifications sample" onClick={() => visit("Notifications")}><Bell size={19}/><span className="home-ref-notification"/></Button><Button size="icon" variant="ghost" className="home-ref-icon-button" aria-label="Profile sample" onClick={() => visit("Me")}><img src={travelerOne} alt="" width={104} height={104}/></Button></div></div>
    <p className="eyebrow text-blue mt-5">YOUR DEPARTURE LOUNGE</p><h3 className="font-display text-3xl font-extrabold mt-2">Where to, TripJunkie-Ty?</h3>
    <div className="home-ref-search"><Search size={18} aria-hidden="true"/><span>Search destinations, games, or squads…</span><Button size="icon" variant="ghost" aria-label="Search filters sample" onClick={() => visit("Search filters")}><SlidersHorizontal size={18}/></Button></div>
  </>;
}

function SampleAvatars() {
  return <div className="home-ref-avatars" aria-label="Three squad members and two more">{[travelerOne, travelerTwo, travelerThree].map(art => <img key={art} src={art} alt="" width={104} height={104}/>) }<span>+2</span></div>;
}

function ReferenceNight({ state, visit }: { state: State; visit: (label: string) => void }) {
  if (state === "welcome") return <NightOrLetter state={state} visit={visit}/>;
  return <div className="home-ref-night"><div className="min-w-0 flex-1"><p className="eyebrow text-blue">{state === "quest" ? "GAME NIGHT · LIVE" : "NEXT GAME NIGHT · BANGKOK ›"}</p><strong className="font-display text-lg">Tonight · 6:00 PM PST</strong><SampleAvatars/></div><Button variant="secondary" className="home-ref-check" onClick={() => visit("Check in")}><Check size={16}/> Check in</Button></div>;
}

function ReferenceWays({ visit }: { visit: (label: string) => void }) {
  const sublines = ["Play from home", "Share the view", "Play right now", "Your stamps"];
  return <><div className="home-ref-section-title"><h4 className="font-display text-lg font-extrabold">More ways to play</h4><Button variant="link" onClick={() => visit("More ways to play")}>See all <ArrowRight size={15}/></Button></div><div className="home-ref-ways">{moreWays.map((item, i) => <Button variant="ghost" key={item.label} className="home-ref-way" onClick={() => visit(item.label)}><span className="home-door-medallion"><img src={item.img} alt="" width={104} height={104}/></span><strong>{item.label === "Passport Junkie" ? "Passport" : item.label}</strong><small>{sublines[i]}</small></Button>)}</div></>;
}

function ReferenceHero({ visit }: { visit: (label: string) => void }) {
  return <div className="home-ref-hero"><img src={heroStandIn} alt="Existing coastline photo placeholder for a plane climbing above palms at sunset" width={1280} height={512}/><span className="home-mock-placeholder">EXISTING PHOTO · PLACEHOLDER</span><div className="home-ref-hero-copy"><p className="eyebrow text-blue">GOING ON A TRIP</p><strong>Turn your trip into a game</strong><p>Game nights before you go · missions at the airport · challenges when you land</p><div className="home-ref-hero-buttons"><Button variant="secondary" onClick={() => visit("Plan a trip")}>Plan a trip</Button><Button variant="outline" onClick={() => visit("Join with code")}><QrCode size={16}/> Join with code</Button></div></div></div>;
}

function ReferenceBoard({ state, visit }: { state: State; visit: (label: string) => void }) {
  return <section className="home-ref-board-scene" aria-label="Photographic departure board sample"><img className="home-ref-board-photo" src={heroStandIn} alt="Existing coast photo placeholder for a real departures board with travelers" width={1280} height={512}/><span className="home-mock-placeholder">EXISTING PHOTO · BOARD PLACEHOLDER</span><div className="home-ref-board"><div className="home-ref-board-head"><strong>DEPARTURES</strong><span>GATE</span><span>STATUS</span></div>{departures.map((item, index) => {const status = index === 4 ? "COLLECTING" : index === 0 && state === "quest" ? "FINAL CALL" : index === 3 && state === "scheduled" ? "BOARDING" : index === 3 && state === "quest" ? "GATE OPEN" : "ON TIME";return <Button key={item.gate} variant="ghost" className="home-ref-board-row" onClick={() => visit(item.target)}><img src={item.img} alt="" width={104} height={104}/><span>{item.label}</span><span>{item.gate}</span><b className={status === "FINAL CALL" ? "is-final" : status === "GATE OPEN" ? "is-open" : status === "BOARDING" ? "is-boarding" : ""}>{status}</b></Button>;})}</div></section>;
}

function ReferenceHome({ layout, state, visit }: { layout: "five" | "six" | "seven"; state: State; visit: (label: string) => void }) {
  return <>
    {layout === "six" ? <ReferenceBoard state={state} visit={visit}/> : <ReferenceHero visit={visit}/>}
    {layout === "seven" && <Button variant="ghost" className="home-ref-strip" onClick={() => visit(state === "quest" ? "Quest" : state === "welcome" ? "Welcome Letter" : "Game Night")}>{state === "quest" ? "QUEST · FINAL CALL · 2h 40m" : state === "welcome" ? "WELCOME ABOARD · YOUR LETTER IS READY" : "GAME NIGHT · BOARDING · 6:00 PM"}<ArrowRight size={16}/></Button>}
    <ReferenceNight state={state} visit={visit}/>
    {(layout !== "five" || state === "quest") && <Discovery state={state} visit={visit}/>}
    <ReferenceWays visit={visit}/>
    <MockLinks visit={visit}/>
    <AirportSignoff/>
  </>;
}