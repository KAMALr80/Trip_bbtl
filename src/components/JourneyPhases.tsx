import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeason, standings, scoreOf } from "@/components/Season";
import { useSeasonsData } from "@/components/Seasons";
import { friendlyDate } from "@/lib/trip-dates";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
export function JourneyPhases({trip,members,cards,userId}:{trip:TripWithRole;members:Member[];cards:PlayerWithAvatar[];userId:string}) {
 const [open,setOpen]=useState(false), season=useSeason(trip.id), data=useSeasonsData(trip.id);
 const game=standings(members,season.nights,season.scores,season.settings,season.qotw), own=game.find(r=>r.user_id===userId), day=data.tripRows.find(r=>r.user_id===userId);
 const played=season.nights.filter(n=>!n.skipped&&new Date(n.starts_at).getTime()+3*3600000<Date.now()).length;
 const leader=(rows:{user_id:string;score:number}[])=>rows.sort((a,b)=>b.score-a.score)[0];
 const gameLeader=leader(game.map(r=>({user_id:r.user_id,score:r.score}))), tripLeader=leader(data.tripRows.map(r=>({user_id:r.user_id,score:scoreOf(r.stamps,r.max_stamps)})));
 const nickname=(id:string|undefined)=>cards.find(c=>c.user_id===id)?.game_name||members.find(m=>m.user_id===id)?.display_name||"Not yet";
 return <><Button variant="outline" className="app-card mt-4 w-full h-auto text-left flex justify-between items-center" onClick={()=>setOpen(true)}><span><span className="eyebrow text-blue">YOUR JOURNEY · TWO SEPARATE CROWNS</span><span className="block font-bold mt-2">✈️ Pre-Flight · {played}/{season.nights.filter(n=>!n.skipped).length} played · {own?.score??0}/100</span><span className="block font-bold mt-2">🌴 Trip Season · {friendlyDate(trip.start_date)} · {day?scoreOf(day.stamps,day.max_stamps):0}/100</span></span><ArrowRight className="shrink-0"/></Button>{open&&<div className="fixed inset-0 z-50 flex items-end justify-center"><div className="absolute inset-0 bg-foreground/50" onClick={()=>setOpen(false)}/><section role="dialog" aria-modal="true" aria-label="Your Journey phases" className="relative w-full max-w-lg rounded-t-3xl bg-card p-6 pb-10"><Button variant="ghost" size="icon" className="absolute right-4 top-4" onClick={()=>setOpen(false)} aria-label="Close"><X/></Button><h2 className="font-display text-2xl font-extrabold pr-10">Two journeys, two crowns</h2><p className="text-sm text-muted-foreground mt-2">Each phase has its own score out of 100 and its own champion. Culture Points are separate too.</p><div className="bg-blue-soft rounded-2xl p-4 mt-5"><h3 className="font-bold">✈️ Pre-Flight Champion</h3><p className="text-sm mt-1">Weekly game nights, cards, votes and attendance before departure.</p><p className="text-xs font-bold mt-2">{played} of {season.nights.filter(n=>!n.skipped).length} nights played · Leading: {nickname(gameLeader?.user_id)}</p></div><div className="bg-orange-soft rounded-2xl p-4 mt-3"><h3 className="font-bold">🌴 Trip Season Champion</h3><p className="text-sm mt-1">Daily bingo, scavenger items, missions and trivia during the trip.</p><p className="text-xs font-bold mt-2">Starts {friendlyDate(trip.start_date)} · Leading: {nickname(tripLeader?.user_id)}</p></div><Button variant="playful" className="w-full mt-5" onClick={()=>setOpen(false)}>Let's go</Button></section></div>}</>;
}
