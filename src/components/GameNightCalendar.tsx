import { tripDisplayName } from "@/lib/trip-display-name";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarPlus, Check, ChevronDown, Phone, Trophy, SkipForward, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import { fmtWhen, viewerZone } from "@/lib/viewer-time";
import { safeLink } from "@/lib/itinerary";
import { Avatar } from "./PlayerCards";
import { CallPanel } from "./CaptainExtras";
import { HostNightActions } from "./HostSwaps";
import { useLook } from "@/lib/look";
import { nextGameNight } from "@/lib/next-game-night";
import { CinematicMonthCalendar } from "./CinematicMonthCalendar";
import { NightGamePicker } from "./NightGamePicker";
import { gameType } from "@/lib/display-game-title";

type Night = Tables<"game_nights">;
type Game = Tables<"game_catalog">;
type StatusRow = { week_number: number; user_id: string };

function saveNight(trip: TripWithRole, night: Night, title: string) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const start = new Date(night.starts_at);
  const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TripJunkies//Game Nights//EN", "BEGIN:VEVENT", `UID:${trip.id}-${night.week_number}@tripjunkies`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + 3600000))}`, `SUMMARY:${escape(`${tripDisplayName(trip.name)} · ${title}`)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = `tripjunkies-week-${night.week_number}.ics`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GameNightCalendar({ trip, nights, games, members, cards = [], userId, viewOnly = false, renderLeaderActions, focus }: { trip: TripWithRole; nights: Night[]; games: Game[]; members: Member[]; cards?: PlayerWithAvatar[]; userId: string; viewOnly?: boolean; renderLeaderActions?: (night: Night) => ReactNode; focus?: { week: number; key: number } | null | undefined }) {
  const cinematic = useLook("calendar") === "cinematic";
  const [view, setView] = useState<"upcoming" | "past">(() => { const target = window.sessionStorage.getItem(`journey-night-${trip.id}`); if (!target) return "upcoming"; window.sessionStorage.removeItem(`journey-night-${trip.id}`); return Number(target) && nights.some(n => n.week_number === Number(target) && new Date(n.starts_at).getTime() + 3 * 3600000 < Date.now()) ? "past" : "upcoming"; });
  const [monthView, setMonthView] = useState(false);
  const [selected, setSelected] = useState<number | null>(() => { const target = window.sessionStorage.getItem(`journey-night-selected-${trip.id}`); window.sessionStorage.removeItem(`journey-night-selected-${trip.id}`); return target ? Number(target) : null; });
  const [call, setCall] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [misses, setMisses] = useState<StatusRow[]>([]);
  const [passes, setPasses] = useState<StatusRow[]>([]);
  const leader = !viewOnly && (trip.myRole === "captain" || trip.myRole === "co_captain");

  const link = safeLink((trip as TripWithRole & { call_link?: string | null }).call_link ?? undefined);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!focus) return;
    const night = nights.find(n => n.week_number === focus.week);
    if (!night) return;
    setView(new Date(night.starts_at).getTime() + 3 * 3600000 < Date.now() ? "past" : "upcoming");
    setMonthView(false);
    if (leader) setSelected(focus.week);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => { const el = document.getElementById(`night-card-${trip.id}-${focus.week}`); el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); el?.focus({ preventScroll: true }); }, 120);
    return () => window.clearTimeout(timer);
  }, [focus?.key]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [p, s] = await Promise.all([
        supabase.from("host_penalties").select("week_number,user_id").eq("trip_id", trip.id),
        supabase.from("skip_passes").select("ref,user_id").eq("trip_id", trip.id).eq("kind", "captain"),
      ]);
      if (active) {
        setMisses(p.error ? [] : p.data ?? []);
        setPasses(s.error ? [] : (s.data ?? []).map(r => ({ week_number: Number(r.ref), user_id: r.user_id })));
      }
    };
    void load(); const timer = window.setInterval(() => void load(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [trip.id]);
  const people = members.map(m => ({ user_id: m.user_id, name: cards.find(c => c.user_id === m.user_id)?.game_name || m.display_name || "Player" }));
  const visible = nights.filter(n => view === "upcoming" ? new Date(n.starts_at).getTime() + 3 * 3600000 >= now : new Date(n.starts_at).getTime() + 3 * 3600000 < now);
  const months = Array.from(new Set(visible.map(n => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: viewerZone() }).format(new Date(n.starts_at)))));
  const todayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: viewerZone() });
  const nextNight = nextGameNight(nights, now);
  if (cinematic) return <CinematicMonthCalendar trip={trip} nights={nights} games={games} members={members} cards={cards} userId={userId} viewOnly={viewOnly}/>;
  return <div className="mt-3" aria-label="Game night calendar">
    <div className="flex items-center gap-2"><div className="flex rounded-full bg-muted p-1" role="group" aria-label="Calendar period">{(["upcoming", "past"] as const).map(v => <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} className="rounded-full" onClick={() => { setView(v); setSelected(null); }}>{v === "upcoming" ? "Upcoming" : "Past"}</Button>)}</div><Button size="sm" variant="ghost" className="ml-auto" aria-pressed={monthView} onClick={() => setMonthView(!monthView)}>{monthView ? "List" : "Months"}</Button></div>
    {!visible.length && <p className="text-sm text-muted-foreground py-5">{view === "past" ? "No past game nights yet." : "No upcoming game nights."}</p>}
    {months.map(month => <div key={month} className="mt-4"><h3 className="text-xs font-extrabold text-muted-foreground uppercase mb-2">{month}</h3>{monthView && <div className="grid grid-cols-7 gap-1 mb-3" aria-label={`${month} game dates`}>{["S","M","T","W","T","F","S"].map((d, i) => <span key={i} className="text-center text-xs text-muted-foreground">{d}</span>)}{(() => { const monthNights = visible.filter(n => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: viewerZone() }).format(new Date(n.starts_at)) === month); const first = monthNights[0]; if (!first) return null; const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "numeric", timeZone: viewerZone() }).formatToParts(new Date(first.starts_at)); const y = Number(parts.find(p => p.type === "year")?.value); const m = Number(parts.find(p => p.type === "month")?.value); return Array.from({ length: new Date(y, m - 1, 1).getDay() + new Date(y, m, 0).getDate() }, (_, i) => { const day = i - new Date(y, m - 1, 1).getDay() + 1; const night = monthNights.find(n => Number(new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: viewerZone() }).format(new Date(n.starts_at))) === day); return day < 1 ? <span key={i}/> : night ? <Button key={i} size="sm" variant="subtle" aria-label={`${month} ${day}, week ${night.week_number}`} className="min-w-0 px-0" onClick={() => setSelected(night.week_number)}>{day}</Button> : <span key={i} className="text-center text-xs py-2 text-muted-foreground">{day}</span>; }); })()}</div>}
      <div className="space-y-2">{visible.filter(n => new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: viewerZone() }).format(new Date(n.starts_at)) === month).map(n => {
        const start = new Date(n.starts_at).getTime();
        const live = !n.skipped && now >= start - 15 * 60000 && now <= start + 3 * 3600000;
        const past = start + 3 * 3600000 < now;
        const tonight = !live && !past && !n.skipped && todayKey.format(new Date(start)) === todayKey.format(new Date(now));
        const name = people.find(p => p.user_id === n.host_id)?.name || "Host to be announced";
        const avatar = cards.find(c => c.user_id === n.host_id)?.avatarUrl || members.find(m => m.user_id === n.host_id)?.avatar_url || undefined;
        const missed = !n.skipped && misses.some(r => r.week_number === n.week_number && r.user_id === n.host_id);
        const pass = passes.some(r => r.week_number === n.week_number && r.user_id === n.host_id);
        const title = n.game_revealed ? games.find(g => g.number === n.game_number)?.name || "Mystery game" : "Mystery game";
        const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", weekday: "short", timeZone: viewerZone() }).formatToParts(new Date(start));
        const part = (type: string) => date.find(p => p.type === type)?.value ?? "";
        const expanded = selected === n.week_number;
        return <div key={n.week_number} id={`night-card-${trip.id}-${n.week_number}`} tabIndex={-1} className={`night-calendar-card scroll-mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tonight ? "night-calendar-tonight" : ""} ${n.skipped ? "night-calendar-skipped" : ""}`}>
          <div className="flex gap-3 p-3 items-start"><div className="night-calendar-date shrink-0"><span className="text-[10px] uppercase font-extrabold">{part("month")}</span><strong className="text-2xl leading-none">{part("day")}</strong><span className="text-[10px] font-bold">{part("weekday")}</span></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><span className="text-[11px] font-extrabold text-blue">WEEK {n.week_number}</span><span aria-hidden="true" className="text-orange">{n.skipped ? <SkipForward size={15}/> : past ? <Trophy size={15}/> : <Plane size={15}/>}</span>{n.skipped ? <span className="neon-chip text-muted-foreground">Skipped</span> : live ? <span className="neon-chip text-green">LIVE · Join call</span> : past ? <span className="night-calendar-check" aria-label="Done"><Check size={14}/> Done</span> : tonight ? <span className="neon-chip text-orange">Tonight · {Math.max(0, Math.ceil((start - now) / 60000))} min</span> : null}{n.host_id === userId && !n.skipped && <span className="neon-chip text-blue">Hosting</span>}{pass && <span className="neon-chip text-orange">pass</span>}</div><p className="font-display font-extrabold leading-tight mt-1 break-words">{title}</p>{n.game_number && n.game_revealed && <span className="game-type-chip">{gameType(n.game_number)}</span>}<p className="text-xs text-muted-foreground mt-1 leading-snug">{fmtWhen(n.starts_at, trip.home_timezone)}</p>{cinematic && <p className="text-xs mt-1">{n.skipped ? "Nobody loses points" : "Your crew is on the way"}</p>}<div className="flex items-center gap-2 mt-2"><Avatar name={name} url={avatar} className="h-7 w-7"/><span className={`text-xs font-bold truncate ${missed ? "line-through text-muted-foreground" : ""}`}>{name}</span>{missed && <span className="neon-chip text-muted-foreground">missed</span>}</div>{cinematic && <div className="flex -space-x-2 mt-2" aria-label="Crew">{members.slice(0,5).map(m => { const c = cards.find(x => x.user_id === m.user_id); return <Avatar key={m.user_id} url={c?.avatarUrl || m.avatar_url || undefined} name={c?.game_name || m.display_name || "Player"} className="size-6 border-2 border-background"/>; })}</div>}</div><div className="flex flex-col gap-1 shrink-0">{link && <Button size="icon" variant="ghost" aria-label={`Open week ${n.week_number} call`} onClick={() => setCall(true)}><Phone size={17}/></Button>}<Button size="icon" variant="ghost" aria-label={`Add week ${n.week_number} to calendar`} onClick={() => saveNight(trip, n, title)}><CalendarPlus size={17}/></Button></div></div>
          {(leader || n.host_id===userId) && <Button variant="ghost" size="sm" className="w-full justify-between border-t border-border rounded-none" aria-expanded={expanded} onClick={() => setSelected(expanded ? null : n.week_number)}>{expanded ? "Close night actions" : "Night actions"}<ChevronDown size={16} className={expanded ? "rotate-180" : ""}/></Button>}
           {expanded && (leader || n.host_id===userId) && <div className="border-t border-border p-3">{renderLeaderActions?.(n)}<NightGamePicker tripId={trip.id} night={n} games={games} canPick={leader || n.host_id===userId} onSaved={()=>{window.dispatchEvent(new CustomEvent("tripjunkie-night-game-changed"));}}/><HostNightActions trip={trip} userId={userId} night={n} people={people} viewOnly={viewOnly}/></div>}
        </div>;
      })}</div></div>)}
    {call && link && <CallPanel link={link} backup={safeLink((trip as TripWithRole & { backup_call_link?: string | null }).backup_call_link ?? undefined) ?? null} onClose={() => setCall(false)}/>}
  </div>;
}