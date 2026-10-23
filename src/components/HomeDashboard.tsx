import { rpc } from "@/data/rpc";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Plane, Search, Share2 } from "lucide-react";
import iconMap from "@/assets/icon-map.webp";
import iconPassport from "@/assets/icon-passport.webp";
import iconBoarding from "@/assets/icon-boarding-pass.webp";
import iconHome from "@/assets/icon-at-home.webp";
import iconCompass from "@/assets/icon-compass.webp";
import iconSuitcase from "@/assets/icon-suitcase.webp";
import gameOptionA from "@/assets/game-tile-option-a.webp";
import gameOptionB from "@/assets/game-tile-option-b.webp";

import { BrandLockup } from "@/components/BrandLockup";
import { GameArcade } from "@/components/GameArcade";

import windowSeatArt from "@/assets/window-seat-room.webp";
import { ROOM_COPY } from "@/lib/room-copy";
import { TripSectionIcon } from "@/components/TripSectionIcon";
import { tripDisplayName } from "@/lib/trip-display-name";
import { TripList } from "@/components/TripList";
import journeyArt from "@/assets/cinematic-journey-map.jpg";

import airportSignoff from "@/assets/home-airport-signoff-diverse.jpg";
import airportSignoffSmall from "@/assets/home-airport-signoff-diverse-768.webp";
import departuresBoardArt from "@/assets/home-departures-board.jpg";

import { phaseBanner } from "@/lib/play-arrangement";
import { Inspiration } from "@/components/Inspiration";

import { Button } from "@/components/ui/button";
import { AvatarButton } from "@/components/PlayerCards";
import { MyPassport } from "@/components/MeExtras";
import { TravelerLevel } from "@/components/PassportBook";
import { fmtWhen } from "@/lib/viewer-time";
import { nextGameNight } from "@/lib/next-game-night";
import { useFlightReminders } from "@/lib/flight-reminders";
import welcomeLetter from "@/assets/welcome-letter.webp";
import { supabase } from "@/integrations/supabase/client";
import type { TripWithRole, Member } from "@/lib/trips";
import type { PlayerWithAvatar } from "@/lib/player-cards";

export type HomeScreen =
  "dashboard" | "trip" | "trips" | "passport" | "inspiration" | "window" | "journey" | "arcade";
type Props = {
  screen: HomeScreen;
  setScreen: (s: HomeScreen) => void;
  trips: TripWithRole[];
  active: TripWithRole | null;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  name: string;
  invite: ReactNode;
  selectTrip: (id: string) => void;
  open: (action: string) => void;
  explore: (destination?: string) => void;
  canStart: boolean;
  adultUnder21?: boolean;
  goPlay: () => void;
  refreshTrips: () => Promise<void>;
  isFounder: boolean;
  questCode?: string | null;
  onQuestOpened?: () => void;
  onWelcome: () => void;
  onMember: (id: string) => void;
};
type Night = { week_number: number; starts_at: string; skipped: boolean };
type HomeLayout = "classic" | "trips_first";

function useNights(tripId: string | undefined) {
  const [nights, setNights] = useState<Night[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!tripId) {
      setNights([]);
      return;
    }
    let live = true;
    const load = () => {
      void supabase
        .from("game_nights")
        .select("week_number,starts_at,skipped")
        .eq("trip_id", tripId)
        .order("starts_at")
        .then(({ data }) => {
          if (live) setNights(data ?? []);
        });
    };
    load();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      load();
    }, 60000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [tripId]);
  return { nights, now };
}

function useHomeLayout(userId: string) {
  const [layout, setLayout] = useState<HomeLayout>("trips_first");
  useEffect(() => {
    let live = true;
    void supabase
      .from("profiles")
      .select("home_layout")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setLayout(data?.home_layout === "classic" ? "classic" : "trips_first");
      });
    return () => {
      live = false;
    };
  }, [userId]);
  return layout;
}

function useSealedQuestWaiting(tripId: string | undefined) {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!tripId) {
      setWaiting(false);
      return;
    }
    let live = true;
    void rpc("sealed_quest_state", { p_trip: tripId }).then(({ data }) => {
      if (live) setWaiting((data ?? []).some((quest) => quest.state === "sealed"));
    });
    return () => {
      live = false;
    };
  }, [tripId]);
  return waiting;
}

function boardCountdown(milliseconds: number) {
  if (milliseconds <= 0) return "NOW";
  const hours = Math.ceil(milliseconds / 3600000);
  if (hours < 24) return `${hours}H`;
  return `${Math.ceil(milliseconds / 86400000)}D`;
}

export function HomeDashboard({
  screen,
  setScreen,
  trips,
  active,
  members,
  cards,
  userId,
  name,
  invite,
  selectTrip,
  open,
  explore,
  canStart,
  adultUnder21 = false,
  goPlay,
  refreshTrips,
  isFounder,
  questCode,
  onQuestOpened,
  onWelcome,
  onMember,
}: Props) {
  const flightReminder = useFlightReminders(active, userId);
  const homeLayout = useHomeLayout(userId);
  const [tile, setTile] = useState("a");
  useEffect(() => {
    void rpc("boarding_tile").then((r) => setTile(r.data ?? "a"));
  }, []);
  const trip = active ?? trips[0] ?? null;
  const { nights, now } = useNights(trip?.id);
  const next = nextGameNight(nights, now);
  const remaining = next ? Math.max(0, new Date(next.starts_at).getTime() - now) : 0;
  const gameNightLive =
    !!next &&
    new Date(next.starts_at).getTime() <= now &&
    new Date(next.starts_at).getTime() + 3 * 3600000 >= now;
  const sealedQuestWaiting = useSealedQuestWaiting(trip?.id);
  const countdown = next
    ? remaining > 0
      ? `${Math.ceil(remaining / 86400000)} ${Math.ceil(remaining / 86400000) === 1 ? "day" : "days"}`
      : "Tonight"
    : trip
      ? "On the way"
      : "Your next trip";
  const back = () => setScreen("dashboard");
  if (screen === "arcade")
    return <GameArcade onBack={back} trips={trips} activeTripId={active?.id ?? null} />;
  if (screen === "passport")
    return (
      <section className="passport-scene pb-8">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft /> Home
        </Button>
        <MyPassport
          trips={trips}
          selectTrip={(id) => {
            selectTrip(id);
            setScreen("trip");
          }}
          userId={userId}
          onNavigate={(phase) => {
            if (phase === "culture") setScreen("inspiration");
            else if (phase === "athome") setScreen("inspiration");
            else if (phase === "touchdown") {
              if (trip) {
                selectTrip(trip.id);
                setScreen("trip");
              } else setScreen("trips");
            } else {
              goPlay();
            }
          }}
        />
      </section>
    );
  if (screen === "inspiration" || screen === "window")
    return (
      <Inspiration
        key={screen}
        room={screen === "window" ? "window" : "home"}
        trips={trips}
        userId={userId}
        isFounder={isFounder}
        onBack={back}
        {...(screen === "window" && active ? { initialTripId: active.id } : {})}
        {...(questCode ? { initialCode: questCode } : {})}
        {...(onQuestOpened ? { onQuestOpened } : {})}
      />
    );
  if (screen === "journey" && !trip)
    return (
      <section className="cinematic-journey pb-8">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft /> Home
        </Button>
        <h1 className="font-display text-3xl font-extrabold mt-5">Journey</h1>
        <p className="text-sm text-muted-foreground mt-1">{ROOM_COPY.journey}</p>
        <img
          src={journeyArt}
          alt="Journey map"
          width={1024}
          height={768}
          className="w-full mt-5 aspect-[4/3] object-cover rounded-md"
        />
        <h2 className="font-display text-xl font-extrabold mt-6">My Trips</h2>
        <p className="text-sm text-muted-foreground mt-2">Your trips will appear here.</p>
        {canStart && (
          <Button variant="playful" className="mt-5 w-full" onClick={() => open("Start a trip")}>
            Plan a Trip
          </Button>
        )}
        <Button variant="outline" className="mt-3 w-full" onClick={() => open("Join a trip")}>
          Join with Code
        </Button>
      </section>
    );
  if (screen === "trips")
    return (
      <section className="pb-8">
        <Button variant="ghost" onClick={back}>
          <ArrowLeft /> Home
        </Button>
        <h1 className="font-display text-3xl font-extrabold mt-4">Journey</h1>
        <p className="text-sm text-muted-foreground mt-1">{ROOM_COPY.journey}</p>
        <p className="text-muted-foreground mt-1 mb-5">Where we're headed</p>
        <TripList
          trips={trips}
          id="home-trips"
          onChanged={refreshTrips}
          onSelect={(id) => {
            selectTrip(id);
            setScreen("trip");
          }}
        />
        {!trips.length && <p className="text-muted-foreground">Your trips will appear here.</p>}
        {canStart && (
          <Button variant="playful" className="mt-5 w-full" onClick={() => open("Start a trip")}>
            <img src={iconSuitcase} className="size-6 object-contain" alt="" /> Plan a Trip
          </Button>
        )}
        {adultUnder21 && (
          <div className="app-card mt-4 text-sm" role="note">
            <p className="font-bold">Captains are 21+ — ask your crew's Captain to invite you.</p>
            <Button variant="outline" className="w-full mt-3" onClick={() => open("Join a trip")}>
              Join with Code
            </Button>
          </div>
        )}
      </section>
    );

  const shortcuts = [
    {
      label: "Journey",
      subtitle: "Where we're headed",
      img: iconMap,
      action: () => setScreen("journey"),
    },
    {
      label: "Passport Junkie",
      subtitle: "Collect your stamps",
      img: iconPassport,
      action: () => setScreen("passport"),
    },
    {
      label: "Join with Code",
      subtitle: "Your Captain's code",
      img: iconBoarding,
      action: () => open("Join a trip"),
    },
    {
      label: "Travel From Home",
      subtitle: "Your couch, any country",
      img: iconHome,
      action: () => setScreen("inspiration"),
    },
    {
      label: "Explore the App",
      subtitle: "See what's inside",
      img: iconCompass,
      action: () => explore(),
    },
    {
      label: "Games on Flight",
      subtitle: "Free to play, no account",
      img: tile === "b" ? gameOptionB : gameOptionA,
      action: () => setScreen("arcade"),
    },
    {
      label: "Window Seat",
      subtitle: "Bring the trip to them",
      img: windowSeatArt,
      action: () => setScreen("window"),
    },
  ];
  const cinematicShortcuts = [
    shortcuts[1],
    shortcuts[2],
    shortcuts[3],
    shortcuts[4],
    shortcuts[5],
    shortcuts[6],
    shortcuts[7],
    shortcuts[0],
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (homeLayout === "trips_first") {
    const boardRows = [
      {
        label: "GOING ON A TRIP",
        gate: "A",
        img: iconMap,
        action: () => setScreen("journey"),
        status: sealedQuestWaiting ? "FINAL CALL" : "ON TIME",
        detail: "",
      },
      {
        label: "EXPLORE A CULTURE",
        gate: "B",
        img: iconHome,
        action: () => setScreen("inspiration"),
        status: "ON TIME",
        detail: "",
      },
      {
        label: "INSPIRE SOMEONE",
        gate: "C",
        img: windowSeatArt,
        action: () => setScreen("window"),
        status: "ON TIME",
        detail: "",
      },
      {
        label: "GAME NIGHT",
        gate: "D",
        img: gameOptionA,
        action: () => setScreen("arcade"),
        status: gameNightLive ? "GATE OPEN" : next ? "BOARDING" : "ON TIME",
        detail: !gameNightLive && next ? boardCountdown(remaining) : "",
      },
      {
        label: "PASSPORT JUNKIE",
        gate: "E",
        img: iconPassport,
        action: () => setScreen("passport"),
        status: "COLLECTING",
        detail: "",
      },
    ];
    const ways = [
      {
        label: "Explore a Culture",
        subline: "Play from home",
        img: iconHome,
        action: () => setScreen("inspiration"),
      },
      {
        label: "Inspire Someone",
        subline: "Share the view",
        img: windowSeatArt,
        action: () => setScreen("window"),
      },
      {
        label: "Game Night",
        subline: "Play right now",
        img: gameOptionA,
        action: () => setScreen("arcade"),
      },
      {
        label: "Passport",
        subline: "Your stamps",
        img: iconPassport,
        action: () => setScreen("passport"),
      },
    ];
    return (
      <section
        className="home-reference-page pb-24 cinematic-home-top cinematic-home-bottom"
        aria-label="Home departures"
      >
        {trip && phaseBanner(trip) && (
          <p className="app-card mt-3 text-sm font-bold" role="status">
            {phaseBanner(trip)}
          </p>
        )}
        <p className="eyebrow text-blue">
          YOUR DEPARTURE LOUNGE{" "}
          {flightReminder && <span className="flight-reminder-dot" aria-label="Flight reminder" />}
        </p>
        <h1 className="font-display text-3xl font-extrabold mt-2">
          Where to,{" "}
          <span className="inline-block max-w-[70%] align-bottom truncate" title={name}>
            {name.split(" ")[0]}
          </span>
          ?
        </h1>
        <Button variant="outline" className="home-live-search" onClick={() => explore()}>
          <Search size={18} />
          <span>Search destinations, games, or squads…</span>
        </Button>
        <section className="home-live-board-scene" aria-label="Departures board">
          <img
            className="home-live-board-photo"
            src={departuresBoardArt}
            alt="A diverse squad beneath an airport departures board at tropical sunset"
            width={1536}
            height={1024}
          />
          <div className="home-live-board">
            <div className="home-live-board-head" aria-hidden="true">
              <strong>DEPARTURES</strong>
              <span>GATE</span>
              <span>STATUS</span>
            </div>
            {boardRows.map((row) => (
              <Button
                key={row.label}
                variant="ghost"
                className="home-live-board-row"
                onClick={() => {
                  void import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
                  row.action();
                }}
                aria-label={`${row.label}, gate ${row.gate}, ${row.status}${row.detail ? `, ${row.detail}` : ""}`}
              >
                <img src={row.img} alt="" width={104} height={104} />
                <span>{row.label}</span>
                <span>{row.gate}</span>
                <b
                  className={
                    row.status === "GATE OPEN"
                      ? "is-open"
                      : row.status === "FINAL CALL"
                        ? "is-final"
                        : row.status === "BOARDING"
                          ? "is-boarding"
                          : ""
                  }
                >
                  {row.status}
                  {row.detail && <small>{row.detail}</small>}
                </b>
              </Button>
            ))}
          </div>
        </section>
        {next && trip ? (
          <section
            className={`home-live-night ${gameNightLive ? "is-live" : ""}`}
            aria-label={gameNightLive ? "Game Night live" : "Next Game Night"}
          >
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-blue">
                {gameNightLive ? "GAME NIGHT · LIVE" : "NEXT GAME NIGHT"}
              </p>
              <strong className="font-display text-lg">
                {gameNightLive ? "Gate open now" : `${countdown} · Week ${next.week_number}`}
              </strong>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {tripDisplayName(trip.name)} · {fmtWhen(next.starts_at, trip.home_timezone)}
              </p>
              <span className="home-live-avatars">
                {members.slice(0, 4).map((member) => {
                  const person = cards.find((card) => card.user_id === member.user_id);
                  return (
                    <AvatarButton
                      key={member.user_id}
                      userId={member.user_id}
                      onOpen={onMember}
                      url={person?.avatarUrl}
                      name={person?.game_name || member.display_name || "Player"}
                      className="size-7"
                      wrapperClass="size-11"
                    />
                  );
                })}
              </span>
            </div>
            <Button variant="secondary" className="home-live-check" onClick={goPlay}>
              <Check size={16} /> Check in
            </Button>
          </section>
        ) : (
          <Button
            variant="outline"
            className="home-live-night w-full justify-start text-left"
            onClick={onWelcome}
          >
            <img
              src={welcomeLetter}
              alt=""
              width={256}
              height={256}
              className="size-16 object-contain"
            />
            <span>
              <span className="eyebrow text-blue block">WELCOME ABOARD</span>
              <strong className="font-display text-lg block">Your welcome letter</strong>
              <small className="text-muted-foreground">Open your starting guide</small>
            </span>
            <ArrowRight className="ml-auto" size={18} />
          </Button>
        )}
        <div className="home-live-section-title">
          <h2 className="font-display text-xl font-extrabold">More ways to play</h2>
        </div>
        <div className="home-live-ways">
          {ways.map((way) => (
            <Button
              key={way.label}
              variant="ghost"
              className={`home-live-way ${way.label === "Inspire Someone" ? "window-seat-shortcut" : ""}`}
              onClick={way.action}
            >
              <span className="home-door-medallion">
                <img src={way.img} alt="" width={104} height={104} />
              </span>
              <strong>{way.label}</strong>
              <small>{way.subline}</small>
            </Button>
          ))}
        </div>
        <div className="home-live-stamp-space" aria-hidden="true">
          <span>
            TRIPJUNKIES
            <br />
            PASSPORT
          </span>
        </div>
        <div className="home-live-signoff">
          <img
            src={airportSignoff}
            srcSet={`${airportSignoffSmall} 768w, ${airportSignoff} 1536w`}
            sizes="(max-width: 520px) 100vw, 768px"
            alt="Four friends watching a plane take off at sunset"
            loading="lazy"
            width={1536}
            height={1024}
          />
          <BrandLockup className="home-signoff text-[clamp(28px,8vw,44px)]" />
        </div>
      </section>
    );
  }
  return (
    <section
      className="home-orbit-page pb-24 cinematic-home-top cinematic-home-bottom"
      aria-label="Home departures"
    >
      {trip && phaseBanner(trip) && (
        <p className="app-card mt-3 text-sm font-bold" role="status">
          {phaseBanner(trip)}
        </p>
      )}
      <p className="eyebrow text-blue">
        YOUR DEPARTURE LOUNGE{" "}
        {flightReminder && <span className="flight-reminder-dot" aria-label="Flight reminder" />}
      </p>
      <h1 className="font-display text-3xl font-extrabold mt-2">
        Where to,{" "}
        <span className="inline-block max-w-[70%] align-bottom truncate" title={name}>
          {name.split(" ")[0]}
        </span>
        ?
      </h1>
      <Button
        variant="link"
        className="relative z-[1] mt-2 min-h-11 h-auto px-0 text-sm text-blue"
        onClick={onWelcome}
      >
        Where should I start? <ArrowRight size={15} />
      </Button>
      <div className="home-orbit mt-5" aria-label="Travel shortcuts">
        <div className="home-orbit-track" aria-hidden="true" />
        <div className="home-orbit-core">
          {next && trip ? (
            <>
              <p className="eyebrow text-blue">NEXT GAME NIGHT</p>
              <strong className="home-orbit-count font-display">{countdown}</strong>
              <p
                className="home-orbit-title text-xs font-semibold text-muted-foreground px-2"
                title={tripDisplayName(trip.name)}
              >
                <TripSectionIcon trip={trip} />
                <span className="min-w-0 text-balance">
                  {`Week ${next.week_number} · ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: trip.home_timezone }).format(new Date(next.starts_at))}`}
                </span>
              </p>
              <Button variant="secondary" className="home-spin mt-3 font-display" onClick={goPlay}>
                Check in
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              aria-label="Open your welcome letter"
              className="home-welcome-letter h-full w-full flex-col gap-0 p-1 text-foreground"
              onClick={onWelcome}
            >
              <img
                src={welcomeLetter}
                alt=""
                width={256}
                height={256}
                className="w-[min(75%,120px)] aspect-square object-contain"
              />
              <span className="font-display text-sm font-extrabold leading-tight">New here?</span>
            </Button>
          )}
        </div>
        {cinematicShortcuts.map((item, index) => (
          <div key={item.label} className={`home-orbit-stop home-orbit-stop-${index}`}>
            <Button
              variant="ghost"
              className={`home-orbit-link ${item.label === "Window Seat" ? "window-seat-shortcut" : ""}`}
              onClick={() => {
                import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
                item.action();
              }}
              title={item.subtitle}
            >
              <>
                <span className="home-door-medallion">
                  <img
                    src={item.label === "Games on Flight" ? gameOptionA : item.img}
                    alt=""
                    width={104}
                    height={104}
                  />
                </span>
                <span className="home-door-label">
                  {item.label === "My trips" ? "My Trips" : item.label}
                </span>
              </>
            </Button>
          </div>
        ))}
      </div>
      {trip && (
        <div className="home-trip-line flex items-center gap-1 cinematic-trip-line">
          <Button
            variant="ghost"
            className="min-w-0 flex-1 justify-between h-auto min-h-14 gap-2 text-left"
            onClick={() => {
              import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
              setScreen("trip");
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="eyebrow block truncate">CURRENT TRIP · {trip.destination}</span>
              <strong className="flex min-w-0 items-center gap-1 font-display text-lg">
                <TripSectionIcon trip={trip} />
                <span className="min-w-0 truncate">{tripDisplayName(trip.name)}</span>
              </strong>
              <small className="block text-muted-foreground mt-1">
                {new Date(`${trip.start_date}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                –{" "}
                {new Date(`${trip.end_date}T12:00:00`).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </small>
            </span>
            <span className="cinematic-destination">
              <TripSectionIcon trip={trip} />
            </span>
            <ArrowRight size={18} />
          </Button>
          <span className="flex shrink-0 -space-x-2 pr-2">
            {members.slice(0, 3).map((m) => {
              const person = cards.find((c) => c.user_id === m.user_id);
              return (
                <AvatarButton
                  key={m.user_id}
                  userId={m.user_id}
                  onOpen={onMember}
                  url={person?.avatarUrl}
                  name={person?.game_name || m.display_name || "Player"}
                  className="home-avatar size-8"
                  wrapperClass="size-11"
                />
              );
            })}
          </span>
        </div>
      )}
      {nights.length > 0 && (
        <section className="mt-7" aria-label="Game night route">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold">The route to takeoff</h2>
            <Plane className="size-5 text-orange" />
          </div>
          <div className="home-week-strip mt-3">
            {nights.map((night, i) => {
              const done =
                new Date(night.starts_at).getTime() + 3 * 3600000 < now && !night.skipped;
              const upcoming = next?.week_number === night.week_number;
              return (
                <div
                  key={night.week_number}
                  className={`home-week ${i === nights.length - 1 ? "home-week-last" : ""} ${upcoming ? "home-week-next" : ""}`}
                >
                  <span className="text-lg">
                    {night.skipped ? (
                      "—"
                    ) : done ? (
                      <Check size={18} />
                    ) : upcoming ? (
                      <Plane size={18} />
                    ) : (
                      <LockKeyhole size={15} />
                    )}
                  </span>
                  <span className="font-bold text-xs">
                    {i === nights.length - 1 ? "Takeoff" : `Week ${night.week_number}`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <div className="home-action-grid mt-6 cinematic-home-actions">
        <Button
          variant="outline"
          className="home-journey-action"
          onClick={() => open("Invite")}
          disabled={!trip}
        >
          <Share2 size={20} />
          <span>
            <strong>Invite your squad</strong>
            <small>{trip ? `${members.length} aboard · Share` : "Start a trip to invite"}</small>
          </span>
          <ArrowRight size={18} />
        </Button>
        <Button
          variant="outline"
          className="home-journey-action"
          onClick={() => {
            import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
            if (trip?.kind === "at_home") goPlay();
            else setScreen("trip");
          }}
          disabled={!trip}
        >
          <span className="text-xl">✉</span>
          <span>
            <strong>Question of the Week</strong>
            <small>
              {trip?.kind === "at_home"
                ? "Open your culture card"
                : trip
                  ? "Open your trip"
                  : "Your first question awaits"}
            </small>
          </span>
          <ArrowRight size={18} />
        </Button>
      </div>
      {adultUnder21 && (
        <div className="app-card mt-4 text-sm" role="note">
          <p className="font-bold">Captains are 21+ — ask your crew's Captain to invite you.</p>
          <Button variant="outline" className="w-full mt-3" onClick={() => open("Join a trip")}>
            <img src={iconBoarding} className="size-6 object-contain" alt="" /> Join with Code
          </Button>
        </div>
      )}
      <>
        <div className="mt-5 flex justify-center">
          <TravelerLevel userId={userId} />
        </div>
        {invite && (
          <div className="mt-7">
            <h2 className="eyebrow mb-3">YOUR INVITE</h2>
            {invite}
          </div>
        )}
        <div className="cinematic-home-signoff">
          <img
            src={airportSignoff}
            srcSet={`${airportSignoffSmall} 768w, ${airportSignoff} 1536w`}
            sizes="(max-width: 520px) 100vw, 768px"
            alt="Four friends watching a plane take off at sunset"
            loading="lazy"
            width={1536}
            height={1024}
          />
          <BrandLockup className="home-signoff text-[clamp(28px,8vw,44px)]" />
        </div>
      </>
    </section>
  );
}
