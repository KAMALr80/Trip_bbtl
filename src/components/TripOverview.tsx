import { TripActions } from "@/components/TripActions";
import { tripDisplayName } from "@/lib/trip-display-name";
import { safeSetItem } from "@/lib/safe-storage";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";
import { friendlyDate, friendlyRange } from "@/lib/trip-dates";
import { tripToday, tripTz } from "@/lib/itinerary";
import { TripTimeline } from "./Itinerary";
import { PhotoWall } from "./Seasons";
import { ItineraryEditor } from "./Itinerary";
import { GamePlanPicker } from "./GamePlanPicker";
import { TripVibeTools, VibeBadge } from "./BetaAccess";
import { TripTimezoneField } from "./TripTimezoneField";
import { CaptainTakeover, EditPencil, Sheet } from "./CaptainExtras";
import { TripSectionIcon } from "./TripSectionIcon";
import { CaptainCrown } from "./CaptainCrown";

type Section = "plan" | "games" | "photos";
type Edit = "itinerary" | "plan" | "vibe" | "tz" | null;

function Accordion({
  title,
  open,
  onToggle,
  children,
  action,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="cinematic-trip-section mt-[14px]">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          data-view-navigation="true"
          className="flex-1 min-h-14 justify-between text-left font-display text-lg font-extrabold px-3"
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
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`tripjunkie-trip-sections-${trip.id}`);
      const parsed: unknown = stored ? JSON.parse(stored) : null;
      setOpen(
        Array.isArray(parsed)
          ? parsed.filter((x): x is Section => ["plan", "games", "photos"].includes(x))
          : [trip.start_date <= tripToday(tripTz(trip)) ? "plan" : "games"],
      );
    } catch {
      setOpen(["plan"]);
    }
    setFull(false);
  }, [trip.id, trip.start_date, trip.home_timezone]);
  function toggle(section: Section) {
    setOpen((current) => {
      const next = current.includes(section)
        ? current.filter((x) => x !== section)
        : [...current, section];
      safeSetItem(`tripjunkie-trip-sections-${trip.id}`, JSON.stringify(next));
      return next;
    });
  }
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
    <div className="cinematic-trip-overview pb-8">
      <p className="eyebrow text-primary">YOUR ROUTE · {trip.destination}</p>
      <h1 className="flex min-w-0 items-center gap-1 font-display text-[28px] font-extrabold mt-1">
        <TripSectionIcon trip={trip} />
        <span className="min-w-0 break-words">{tripDisplayName(trip.name)}</span>
        {trip.myRole === "captain" && <CaptainCrown />}
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

      {onWindowSeat && trip.kind !== "at_home" && (
        <Button variant="outline" className="mt-4 min-h-11" onClick={onWindowSeat}>
          Add to Window Seat <ChevronRight size={18} />
        </Button>
      )}
      <CaptainTakeover trip={trip} onChanged={saved} />
      <Accordion
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
        title="Pre-Flight"
        action={pencil("plan", "Pre-Flight start date")}
        open={open.includes("games")}
        onToggle={() => toggle("games")}
      >
        <p className="text-sm text-muted-foreground mt-2">
          {trip.game_start
            ? `Pre-Flight starts ${friendlyDate(trip.game_start)}.`
            : "Set when Pre-Flight starts with the pencil."}{" "}
          Call nights and daily cards arrive with the new setup.
        </p>
      </Accordion>
      <Accordion
        title="Photo wall"
        open={open.includes("photos")}
        onToggle={() => toggle("photos")}
      >
        <PhotoWall trip={trip} members={members} cards={cards} userId={userId} />
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
        <Sheet title="Pre-Flight start date" onClose={() => setEdit(null)}>
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
    </div>
  );
}
