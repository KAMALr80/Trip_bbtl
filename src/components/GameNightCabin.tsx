import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayNights } from "@/components/GameNights";
import { SealedQuests } from "@/components/SealedQuests";
import { PlayFooter } from "@/components/PlayFooter";
import { GameNightCall } from "@/components/GameNightExtras";
import screenArt from "@/assets/play-flight-screen.webp";
import homeRoomArt from "@/assets/travel-from-home-room.webp";
import windowRoomArt from "@/assets/window-seat-room.webp";
import { AtHomePlay, isAtHome } from "@/components/AtHome";
import { supabase } from "@/integrations/supabase/client";
import { CULTURE_LAYERS } from "@/lib/culture-pool";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

const STEPS = ["Check-in", "Boarding", "Cruising", "Final approach", "Landing"];
export function GameNightCabin({
  trip,
  members,
  cards,
  userId,
  viewOnly,
  onClose,
  onMember,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  viewOnly: boolean;
  onClose: () => void;
  onMember?: ((id: string) => void) | undefined;
}) {
  const [flow, setFlow] = useState<{
    phase: string;
    first_player: string | null;
    week_number: number;
  } | null>(null);
  const [night, setNight] = useState<{
    week_number: number;
    starts_at: string;
    skipped: boolean;
    host_id: string | null;
  } | null>(null);
  const [cultureTheme, setCultureTheme] = useState<{
    title: string;
    layer: string;
    kind: string;
  } | null>(null);
  useEffect(() => {
    let live = true;
    void supabase
      .from("culture_experiences")
      .select("title,culture_layer,a2e_kind")
      .eq("trip_id", trip.id)
      .not("a2e_kind", "is", null)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (live && data)
          setCultureTheme({
            title: data.title,
            layer: data.culture_layer ?? "mixed",
            kind: data.a2e_kind ?? "",
          });
      });
    return () => {
      live = false;
    };
  }, [trip.id]);
  useEffect(() => {
    const load = async () => {
      const [n, l] = await Promise.all([
        supabase
          .from("game_nights")
          .select("week_number,starts_at,skipped,host_id")
          .eq("trip_id", trip.id)
          .order("starts_at", { ascending: false }),
        supabase.rpc("games_live", { p_trip: trip.id }),
      ]);
      const open =
        l.data === true
          ? (n.data?.find(
              (row) =>
                !row.skipped &&
                new Date(row.starts_at).getTime() - 15 * 60000 <= Date.now() &&
                new Date(row.starts_at).getTime() + 3.5 * 3600000 > Date.now(),
            ) ?? null)
          : null;
      setNight(open);
      if (open) {
        const { data } = await supabase
          .from("game_night_flow")
          .select("phase,first_player,week_number")
          .eq("trip_id", trip.id)
          .eq("week_number", open.week_number)
          .maybeSingle();
        setFlow(data);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 8000);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearInterval(timer);
      document.body.style.overflow = previous;
    };
  }, [trip.id]);
  const current =
    flow?.phase === "cards" ? 2 : flow?.phase === "finale" ? 3 : flow?.first_player ? 1 : 0;
  const host =
    !viewOnly &&
    !!night &&
    (trip.myRole === "captain" || trip.myRole === "co_captain" || night.host_id === userId);
  const locate = (suffix: string | undefined) =>
    suffix &&
    document.getElementById(`${suffix}-${trip.id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  const isHomeRoom = !!cultureTheme && cultureTheme.kind !== "inspire";
  const isWindowRoom = cultureTheme?.kind === "inspire";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isHomeRoom ? "Travel From Home Game Night" : "Game Night cabin"}
      className={`flight-cabin fixed inset-0 z-[80] overflow-y-auto bg-background text-foreground ${isHomeRoom ? "home-game-night home-room-scene" : isWindowRoom ? "window-game-night window-room-scene" : ""}`}
    >
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 backdrop-blur">
          <div>
            <p className="eyebrow text-primary">
              {cultureTheme
                ? `${CULTURE_LAYERS.find((l) => l.id === cultureTheme.layer)?.label ?? "Culture"} · GAME NIGHT`
                : `${trip.destination || "Your destination"} · LIVE FLIGHT`}
            </p>
            <h1 className="font-display text-xl font-extrabold">
              {cultureTheme ? cultureTheme.title : "Game Night cabin"}
            </h1>
          </div>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={onClose}
            aria-label="Leave Game Night cabin"
          >
            <X size={18} /> Leave
          </Button>
        </header>
        <nav
          aria-label={isHomeRoom ? "Game Night path" : "Flight path"}
          className="flight-cabin-path mt-4"
        >
          {STEPS.map((s, i) => (
            <span
              key={s}
              aria-current={i === current ? "step" : undefined}
              className={i === current ? "flight-cabin-current" : ""}
            >
              {isHomeRoom ? ["Welcome", "Settle in", "Play", "Showcase", "Finale"][i] : s}
            </span>
          ))}
        </nav>
        <figure className="game-night-room-art mt-4 max-w-[520px] overflow-hidden rounded-xl">
          <img
            src={isHomeRoom ? homeRoomArt : isWindowRoom ? windowRoomArt : screenArt}
            width={isHomeRoom || isWindowRoom ? 1536 : 780}
            height={isHomeRoom || isWindowRoom ? 1024 : 390}
            alt={
              isHomeRoom
                ? "Friends gathered for a lamp-lit game night at home"
                : isWindowRoom
                  ? "Sunset through an airplane window"
                  : "Seatback flight screen in the cabin"
            }
            className="h-full w-full object-cover"
          />
          <figcaption>
            {cultureTheme
              ? "Existing image placeholder · final room art pending approval"
              : "Game Night"}
          </figcaption>
        </figure>
        {host && (
          <div
            className="sticky top-20 z-10 mt-3 flex gap-2 overflow-x-auto rounded-xl bg-card/95 p-2 backdrop-blur"
            aria-label="Host controls"
          >
            {[
              ["Next", "gameday-flow"],
              ["Lock", "play-game"],
              ["Reveal", "play-votes"],
              ["Pick winner", "night-leaderboard"],
            ].map(([label, target]) => (
              <Button
                key={label}
                variant="outline"
                className="min-h-11 shrink-0"
                onClick={() => locate(target)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        <GameNightCall trip={trip} userId={userId} viewOnly={viewOnly} compact />
        <Button
          variant="outline"
          className="w-full min-h-11 mt-3"
          onClick={() => locate("play-game")}
        >
          Games · tonight's live game
        </Button>
        {isAtHome(trip) ? (
          <AtHomePlay
            trip={trip}
            cards={cards}
            userId={userId}
            viewOnly={viewOnly}
            refresh={async () => {}}
          />
        ) : (
          <PlayNights
            trip={trip}
            members={members}
            userId={userId}
            players={cards}
            viewOnly={viewOnly}
            embedded
            onMember={onMember}
          />
        )}
        <section className="mt-4" aria-label="Show and Tell">
          <h2 className="font-display text-xl font-extrabold">Final approach · Show & Tell</h2>
          <p className="text-sm text-muted-foreground">
            Share your quest, its backstory and the why. Your Captain sets the pace aloud.
          </p>
          <SealedQuests
            trip={trip}
            members={members}
            cards={cards}
            userId={userId}
            viewOnly={viewOnly}
            proofOnly
          />
        </section>
        <section className="mt-4" aria-label="Landing and scores">
          <h2 className="font-display text-xl font-extrabold">Landing · points recap</h2>
          <PlayFooter trip={trip} members={members} cards={cards} onMember={onMember} />
        </section>
      </div>
    </div>
  );
}
