import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameScene } from "./GameScene";
import { LocalCrownCelebration } from "./CrownCelebration";
import { practicePrompts } from "@/lib/practice-prompts";
import { gameNameProblem, normalizeName } from "@/lib/game-name";
import { displayGameTitle } from "@/lib/display-game-title";
import { premadeAvatars } from "@/lib/player-cards";
import { readOfflineRoster } from "@/lib/play-arrangement";

/** One-phone Game Night. Room-specific names, scores, and used prompts remain on this device. */
const KEY = "tj-game-night";
export type NightGame = { index: number; title: string; art: string; icon: string };
type Stage = "players" | "format" | "round" | "won" | "crown" | "end";
type Night = { selected?: number | null; stage: Stage; players: string[]; format: "one" | "mix"; game: number; rounds: number; round: number; games: number[]; prompts: string[]; scores: number[]; seconds: number; extra: number };
const fresh = (players: string[] = []): Night => ({ stage: "players", players, format: "one", game: 0, rounds: 3, round: 1, games: [], prompts: [], scores: players.map(() => 0), seconds: 0, extra: 0 });
const timerFor = (game: number) => (game === 2 ? 30 : game === 1 ? 30 : 0); // 30-sec Draw, Spin the wheel hot seat

function shuffle<T>(items: T[]) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }

export function OnePhoneNight({ games, onExit, tripId, destination }: { games: NightGame[]; onExit: () => void; tripId?: string; destination?: string }) {
  const storageKey = tripId ? `${KEY}:${tripId}` : KEY;
  const [n, setN] = useState<Night>(() => { try { const raw = localStorage.getItem(storageKey); return raw ? (JSON.parse(raw) as Night) : fresh(tripId ? readOfflineRoster(tripId) : []); } catch { return fresh(tripId ? readOfflineRoster(tripId) : []); } });
  const [name, setName] = useState(""), [error, setError] = useState("");
  useEffect(() => { try { if (n.players.length >= 2) localStorage.setItem(storageKey, JSON.stringify(n)); else localStorage.removeItem(storageKey); } catch { /* private browsing */ } }, [n, storageKey]);
  useEffect(() => { if (n.stage !== "round" || n.seconds <= 0) return; const t = window.setTimeout(() => setN(s => ({ ...s, seconds: s.seconds - 1 })), 1000); return () => window.clearTimeout(t); }, [n.stage, n.seconds]);

  const done = () => { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } onExit(); };
  const add = () => {
    const v = name.trim().replace(/\s+/g, " ");
    const p = gameNameProblem(v);
    if (p) return setError(p);
    if (n.players.some(x => normalizeName(x) === normalizeName(v))) return setError("That name is already playing.");
    if (n.players.length >= 10) return setError("Up to 10 players.");
    setN(s => ({ ...s, players: [...s.players, v], scores: [...s.scores, 0] })); setName(""); setError("");
  };
  const start = (s: Night): Night => {
    const pool = games.map(g => g.index);
    // Mix it up: a different built-in game each round (cycles through a shuffled deck).
    const deck = shuffle(pool);
    const order = Array.from({ length: s.rounds }, (_, i) => (s.format === "one" ? s.game : deck[i % deck.length]!));
    const historyKey = `${storageKey}:used-prompts`;
    let history: string[] = [];
    try { const saved = JSON.parse(localStorage.getItem(historyKey) ?? "[]") as unknown; if (Array.isArray(saved)) history = saved.filter((x): x is string => typeof x === "string"); } catch { /* unavailable storage */ }
    const used = new Set(history);
    const prompts = order.map(g => {
      const pool = practicePrompts[g] ?? [];
      // Once a deck is exhausted, reuse a different angle rather than displaying an empty card.
      const p = shuffle(pool).find(x => !used.has(x)) ?? shuffle(pool)[0] ?? "Ask everyone to share one thing they learned about the destination.";
      used.add(p);
      const groupPrompt = s.players.length >= 4 ? " Split into teams or pass the phone; vote for your favorite." : " Pass the phone and vote for your favorite.";
      return destination ? `${p} Connect your answer to ${destination}: a food, local custom, landmark, music, or a respectful fact you learned.${groupPrompt}` : p;
    });
    if (tripId) { try { localStorage.setItem(historyKey, JSON.stringify([...used].slice(-300))); } catch { /* unavailable storage */ } }
    return { ...s, stage: "round", round: 1, games: order, prompts, scores: s.players.map(() => 0), seconds: timerFor(order[0]!), extra: 0 };
  };
  const award = (who: number | null) => setN(s => {
    if (s.stage !== "won") return s;
    const scores = s.scores.map((v, i) => (i === who ? v + 1 : v));
    if (s.round >= s.rounds) return { ...s, scores, selected: null, stage: "crown" };
    const g = s.games[s.round]!;
    return { ...s, scores, selected: null, round: s.round + 1, stage: "round", seconds: timerFor(g), extra: 0 };
  });

  const back = <Button variant="ghost" onClick={onExit}><ArrowLeft /> Games on Flight</Button>; // keeps the saved night so it can resume
  if (n.stage === "players") return <section className="pb-12">{back}
    <p className="eyebrow text-blue mt-5">ONE-PHONE GAME NIGHT</p><h1 className="font-display text-3xl font-extrabold mt-1">Who's Playing?</h1>
    <p className="text-sm text-muted-foreground mt-1">{tripId ? "2–10 players. Names and scores stay on this device; another device cannot recover them." : "2–10 players. Pass the phone around — nothing is saved to any account."}</p>
    <form className="mt-5 flex gap-2" onSubmit={e => { e.preventDefault(); add(); }}><input aria-label="Player name" value={name} maxLength={15} onChange={e => { setName(e.target.value); setError(""); }} placeholder="Add a name" className="flex-1 min-h-12 rounded-full border border-border bg-card px-4 text-base"/><Button type="submit" variant="playful" className="min-h-12" disabled={n.players.length >= 10}><Plus /> Add</Button></form>
    {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2" aria-label="Players">{n.players.map((p, i) => <span key={p} className="inline-flex items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2 py-1 font-bold"><img src={premadeAvatars[i] ?? ""} alt="" width={32} height={32} className="size-8 rounded-full object-cover"/>{p}<button type="button" aria-label={`Remove ${p}`} className="min-h-8 min-w-8 grid place-items-center text-muted-foreground" onClick={() => setN(s => ({ ...s, players: s.players.filter((_, j) => j !== i), scores: s.scores.filter((_, j) => j !== i) }))}><X size={16} /></button></span>)}</div>
    <p className="mt-4 text-sm">Pass the phone: whoever's up reads the prompt out loud.</p>
    <Button variant="playful" size="lg" className="w-full mt-6" disabled={n.players.length < 2} onClick={() => setN(s => ({ ...s, stage: "format" }))}>Next: Pick the Format</Button>
  </section>;

  if (n.stage === "format") return <section className="pb-12"><Button variant="ghost" onClick={() => setN(s => ({ ...s, stage: "players" }))}><ArrowLeft /> Players</Button>
    <h1 className="font-display text-3xl font-extrabold mt-5">Pick the Format</h1>
    <div className="mt-4 grid grid-cols-2 gap-2">{(["one", "mix"] as const).map(f => <Button key={f} variant={n.format === f ? "playful" : "outline"} className="min-h-12 rounded-full" onClick={() => setN(s => ({ ...s, format: f }))}>{f === "one" ? "One Game" : "Mix of games"}</Button>)}</div>
    {n.format === "one" ? <div className="mt-4 grid grid-cols-2 gap-2">{games.map(g => <Button key={g.index} variant={n.game === g.index ? "playful" : "outline"} className="h-auto min-h-14 flex-col whitespace-normal py-2" onClick={() => setN(s => ({ ...s, game: g.index }))}><img src={g.art} alt="" width={48} height={48} className="size-12 object-contain"/>{displayGameTitle(g.title)}</Button>)}</div> : <p className="mt-4 text-sm text-muted-foreground">A different built-in game each round. AI custom cards need a signed-in profile and credits.</p>}
    <p className="eyebrow mt-6">ROUNDS</p><div className="mt-2 grid grid-cols-3 gap-2">{[3, 5, 8].map(r => <Button key={r} variant={n.rounds === r ? "playful" : "outline"} className="min-h-12 rounded-full" onClick={() => setN(s => ({ ...s, rounds: r }))}>{r}</Button>)}</div>
    <Button variant="playful" size="lg" className="w-full mt-6" onClick={() => setN(s => start(s))}>Start the Night</Button>
  </section>;

  const g = games.find(x => x.index === n.games[n.round - 1]) ?? games[0]!;
  const up = n.players[(n.round - 1) % n.players.length] ?? "";
  const crew = n.players.map((p, i) => ({ name: p, avatar: premadeAvatars[i] ?? "", done: p === up }));
  const board = n.players.map((p, i) => ({ p, s: n.scores[i] ?? 0, i })).sort((a, b) => b.s - a.s);
  const top = board[0]?.s ?? 0, winners = board.filter(x => x.s === top && top > 0).map(x => x.p);

  if (n.stage === "crown") return <LocalCrownCelebration name={winners.join(" & ") || "Nobody this time"} label={`One-Phone Game Night · ${n.rounds} rounds`} score={top} onContinue={() => setN(s => ({ ...s, stage: "end" }))}/>;
  if (n.stage === "end") return <section className="pb-12">{back}
    <h1 className="font-display text-3xl font-extrabold mt-5">Scoreboard</h1>
    <ol className="mt-4 grid gap-2">{board.map((x, rank) => <li key={x.p} className="app-card flex items-center gap-3 py-3"><span className="font-display text-xl font-extrabold w-6">{rank + 1}</span><img src={premadeAvatars[x.i] ?? ""} alt="" width={40} height={40} className="size-10 rounded-full object-cover"/><span className="flex-1 font-bold">{x.p}{winners.includes(x.p) && " 👑"}</span><span className="font-display text-xl font-extrabold">{x.s}</span></li>)}</ol>
    <p className="text-xs text-muted-foreground mt-3">{tripId ? "Scores stay on this device, never on anyone’s profile or leaderboard." : "Just for tonight — nothing goes to passports or leaderboards."}</p>
    <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="playful" size="lg" onClick={() => setN(s => start({ ...fresh(s.players), format: s.format, game: s.game, rounds: s.rounds }))}>Play Again</Button><Button variant="outline" size="lg" onClick={done}>Done</Button></div>
  </section>;

  const max = 30 + 30;
  return <GameScene index={g.index} title={g.title} phase={`Round ${n.round} of ${n.rounds}`} icon={g.art} crew={crew} progress={<span>Round {n.round} of {n.rounds}{n.seconds > 0 || timerFor(g.index) ? ` · ${n.seconds}s` : ""}</span>} onBack={onExit}>
    <div className="mt-4">
      <p className="eyebrow text-blue">ROUND {n.round} OF {n.rounds}</p>
      <h1 className="font-display text-3xl font-extrabold mt-1">{g.icon} {displayGameTitle(g.title)}</h1>
      <p className="mt-2 text-lg font-bold">Up now: {up}</p>
      {n.stage === "round" ? <>
        <div className="app-card mt-4 min-h-40 grid place-items-center text-center cinematic-hero-card"><p className="font-display text-xl font-bold">{n.prompts[n.round - 1]}</p></div>
        {timerFor(g.index) > 0 && <div className="mt-3 flex items-center justify-between gap-2"><span role="timer" className="font-display text-2xl font-extrabold"><Timer className="inline -mt-1" /> {n.seconds}s</span>{g.index === 2 && <Button variant="outline" disabled={30 + n.extra >= max} onClick={() => setN(s => ({ ...s, seconds: s.seconds + 10, extra: s.extra + 10 }))}>+10 sec</Button>}</div>}
        <Button variant="playful" size="lg" className="w-full mt-5" onClick={() => setN(s => ({ ...s, stage: "won", seconds: 0 }))}>Who Won This Round?</Button>
      </> : <>
        <h2 className="font-display text-2xl font-extrabold mt-5">Who Won This Round?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">{n.players.map((p, i) => <Button key={p} className="min-h-12" onClick={() => setN(s => ({ ...s, selected: i }))} aria-pressed={n.selected === i} variant={n.selected === i ? "playful" : "outline"}>{p}</Button>)}</div>
        <Button variant="ghost" className="w-full mt-2" onClick={() => setN(s => ({ ...s, selected: -1 }))}>Nobody</Button><Button variant="playful" className="w-full min-h-11 mt-3" disabled={n.selected === undefined || n.selected === null} onClick={() => award(n.selected === -1 ? null : n.selected ?? null)}>Lock winner</Button>
      </>}
    </div>
  </GameScene>;
}
