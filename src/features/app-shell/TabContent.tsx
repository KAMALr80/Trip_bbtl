import { lazy, Suspense } from "react";
import { HomeSeasons } from "@/features/points/HomeSeasons";
import { Tab } from "@/features/app-shell/tabs";
import { SquadView } from "@/features/trip/SquadView";

import { ArchivedTrip } from "@/features/trip/ArchivedTrip";
import { AfterTrip } from "@/features/postcard/AfterTrip";
import { MeHome } from "@/features/me/MeHome";

import gameOptionA from "@/assets/game-tile-option-a.webp";
import tripCoast from "@/assets/journey-coast-top.jpg";
import tripCoastSmall from "@/assets/journey-coast-top-768.jpg";

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

import { RememberedSection } from "@/components/RememberedSection";

import { AtHomeHome, AtHomeTrip, Rewards, isAtHome } from "@/features/at-home/AtHome";
import { LaunchSwitch } from "@/features/onboarding/BetaAccess";
import { BetaCodesDoor } from "@/features/admin/BetaCodes";
import { AiGuardDoor, AiCapBanner } from "@/features/admin/AiGuard";

import { FounderWelcomeEditor } from "@/features/onboarding/WelcomeCopy";

import { AppearanceQuickToggle } from "@/features/me/MeExtras";
import { FoundingControls } from "@/features/onboarding/LegalConsent";
import { legalLinks } from "@/lib/legal";
import { Link } from "@tanstack/react-router";
import { isFounderSection } from "@/features/app-shell/nav";
import { i18n } from "@/i18n";
import { tripIsOver } from "@/features/trip/trip-order";

// Screens only the founder opens: not in every player's first download.
const FounderDashboard = lazy(() =>
  import("@/features/admin/FounderDashboard").then((m) => ({ default: m.FounderDashboard })),
);
const ModerationQueue = lazy(() =>
  import("@/features/moderation/ModerationQueue").then((m) => ({ default: m.ModerationQueue })),
);
const AdminDirectory = lazy(() =>
  import("@/features/admin/AdminDirectory").then((m) => ({ default: m.AdminDirectory })),
);
const ContentAdmin = lazy(() =>
  import("@/features/admin/ContentAdmin").then((m) => ({ default: m.ContentAdmin })),
);

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
  meSection: requestedSection,
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
  // Founder sections open only for an app admin (QA-13). Anyone else who follows such a link sees
  // their own Me page; the server refuses the data either way.
  const meSection =
    requestedSection && isFounderSection(requestedSection) && !isAdmin ? null : requestedSection;
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
  // M5-12 (R-609): after the Day 7 lock a trip shows its overview, answers and kept photos only.
  if (active && active.locked_at && tab !== "Me")
    return <AfterTrip trip={active} cards={cards} onMember={onMember} />;
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
              {days > 0
                ? i18n.t("home.daysUntil", { count: days })
                : days === 0
                  ? "starts today"
                  : "memories made"}
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
          {!tripIsOver(active) && (
            <Button variant="outline" className="h-12 rounded-full" onClick={() => open("Invite")}>
              <Ticket /> Invite squad
            </Button>
          )}
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
        <MeHome
          userId={userId}
          name={name}
          cards={cards}
          active={active}
          onEditCard={onEditCard}
          onProfile={() => onMember(userId)}
          onPassport={() => setMeSection("me-passport")}
          onNotifications={() => onMe("notifications")}
          onCaptainTools={() => onManage?.()}
          onHelp={() => onMe("help")}
          onTour={onReplay}
          onAbout={onAbout}
          onFeedback={() => onMe("bug")}
          onTrips={() => setMeSection("me-trips")}
          onSettings={() => setMeSection("me-settings")}
        />
        {isAdmin && <AiCapBanner onOpen={() => setMeSection("ai-guard")} />}
        <Suspense fallback={null}>
          {isAdmin && (
            <FounderDashboard
              trips={trips}
              onOpen={(key) =>
                key === "welcome" ||
                key === "founding-members" ||
                key === "beta-codes" ||
                key === "ai-guard" ||
                key === "icon-options" ||
                key === "me-explore" ||
                key === "moderation" ||
                key === "admin-directory" ||
                key === "content-admin"
                  ? setMeSection(key)
                  : onMe(key as "reports" | "feedback" | "lab")
              }
            />
          )}
        </Suspense>
      </div>
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
              moderation: "Photo review",
              "admin-directory": "Users & trips",
              "content-admin": "Content",
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
      <Suspense fallback={null}>
        {meSection === "moderation" && isAdmin && <ModerationQueue />}
        {meSection === "admin-directory" && isAdmin && <AdminDirectory />}
        {meSection === "content-admin" && isAdmin && <ContentAdmin />}
      </Suspense>
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
