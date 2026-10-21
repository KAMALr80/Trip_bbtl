import { TripActions } from "@/components/TripActions";
import { nextGameNight } from "@/lib/next-game-night";
import { displayGameTitle } from "@/lib/display-game-title";
import { tripDisplayName } from "@/lib/trip-display-name";
import { confirmInApp } from "@/lib/confirm";
import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { fmtWhen } from "@/lib/viewer-time";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import { friendlyRange } from "@/lib/trip-dates";
import { tripToday, tripTz } from "@/lib/itinerary";
import { TripTimeline } from "./Itinerary";
import { PhotoWall } from "./Seasons";
import { FeatureGate } from "@/lib/features";
import { CostReminder, TripCostsPlayer } from "./TripCosts";
import { ItineraryEditor } from "./Itinerary";
import { GamePlanPicker } from "./GamePlanPicker";
import { TripVibeTools, VibeBadge } from "./BetaAccess";
import { TripTimezoneField } from "./TripTimezoneField";
import { TeamsEditor } from "./Seasons";
import { CaptainTakeover, EditPencil, Sheet, TeamPicker } from "./CaptainExtras";
import { GameNightCalendar } from "./GameNightCalendar";
import { TripSectionIcon } from "./TripSectionIcon";
import { CaptainCrown } from "./CaptainCrown";
import { useLook } from "@/lib/look";

type Night = Tables<"game_nights">;
type Game = Tables<"game_catalog">;
type Section = "plan" | "games" | "hosts" | "photos" | "costs" | "teams";
type Edit = "itinerary" | "plan" | "vibe" | "tz" | "teams" | null;

function Accordion({
  title,
  open,
  onToggle,
  children,
  action,
  cinematic = false,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  action?: ReactNode;
  cinematic?: boolean;
}) {
  return (
    <section
      className={
        cinematic ? "cinematic-trip-section mt-[14px]" : "mt-[14px] border-b border-border pb-3"
      }
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          data-view-navigation="true"
          className={`flex-1 min-h-14 justify-between text-left font-display text-lg font-extrabold ${cinematic ? "px-3" : "px-0"}`}
          aria-expanded={open}
          onClick={onToggle}
        >
          {title}
          <span className="luggage-toggle">
            <ChevronDown
              className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </span>
        </Button>
        {action}
      </div>
      {open && <div>{children}</div>}
    </section>
  );
}

export function TripOverview({
  trip,
  members,
  cards,
  userId,
  itineraryVersion,
  onUpdated,
  onJourney,
  onWindowSeat,
  viewOnly = false,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  itineraryVersion: number;
  onUpdated?: () => void | Promise<void>;
  onJourney?: (() => void) | undefined;
  onWindowSeat?: (() => void) | undefined;
  viewOnly?: boolean;
}) {
  const cinematic = useLook("journey") === "cinematic";
  const [full, setFull] = useState(false);
  const [edit, setEdit] = useState<Edit>(null),
    [bump, setBump] = useState(0);
  const captain = trip.myRole === "captain" && !viewOnly;
  const saved = async () => {
    setBump((b) => b + 1);
    await onUpdated?.();
  };
  const pencil = (e: Exclude<Edit, null>, label: string) =>
    captain ? <EditPencil label={label} onClick={() => setEdit(e)} /> : null;
  const tz =
    (trip as TripWithRole & { trip_timezone?: string }).trip_timezone || trip.home_timezone;
  const [open, setOpen] = useState<Section[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState("");
  const [nightBusy, setNightBusy] = useState(false);
  async function toggleNight(week: number, skipped: boolean) {
    if (!skipped && !(await confirmInApp(`Mark Week ${week} as skipped? Nobody loses points.`)))
      return;
    setNightBusy(true);
    const result = await supabase.rpc("set_night_skipped", {
      p_trip: trip.id,
      p_week: week,
      p_skipped: !skipped,
    });
    setNightBusy(false);
    if (result.error) setError(friendlyError(result.error));
    else {
      setNights((rows) =>
        rows.map((n) => (n.week_number === week ? { ...n, skipped: !skipped } : n)),
      );
      setError("");
    }
  }
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`tripjunkie-trip-sections-${trip.id}`);
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      setOpen(
        Array.isArray(parsed)
          ? parsed.filter((x): x is Section =>
              ["plan", "games", "hosts", "photos", "costs", "teams"].includes(x),
            )
          : [trip.start_date <= tripToday(tripTz(trip)) ? "plan" : "games"],
      );
    } catch {
      setOpen(["plan"]);
    }
    setFull(false);
  }, [trip.id, trip.start_date, trip.home_timezone]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [n, g] = await Promise.all([
        supabase.from("game_nights").select("*").eq("trip_id", trip.id).order("week_number"),
        supabase.from("game_catalog").select("*").order("number"),
      ]);
      if (!alive) return;
      if (n.error || g.error) setError("Could not load game nights. Try again later.");
      else {
        setNights(n.data ?? []);
        setGames(g.data ?? []);
        setError("");
      }
    };
    void load();
    const changed = () => void load();
    window.addEventListener("tripjunkie-night-game-changed", changed);
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("tripjunkie-night-game-changed", changed);
    };
  }, [trip.id]);
  function toggle(section: Section) {
    setOpen((current) => {
      const next = current.includes(section)
        ? current.filter((x) => x !== section)
        : [...current, section];
      safeSetItem(`tripjunkie-trip-sections-${trip.id}`, JSON.stringify(next));
      return next;
    });
  }
  const next = nextGameNight(nights, Date.now());
  const format = (date: string) => fmtWhen(date, trip.home_timezone);
  if (full)
    return (
      <div className="pb-8">
        <Button
          variant="ghost"
          data-view-navigation="true"
          className="-ml-2"
          onClick={() => setFull(false)}
        >
          <ArrowLeft /> Trip
        </Button>
        <h1 className="font-display text-2xl font-extrabold mt-5">Full itinerary</h1>
        <TripTimeline trip={trip} version={itineraryVersion + bump} />
      </div>
    );
  return (
    <div className={cinematic ? "cinematic-trip-overview pb-8" : "pb-8"}>
      <p className="eyebrow text-primary">YOUR ROUTE · {trip.destination}</p>
      <h1 className="flex min-w-0 items-center gap-1 font-display text-[28px] font-extrabold mt-1">
        <TripSectionIcon trip={trip} />
        <span className="min-w-0 break-words">{tripDisplayName(trip.name)}</span>
        {cinematic && trip.myRole === "captain" && <CaptainCrown />}
        {!viewOnly && onUpdated && (
          <span className="ml-auto">
            <TripActions
              trip={trip}
              members={members}
              cards={cards}
              userId={userId}
              onDone={onUpdated}
            />
          </span>
        )}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">{trip.destination}</p>
      <p className="mt-4 text-xs text-muted-foreground">
        {friendlyRange(trip.start_date, trip.end_date)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1">
          <VibeBadge vibe={((trip as TripWithRole & { vibe?: string }).vibe ?? "chill") as never} />
          {pencil("vibe", "trip vibe")}
        </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          🌏 {tz.replace(/_/g, " ")}
          {pencil("tz", "trip time zone")}
        </span>
      </div>
      {!cinematic && onJourney && (
        <Button variant="outline" className="home-journey-action mt-5" onClick={onJourney}>
          <MapPinned size={24} className="text-blue" />
          <span>
            <strong>Journey</strong>
            <small>Follow your squad's route</small>
          </span>
          <ChevronRight size={18} />
        </Button>
      )}
      {onWindowSeat && trip.kind !== "at_home" && (
        <Button variant="outline" className="mt-4 min-h-11" onClick={onWindowSeat}>
          Add to Window Seat <ChevronRight size={18} />
        </Button>
      )}
      <CaptainTakeover trip={trip} onChanged={saved} />
      <CostReminder trip={trip} userId={userId} />
      <Accordion
        cinematic={cinematic}
        title="What's next · itinerary"
        action={pencil("itinerary", "itinerary, spots and excursions")}
        open={open.includes("plan")}
        onToggle={() => toggle("plan")}
      >
        <TripTimeline trip={trip} version={itineraryVersion + bump} preview />
        <Button
          variant="outline"
          data-view-navigation="true"
          className="w-full justify-between"
          onClick={() => setFull(true)}
        >
          See full itinerary <ChevronRight size={18} />
        </Button>
      </Accordion>
      <Accordion
        cinematic={cinematic}
        title="Games to come"
        action={pencil("plan", cinematic ? "Pre-Flight start date" : "Game Day start date")}
        open={open.includes("games")}
        onToggle={() => toggle("games")}
      >
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {next ? (
          <div className="app-card mt-3">
            <p className="eyebrow text-green">NEXT GAME NIGHT</p>
            <p className="font-display font-extrabold mt-2">{format(next.starts_at)}</p>
            <p className="text-sm mt-2">
              {next.game_revealed
                ? displayGameTitle(
                    games.find((g) => g.number === next.game_number)?.name ?? "Mystery game",
                  )
                : "Mystery game"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            {nights.length
              ? "No more game nights scheduled."
              : "Your next game night will show here once scheduled."}
          </p>
        )}
      </Accordion>
      <div id={`trip-calendar-${trip.id}`}>
        <Accordion
          cinematic={cinematic}
          title={cinematic ? "Game Night Calendar" : "Game night calendar"}
          open={open.includes("hosts")}
          onToggle={() => toggle("hosts")}
        >
          {nights.length || cinematic ? (
            <FeatureGate tripId={trip.id} feature="calendar" compact>
              <GameNightCalendar
                trip={trip}
                nights={nights}
                games={games}
                members={members}
                cards={cards}
                userId={userId}
                viewOnly={viewOnly}
                renderLeaderActions={(n) =>
                  captain ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEdit("plan")}>
                        Game Day start date
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={nightBusy}
                        onClick={() => void toggleNight(n.week_number, n.skipped)}
                      >
                        {n.skipped ? "Un-skip night" : "Mark skipped"}
                      </Button>
                    </div>
                  ) : null
                }
              />
            </FeatureGate>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">
              Game nights will appear once scheduled.
            </p>
          )}
        </Accordion>
      </div>
      <Accordion
        cinematic={cinematic}
        title="Teams 🚩"
        action={pencil("teams", "teams")}
        open={open.includes("teams")}
        onToggle={() => toggle("teams")}
      >
        <FeatureGate tripId={trip.id} feature="teams" compact>
          <TeamPicker
            trip={trip}
            userId={userId}
            members={members}
            cards={cards}
            onEdit={captain ? () => setEdit("teams") : undefined}
          />
        </FeatureGate>
      </Accordion>
      <Accordion
        cinematic={cinematic}
        title="Trip pot 💸"
        open={open.includes("costs")}
        onToggle={() => toggle("costs")}
      >
        <FeatureGate tripId={trip.id} feature="trip_pot" compact>
          <TripCostsPlayer trip={trip} userId={userId} />
        </FeatureGate>
      </Accordion>
      <Accordion
        cinematic={cinematic}
        title="Photo wall"
        open={open.includes("photos")}
        onToggle={() => toggle("photos")}
      >
        <FeatureGate tripId={trip.id} feature="photo_wall" compact>
          <PhotoWall trip={trip} members={members} cards={cards} userId={userId} />
        </FeatureGate>
      </Accordion>
      {edit === "itinerary" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit itinerary"
          className="fixed inset-0 z-50 overflow-y-auto bg-background px-6 pt-6 pb-[var(--nav-clearance)]"
        >
          <div className="mx-auto max-w-lg">
            <ItineraryEditor trip={trip} onBack={() => setEdit(null)} onSaved={saved} />
          </div>
        </div>
      )}
      {edit === "plan" && (
        <Sheet
          title={cinematic ? "Pre-Flight start date" : "Game Day start date 🎯"}
          onClose={() => setEdit(null)}
        >
          <GamePlanPicker
            trip={trip}
            compact
            onSaved={async () => {
              await saved();
              setEdit(null);
            }}
          />
        </Sheet>
      )}
      {edit === "vibe" && (
        <Sheet title="Trip vibe ✨" onClose={() => setEdit(null)}>
          <TripVibeTools trip={trip} onSaved={saved} />
        </Sheet>
      )}
      {edit === "tz" && (
        <Sheet title="Trip time zone 🌏" onClose={() => setEdit(null)}>
          <TripTimezoneField trip={trip} />
        </Sheet>
      )}
      {edit === "teams" && (
        <Sheet title="Teams 🚩" onClose={() => setEdit(null)}>
          <TeamsEditor trip={trip} members={members} cards={cards} />
        </Sheet>
      )}
    </div>
  );
}
