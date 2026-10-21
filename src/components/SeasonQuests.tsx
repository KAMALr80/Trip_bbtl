import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvatarButton } from "@/components/PlayerCards";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/friendly-error";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

type Score = {
  user_id: string;
  games: number;
  quests: number;
  showcase: number;
  legacy: number;
  other: number;
  total: number;
};
type QuestState = { kind: string; state: string };
const rpc = supabase as unknown as {
  rpc: (
    name: string,
    args: object,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** The shared player score strip; legacy quests are still counted by the server but not drawn as cards. */
export function SeasonQuests({
  trip,
  members,
  cards,
  userId,
  onMember,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly: boolean;
  compact?: boolean;
  onMember?: ((id: string) => void) | undefined;
}) {
  const [rows, setRows] = useState<Score[]>([]),
    [quests, setQuests] = useState<QuestState[]>([]);
  const [expanded, setExpanded] = useState(false),
    [error, setError] = useState("");
  const season =
    trip.kind !== "trip"
      ? "home"
      : new Date(`${trip.start_date}T12:00:00`).getTime() <= Date.now()
        ? "trip"
        : "preflight";
  const load = useCallback(async () => {
    const [s, q] = await Promise.all([
      rpc.rpc("season_points", { p_trip: trip.id, p_season: season }),
      rpc.rpc("sealed_quest_state", { p_trip: trip.id }),
    ]);
    if (s.error || q.error) {
      setError(friendlyError(s.error ?? q.error));
      return;
    }
    setRows((s.data as Score[]) ?? []);
    setQuests((q.data as QuestState[]) ?? []);
    setError("");
  }, [trip.id, season]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);
  const mine = rows.find((r) => r.user_id === userId);
  const rank = rows.findIndex((r) => r.user_id === userId) + 1;
  const avatar = cards.find((c) => c.user_id === userId);
  const drops = quests.filter((q) => q.kind === "sealed");
  const completed = drops.filter((q) => q.state === "counted" || q.state === "show_pending").length;
  const streak = (mine?.games ?? 0) > 0 ? "In flight" : "Ready to play";
  return (
    <section className="mt-4" aria-label="Your score">
      <div className="flight-score flex min-h-28 w-full items-center gap-3 px-4 py-3 text-left">
        <AvatarButton
          userId={userId}
          onOpen={onMember}
          url={avatar?.avatarUrl}
          name={avatar?.game_name || "Player"}
          className="size-12 shrink-0"
        />
        <Button
          variant="ghost"
          className="min-w-0 min-h-20 h-auto flex-1 justify-start whitespace-normal p-0 text-left"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="min-w-0 flex-1">
            <strong className="block text-xs text-blue uppercase">Your score</strong>
            <span className="font-display text-2xl font-extrabold">
              {mine?.total ?? 0} <small className="text-sm font-semibold">pts</small>
            </span>
            <small className="block text-muted-foreground">
              #{rank || "–"} of {rows.length || members.length} · {streak}
            </small>
            <small className="block text-muted-foreground leading-snug mt-1">
              Discovery (soon) · Daily Card (soon) · Quests {completed}/{drops.length}
            </small>
          </span>
          {expanded ? (
            <ChevronUp size={18} className="shrink-0" />
          ) : (
            <ChevronDown size={18} className="shrink-0" />
          )}
        </Button>
      </div>
      <div className="flight-progress" aria-hidden="true">
        <Plane size={16} />
        <span />
      </div>
      {expanded && (
        <div className="flight-score-detail text-sm" aria-label="Score breakdown">
          <p>
            Game nights <b>{mine?.games ?? 0}</b>
          </p>
          <p>
            Sealed quests <b>{mine?.quests ?? 0}</b>
          </p>
          <p>
            Showcase <b>{mine?.showcase ?? 0}</b>
          </p>
          <p>
            Early Check-In &amp; earlier quests <b>{mine?.legacy ?? 0}</b>
          </p>
          <p>
            {season === "trip" ? "Trip Season" : season === "home" ? "At Home" : "Other"}{" "}
            <b>{mine?.other ?? 0}</b>
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
