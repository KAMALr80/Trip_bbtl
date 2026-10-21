import { Crown, CalendarDays, MapPinned, Plane, Ticket, Compass, Users, Home, Settings2 } from "lucide-react";
import { buddyAvatars } from "@/lib/player-cards";
import homeArt from "@/assets/home-airport-signoff-diverse.jpg";
import coast from "@/assets/passport-seaside.jpg";
import mexico from "@/assets/athome-mexico.jpg";
import japan from "@/assets/athome-japan.jpg";
import cards from "@/assets/boarding-game-1.webp";
import wheel from "@/assets/boarding-game-2.webp";
import joinArt from "@/assets/how-join-squad.jpg";
import playArt from "@/assets/how-play-together.jpg";
import nightArt from "@/assets/how-game-nights.jpg";
import crownArt from "@/assets/how-crowning.jpg";

const how = [
  { image: nightArt, title: "Game nights", line: "Weekly game nights before the trip.", icon: CalendarDays },
  { image: playArt, title: "Play together", line: "Squad playing on their phones.", icon: Users },
  { image: joinArt, title: "Join the squad", line: "Invites and join codes.", icon: Ticket },
  { image: crownArt, title: "The crowning", line: "Season champion moment.", icon: Crown },
];
function HowCard({ step }: { step: number }) { const item = how[step] ?? how[0]; if (!item) return null; const Icon = item.icon; return <div className={`tour-how-card tour-how-${step}`}><div className="tour-how-art"><img src={item.image} alt="" width={1024} height={1024} loading="lazy"/><span className="tour-how-postmark" aria-hidden="true">TRIPJUNKIES</span><span className="tour-how-flight" aria-hidden="true">✈</span></div><div className="tour-how-footer"><span className="tour-how-icon"><Icon size={18}/></span><div><strong>{item.title}</strong><small>{item.line}</small><i/></div></div></div>; }
function MiniCard({ label, children }: { label: string; children: React.ReactNode }) { return <div className="tour-mini-card"><small>{label}</small><div>{children}</div></div>; }
const faces = buddyAvatars.slice(0, 4);
export function CinematicTourSlide({ index }: { index: number }) {
  return <div className="tour-mini-screen">
    <div className="tour-mini-stars" aria-hidden="true"/><span className="tour-mini-stamp" aria-hidden="true">TRIPJUNKIES</span>
    <header><Plane size={13}/> TRIPJUNKIES™ <span>✦</span></header>
    {index === 0 ? <><h2>Your trip starts here</h2><div className="tour-orbit"><img src={homeArt} alt="" width={1024} height={1024}/><strong>Check in</strong></div><MiniCard label="YOUR SQUAD"><b>Bangkok together</b><p>Plans and games in one place</p></MiniCard></>
    : index === 1 ? <><h2>Pre-Flight</h2><div className="tour-photo"><img src={nightArt} alt="" width={1024} height={1024}/></div><MiniCard label="GAME NIGHT"><b>Spin · cards · vote</b><p>One Pre-Flight crown</p></MiniCard></>
    : index === 2 ? <><h2>Takeoff</h2><div className="tour-photo"><img src={homeArt} alt="" width={1024} height={1024}/></div><MiniCard label="SECURITY CHECK · SAMPLE"><b>Find a color your squad all packed</b><p>Pending → Captain verifies · 2 pts</p></MiniCard><MiniCard label="BONUS"><b>2 of 12 points</b></MiniCard></>
    : index === 3 ? <><h2>Trip Season</h2><div className="tour-photo"><img src={playArt} alt="" width={1024} height={1024}/></div><MiniCard label="DAILY GAMES"><b>Bingo · scavenger hunt · photos</b><p>A second crown</p></MiniCard></>
    : index === 4 ? <><h2>Wrapped</h2><div className="tour-photo"><img src={crownArt} alt="" width={1024} height={1024}/></div><MiniCard label="SAMPLE RECAP"><b>12 stamps · 2 crowns</b><p>Favorite moments on the photo wall</p></MiniCard></>
    : index === 5 ? <><h2>Meet the squad</h2><div className="tour-crew">{faces.map((face,i)=><img key={i} src={face} alt="" width={48} height={48}/>)}</div><MiniCard label="PLAYER CARD"><b>Alex · The explorer</b><p>Pick your avatar</p></MiniCard><HowCard step={1}/></>
    : index === 6 ? <><h2>Pick your vibe</h2>{["Family", "Chill", "Party"].map((v,i)=><MiniCard key={v} label={i===2?"21+ APPROVAL":"YOUR CREW"}><b>{v}</b></MiniCard>)}</>
    : index === 7 ? <><h2>At Home</h2><div className="tour-photo"><img src={mexico} alt="" width={1024} height={1024}/></div><MiniCard label="TRIP SEASON · DAY 1"><b>Make a snack and share a story</b><p>Present → vote → Wrapped</p></MiniCard></>
    : index === 8 ? <><h2>Travel From Home & Window Seat</h2><div className="tour-photo"><img src={japan} alt="" width={1024} height={1024}/></div><MiniCard label="SAMPLE CULTURE CARD"><b>Share a tradition that matters to you</b><p>From home or on the road</p></MiniCard></>
    : index === 9 ? <><h2>Games on Flight</h2><div className="tour-icon-grid">{[cards,wheel].map((image,i)=><div key={i}><img src={image} alt="" width={256} height={256}/><small>{i?"Spin the wheel":"Card flip"}</small></div>)}</div><MiniCard label="ONE PHONE"><b>Play a sample Game Night</b><p>Nothing saved</p></MiniCard></>
    : index === 10 ? <><h2>For the Captain</h2><div className="tour-photo"><img src={joinArt} alt="" width={1024} height={1024}/></div><MiniCard label="YOUR SQUAD"><b>Plan · invite · host</b><p>Send the code</p></MiniCard></>
    : <><h2>Passport Junkie</h2><div className="tour-passport"><img src={coast} alt="" width={1024} height={1024}/><b>Alex · Collection</b><p>Stamps · Crowns · Postcards</p></div></>}
    <div className="tour-mini-nav">{[Home, Compass, MapPinned, Users, Settings2].map((Icon,i)=><Icon key={i} size={14} aria-hidden="true"/>)}</div>
  </div>;
}
