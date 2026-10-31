import { FounderDashboard } from "@/features/admin/FounderDashboard";
import { HomeSeasons } from "@/features/points/HomeSeasons";
import { Tab } from "@/features/app-shell/tabs";
import { MaskedEmail } from "@/features/auth/AuthScreen";
import { SquadView } from "@/features/trip/SquadView";

import { ArchivedTrip } from "@/features/trip/ArchivedTrip";

import gameOptionA from "@/assets/game-tile-option-a.webp";
import tripCoast from "@/assets/journey-coast-top.jpg";
import tripCoastSmall from "@/assets/journey-coast-top-768.jpg";

import iconPassport from "@/assets/icon-passport.webp";
import iconTrophy from "@/assets/icon-trophy.webp";
import iconMap from "@/assets/icon-map.webp";
import iconBoarding from "@/assets/icon-boarding-pass.webp";
import iconCompass from "@/assets/icon-compass.webp";

import founderFeedbackIcon from "@/assets/founder-feedback.webp";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  LogOut,
  Plus,
  Sparkles,
  CalendarDays,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/data/account";

import { TripOverview } from "@/features/trip/TripOverview";
import { BugUpdates } from "@/features/admin/BugInbox";
import { PhaseNotice } from "@/features/play/PhaseNotice";
import { DailyDiscovery } from "@/features/daily/DailyPlay";
import { PlayHub } from "@/features/play/PlayHub";

import { CaptainBadge, LockedNote, isUnlocked } from "@/features/trip/TripUnlock";
import { ReadOnlyBanner } from "@/features/points/Seasons";
import { type TripWithRole, type Member } from "@/lib/trips";

import { Avatar } from "@/features/players/PlayerCards";
import { type PlayerWithAvatar } from "@/lib/player-cards";
import {
  MyPassport,
  Skeleton,
  AppearanceToggle,
  HomeLayoutSetting,
  TimeZoneSetting,
  PublicLeaderboardSetting,
} from "@/features/me/MeExtras";
import { TripList } from "@/features/trip/TripList";
import { Bug, HelpCircle, PlayCircle, Trash2 } from "lucide-react";

import {
  TravelerLevel,
  CultureCreatorBadge,
  CulturePoints,
} from "@/features/passport/PassportBook";

import { RememberedSection } from "@/components/RememberedSection";

import { AtHomeHome, AtHomeTrip, Rewards, isAtHome } from "@/features/at-home/AtHome";
import { LaunchSwitch } from "@/features/onboarding/BetaAccess";
import { BetaCodesDoor } from "@/features/admin/BetaCodes";
import { AiGuardDoor, AiCapBanner } from "@/features/admin/AiGuard";

import { FounderWelcomeEditor } from "@/features/onboarding/WelcomeCopy";

import { AppearanceQuickToggle } from "@/features/me/MeExtras";
import { FoundingBadge, FoundingControls } from "@/features/onboarding/LegalConsent";
import { legalLinks } from "@/lib/legal";
import { Link } from "@tanstack/react-router";

export function TabContent({
  tab,
  name,
  email,
  open,
  active,
  trips,
  members,
  cards,
  onMember,
  onEditCard,
  userId,
  selectTrip,
  refresh,
  onAbout,
  onMe,
  onReplay,
  meSection,
  setMeSection,
  loading,
  itineraryVersion,
  canStart,
  viewOnly,
  isAdmin,
  onManage,
  onCalendar,
  onJourney,
  onWindowSeat,
  onTrip,
  onWrapped,
  onPassportNavigate,
}: {
  onPassportNavigate: (phase: "preflight" | "touchdown" | "athome" | "culture" | "window") => void;
  onTrip?: () => void;
  onWrapped?: () => void;
  meSection: string | null;
  setMeSection: (s: string | null) => void;
  onManage?: () => void;
  onCalendar?: () => void;
  onJourney?: () => void;
  onWindowSeat?: () => void;
  isAdmin?: boolean;
  tab: Tab;
  name: string;
  email: string;
  open: (value: string) => void;
  active: TripWithRole | null;
  trips: TripWithRole[];
  members: Member[];
  cards: PlayerWithAvatar[];
  onMember: (id: string) => void;
  onEditCard: () => void;
  userId: string;
  selectTrip: (id: string) => void;
  refresh: () => Promise<void>;
  onAbout: () => void;
  onMe: (v: "help" | "bug" | "delete" | "feedback" | "lab" | "reports" | "notifications") => void;
  onReplay: () => void;
  loading: boolean;
  itineraryVersion: number;
  canStart: boolean;
  viewOnly: boolean;
}) {
  const queryClient = useQueryClient();
  if (loading && active && tab !== "Me")
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-20" />
      </div>
    );
  // M1-01: trips archived at the new-engine cutover get one read-only view instead of their tabs.
  if (active && active.rules_version === 1 && tab !== "Me")
    return <ArchivedTrip trip={active} cards={cards} userId={userId} onMember={onMember} />;
  if (tab === "Home" && active && isAtHome(active)) return <AtHomeHome trip={active} open={open} />;
  if (tab === "Home" && active) {
    const days = Math.ceil(
      (new Date(`${active.start_date}T00:00:00`).getTime() - Date.now()) / 86400000,
    );
    return (
      <>
        <PhaseNotice trip={active} viewOnly={viewOnly} />
        <DailyDiscovery trip={active} viewOnly={viewOnly} />
        <div className="app-card cinematic-trip-countdown">
          <img
            className="cinematic-trip-art-strip"
            src={tripCoast}
            srcSet={`${tripCoastSmall} 768w, ${tripCoast} 1536w`}
            sizes="(max-width: 520px) 100vw, 768px"
            alt=""
            width={1536}
            height={1920}
          />
          <h1 className="font-display text-xl font-extrabold">{active.name}</h1>
          {(active as { motto?: string | null }).motto && (
            <p className="italic text-green text-[13px] mt-1">
              “{(active as { motto?: string | null }).motto}”
            </p>
          )}
          <p className="eyebrow mt-3">{active.destination}</p>
          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="font-display text-[58px] leading-none font-extrabold text-primary">
              {days > 0 ? days : days === 0 ? "0" : "✓"}
            </p>
            <p className="text-right text-xs text-muted-foreground">
              {days > 0 ? "days until" : days === 0 ? "starts today" : "memories made"}
              <br />
              <strong className="text-foreground text-sm">
                {new Date(`${active.start_date}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </strong>
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-[14px] cinematic-trip-actions">
          <Button variant="outline" className="h-12 rounded-full" onClick={() => open("Invite")}>
            <Ticket /> Invite squad
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-full"
            onClick={() => open("Quick actions")}
          >
            <Sparkles /> More
          </Button>
        </div>
        {!isUnlocked(active) && <LockedNote trip={active} what="the full trip" />}
        <div className="cinematic-trip-extras">
          <HomeSeasons
            key={`hs-${active.id}`}
            trip={active}
            members={members}
            cards={cards}
            userId={userId}
            onMember={onMember}
          />
        </div>
      </>
    );
  }
  if (tab === "Home")
    return (
      <>
        <p className="text-sm font-bold text-muted-foreground">YOUR NEXT ADVENTURE ✨</p>
        <h1 className="font-display text-4xl font-extrabold mt-2">
          Hey, {name.split(" ")[0]}! <span className="inline-block float-sticker">👋</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Good things happen when the squad gets together.
        </p>
        <div className="mt-8 bg-green text-primary-foreground rounded-[1.75rem] p-6 relative overflow-hidden shadow-soft">
          <div className="absolute -right-3 -top-5 text-[110px] opacity-20 rotate-12">✳</div>
          <span className="text-xs font-extrabold tracking-widest opacity-80">YOUR TRIPS</span>
          <h2 className="font-display text-[1.8rem] leading-tight font-extrabold mt-3 max-w-56">
            A new adventure starts here.
          </h2>
          <p className="text-sm opacity-85 mt-3 max-w-56">
            Bring your favorite people together for a trip worth remembering.
          </p>
          <Button variant="secondary" className="mt-6" onClick={() => open("Start a trip")}>
            Start a trip <ArrowRight />
          </Button>
        </div>
        <Button variant="subtle" className="mt-3 w-full h-14" onClick={() => open("At Home")}>
          Start an At Home experience
        </Button>
        <div className="flex gap-3 mt-4">
          <Button
            variant="outline"
            className="flex-1 bg-card h-16 rounded-2xl"
            onClick={() => open("Join a trip")}
          >
            <Ticket className="text-orange" /> Join a trip
          </Button>
          <Button
            variant="outline"
            className="flex-1 bg-card h-16 rounded-2xl"
            onClick={() => open("Quick actions")}
          >
            <Sparkles className="text-green" /> Quick actions
          </Button>
        </div>
        <div className="mt-9 flex items-center justify-between">
          <h2 className="font-display font-extrabold text-xl">The good stuff</h2>
          <span className="text-xl">💌</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <FeatureCard
            color="bg-blue-soft"
            emoji="🎡"
            title="Before you go"
            copy="Game nights that bring everyone closer."
          />
          <FeatureCard
            color="bg-green-soft"
            emoji="🎯"
            title="On the trip"
            copy="Little challenges, big memories."
          />
        </div>
      </>
    );
  if (tab === "Play" && active)
    return (
      <>
        <ReadOnlyBanner trip={active} />
        <PlayHub
          key={active.id}
          trip={active}
          members={members}
          cards={cards}
          userId={userId}
          viewOnly={viewOnly}
          onManage={onManage}
          onCalendar={onCalendar}
          onWrapped={onWrapped}
          onMember={onMember}
          refresh={refresh}
        />
      </>
    );
  if (tab === "Play")
    return (
      <>
        <PageHeading
          eyebrow="THE FUN STARTS HERE"
          title="Play together."
          emoji="🎲"
          copy="One trip, two seasons, endless inside jokes."
        />
        <EmptyPrompt
          emoji="🎮"
          title="The games are waiting"
          copy="Join a trip to see what your squad has in store."
          action="Join a trip"
          onClick={() => open("Join a trip")}
        />
      </>
    );
  if (tab === "Trip" && active && isAtHome(active))
    return (
      <>
        <AtHomeTrip
          trip={active}
          members={members}
          cards={cards}
          userId={userId}
          viewOnly={viewOnly}
        />

        <section className="mt-8" aria-label="Squad">
          <SquadView
            key={`sv-${active.id}`}
            trip={active}
            members={members}
            cards={cards}
            userId={userId}
            onMember={onMember}
            open={open}
            viewOnly={viewOnly}
          />
        </section>
      </>
    );
  if (tab === "Trip" && active)
    return (
      <>
        <TripOverview
          key={active.id}
          trip={active}
          members={members}
          cards={cards}
          userId={userId}
          itineraryVersion={itineraryVersion}
          onUpdated={refresh}
          onJourney={onJourney}
          onWindowSeat={onWindowSeat}
          viewOnly={viewOnly}
        />
        <section className="mt-8" aria-label="Squad">
          <SquadView
            key={`sv-${active.id}`}
            trip={active}
            members={members}
            cards={cards}
            userId={userId}
            onMember={onMember}
            open={open}
            viewOnly={viewOnly}
          />
        </section>
      </>
    );
  if (tab === "Trip")
    return (
      <>
        <PageHeading
          eyebrow="YOUR ADVENTURES"
          title="Trip central."
          emoji="🧳"
          copy="All the moments leading up to your next big thing."
        />
        <EmptyPrompt
          emoji="🗺️"
          title="No trips just yet"
          copy="Every unforgettable trip starts with a date and your favorite people."
          action="Start a trip"
          onClick={() => open("Start a trip")}
        />
        <div className="mt-7 flex items-center gap-3 text-sm text-muted-foreground">
          <CalendarDays className="text-orange" /> Built around your trip dates, always.
        </div>
      </>
    );
  if (!meSection)
    return (
      <div className="cinematic-me">
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow text-gold">YOUR CORNER</p>
            <h1 className="font-display text-4xl font-extrabold mt-1">It’s you!</h1>
          </div>
          <AppearanceQuickToggle />
        </div>
        <BugUpdates />
        <CaptainBadge />
        <div className="cinematic-me-profile">
          <Avatar
            url={cards.find((c) => c.user_id === userId)?.avatarUrl}
            name={name}
            className="size-20"
          />
          <div className="min-w-0">
            <strong className="font-display text-xl block truncate">{name}</strong>
            <MaskedEmail email={email} />
            <FoundingBadge userId={userId} straight />
            <TravelerLevel userId={userId} />
            <CultureCreatorBadge userId={userId} />
            <CulturePoints userId={userId} />
          </div>
          <Button variant="outline" onClick={onEditCard}>
            Edit
          </Button>
        </div>
        <div className="cinematic-me-menu">
          {[
            ["Passport Junkie", iconPassport, "me-passport"],
            ["Rewards", iconTrophy, "me-rewards"],
            ["Your trips", iconMap, "me-trips"],
            ["Your seasons", iconBoarding, "me-seasons"],
            ["How it works", iconCompass, "how"],
            ["Notifications", iconBoarding, "notifications"],
            ["Help & FAQ", iconCompass, "help"],
            ["About TripJunkies", iconTrophy, "about"],
            ["Send feedback", founderFeedbackIcon, "feedback"],
          ].map(([label, icon, key]) => (
            <Button
              key={key}
              variant="outline"
              onClick={() =>
                key === "feedback"
                  ? onMe("bug")
                  : key === "help" || key === "notifications"
                    ? onMe(key)
                    : key === "how"
                      ? onReplay()
                      : key === "about"
                        ? onAbout()
                        : setMeSection(key ?? null)
              }
            >
              <img src={icon} alt="" />
              <span>{label}</span>
              <ChevronRight size={18} />
            </Button>
          ))}
        </div>
        <div className="cinematic-me-switches">
          <AppearanceToggle />
          <PublicLeaderboardSetting userId={userId} />
        </div>
        <Button variant="ghost" className="w-full mt-4" onClick={() => setMeSection("me-settings")}>
          All settings ›
        </Button>
        {isAdmin && <AiCapBanner onOpen={() => setMeSection("ai-guard")} />}
        {isAdmin && (
          <FounderDashboard
            trips={trips}
            onOpen={(key) =>
              key === "welcome" ||
              key === "founding-members" ||
              key === "beta-codes" ||
              key === "ai-guard" ||
              key === "icon-options" ||
              key === "me-explore"
                ? setMeSection(key)
                : onMe(key as "reports" | "feedback" | "lab")
            }
          />
        )}
      </div>
    );
  if (!meSection)
    return (
      <>
        <div className="flex items-start justify-between">
          <PageHeading
            eyebrow="YOUR CORNER"
            title="It's you!"
            emoji="✨"
            copy="Ready for the next story?"
          />
          <AppearanceQuickToggle />
        </div>
        <BugUpdates />
        <CaptainBadge />
        <div className="mt-5 bg-card rounded-[1.5rem] p-5 border border-border flex gap-4 items-center">
          <Avatar
            url={cards.find((c) => c.user_id === userId)?.avatarUrl}
            name={name}
            className="h-14 w-14"
          />
          <div className="min-w-0">
            <p className="font-display font-extrabold text-lg truncate">{name}</p>
            <MaskedEmail email={email} />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <TravelerLevel userId={userId} />
              <CultureCreatorBadge userId={userId} />
              <FoundingBadge userId={userId} straight />
              <CulturePoints userId={userId} />
            </div>
          </div>
        </div>
        <Button variant="subtle" className="mt-3 w-full" onClick={onEditCard}>
          Edit my player card <ArrowRight />
        </Button>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => onMe("bug")}>
          Send feedback
        </Button>
        <div className="grid grid-cols-2 gap-3 mt-5">
          <Button
            key="me-passport"
            variant="outline"
            className="home-bubble me-passport-action min-h-28 h-auto whitespace-normal font-display font-bold"
            onClick={() => setMeSection("me-passport")}
          >
            {" "}
            <img src={iconPassport} className="size-8 mb-2 object-contain" alt="" /> Passport
            Junkie{" "}
          </Button>
          <Button
            key="me-rewards"
            variant="outline"
            className="home-bubble me-passport-action min-h-28 h-auto whitespace-normal font-display font-bold"
            onClick={() => setMeSection("me-rewards")}
          >
            {" "}
            <img src={iconTrophy} className="size-8 mb-2 object-contain" alt="" /> Rewards{" "}
          </Button>
          <Button
            key="me-trips"
            variant="outline"
            className="home-bubble me-passport-action min-h-28 h-auto whitespace-normal font-display font-bold"
            onClick={() => setMeSection("me-trips")}
          >
            {" "}
            <img src={iconMap} className="size-8 mb-2 object-contain" alt="" /> Your trips{" "}
          </Button>
          <Button
            key="me-seasons"
            variant="outline"
            className="home-bubble me-passport-action min-h-28 h-auto whitespace-normal font-display font-bold"
            onClick={() => setMeSection("me-seasons")}
          >
            {" "}
            <img src={iconBoarding} className="size-8 mb-2 object-contain" alt="" /> Your
            seasons{" "}
          </Button>
          <Button
            key="me-explore"
            variant="outline"
            className="home-bubble me-passport-action min-h-28 h-auto whitespace-normal font-display font-bold"
            onClick={() => setMeSection("me-explore")}
          >
            {" "}
            <img src={iconCompass} className="size-8 mb-2 object-contain" alt="" /> Explore &
            help{" "}
          </Button>
          <Button
            key="me-settings"
            variant="outline"
            className="home-bubble me-passport-action min-h-28 h-auto whitespace-normal font-display font-bold"
            onClick={() => setMeSection("me-settings")}
          >
            {" "}
            <span className="text-3xl mb-2">⚙️</span> Settings{" "}
          </Button>
        </div>
        {isAdmin && (
          <div className="mt-6">
            <h2 className="font-display text-lg font-extrabold">Founder</h2>
            <AiCapBanner onOpen={() => setMeSection("ai-guard")} />
            <div className="grid grid-cols-2 gap-3 mt-3">
              {[
                ["Reports", "reports"],
                ["Feedback", "feedback"],
                ["Test Lab", "lab"],
                ["Welcome wording", "welcome"],
                ["Icon options", "icon-options"],
                ["AI", "ai-guard"],
              ].map(([label, key]) => (
                <Button
                  key={key}
                  variant="outline"
                  className="home-bubble min-h-24 h-auto whitespace-normal"
                  onClick={() =>
                    key === "welcome" || key === "icon-options" || key === "ai-guard"
                      ? setMeSection(key)
                      : onMe(key as "reports" | "feedback" | "lab")
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  return (
    <>
      <Button variant="ghost" onClick={() => setMeSection(null)}>
        <ArrowLeft /> Me
      </Button>
      <h1 className="font-display text-3xl font-extrabold mt-4">
        {
          (
            {
              "me-passport": "Passport Junkie",
              "me-rewards": "Rewards",
              "me-trips": "Your trips",
              "me-seasons": "Your seasons",
              "me-explore": "Explore & help",
              "me-settings": "Settings",
              welcome: "Welcome wording",
              features: "Features",
              "founding-members": "Founding Members",
              "beta-codes": "Beta codes",
              "ai-guard": "AI",
              "icon-options": "Icon options",
            } as Record<string, string>
          )[meSection]
        }
      </h1>
      {meSection === "icon-options" && isAdmin && (
        <div className="app-card mt-5">
          <p className="text-sm font-bold">Current tile: A</p>
          <img
            src={gameOptionA}
            alt="Airplane-shaped game controller"
            width={512}
            height={512}
            loading="lazy"
            className="mx-auto mt-4 w-40 aspect-square object-contain"
          />
        </div>
      )}
      {meSection === "welcome" && isAdmin && <FounderWelcomeEditor />}
      {meSection === "founding-members" && isAdmin && <FoundingControls />}
      {meSection === "beta-codes" && isAdmin && <BetaCodesDoor />}
      {meSection === "ai-guard" && isAdmin && <AiGuardDoor />}
      {meSection === "me-passport" && (
        <MyPassport
          trips={trips}
          selectTrip={selectTrip}
          userId={userId}
          onNavigate={onPassportNavigate}
        />
      )}
      {meSection === "me-rewards" && (
        <RememberedSection id="me-rewards" title="Rewards" defaultOpen>
          <Rewards userId={userId} />
        </RememberedSection>
      )}
      {meSection === "me-trips" && (
        <RememberedSection id="me-trips" title="Your trips" defaultOpen>
          <div className="mt-3">
            <TripList trips={trips} id="me-trips-list" onSelect={selectTrip} onChanged={refresh} />
            <Button variant="outline" className="mt-4 w-full" onClick={() => open("Join a trip")}>
              <Plus /> Join another trip
            </Button>
            <Button variant="subtle" className="mt-2 w-full" onClick={() => open("At Home")}>
              Start an At Home experience
            </Button>
          </div>
        </RememberedSection>
      )}
      {meSection === "me-seasons" && (
        <RememberedSection id="me-seasons" title="Your seasons" defaultOpen>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <FeatureCard
              color="bg-blue-soft"
              emoji="🎡"
              title="Pre-trip"
              copy="The warm-up season."
            />
            <FeatureCard color="bg-orange-soft" emoji="👑" title="On-trip" copy="The main event." />
          </div>
        </RememberedSection>
      )}
      {meSection === "me-explore" && (
        <RememberedSection id="me-explore" title="Explore & help" defaultOpen>
          <Button
            variant="outline"
            className="mt-3 w-full bg-card justify-between"
            onClick={onReplay}
          >
            <span className="flex items-center gap-2">
              <PlayCircle size={18} /> How it works
            </span>
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            className="mt-3 w-full bg-card justify-between"
            onClick={() => onMe("help")}
          >
            <span className="flex items-center gap-2">
              <HelpCircle size={18} /> Help & FAQ
            </span>
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            className="mt-3 w-full bg-card justify-between"
            onClick={onAbout}
          >
            <span className="flex items-center gap-2">
              <Sparkles size={18} /> About TripJunkies
            </span>
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            className="mt-3 w-full bg-card justify-between"
            onClick={() => onMe("bug")}
          >
            <span className="flex items-center gap-2">
              <Bug size={18} /> Report a bug
            </span>
            <ChevronRight size={18} />
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              className="mt-3 w-full bg-card justify-between"
              onClick={() => onMe("reports")}
            >
              <span className="flex items-center gap-2">🐞 Reports (founder)</span>
              <ChevronRight size={18} />
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              className="mt-3 w-full bg-card justify-between"
              onClick={() => onMe("feedback")}
            >
              <span className="flex items-center gap-2">📊 Trip feedback (founder)</span>
              <ChevronRight size={18} />
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              className="mt-3 w-full bg-card justify-between"
              onClick={() => onMe("lab")}
            >
              <span className="flex items-center gap-2">🧪 Test Lab (founder)</span>
              <ChevronRight size={18} />
            </Button>
          )}
          {isAdmin && <LaunchSwitch />}
        </RememberedSection>
      )}
      {meSection === "me-settings" && (
        <RememberedSection id="me-settings" title="Settings" defaultOpen>
          <AppearanceToggle />
          <HomeLayoutSetting userId={userId} />
          <TimeZoneSetting userId={userId} />
          <PublicLeaderboardSetting userId={userId} />
          <div className="mt-5">
            <h2 className="font-display font-bold">Legal</h2>
            <nav className="mt-3 flex flex-col items-start gap-3 text-sm">
              {legalLinks.map((item) => (
                <Link
                  key={item.href}
                  to="/legal/$document"
                  params={{ document: item.href.split("/").pop() || "terms" }}
                  className="text-primary underline"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <Button
            variant="outline"
            className="mt-3 w-full bg-card justify-between text-destructive"
            onClick={() => onMe("delete")}
          >
            <span className="flex items-center gap-2">
              <Trash2 size={18} /> Delete my account
            </span>
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            className="mt-3 w-full bg-card"
            onClick={async () => {
              await queryClient.cancelQueries();
              queryClient.clear();
              await signOut();
              window.location.assign("/");
            }}
          >
            <LogOut /> Sign out
          </Button>
        </RememberedSection>
      )}
    </>
  );
}

export function PageHeading({
  eyebrow,
  title,
  emoji,
  copy,
}: {
  eyebrow: string;
  title: string;
  emoji: string;
  copy: string;
}) {
  return (
    <>
      <p className="eyebrow text-primary">{eyebrow}</p>
      <h1 className="font-display text-[28px] leading-tight font-extrabold mt-1">
        {title} <span>{emoji}</span>
      </h1>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{copy}</p>
    </>
  );
}

export function FeatureCard({
  color,
  emoji,
  title,
  copy,
}: {
  color: string;
  emoji: string;
  title: string;
  copy: string;
}) {
  return (
    <div className={`${color} rounded-[1.5rem] p-5 min-h-40`}>
      <span className="text-3xl">{emoji}</span>
      <h3 className="font-display font-extrabold text-lg leading-tight mt-3">{title}</h3>
      <p className="text-sm text-ink-soft mt-1 leading-snug">{copy}</p>
    </div>
  );
}

export function EmptyPrompt({
  emoji,
  title,
  copy,
  action,
  onClick,
}: {
  emoji: string;
  title: string;
  copy: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="mt-8 text-center py-9 border-2 border-dashed border-border rounded-[1.75rem] px-5">
      <div className="text-5xl">{emoji}</div>
      <h2 className="font-display text-xl font-extrabold mt-4">{title}</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-60 mx-auto">{copy}</p>
      <Button variant="playful" className="mt-5" onClick={onClick}>
        {action}
        <ArrowRight />
      </Button>
    </div>
  );
}
