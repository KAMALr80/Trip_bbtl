import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { GAME_TYPES, gameTypes } from "@/lib/display-game-title";
import { friendlyError } from "@/lib/friendly-error";

type Game = { number: number; name: string };
type Night = { week_number: number; starts_at: string; game_number: number | null; game_locked: boolean; game_revealed: boolean; skipped: boolean; host_id: string | null };

export function NightGamePicker({ tripId, night, games, canPick, onSaved }: { tripId: string; night: Night; games: Game[]; canPick: boolean; onSaved: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState("");
  if (!canPick || night.skipped || night.game_locked || (night.game_number !== null && night.game_revealed) || new Date(night.starts_at).getTime() <= Date.now()) return null;
  async function save() {
    setBusy(true); setError("");
    const result = await (supabase as unknown as { rpc: (name: string, args: object) => PromiseLike<{ error: { message: string } | null }> }).rpc(choice === "surprise" ? "surprise_night_game" : "pick_night_game", choice === "surprise" ? { p_trip: tripId, p_week: night.week_number } : { p_trip: tripId, p_week: night.week_number, p_game: Number(choice) });
    if (result.error) setError(friendlyError(result.error)); else { setChoice(""); await onSaved(); }
    setBusy(false);
  }
  return <div className="mt-3 space-y-2" aria-label={`Pick Week ${night.week_number} game`}>
    <label className="block text-sm font-bold">{night.game_number ? `Change Week ${night.week_number}'s unrevealed game` : `Choose Week ${night.week_number}'s game`}
      <select className="mt-1 w-full h-12 rounded-md bg-card border border-border px-3 text-foreground" value={choice} onChange={e => setChoice(e.target.value)}>
        <option value="">Choose a game</option>
        <option value="surprise">Surprise me · all unplayed games</option>
        {GAME_TYPES.map(type => <optgroup key={type} label={type}>{games.filter(game => gameTypes(game.number).includes(type)).map(game => <option key={`${type}-${game.number}`} value={game.number}>{game.name}</option>)}</optgroup>)}
      </select>
    </label>
    <Button variant="playful" className="w-full min-h-11" disabled={busy || !choice} onClick={() => void save()}>{busy ? "Choosing…" : "Choose game"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}