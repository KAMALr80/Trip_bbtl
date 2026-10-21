import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AvatarButton } from "@/components/PlayerCards";
import { GameArcade } from "@/components/GameArcade";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Score = { user_id: string; total: number };
const rpc = supabase as unknown as { rpc: (name: string, args: object) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export function PlayFooter({ trip, members, cards, onMember }: { trip: TripWithRole; members: Member[]; cards: PlayerWithAvatar[]; onMember?: ((id: string) => void) | undefined }) {
  const [rows, setRows] = useState<Score[]>([]), [all, setAll] = useState(false), [practice, setPractice] = useState(false);
  const localOnly = trip.play_arrangement === "offline" || trip.play_arrangement === "solo";
  const season = trip.kind !== "trip" ? "home" : new Date(`${trip.start_date}T12:00:00`).getTime() <= Date.now() ? "trip" : "preflight";
  const load = useCallback(async () => { if (localOnly) return; const r = await rpc.rpc("season_points", { p_trip: trip.id, p_season: season }); if (!r.error) setRows((r.data as Score[]) ?? []); }, [trip.id, season, localOnly]);
  useEffect(() => { void load(); const t = window.setInterval(() => { if (!document.hidden) void load(); }, 30000); return () => window.clearInterval(t); }, [load]);
  if (practice) return <div className="mt-5"><GameArcade trips={[trip]} practiceMode onBack={() => setPractice(false)}/></div>;
  return <div className="flight-footer mt-6 space-y-5">
    {!localOnly && <section aria-label="Leaderboard"><div className="flex items-center justify-between gap-2"><h2 className="font-display text-xl font-extrabold">Leaderboard</h2>{rows.length > 3 && <Button variant="ghost" className="min-h-11" aria-expanded={all} onClick={() => setAll(v => !v)}>{all ? "See less" : "See all"}</Button>}</div><ol className="mt-3 grid gap-2">{(all ? rows : rows.slice(0, 3)).map((r, i) => { const c = cards.find(x => x.user_id === r.user_id); const playerName = c?.game_name || members.find(m => m.user_id === r.user_id)?.display_name || "Player"; return <li key={r.user_id} className="flex items-center gap-3 border border-border bg-card rounded-md p-2"><span className="w-6 text-center font-bold">{i + 1}</span><AvatarButton userId={r.user_id} onOpen={onMember} url={c?.avatarUrl} name={playerName} className="size-10 shrink-0"/><strong className="flex-1 truncate text-sm">{playerName}</strong><b>{r.total} pts</b></li>; })}</ol></section>}
    <section aria-label="Practice" className="border-t border-border pt-4"><h2 className="font-display text-xl font-extrabold">Practice</h2><p className="text-sm text-muted-foreground mt-1">Nothing is saved to your score.</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => setPractice(true)}>Practice a game</Button></section>
  </div>;
}