import { useEffect, useState } from "react";
import { Crown, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLockup } from "./BrandLockup";
import { Avatar } from "./PlayerCards";
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
      for (const trip of trips) {
        const [champs, info, nights, scores, board] = await Promise.all([
          supabase
            .from("season_champions")
            .select("season,user_id,score,created_at")
            .eq("trip_id", trip.id)
            .eq("user_id", userId)
            .in("season", ["game", "trip"]),
          supabase.rpc("season_info", { p_trip: trip.id }),
          supabase
            .from("game_nights")
            .select("week_number,starts_at,skipped")
            .eq("trip_id", trip.id),
          supabase
            .from("game_scores")
            .select("week_number,won,updated_at")
            .eq("trip_id", trip.id)
            .eq("user_id", userId)
            .eq("won", true),
          supabase.rpc("game_board", { p_trip: trip.id }),
        ]);
        if (!live) return;
        if (champs.error || info.error || nights.error || scores.error || board.error) continue;
        const identity = cards.find((card) => card.trip_id === trip.id && card.user_id === userId);
        const common = {
          trip,
          name: identity?.game_name || "Champion",
          ...(identity?.avatarUrl ? { avatar: identity.avatarUrl } : {}),
        };
        const score = board.data?.find((row) => row.user_id === userId)?.score;
        for (const champ of champs.data ?? []) {
          const detail = (info.data ?? []).find((row) => row.season === champ.season);
          if (!detail?.revealed) continue;
          const id = `crown:${trip.id}:${champ.season}:${userId}`;
          if (!already.includes(id))
            candidates.push({
              ...common,
              id,
              title: "Season Champion!",
              label: `${champ.season === "game" ? "Pre-Flight" : "Trip Season"} season`,
              score: champ.score,
              prize: detail.prize,
            });
        }
        for (const win of scores.data ?? []) {
          const night = nights.data?.find((row) => row.week_number === win.week_number);
          if (
            !night ||
            night.skipped ||
            Date.now() < new Date(night.starts_at).getTime() + 3 * 60 * 60 * 1000 ||
            score == null
          )
            continue;
          const id = `crown:${trip.id}:night:${win.week_number}:${userId}`;
          if (!already.includes(id))
            candidates.push({
              ...common,
              id,
              title: "Game Night Crown!",
              label: `Week ${win.week_number}`,
              score,
            });
        }
      }
      if (live) setCrown((current) => current ?? candidates[0] ?? null);
    }
    void check();
    return () => {
      live = false;
    };
  }, [true, trips, userId, cards]);

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
    const text = `${crown.title} ${tripDisplayName(crown.trip.name)} · ${crown.label} · ${crown.score}/100 on TripJunkies™`;
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
          <span className="text-xl">/100</span>
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
