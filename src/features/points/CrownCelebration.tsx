import { useEffect, useState } from "react";
import { Crown, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "@/components/BrandLockup";
import { Avatar } from "@/features/players/PlayerCards";
import { supabase } from "@/integrations/supabase/client";

import { tripDisplayName } from "@/lib/trip-display-name";
import type { TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Celebration = {
  id: string;
  trip: TripWithRole;
  title: string;
  label: string;
  score: number;
  prize?: string | null;
  avatar?: string;
  name: string;
};

/** Celebrates only records already awarded by the server. It never awards a point or changes a result. */
export function CrownCelebration({
  trips,
  userId,
  cards,
}: {
  trips: TripWithRole[];
  userId: string;
  cards: PlayerWithAvatar[];
}) {
  const [crown, setCrown] = useState<Celebration | null>(null);
  const [seen, setSeen] = useState<string[] | null>(null);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!trips.length) return;
    let live = true;
    async function check() {
      const profile = await supabase
        .from("profiles")
        .select("seen_tips")
        .eq("id", userId)
        .maybeSingle();
      if (!live || profile.error) return;
      const already = profile.data?.seen_tips ?? [];
      setSeen(already);
      const candidates: Celebration[] = [];
      // Crowns decided by the new engine (M3-11): Early Bird and Jet Setter.
      for (const trip of trips) {
        const [crowns, info] = await Promise.all([
          supabase
            .from("trip_crowns")
            .select("season,user_id,points")
            .eq("trip_id", trip.id)
            .eq("user_id", userId),
          supabase.rpc("season_info", { p_trip: trip.id }),
        ]);
        if (!live) return;
        if (crowns.error) continue;
        const identity = cards.find((card) => card.trip_id === trip.id && card.user_id === userId);
        for (const crown of crowns.data ?? []) {
          const early = crown.season === "preflight";
          const id = `crown:${trip.id}:${early ? "game" : "trip"}:${userId}`;
          if (already.includes(id)) continue;
          const prize = (info.data ?? []).find(
            (row) => row.season === (early ? "game" : "trip") && row.revealed,
          )?.prize;
          candidates.push({
            trip,
            name: identity?.game_name || "Champion",
            ...(identity?.avatarUrl ? { avatar: identity.avatarUrl } : {}),
            id,
            title: early ? "Early Bird crown!" : "Jet Setter crown!",
            label: early ? "Pre-Flight" : "Trip Season",
            score: crown.points,
            ...(prize ? { prize } : {}),
          });
        }
      }
      if (live) setCrown((current) => current ?? candidates[0] ?? null);
    }
    void check();
    return () => {
      live = false;
    };
  }, [trips, userId, cards]);

  async function continueOn() {
    if (!crown) return;
    const profile = await supabase
      .from("profiles")
      .select("seen_tips")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error) return;
    const next = Array.from(new Set([...(profile.data?.seen_tips ?? seen ?? []), crown.id]));
    const saved = await supabase.from("profiles").update({ seen_tips: next }).eq("id", userId);
    if (!saved.error) {
      setSeen(next);
      setCrown(null);
    }
  }

  async function share() {
    if (!crown) return;
    const text = `${crown.title} ${tripDisplayName(crown.trip.name)} · ${crown.label} · ${crown.score} points on TripJunkies™`;
    if (navigator.share) {
      try {
        await navigator.share({ title: crown.title, text });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
    } catch {
      setShared(false);
    }
  }

  if (!crown) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={crown.title}
      className="cinematic-crown-celebration"
    >
      <div className="cinematic-crown-confetti" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => (
          <i
            key={i}
            style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 11) * 0.17}s` }}
          />
        ))}
      </div>
      <div className="cinematic-crown-content">
        <BrandLockup className="text-2xl" compact />
        <Crown className="cinematic-crown-icon" aria-hidden="true" strokeWidth={1.3} />
        <h2 className="font-display text-4xl font-extrabold">{crown.title}</h2>
        <p className="mt-2 font-bold">
          {tripDisplayName(crown.trip.name)} · {crown.label}
        </p>
        <Avatar url={crown.avatar} name={crown.name} className="cinematic-crown-avatar" />
        <p className="font-display text-xl font-bold break-words">{crown.name}</p>
        <p className="font-display text-5xl font-extrabold text-gold mt-2">
          {crown.score}
          <span className="text-xl"> {crown.score === 1 ? "point" : "points"}</span>
        </p>
        {crown.prize && <p className="mt-3 text-sm font-bold">🎁 {crown.prize}</p>}
        <Button
          variant="playful"
          size="lg"
          className="w-full mt-8"
          onClick={() => void continueOn()}
        >
          Continue
        </Button>
        <Button variant="link" className="text-blue mt-3" onClick={() => void share()}>
          <Share2 size={16} />
          {shared ? "Copied to share" : "Share with my squad"}
        </Button>
      </div>
    </div>
  );
}
/** Local-only crown for a one-phone Game Night: no server, no saving. */
export function LocalCrownCelebration({
  name,
  label,
  score,
  onContinue,
}: {
  name: string;
  label: string;
  score: number;
  onContinue: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Game Night Crown"
      className="cinematic-crown-celebration"
    >
      <div className="cinematic-crown-confetti" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => (
          <i
            key={i}
            style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 11) * 0.17}s` }}
          />
        ))}
      </div>
      <div className="cinematic-crown-content">
        <BrandLockup className="text-2xl" compact />
        <Crown className="cinematic-crown-icon" aria-hidden="true" strokeWidth={1.3} />
        <h2 className="font-display text-4xl font-extrabold">Game Night Crown!</h2>
        <p className="mt-2 font-bold">{label}</p>
        <Avatar name={name} className="cinematic-crown-avatar" />
        <p className="font-display text-xl font-bold break-words">{name}</p>
        <p className="font-display text-5xl font-extrabold text-gold mt-2">
          {score}
          <span className="text-xl"> {score === 1 ? "point" : "points"}</span>
        </p>
        <Button variant="playful" size="lg" className="w-full mt-8" onClick={onContinue}>
          See the scoreboard
        </Button>
      </div>
    </div>
  );
}
