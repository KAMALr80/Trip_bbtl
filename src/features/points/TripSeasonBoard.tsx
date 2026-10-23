// Trip Season leaderboard (kept until the points ledger replaces it in M3-16).
import { safeSetItem } from "@/lib/safe-storage";
import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/features/players/PlayerCards";
import { StampBadge } from "@/features/passport/StampBadge";
import type { Member, TripWithRole } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import { tripToday, tripTz } from "@/lib/itinerary";

export const tripHasStarted = (t: TripWithRole) => tripToday(tripTz(t)) >= t.start_date;

export type SeasonRow = {
  user_id: string;
  stamps: number;
  today_stamps: number;
  max_stamps: number;
  score?: number;
  carry_on?: number;
};

export function TripSeasonBoard({
  trip,
  members,
  cards,
  userId,
  rows: given,
  compact,
  onMember,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  rows?: SeasonRow[];
  compact?: boolean;
  onMember?: ((id: string) => void) | undefined;
}) {
  const [own, setOwn] = useState<SeasonRow[]>([]);
  useEffect(() => {
    if (given) return;
    const load = () =>
      supabase.rpc("trip_season_score", { p_trip: trip.id }).then(({ data }) => setOwn(data ?? []));
    void load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [trip.id, !!given]);
  const rows = (given ?? own)
    .map((r) => ({
      ...r,
      score:
        "score" in r
          ? Number(r.score)
          : Math.min(100, r.max_stamps ? Math.round((r.stamps / r.max_stamps) * 100) : 0),
    }))
    .sort((a, b) => b.score - a.score || b.stamps - a.stamps);
  const list = compact ? rows.slice(0, 5) : rows;
  const [allRows, setAllRows] = useState(false);
  useEffect(() => {
    try {
      setAllRows(localStorage.getItem(`board-trip-${trip.id}`) === "true");
    } catch {
      /* storage unavailable */
    }
  }, [trip.id]);
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-extrabold">Trip Season 🧳</h2>
      {list.length === 0 ? (
        <p className="text-sm text-ink-soft mt-2">Everyone starts at 0.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {(list.length > 3 && !allRows ? list.slice(0, 3) : list).map((s, i) => {
            const c = cards.find((x) => x.user_id === s.user_id);
            const name =
              c?.game_name ||
              members.find((m) => m.user_id === s.user_id)?.display_name ||
              "Player";
            return (
              <li
                key={s.user_id}
                role={onMember ? "button" : undefined}
                tabIndex={onMember ? 0 : undefined}
                aria-label={onMember ? "Open player card" : undefined}
                onClick={onMember ? () => onMember(s.user_id) : undefined}
                onKeyDown={
                  onMember
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onMember(s.user_id);
                        }
                      }
                    : undefined
                }
                className={`flex items-center gap-3 rounded-2xl p-3 ${onMember ? "cursor-pointer hover:border-primary" : ""} ${i === 0 && s.stamps > 0 ? "bg-orange-soft" : "bg-card border border-border"} ${s.user_id === userId ? "ring-2 ring-primary" : ""}`}
              >
                <span className="font-display font-extrabold w-6 text-center">{i + 1}</span>
                <span className="relative">
                  {i === 0 && s.stamps > 0 && (
                    <Crown
                      size={20}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 text-orange fill-orange"
                    />
                  )}
                  <Avatar url={c?.avatarUrl} name={name} className="h-11 w-11" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{name}</span>
                  <StampBadge tripId={trip.id} userId={s.user_id} />
                  <span className="block text-xs text-ink-soft">
                    🛂 {s.stamps} stamps · {s.today_stamps} today
                  </span>
                </span>
                <span className="passport-stamp bg-card px-2 py-1 font-display font-extrabold text-lg text-blue">
                  {s.score}
                </span>
              </li>
            );
          })}
          {list.length > 3 && (
            <li>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setAllRows(!allRows);
                  safeSetItem(`board-trip-${trip.id}`, String(!allRows));
                }}
              >
                {allRows ? "Show less" : `Show all (${list.length})`}
              </Button>
            </li>
          )}
        </ol>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        Score out of 100 = stamps earned ÷ max possible so far · separate from Pre-Flight
      </p>
    </section>
  );
}
