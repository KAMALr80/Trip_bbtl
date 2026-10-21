import { displayGameTitle } from "@/lib/display-game-title";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import cards from "@/assets/game-world-cards.jpg";
import draw from "@/assets/game-world-draw.jpg";
import song from "@/assets/game-world-song.jpg";
import never from "@/assets/game-world-never.jpg";
import vote from "@/assets/game-world-vote.jpg";
import truths from "@/assets/game-world-truths.jpg";
import bingo from "@/assets/game-world-bingo.jpg";
import hunt from "@/assets/game-world-hunt.jpg";
import mix from "@/assets/game-world-mix.jpg";
import wheel from "@/assets/boarding-game-2.webp";
import { premadeAvatars } from "@/lib/player-cards";

const scenes = [cards, wheel, draw, song, never, vote, truths, bingo, hunt, mix];
export function gameSceneArt(title: string) {
  return scenes[gameSceneFor(title)] ?? cards;
}

export function gameSceneFor(title: string) {
  const value = title.toLowerCase();
  if (value.includes("spin") || value.includes("wheel")) return 1;
  if (value.includes("draw")) return 2;
  if (value.includes("song")) return 3;
  if (value.includes("never")) return 4;
  if (value.includes("vote") || value.includes("showdown")) return 5;
  if (value.includes("truth") || value.includes("lie")) return 6;
  if (value.includes("bingo")) return 7;
  if (value.includes("scavenger") || value.includes("hunt")) return 8;
  if (value.includes("mix")) return 9;
  return 0;
}

export function GameScene({
  index,
  title,
  phase,
  icon,
  crew,
  progress,
  onBack,
  onMember,
  children,
}: {
  index: number;
  title: string;
  phase: string;
  icon: string;
  crew: { userId?: string; name: string; avatar: string; done?: boolean }[];
  progress?: ReactNode;
  onBack?: () => void;
  onMember?: ((id: string) => void) | undefined;
  children: ReactNode;
}) {
  return (
    <div className={`cinematic-game-scene cinematic-game-scene-${index}`}>
      <img
        className="cinematic-game-world"
        src={scenes[index] ?? cards}
        alt=""
        width={1536}
        height={1536}
        loading="lazy"
        sizes="(max-width: 520px) calc(100vw - 36px), 512px"
      />
      <div className="cinematic-game-content">
        <header className="cinematic-game-header">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to Games on Flight"
              onClick={onBack}
            >
              <ArrowLeft />
            </Button>
          )}
          <img src={icon} alt="" width={48} height={48} />
          <span className="min-w-0">
            <span className="eyebrow">{phase}</span>
            <strong className="font-display">{displayGameTitle(title)}</strong>
          </span>
        </header>
        <div className={`cinematic-game-play cinematic-hero-${index}`}>{children}</div>
        {progress && <div className="cinematic-game-progress">{progress}</div>}
        <div className="cinematic-game-crew" aria-label="Your crew">
          {crew.map((person, i) =>
            person.userId && onMember ? (
              <Button
                key={`${person.name}-${i}`}
                variant="ghost"
                className="min-h-11 h-auto flex-col"
                title={`${person.name}${person.done ? " · ready" : ""}`}
                onClick={() => onMember(person.userId as string)}
              >
                <img
                  src={person.avatar || premadeAvatars[i % premadeAvatars.length]}
                  alt={`${person.name}'s avatar`}
                  width={36}
                  height={36}
                />
                <small>
                  {person.name}
                  {person.done ? " ✓" : ""}
                </small>
              </Button>
            ) : (
              <span
                key={`${person.name}-${i}`}
                title={`${person.name}${person.done ? " · ready" : ""}`}
              >
                <img
                  src={person.avatar || premadeAvatars[i % premadeAvatars.length]}
                  alt={`${person.name}'s avatar`}
                  width={36}
                  height={36}
                />
                <small>
                  {person.name}
                  {person.done ? " ✓" : ""}
                </small>
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
