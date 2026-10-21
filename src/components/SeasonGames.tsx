import { useCallback, useEffect, useState } from "react";
import { Check, ImagePlus, LockKeyhole, Timer } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";
import { friendlyError } from "@/lib/friendly-error";
import { tripToday, tripTz } from "@/lib/itinerary";
import { prepareSeasonGame, seasonGameFor, type SeasonGameKind } from "@/lib/season-games.functions";
import type { TripWithRole } from "@/lib/trips";

type Game = { id: string; game: SeasonGameKind; city: string; tasks: string[]; speed_minutes: number | null };
type Find = { slot: number; declined_at: string | null };
const rpc = supabase as unknown as { rpc: (fn: string, args: object) => Promise<{ data: unknown; error: { message: string } | null }>; from: (t: string) => any };
const LABEL: Record<SeasonGameKind, string> = { bingo: "Bingo", scavenger: "Scavenger Hunt", speed: "Speed Challenge" };
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

/** Which rooms show Trip Season games — mirrors trip_private.season_games_ok. */
export function seasonGamesApply(trip: TripWithRole, windowSeat: boolean) {
  return trip.kind === "trip" && trip.season_scoring !== false && trip.play_arrangement !== "offline" && !windowSeat;
}
export function todaysSeasonGame(trip: TripWithRole): SeasonGameKind | null {
  const today = tripToday(tripTz(trip));
  return today >= trip.start_date && today <= trip.end_date ? seasonGameFor(trip.start_date, today) : null;
}

export function SeasonGames({ trip, userId, viewOnly }: { trip: TripWithRole; userId: string; viewOnly: boolean }) {
  const today = tripToday(tripTz(trip));
  const prepare = useServerFn(prepareSeasonGame);
  const [game, setGame] = useState<Game | null>(null), [finds, setFinds] = useState<Find[]>([]), [revealed, setRevealed] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading"), [error, setError] = useState(""), [busy, setBusy] = useState<number | null>(null);
  const [flipped, setFlipped] = useState<number | null>(null), [stamped, setStamped] = useState<number | null>(null), [now, setNow] = useState(Date.now());
  const solo = trip.play_arrangement === "solo";

  const load = useCallback(async () => {
    setError("");
    if (today < trip.start_date || today > trip.end_date) { setState("none"); return; }
    let g = await rpc.from("trip_season_games").select("id,game,city,tasks,speed_minutes").eq("trip_id", trip.id).eq("day_date", today).maybeSingle();
    if (!g.data && !viewOnly) { try { await prepare({ data: { tripId: trip.id, date: today } }); } catch (e) { setError(friendlyError(e)); } g = await rpc.from("trip_season_games").select("id,game,city,tasks,speed_minutes").eq("trip_id", trip.id).eq("day_date", today).maybeSingle(); }
    if (!g.data || !(g.data.tasks as string[]).length) { setState("none"); return; }
    const [f, r] = await Promise.all([rpc.from("trip_season_finds").select("slot,declined_at").eq("trip_id", trip.id).eq("day_date", today).eq("user_id", userId), rpc.from("trip_season_reveals").select("revealed_at").eq("trip_id", trip.id).eq("day_date", today).eq("user_id", userId).maybeSingle()]);
    setGame(g.data as Game); setFinds((f.data ?? []) as Find[]); setRevealed(r.data?.revealed_at ?? null); setState("ready");
  }, [trip.id, trip.start_date, trip.end_date, today, userId, viewOnly, prepare]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (game?.game !== "speed" || !revealed) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [game?.game, revealed]);

  async function reveal() { setError(""); const r = await rpc.rpc("season_game_reveal", { p_trip: trip.id, p_date: today }); if (r.error) setError(friendlyError(r.error)); else setRevealed(String(r.data)); }
  async function upload(slot: number, file: File) {
    if (!game) return; setBusy(slot); setError("");
    try {
      const small = await compressImage(file, 1280, 300_000); const path = `${trip.id}/${userId}/${game.id}/${slot}-${Date.now()}.jpg`;
      const up = await supabase.storage.from("quest-proofs").upload(path, small, { contentType: small.type || "image/jpeg" });
      if (up.error) throw up.error;
      const r = await rpc.rpc("season_game_submit", { p_trip: trip.id, p_date: today, p_slot: slot, p_path: path });
      if (r.error) throw r.error;
      setStamped(slot); setFlipped(null); await load();
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(null); }
  }

  if (state === "loading") return <p className="text-sm text-muted-foreground p-4">Loading today’s game…</p>;
  if (state === "none" || !game) return <section className="flight-card p-4"><h2 className="font-display font-extrabold">Trip Season games</h2><p className="text-sm text-muted-foreground mt-1">{today < trip.start_date ? "The first game opens on day one of the trip." : today > trip.end_date ? "Trip Season games have ended for this trip." : "Today’s game isn’t ready yet. A leader opening this page sets it up."}</p>{error && <p role="alert" className="text-sm text-destructive mt-2">{error}</p>}</section>;

  const done = new Map(finds.map(f => [f.slot, f]));
  const counted = finds.filter(f => !f.declined_at).map(f => f.slot);
  const proofInput = (slot: number) => done.has(slot) ? <p className="mt-3 flex items-center gap-2 font-bold"><Check size={16}/> {done.get(slot)?.declined_at ? "Declined by your Captain" : "Stamped"}</p>
    : <label className="flight-action mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full border border-border font-bold cursor-pointer"><ImagePlus size={18}/> {busy === slot ? "Uploading…" : "Complete · add photo"}<input type="file" accept="image/*" className="sr-only" disabled={busy !== null || viewOnly} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(slot, f); }}/></label>;
  const head = <header className="mb-3"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Today · {game.city}</p><h2 className="font-display text-2xl font-extrabold">{LABEL[game.game]}</h2></header>;
  const err = error && <p role="alert" className="text-sm text-destructive mt-3">{error}</p>;

  if (game.game === "bingo") {
    const lines = LINES.filter(l => l.every(s => counted.includes(s))).length;
    return <section className="flight-card p-4">{head}<p className="text-sm text-muted-foreground">2 pts a tile · +5 for a line of 3 · +10 for all nine{solo ? " · your personal card" : ""}</p>
      <div className="grid grid-cols-3 gap-2 mt-3">{game.tasks.slice(0, 9).map((t, i) => { const d = done.get(i); const open = flipped === i || !!d;
        return <button key={i} type="button" aria-label={open ? t : `Tile ${i + 1}, face down`} aria-pressed={flipped === i} onClick={() => setFlipped(flipped === i ? null : i)} className={`relative min-h-24 rounded-lg border border-border p-2 text-left text-xs font-semibold ${open ? "bg-card qotw-flip" : "bg-muted"}`}>
          {open ? <span className="line-clamp-4">{t}</span> : <span className="flex h-full items-center justify-center font-display text-2xl font-extrabold text-muted-foreground">{i + 1}</span>}
          {d && !d.declined_at && <span className={`absolute right-1 bottom-1 rounded-full border-2 border-primary px-2 text-[11px] font-extrabold uppercase text-primary ${stamped === i ? "stamp-arrive" : ""}`}>Stamped</span>}
        </button>; })}</div>
      {flipped !== null && !done.has(flipped) && <div className="mt-3 rounded-lg border border-border p-3"><p className="font-bold">{game.tasks[flipped]}</p>{proofInput(flipped)}</div>}
      <p className="text-sm mt-3">{counted.length} of 9 stamped · {lines ? "Line bonus earned" : "No line yet"}{counted.length >= 9 ? " · Blackout" : ""}</p>{err}</section>;
  }

  if (!revealed) return <section className="flight-card p-4">{head}<p className="text-sm text-muted-foreground">{game.game === "scavenger" ? `Five finds · 4 pts each · +5 if all five are done within 3 hours of revealing.` : `One task · 10 pts for the photo · +5 if you beat the ${game.speed_minutes ?? 60}-minute clock.`} The clock starts when you reveal.</p>
    <Button className="mt-3 min-h-11 w-full" disabled={viewOnly} onClick={() => void reveal()}><LockKeyhole size={16}/> Tap to reveal</Button>{err}</section>;

  if (game.game === "scavenger") return <section className="flight-card p-4">{head}<p className="text-sm text-muted-foreground">{counted.length} of {game.tasks.length} found · speed bonus window ends {new Date(Date.parse(revealed) + 3 * 3600e3).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
    <div className="mt-3 grid gap-3">{game.tasks.map((t, i) => <div key={i} className="rounded-lg border border-border p-3 qotw-flip"><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Find {i + 1}</p><p className="font-bold">{t}</p>{proofInput(i)}{stamped === i && <span className="stamp-arrive inline-block mt-2 rounded-full border-2 border-primary px-2 text-[11px] font-extrabold uppercase text-primary">Stamped</span>}</div>)}</div>{err}</section>;

  const end = Date.parse(revealed) + (game.speed_minutes ?? 60) * 60e3; const left = Math.max(0, end - now);
  const mm = String(Math.floor(left / 60e3)).padStart(2, "0"), ss = String(Math.floor(left / 1e3) % 60).padStart(2, "0");
  return <section className="flight-card p-4">{head}<div className="rounded-lg border border-border p-3 qotw-flip"><p className="font-bold">{game.tasks[0]}</p>
    <p className="mt-3 flex items-center gap-2 font-display text-3xl font-extrabold tabular-nums" aria-live="off"><Timer size={22}/> {left ? `${mm}:${ss}` : "Time’s up"}</p>
    <p className="text-xs text-muted-foreground">{left ? "Finish before the clock for +5." : "You can still add your photo for 10 pts."}</p>{proofInput(0)}{stamped === 0 && <span className="stamp-arrive inline-block mt-2 rounded-full border-2 border-primary px-2 text-[11px] font-extrabold uppercase text-primary">Stamped</span>}</div>{err}</section>;
}
