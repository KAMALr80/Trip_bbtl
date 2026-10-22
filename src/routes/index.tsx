import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";
import { ArchivedTrip } from "@/components/ArchivedTrip";
import { JourneyPhases } from "@/components/JourneyPhases";
import { BrandLockup } from "@/components/BrandLockup";
import { CaptainCrown } from "@/components/CaptainCrown";
import { CinematicSplash } from "@/components/CinematicSplash";
import { CrownCelebration } from "@/components/CrownCelebration";

import gameOptionA from "@/assets/game-tile-option-a.webp";
import tripCoast from "@/assets/journey-coast-top.jpg";
import tripCoastSmall from "@/assets/journey-coast-top-768.jpg";
import { GameArcade } from "@/components/GameArcade";
import { ShortList } from "@/components/ShortList";
import iconSuitcase from "@/assets/icon-suitcase.webp";
import iconPassport from "@/assets/icon-passport.webp";
import iconTrophy from "@/assets/icon-trophy.webp";
import iconMap from "@/assets/icon-map.webp";
import iconBoarding from "@/assets/icon-boarding-pass.webp";
import iconCompass from "@/assets/icon-compass.webp";
import iconHome from "@/assets/icon-at-home.webp";
import founderLabIcon from "@/assets/founder-test-lab.webp";
import founderFeedbackIcon from "@/assets/founder-feedback.webp";
import founderReportsIcon from "@/assets/founder-reports.webp";
import founderFeaturesIcon from "@/assets/founder-features.webp";
import founderMembersIcon from "@/assets/founder-members.webp";
import founderLaunchIcon from "@/assets/founder-launch.webp";

import { tripDisplayName } from "@/lib/trip-display-name";

import { OutOfCreditsHost } from "@/components/AiCredits";
import { CaptainNudge } from "@/components/CaptainChecklist";
import { createFileRoute } from "@tanstack/react-router";
import { ShowcaseGuest } from "@/components/CultureShowcase";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Home,
  LogOut,
  Plus,
  Sparkles,
  Users,
  UserRound,
  X,
  CalendarDays,
  Ticket,
  Play,
  Eye,
  EyeOff,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { TripSheets } from "@/components/TripSheets";
import { SeatCap } from "@/components/SeatCap";
import { InviteCode } from "@/components/InviteCode";

import { JoinRoomCard } from "@/components/InvitePreview";
import { setViewerZone, deviceZone } from "@/lib/viewer-time";
import { nudgeTopUp } from "@/lib/content.functions";
import { CaptainTools } from "@/components/CaptainTools";
import { TripOverview } from "@/components/TripOverview";
import { FounderReports, BugUpdates, QuickCheckIn } from "@/components/BugInbox";
import { FeedbackAdmin, TripFeedbackForm, useFeedbackDone } from "@/components/TripFeedback";
import { PhaseNotice } from "@/components/PhaseNotice";
import { PlayHub } from "@/components/PlayHub";
import { RoleTips } from "@/components/RoleTips";
import { CaptainBadge, LockedNote, isUnlocked } from "@/components/TripUnlock";
import {
  ActiveSeasonBoard,
  MysteryPrizes,
  SquadSeasons,
  tripHasEnded,
  useBadges,
  useSeasonsData,
  ReadOnlyBanner,
} from "@/components/Seasons";
import {
  loadTrips,
  loadMembers,
  inviteUrl,
  shareInvite,
  type TripWithRole,
  type Member,
} from "@/lib/trips";
import { Clipboard, Share2 } from "lucide-react";
import {
  Avatar,
  AvatarButton,
  PlayerCardEditor,
  PlayerCardView,
  RoleStamp,
  QuickJoinCard,
  type AccountProfile,
} from "@/components/PlayerCards";
import { loadCards, dicebearUrl, type PlayerWithAvatar } from "@/lib/player-cards";
import {
  MyPassport,
  HelpPage,
  BugReport,
  DeleteAccount,
  Skeleton,
  AppearanceToggle,
  HomeLayoutSetting,
  TimeZoneSetting,
  PublicLeaderboardSetting,
} from "@/components/MeExtras";
import { TripList } from "@/components/TripList";
import { Bug, HelpCircle, PlayCircle, Trash2 } from "lucide-react";

import cinematicLoginCoast from "@/assets/cinematic-login-coast-tall-768.jpg";
import cinematicLoginCoastLarge from "@/assets/cinematic-login-coast.jpg";
import { ExploreTour } from "@/components/ExploreTour";

import { TravelerLevel, CultureCreatorBadge, CulturePoints } from "@/components/PassportBook";
import { HomeDashboard, type HomeScreen } from "@/components/HomeDashboard";
import { FirstRunWelcome } from "@/components/FirstRunWelcome";
import { JourneyMap, type JourneyStop } from "@/components/JourneyMap";
import { RememberedSection } from "@/components/RememberedSection";
import { AboutContent } from "@/components/AboutStory";
import { TestLab, SandboxBanner, LabViewBanner } from "@/components/TestLab";
import { setFounder } from "@/lib/lab-mode";
import { AtHomeSetup, AtHomeHome, AtHomeTrip, Rewards, isAtHome } from "@/components/AtHome";
import { readPendingCode, clearPendingCode } from "@/lib/pending-code";
import {
  AgeGate,
  BetaLock,
  LaunchSwitch,
  VIBES,
  WaitingGate,
  TeenJoinGate,
  WaitingTrips,
  vibeOf,
} from "@/components/BetaAccess";
import { BetaCodeField, BetaCodesDoor, WaitingToJoin } from "@/components/BetaCodes";
import { AiGuardDoor, AiCapBanner } from "@/components/AiGuard";
import { readPendingBeta, clearPendingBeta } from "@/lib/pending-beta";
import { dicebearUrl as betaAvatarUrl } from "@/lib/player-cards";
import { FounderWelcomeEditor } from "@/components/WelcomeCopy";
import { DeletedTripNotes } from "@/components/DeletedTripNotes";

import { AppearanceQuickToggle } from "@/components/MeExtras";
import {
  LegalCheckbox,
  LegalConsent,
  useLegalStatus,
  FoundingBadge,
  FoundingControls,
} from "@/components/LegalConsent";
import { LEGAL_VERSION, legalLinks } from "@/lib/legal";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TripJunkies™ — Collect the world with your squad." },
      {
        name: "description",
        content:
          "TripJunkies brings your squad together before, during and after the trip with game nights, daily challenges and a recap worth sharing.",
      },
      { property: "og:title", content: "TripJunkies™ — Collect the world with your squad." },
      {
        property: "og:description",
        content:
          "TripJunkies: game nights before you go, challenges while you're there, and memories after.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const tabs = [
  { name: "Home", icon: Home },
  { name: "Play", icon: Play },
  { name: "Trip", icon: CalendarDays },
  { name: "Squad", icon: Users },
  { name: "Me", icon: UserRound },
] as const;
type Tab = (typeof tabs)[number]["name"];

function Index() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const [splashReady, setSplashReady] = useState(false);
  const [splashTimedOut, setSplashTimedOut] = useState(false);
  const [splashLogin, setSplashLogin] = useState(false);
  useEffect(() => {
    const ready = window.setTimeout(() => setSplashReady(true), 1250);
    const timeout = window.setTimeout(() => setSplashTimedOut(true), 15000);
    return () => {
      window.clearTimeout(ready);
      window.clearTimeout(timeout);
    };
  }, []);
  const legal = useLegalStatus(user?.id);
  const [tab, setTab] = useState<Tab>("Home");
  const [homeScreen, setHomeScreen] = useState<HomeScreen>("dashboard");
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeStoryReturn, setWelcomeStoryReturn] = useState(false);
  const closeWelcome = () => setWelcomeOpen(false);
  const [questCode, setQuestCode] = useState<string | null>(null);
  const [showcaseCode, setShowcaseCode] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const showcase = params.get("showcase");
    if (showcase && /^[A-Z2-9]{16}$/i.test(showcase)) setShowcaseCode(showcase.toUpperCase());
    const code = params.get("quest");
    if (code && /^[A-Z0-9]{6}$/i.test(code)) {
      setQuestCode(code.toUpperCase());
      setHomeScreen("inspiration");
    }
  }, []);
  const [sampleDestination, setSampleDestination] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [exploreTour, setExploreTour] = useState(false);
  const [tourDismissed, setTourDismissed] = useState(false);
  const tripsRequest = useRef(0);
  const [trips, setTrips] = useState<TripWithRole[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [cards, setCards] = useState<PlayerWithAvatar[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [editCard, setEditCard] = useState(false);
  const [tools, setTools] = useState(false);
  const [viewAsPlayer, setViewAsPlayer] = useState(false);
  // Capture outside React too: dialogs may be portaled outside the app root.
  useEffect(() => {
    if (!viewAsPlayer) return;
    const block = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (
        event.type === "click" &&
        (target?.closest('[data-view-navigation="true"]') || target?.closest('a[target="_blank"]'))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", block, true);
    document.addEventListener("submit", block, true);
    document.addEventListener("change", block, true);
    return () => {
      document.removeEventListener("click", block, true);
      document.removeEventListener("submit", block, true);
      document.removeEventListener("change", block, true);
    };
  }, [viewAsPlayer]);
  const [itineraryVersion, setItineraryVersion] = useState(0);
  const [about, setAbout] = useState(false);
  const [meView, setMeView] = useState<
    "help" | "bug" | "delete" | "feedback" | "lab" | "reports" | null
  >(null);
  const [publicView, setPublicView] = useState<"overview" | "story" | "games" | null>(null);
  const [meSection, setMeSection] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    void supabase.rpc("is_app_admin").then((r) => {
      setIsAdmin(!!r.data);
      setFounder(!!r.data);
    });
    if (user) void supabase.rpc("touch_last_seen" as never);
  }, [user?.id]);
  const [myProfile, setMyProfile] = useState<AccountProfile | null | undefined>(undefined);
  const loadMyProfile = async () => {
    if (!user) return;
    const { data } = await (supabase as unknown as { from: (t: string) => any })
      .from("player_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setMyProfile((data as AccountProfile | null) ?? null);
  };
  useEffect(() => {
    void loadMyProfile();
  }, [user?.id]);
  function replayIntro() {
    setMeView(null);
    setExploreTour(true);
  }
  const [tripError, setTripError] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [inviteSnoozed, setInviteSnoozed] = useState(false);
  useEffect(() => {
    setInviteSnoozed(!!pendingCode && sessionStorage.getItem("tj-invite-snoozed") === pendingCode);
  }, [pendingCode]);
  // Personal time zone: follow the device unless the person picked one in Settings. Display only.
  useEffect(() => {
    if (!user) return;
    void (supabase as unknown as { from: (t: string) => any })
      .from("profiles")
      .select("time_zone,time_zone_manual")
      .eq("id", user.id)
      .maybeSingle()
      .then(
        ({ data }: { data: { time_zone: string | null; time_zone_manual: boolean } | null }) => {
          const device = deviceZone();
          if (data?.time_zone_manual && data.time_zone) {
            setViewerZone(data.time_zone);
            return;
          }
          setViewerZone(device);
          if (data && data.time_zone !== device)
            void (supabase as unknown as { from: (t: string) => any })
              .from("profiles")
              .update({ time_zone: device })
              .eq("id", user.id);
        },
      );
  }, [user?.id]);
  const [launch, setLaunch] = useState<boolean | null>(null);
  const [betaNotice, setBetaNotice] = useState("");
  const [anonCode, setAnonCode] = useState<string | null>(null);
  const [previewLock, setPreviewLock] = useState(false);
  const [access, setAccess] = useState<{
    beta: boolean;
    has_dob: boolean;
    age_range: string;
  } | null>(null);
  useEffect(() => {
    void supabase.rpc("public_launch" as never).then((r: { data: unknown }) => setLaunch(!!r.data));
    setAnonCode(readPendingCode() ?? readPendingBeta());
  }, []);
  const loadAccess = async () => {
    // Call through the client so `this` stays bound (a detached `.rpc` crashes with "reading 'rest'").
    const rpc = (n: string, a?: object) =>
      (
        supabase as unknown as {
          rpc: (n: string, a?: object) => Promise<{ data: any; error: unknown }>;
        }
      ).rpc(n, a);
    let r = await rpc("my_access");
    let next = r.data?.[0] ?? { beta: false, has_dob: false, age_range: "Unknown" };
    // A saved /beta/<CODE> is redeemed automatically after the first sign-in (server-checked).
    const saved = readPendingBeta();
    if (saved && next.has_dob) {
      if (!next.beta) {
        const redeem = await rpc("redeem_beta_code", { p_code: saved });
        // Say why it failed. This used to be swallowed, so someone whose code was
        // already used landed on the private-beta screen with no explanation.
        if (redeem.error) setBetaNotice(friendlyError(redeem.error));
        r = await rpc("my_access");
        next = r.data?.[0] ?? next;
      }
      // Only forget the saved code once it has actually worked — it was being
      // cleared even when the server rejected it, which left people stuck with
      // nothing to retry and nothing on screen to act on.
      if (next.beta) {
        setBetaNotice("");
        clearPendingBeta();
      }
    }
    setAccess(next);
  };
  useEffect(() => {
    if (user) void loadAccess();
    else setAccess(null);
  }, [user?.id]);
  const active = trips.find((t) => t.id === activeId) ?? null;
  useEffect(() => {
    if (!activeId || sessionStorage.getItem(`tj-topup-${activeId}`)) return;
    sessionStorage.setItem(`tj-topup-${activeId}`, "1");
    nudgeTopUp(activeId);
  }, [activeId]);
  const joinRoom = !pendingCode ? null : inviteSnoozed ? (
    <Button
      variant="outline"
      className="w-full mb-4 border-blue text-blue"
      onClick={() => {
        sessionStorage.removeItem("tj-invite-snoozed");
        setInviteSnoozed(false);
      }}
    >
      📌 Trip invite waiting · open
    </Button>
  ) : (
    <JoinRoomCard
      key={pendingCode}
      code={pendingCode}
      onJoin={async (id) => {
        await refreshTrips(id);
        clearPendingCode();
        setPendingCode(null);
        setHomeScreen("dashboard");
        setTab("Home");
      }}
      onDismiss={() => {
        sessionStorage.setItem("tj-invite-snoozed", pendingCode);
        setInviteSnoozed(true);
      }}
      onExpired={() => {
        clearPendingCode();
        setPendingCode(null);
      }}
    />
  );
  const displayedTrip = active && viewAsPlayer ? { ...active, myRole: "player" } : active;
  const displayedMembers = viewAsPlayer
    ? members.map((m) => (m.user_id === user?.id ? { ...m, role: "player" } : m))
    : members;
  const refreshTrips = async (preferredId?: string, requirePreferred = false) => {
    if (!user) return;
    const request = ++tripsRequest.current;
    try {
      const next = await loadTrips(user.id);
      if (request !== tripsRequest.current) return;
      if (requirePreferred && !next.some((t) => t.id === preferredId))
        throw new Error("Your trip hasn't loaded yet. Please try again.");
      setTrips(next);
      setCardsLoading(true);
      setActiveId((previous) => {
        const preferred =
          preferredId ?? previous ?? window.localStorage.getItem(`tripjunkie-active-${user.id}`);
        return next.find((t) => t.id === preferred)?.id ?? next[0]?.id ?? null;
      });
      setTripError("");
    } catch (error) {
      setTripError(friendlyError(error));
      if (requirePreferred) throw error;
    }
  };
  useEffect(() => {
    if (!user) {
      tripsRequest.current++;
      setTrips([]);
      setActiveId(null);
      return;
    }
    setTourDismissed(false);
    void refreshTrips();
    setPendingCode(readPendingCode());
  }, [user?.id]);
  // Removed/left/approved: watch my own memberships and refresh right away so no stale trip stays open.
  useEffect(() => {
    if (!user) return;
    let sig = "";
    const check = async () => {
      const { data } = await supabase
        .from("trip_members")
        .select("trip_id,status")
        .eq("user_id", user.id);
      const next = (data ?? [])
        .map((m) => `${m.trip_id}:${m.status}`)
        .sort()
        .join(",");
      if (sig && next !== sig) void refreshTrips();
      sig = next;
    };
    void check();
    const t = window.setInterval(() => {
      if (!document.hidden) void check();
    }, 15000);
    const vis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user || !activeId) {
      setMembers([]);
      setCards([]);
      setCardsLoading(false);
      return;
    }
    setCardsLoading(true);
    safeSetItem(`tripjunkie-active-${user.id}`, activeId);
    void Promise.all([loadMembers(activeId), loadCards(activeId)])
      .then(([nextMembers, nextCards]) => {
        setMembers(nextMembers);
        setCards(nextCards);
        setCardsLoading(false);
      })
      .catch((error) => {
        setTripError(friendlyError(error));
        setCardsLoading(false);
      });
  }, [user?.id, activeId, trips]);
  async function refreshCards() {
    if (!activeId) return;
    const [nextMembers, nextCards] = await Promise.all([
      loadMembers(activeId),
      loadCards(activeId),
    ]);
    setMembers(nextMembers);
    setCards(nextCards);
  }
  function selectTrip(id: string) {
    setActiveId(id);
    setCardsLoading(true);
    setTools(false);
    setViewAsPlayer(false);
    setTab("Home");
    setHomeScreen("trip");
  }
  async function finishTrip(id: string) {
    await refreshTrips(id);
    setTab("Home");
    setHomeScreen("trip");
    if (sheet === "Start a trip") setSheet(null);
    else if (sheet === "At Home") setSheet("celebrate");
    else setSheet(null);
  }

  async function finishOnboarding() {
    if (!user) return;
    setExploreTour(false);
    setTourDismissed(true);
    if (!profile?.onboarding_completed) {
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);
      if (error) {
        console.error("Tour completion couldn't be saved", error);
        setTourDismissed(false);
        return;
      }
      await refreshProfile();
    }
  }

  if (
    !splashLogin &&
    ((!splashReady && !splashTimedOut) ||
      loading ||
      (user && !profile) ||
      (!user && launch === null))
  )
    return <CinematicSplash failed={splashTimedOut} onLogin={() => setSplashLogin(true)} />;
  if (loading || (user && !profile))
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <BrandLockup className="text-3xl" />
      </div>
    );
  if (!user) {
    if (launch === null)
      return (
        <AuthScreen
          allowSignup={false}
          onExplore={() => setPublicView("overview")}
          onStory={() => setPublicView("story")}
        />
      );
    if (publicView === "games")
      return (
        <main className="min-h-dvh max-w-lg mx-auto px-[18px] pt-[max(1rem,env(safe-area-inset-top))] pb-8">
          <header className="cinematic-home-header">
            <BrandLockup className="cinematic-home-brand" compact />
            <div className="cinematic-home-controls">
              <Button
                variant="playful"
                size="sm"
                className="rounded-full"
                onClick={() => setPublicView(null)}
              >
                Sign in
              </Button>
            </div>
          </header>
          <GameArcade guest onBack={() => setPublicView(null)} />
          <OutOfCreditsHost onSignIn={() => setPublicView(null)} />
        </main>
      );
    if (publicView === "overview")
      return (
        <ExploreTour
          onFinish={() => setPublicView(null)}
          onPlayNow={() => setPublicView("games")}
        />
      );
    if (publicView)
      return (
        <main className="min-h-dvh max-w-lg mx-auto px-[18px] py-8">
          <Button variant="ghost" onClick={() => setPublicView(null)}>
            <ArrowLeft /> Back
          </Button>
          {publicView === "story" ? (
            <AboutContent onBack={() => setPublicView(null)} backLabel="Welcome" />
          ) : (
            <>
              <p className="eyebrow mt-6">TRIPJUNKIES · SAMPLE PREVIEW</p>
              <h1 className="font-display text-3xl font-extrabold mt-2">
                Collect the world with your squad.
              </h1>
              <p className="text-muted-foreground mt-2">See the adventure before you join one.</p>
              <div className="grid gap-3 mt-6">
                {[
                  ["Game nights", "Break the ice before takeoff."],
                  ["Trip days", "Little challenges make bigger memories."],
                  ["At Home", "Explore together from your couch."],
                  ["My Passport", "Keep the places you've collected."],
                ].map(([title, copy]) => (
                  <div className="app-card flex items-center gap-3" key={title}>
                    <img
                      src={
                        title === "Game nights"
                          ? iconBoarding
                          : title === "Trip days"
                            ? iconMap
                            : title === "At Home"
                              ? iconHome
                              : iconPassport
                      }
                      alt=""
                      className="size-16 shrink-0 object-contain"
                    />
                    <div>
                      <h2 className="font-display text-lg font-extrabold">{title}</h2>
                      <p className="text-sm text-muted-foreground mt-1">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-5 w-full"
                onClick={() => setPublicView("story")}
              >
                Read the founder's story <ArrowRight />
              </Button>
            </>
          )}
        </main>
      );
    return (
      <AuthScreen
        allowSignup={launch || !!anonCode}
        onBetaSaved={() => setAnonCode(readPendingBeta())}
        onExplore={() => setPublicView("overview")}
        onStory={() => setPublicView("story")}
      />
    );
  }
  if (legal.status === "loading")
    return (
      <main className="min-h-dvh grid place-items-center">
        <BrandLockup className="text-3xl" />
      </main>
    );
  if (legal.status === "required") return <LegalConsent onAccepted={legal.accept} />;
  if (!access) return null;
  if (!access.has_dob) return <AgeGate onDone={() => void loadAccess()} />;
  if (access.age_range.startsWith("Teen") && trips.length === 0)
    return (
      <TeenJoinGate
        onJoined={() => {
          void refreshTrips();
          void loadAccess();
        }}
      />
    );
  if (!access.beta && !pendingCode)
    return <WaitingGate notice={betaNotice} onRedeemed={() => void loadAccess()} />;
  if (previewLock)
    return (
      <div>
        <BetaLock
          onLogin={() => setPreviewLock(false)}
          onExplore={() => {
            setPreviewLock(false);
            setExploreTour(true);
          }}
          onStory={() => {
            setPreviewLock(false);
            setAbout(true);
            setTab("Me");
          }}
        />
        <p className="fixed bottom-4 inset-x-0 text-center text-xs text-muted-foreground">
          Test Lab preview · tap Log in to go back
        </p>
      </div>
    );
  if (exploreTour)
    return (
      <ExploreTour
        onFinish={async () => {
          await finishOnboarding();
          setSampleDestination(null);
        }}
        destination={sampleDestination ?? undefined}
        onPlanTrip={async () => {
          await finishOnboarding();
          setExploreTour(false);
          setSampleDestination(null);
          setTab("Home");
          setHomeScreen("dashboard");
          setSheet("Start a trip");
        }}
        onStartTrip={
          sampleDestination && access.age_range === "21+"
            ? () => {
                setExploreTour(false);
                setSampleDestination(null);
                setTab("Home");
                setHomeScreen("dashboard");
                setSheet("Start a trip");
              }
            : undefined
        }
      />
    );
  return (
    <div
      data-vibe={active ? vibeOf(active) : undefined}
      className={`page-scene page-scene-${tab.toLowerCase()} cinematic-page-scene min-h-dvh max-w-lg mx-auto relative`}
    >
      {(active as { is_sandbox?: boolean } | null)?.is_sandbox && <SandboxBanner />}
      <LabViewBanner refresh={(id) => refreshTrips(id)} />
      {viewAsPlayer && (
        <div className="sticky top-0 z-30 bg-blue text-primary-foreground px-[18px] py-2 text-xs font-bold flex items-center justify-between">
          Viewing as player{" "}
          <Button
            data-view-navigation="true"
            variant="ghost"
            className="h-8 text-primary-foreground underline"
            onClick={() => setViewAsPlayer(false)}
          >
            Switch back
          </Button>
        </div>
      )}
      <header className="cinematic-home-header">
        <BrandLockup className="cinematic-home-brand" compact />
        <div className="cinematic-home-controls">
          {active && (
            <span
              className="cinematic-home-vibe"
              role="img"
              aria-label={`Vibe: ${VIBES[vibeOf(active)].label}`}
              title={`Vibe: ${VIBES[vibeOf(active)].label}`}
            >
              {VIBES[vibeOf(active)].emoji}
            </span>
          )}
          {active && !viewAsPlayer && ["captain", "co_captain"].includes(active.myRole) && (
            <Button
              variant="ghost"
              className="cinematic-home-captain"
              aria-label="Captain Tools"
              title="Captain Tools"
              onClick={() => {
                setTools(true);
                setSheet(null);
              }}
            >
              <CaptainCrown />
            </Button>
          )}
          {!viewAsPlayer && access.age_range === "21+" && (
            <Button
              variant="ghost"
              className="cinematic-plan-trip"
              aria-label="Plan a Trip"
              title="Plan a Trip"
              onClick={() => setSheet("Start a trip")}
            >
              <img src={iconSuitcase} alt="" width={72} height={72} />
              <span aria-hidden="true">+</span>
            </Button>
          )}
        </div>
      </header>
      {meView && tab === "Me" ? (
        <div className="px-[18px]">
          {meView === "lab" && isAdmin ? (
            <TestLab
              trips={trips}
              activeId={active?.id}
              selectTrip={(id) => {
                selectTrip(id);
                setMeView(null);
              }}
              refresh={(id) => refreshTrips(id)}
              onBack={() => setMeView(null)}
              goTab={(t) => {
                setMeView(null);
                setTab(t);
              }}
              openTools={() => {
                setMeView(null);
                setTools(true);
              }}
              previewLock={() => setPreviewLock(true)}
            />
          ) : meView === "feedback" ? (
            <FeedbackAdmin onBack={() => setMeView(null)} />
          ) : meView === "reports" && isAdmin ? (
            <FounderReports onBack={() => setMeView(null)} />
          ) : meView === "help" ? (
            <HelpPage onBack={() => setMeView(null)} onReplay={() => void replayIntro()} />
          ) : meView === "bug" ? (
            <BugReport
              onBack={() => setMeView(null)}
              tripId={active?.id}
              page={`Me (last tab: ${tab})`}
            />
          ) : (
            <DeleteAccount onBack={() => setMeView(null)} />
          )}
        </div>
      ) : showcaseCode ? (
        <div className="px-[18px]">
          <ShowcaseGuest
            code={showcaseCode}
            onBack={() => {
              setShowcaseCode(null);
              const url = new URL(window.location.href);
              url.searchParams.delete("showcase");
              window.history.replaceState({}, "", url);
              setTab("Home");
              setHomeScreen("dashboard");
            }}
          />
        </div>
      ) : about && tab === "Me" ? (
        <div className="px-[18px]">
          <AboutContent
            backLabel={welcomeStoryReturn ? "Home" : "Me"}
            onBack={() => {
              setAbout(false);
              if (welcomeStoryReturn) {
                setTab("Home");
                setHomeScreen("dashboard");
                setWelcomeStoryReturn(false);
              }
            }}
          />
        </div>
      ) : tools && active ? (
        <CaptainTools
          key={active.id}
          trip={active}
          members={members}
          cards={cards}
          onBack={() => setTools(false)}
          onViewAsPlayer={() => {
            setViewAsPlayer(true);
            setTools(false);
            setTab("Home");
            setHomeScreen("trip");
          }}
          onMember={setSelectedMember}
          onUpdated={async () => {
            setItineraryVersion((v) => v + 1);
            await refreshTrips();
          }}
          userId={user.id}
        />
      ) : (
        <div className="px-[18px]">
          {tripError && (
            <p role="alert" className="text-destructive text-sm mb-4">
              {tripError}
            </p>
          )}
          <OutOfCreditsHost />
          {tab === "Home" && homeScreen === "dashboard" && (
            <>
              <WaitingTrips />
              <DeletedTripNotes />
            </>
          )}
          {tab === "Home" && homeScreen === "journey" && displayedTrip ? (
            <JourneyMap
              key={displayedTrip.id}
              trip={displayedTrip}
              members={displayedMembers}
              cards={cards}
              trips={trips}
              onSelectTrip={selectTrip}
              onTripsChanged={() => refreshTrips()}
              onPlanTrip={access.age_range === "21+" ? () => setSheet("Start a trip") : undefined}
              onJoinTrip={() => setSheet("Join a trip")}
              onBack={() => setHomeScreen("dashboard")}
              onOpenStop={(stop: JourneyStop) => {
                if (stop.type === "activity") {
                  setTab("Play");
                  setHomeScreen("dashboard");
                } else if (stop.type === "day") {
                  setTab("Trip");
                  setHomeScreen("dashboard");
                  const key = `tripjunkie-trip-sections-${displayedTrip.id}`;
                  try {
                    const saved = JSON.parse(window.localStorage.getItem(key) || "[]") as string[];
                    safeSetItem(
                      key,
                      JSON.stringify(Array.from(new Set([...saved, "plan", "photos"]))),
                    );
                  } catch {
                    safeSetItem(key, JSON.stringify(["plan", "photos"]));
                  }
                  window.sessionStorage.setItem(
                    `journey-day-${displayedTrip.id}`,
                    String(stop.date),
                  );
                  let tries = 0;
                  const tripKey = displayedTrip.id;
                  const seek = () => {
                    const el = document.getElementById(`itinerary-day-${tripKey}-${stop.date}`);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "start" });
                      return;
                    }
                    if (++tries < 20) window.setTimeout(seek, 200);
                    else
                      document
                        .getElementById(`trip-calendar-${tripKey}`)
                        ?.scrollIntoView({ behavior: "smooth" });
                  };
                  window.setTimeout(seek, 250);
                } else {
                  setTab("Home");
                  setHomeScreen("trip");
                }
              }}
            />
          ) : (
            tab === "Home" &&
            homeScreen !== "trip" && (
              <HomeDashboard
                screen={homeScreen}
                setScreen={setHomeScreen}
                trips={trips}
                active={displayedTrip}
                members={displayedMembers}
                cards={cards}
                userId={user.id}
                name={myProfile?.game_name || "friend"}
                invite={joinRoom}
                selectTrip={selectTrip}
                open={setSheet}
                explore={(destination) => {
                  setSampleDestination(destination ?? null);
                  setExploreTour(true);
                }}
                canStart={access.age_range === "21+"}
                adultUnder21={access.age_range === "18–20"}
                goPlay={() => setTab("Play")}
                refreshTrips={() => refreshTrips()}
                isFounder={isAdmin}
                questCode={questCode}
                onQuestOpened={() => {
                  setQuestCode(null);
                  const url = new URL(window.location.href);
                  url.searchParams.delete("quest");
                  window.history.replaceState({}, "", url);
                }}
                onWelcome={() => setWelcomeOpen(true)}
                onMember={setSelectedMember}
              />
            )
          )}{" "}
          {tab === "Home" && homeScreen === "trip" && <WaitingTrips />}
          {tab === "Home" && homeScreen === "trip" && joinRoom}
          {tab === "Home" &&
            homeScreen === "trip" &&
            active &&
            !viewAsPlayer &&
            active.ended_at == null && <QuickCheckIn trip={active} />}
          {tab === "Home" &&
            homeScreen === "trip" &&
            !viewAsPlayer &&
            !cardsLoading &&
            (!active || cards.some((c) => c.user_id === user.id)) &&
            !profile?.onboarding_completed &&
            !tourDismissed && (
              <ExplorePrompt onOpen={replayIntro} onDismiss={() => void finishOnboarding()} />
            )}
          {tab === "Home" &&
            homeScreen === "trip" &&
            active &&
            !viewAsPlayer &&
            ["captain", "co_captain"].includes(active.myRole) && (
              <CaptainNudge
                key={`nudge-${active.id}`}
                trip={active}
                members={members}
                onOpenTools={() => {
                  setTools(true);
                  setSheet(null);
                }}
              />
            )}{" "}
          {!(tab === "Home" && homeScreen !== "trip") && (
            <div key={`${tab}-${tools}-${about}-${meView ?? "main"}`} className="tab-enter">
              <TabContent
                isAdmin={isAdmin}
                tab={tab}
                name={
                  myProfile?.game_name ||
                  cards.find((c) => c.user_id === user.id)?.game_name ||
                  "friend"
                }
                email={user.email ?? ""}
                open={setSheet}
                active={displayedTrip}
                trips={trips}
                members={displayedMembers}
                cards={cards}
                onMember={setSelectedMember}
                onEditCard={() => setEditCard(true)}
                userId={user.id}
                selectTrip={selectTrip}
                refresh={() => refreshTrips()}
                onAbout={() => setAbout(true)}
                onMe={setMeView}
                onReplay={() => void replayIntro()}
                meSection={meSection}
                setMeSection={setMeSection}
                loading={cardsLoading}
                itineraryVersion={itineraryVersion}
                canStart={access.age_range === "21+"}
                viewOnly={viewAsPlayer}
                onManage={() => setTools(true)}
                onCalendar={() => {
                  if (active) {
                    const key = `tripjunkie-trip-sections-${active.id}`;
                    try {
                      const saved = JSON.parse(
                        window.localStorage.getItem(key) || "[]",
                      ) as string[];
                      safeSetItem(key, JSON.stringify(Array.from(new Set([...saved, "hosts"]))));
                    } catch {
                      safeSetItem(key, JSON.stringify(["hosts"]));
                    }
                  }
                  setTab("Trip");
                  window.setTimeout(
                    () =>
                      document
                        .getElementById(`trip-calendar-${active?.id}`)
                        ?.scrollIntoView({ behavior: "smooth" }),
                    80,
                  );
                }}
                onJourney={() => {
                  setTab("Home");
                  setHomeScreen("journey");
                }}
                onWindowSeat={() => {
                  setTab("Home");
                  setHomeScreen("window");
                }}
                onTrip={() => {
                  if (active) {
                    const key = `tripjunkie-trip-sections-${active.id}`;
                    try {
                      const saved = JSON.parse(
                        window.localStorage.getItem(key) || "[]",
                      ) as string[];
                      safeSetItem(key, JSON.stringify(Array.from(new Set([...saved, "plan"]))));
                    } catch {
                      safeSetItem(key, JSON.stringify(["plan"]));
                    }
                  }
                  setTab("Trip");
                  window.setTimeout(() => window.scrollTo({ top: 0 }), 50);
                }}
                onWrapped={() => {
                  setTab("Home");
                  setHomeScreen("trip");
                  window.setTimeout(() => window.scrollTo({ top: 0 }), 50);
                }}
                onPassportNavigate={(phase) => {
                  if (phase === "window") {
                    setTab("Home");
                    setHomeScreen("window");
                  } else if (phase === "culture" || phase === "athome") {
                    setTab("Home");
                    setHomeScreen("inspiration");
                  } else if (phase === "preflight") setTab("Play");
                  else {
                    setTab("Trip");
                    setHomeScreen("dashboard");
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
      <nav
        className="night-nav fixed inset-x-0 mx-auto w-[calc(100%-24px)] max-w-[488px] z-20 bg-nav px-2 py-1.5 flex items-center justify-between"
        aria-label="Main navigation"
      >
        {tabs.map(({ name, icon: Icon }) => (
          <Button
            data-view-navigation="true"
            key={name}
            variant="ghost"
            onClick={() => {
              if (welcomeOpen) closeWelcome();
              setWelcomeStoryReturn(false);
              setTools(false);
              setAbout(false);
              setMeView(null);
              setTab(name);
              window.scrollTo({ top: 0, behavior: "instant" });
              if (name === "Home") setHomeScreen("dashboard");
            }}
            aria-label={name}
            aria-current={tab === name ? "page" : undefined}
            onPointerDown={(e) => e.currentTarget.blur()}
            className={`h-14 min-w-0 flex-1 flex-col gap-0.5 rounded-full px-1 text-[10px] ${tab === name ? "text-blue" : "text-muted-foreground"}`}
          >
            <Icon size={20} strokeWidth={tab === name ? 2.7 : 2} className="!size-5" />
            {name}
          </Button>
        ))}
      </nav>
      {welcomeOpen && !sheet && !tools && !viewAsPlayer && (
        <FirstRunWelcome
          canStart={access.age_range === "21+"}
          onTrip={() => {
            if (access.age_range === "21+") {
              closeWelcome();
              setSheet("Start a trip");
            }
          }}
          onHome={() => {
            closeWelcome();
            setTab("Home");
            setHomeScreen("inspiration");
          }}
          onInspire={() => {
            closeWelcome();
            setTab("Home");
            setHomeScreen("window");
          }}
          onGames={() => {
            closeWelcome();
            setTab("Home");
            setHomeScreen("arcade");
          }}
          onStory={() => {
            closeWelcome();
            setWelcomeStoryReturn(true);
            setTab("Me");
            setAbout(true);
          }}
          onClose={closeWelcome}
        />
      )}
      <AppSheet
        title={sheet}
        onClose={() => setSheet(null)}
        onSelect={setSheet}
        onDone={(id) => void finishTrip(id)}
        active={active}
      />
      {!welcomeOpen && !sheet && !selectedMember && !editCard && !tools && !viewAsPlayer && (
        <CrownCelebration trips={trips} userId={user.id} cards={cards} />
      )}
      {active && !welcomeOpen && !tools && !viewAsPlayer && (
        <>{!sheet && <RoleTips key={`rt-${active.id}`} trip={active} userId={user.id} />}</>
      )}
      {selectedMember && active && (
        <PlayerCardView
          tripId={active.id}
          userId={selectedMember}
          fallback={cards.find((c) => c.user_id === selectedMember)}
          onClose={() => setSelectedMember(null)}
        />
      )}
      {user &&
        myProfile !== undefined &&
        !sheet &&
        !viewAsPlayer &&
        (() => {
          const mine = cards.find((c) => c.user_id === user.id);
          const needsCard = !!active && !cardsLoading && !mine;
          if (needsCard && myProfile && !editCard)
            return (
              <QuickJoinCard
                key={`qj-${active.id}`}
                tripId={active.id}
                tripName={active.name}
                userId={user.id}
                profile={myProfile}
                avatar={
                  myProfile.avatar_style === "photo"
                    ? ""
                    : dicebearUrl(myProfile.avatar_style, myProfile.avatar_seed)
                }
                onSaved={refreshCards}
              />
            );
          if (editCard || (needsCard && !myProfile))
            return (
              <PlayerCardEditor
                key={`ed-${active?.id ?? "none"}-${!!mine}`}
                tripId={active && !cardsLoading ? active.id : undefined}
                userId={user.id}
                profile={myProfile}
                current={mine}
                onSaved={async () => {
                  await Promise.all([loadMyProfile(), refreshCards()]);
                  setEditCard(false);
                }}
                onClose={needsCard ? undefined : () => setEditCard(false)}
              />
            );
          return null;
        })()}
    </div>
  );
}

function Brand() {
  return <BrandLockup className="text-xl" compact />;
}

function ExplorePrompt({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="app-card mb-4 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-extrabold">Explore the app ✨</h2>
        <Button variant="link" className="h-auto p-0 text-blue" onClick={onOpen}>
          See the tour <ArrowRight size={16} />
        </Button>
      </div>
      <Button variant="outline" size="sm" onClick={onDismiss}>
        Got it
      </Button>
    </div>
  );
}

function AuthScreen({
  allowSignup = true,
  onExplore,
  onStory,
  onBetaSaved,
}: {
  onBetaSaved?: () => void;
  allowSignup?: boolean;
  onExplore: () => void;
  onStory: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [legalChecked, setLegalChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupDob, setSignupDob] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false),
    [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verifying, setVerifying] = useState("");
  async function emailAuth(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && (!legalChecked || !signupDob)) return;
    const ageAt = (y: number) =>
      new Date(signupDob) <= new Date(new Date().setFullYear(new Date().getFullYear() - y));
    const teenInvite = readPendingCode();
    if (mode === "signup" && !Number.isFinite(new Date(signupDob).getTime())) {
      e.preventDefault();
      setMessage("Check your birthday.");
      return;
    }
    if (mode === "signup" && !ageAt(13)) {
      e.preventDefault();
      setMessage("Family Mode is coming soon. TripJunkies accounts are for ages 13 and up.");
      return;
    }
    const isTeen = mode === "signup" && !ageAt(18);
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const { data, error } =
      mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: {
                legal_version: LEGAL_VERSION,
                birthday: signupDob,
                ...(isTeen && teenInvite ? { teen_invite: teenInvite } : {}),
              },
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });
    if (error && /not confirmed/i.test(error.message)) {
      await supabase.auth.resend({ type: "signup", email });
      setVerifying(email);
    } else if (error) setMessage(`Oops, that didn't work: ${friendlyError(error)}`);
    else if (mode === "signup" && !data.session) setVerifying(email);
    else if (mode === "signup" && data.session) {
      await supabase.rpc("accept_legal", { p_version: LEGAL_VERSION });
      if (isTeen)
        await (supabase.rpc as unknown as (n: string, a: object) => Promise<unknown>)(
          "set_teen_dob",
          { p_dob: signupDob, p_agree: true, p_invite: teenInvite },
        );
      else await supabase.rpc("set_my_dob", { p_dob: signupDob, p_agree: true });
    }
    setBusy(false);
  }
  async function social(provider: "google") {
    setBusy(true);
    setMessage("");
    try {
      // Supabase redirects the browser to Google and back to this origin, where the session is
      // picked up from the URL. The Google provider and redirect URLs live in Supabase Auth settings.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) {
        setMessage(
          `Google sign-in didn't work: ${friendlyError(error) || "please try again"}. You can also use email below.`,
        );
        setBusy(false);
      }
    } catch (error) {
      setMessage(
        `Google sign-in didn't work: ${friendlyError(error) || "please try again"}. Pop-ups may be blocked — try again or use email below.`,
      );
      setBusy(false);
    }
  }
  if (verifying)
    return (
      <VerifyCode
        email={verifying}
        onBack={() => {
          setVerifying("");
          setMode("signin");
        }}
      />
    );
  return (
    <main className={`cinematic-auth ${emailOpen ? "cinematic-auth-email" : ""}`}>
      <img
        className="cinematic-auth-scene"
        src={cinematicLoginCoast}
        srcSet={`${cinematicLoginCoast} 768w, ${cinematicLoginCoastLarge} 1024w`}
        sizes="(max-width: 520px) 100vw, 520px"
        alt="Five diverse friends cheering over a tropical coastal town at sunset"
        width={768}
        height={1366}
        fetchPriority="high"
      />
      <div className="cinematic-auth-content">
        <BrandLockup className="cinematic-auth-brand" />
        <div className="cinematic-auth-spacer">
          {!emailOpen && <p className="login-hook">Think you can out-travel your crew?</p>}
        </div>
        {emailOpen ? (
          <section
            className="cinematic-auth-form"
            aria-label={
              forgot
                ? "Reset your password"
                : mode === "signup"
                  ? "Sign up with email"
                  : "Sign in with email"
            }
          >
            <Button
              variant="ghost"
              className="cinematic-auth-back"
              onClick={() => {
                setEmailOpen(false);
                setForgot(false);
                setMessage("");
              }}
            >
              <ArrowLeft size={17} /> Back
            </Button>
            <h1>
              {forgot
                ? "Reset your password"
                : mode === "signup"
                  ? "Join the squad"
                  : "Welcome back"}
            </h1>
            {forgot ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                  } finally {
                    setMessage(
                      "If an account uses that email, a reset link is on its way. Check your inbox.",
                    );
                    setBusy(false);
                  }
                }}
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="Email address"
                  aria-label="Email address"
                />
                <Button type="submit" className="cinematic-auth-submit" disabled={busy}>
                  Send reset link
                </Button>
                <Button type="button" variant="link" onClick={() => setForgot(false)}>
                  Back to Log in
                </Button>
              </form>
            ) : (
              <>
                <form onSubmit={(e) => void emailAuth(e)}>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email address"
                    aria-label="Email address"
                  />
                  <div className="cinematic-auth-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      aria-label="Password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  {mode === "signup" && (
                    <>
                      <label className="cinematic-auth-birthday">
                        Birthday
                        <input
                          type="date"
                          required
                          max={new Date().toISOString().slice(0, 10)}
                          value={signupDob}
                          onChange={(e) => setSignupDob(e.target.value)}
                        />
                        <small>
                          Saved once. Contact support to correct it later. Ages 13 and up can sign
                          up; 13–17 join a trip with their Captain's code and approval.
                        </small>
                      </label>
                      <LegalCheckbox checked={legalChecked} onChange={setLegalChecked} />
                    </>
                  )}
                  <Button type="submit" className="cinematic-auth-submit" disabled={busy}>
                    {busy ? "One sec..." : mode === "signup" ? "Sign up" : "Log in"}
                  </Button>
                </form>
                <div className="cinematic-auth-links">
                  {mode === "signin" && (
                    <Button
                      variant="link"
                      onClick={() => {
                        setForgot(true);
                        setMessage("");
                      }}
                    >
                      Forgot password?
                    </Button>
                  )}
                  {!allowSignup && onBetaSaved && (
                    <div className="w-full mt-3">
                      <BetaCodeField signedIn={false} onRedeemed={onBetaSaved} />
                    </div>
                  )}
                  {allowSignup && (
                    <Button
                      variant="link"
                      onClick={() => {
                        setMode(mode === "signin" ? "signup" : "signin");
                        setMessage("");
                      }}
                    >
                      {mode === "signin" ? "New here? Sign up" : "Already have an account? Log in"}
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>
        ) : (
          <div className="cinematic-auth-actions">
            <Button
              className="cinematic-auth-google"
              onClick={() => void social("google")}
              disabled={busy}
            >
              <span className="cinematic-google-g" aria-hidden="true">
                G
              </span>
              Continue with Google
            </Button>
            <Button
              className="cinematic-auth-email-button"
              onClick={() => {
                setEmailOpen(true);
                setForgot(false);
              }}
            >
              Sign in with email
            </Button>
            <div className="cinematic-auth-chips">
              <Button variant="outline" onClick={onExplore}>
                <Eye size={17} />
                Take a look around ›
              </Button>
              <Button variant="outline" onClick={onStory}>
                <BookOpen size={17} />
                Our story ›
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Need a hand?{" "}
              <a href="mailto:support@tripjunkies.app" className="underline">
                support@tripjunkies.app
              </a>
            </p>
          </div>
        )}
        {message && (
          <p role="status" className="cinematic-auth-message">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

function TabContent({
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
  onMe: (v: "help" | "bug" | "delete" | "feedback" | "lab" | "reports") => void;
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

        <Button
          variant="playful"
          className="mt-6 w-full"
          onClick={() => {
            import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
            open("Invite");
          }}
        >
          <Share2 /> Share invite
        </Button>
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
        <Button
          variant="playful"
          className="mt-6 w-full"
          onClick={() => {
            import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
            open("Invite");
          }}
        >
          <Share2 /> Share invite
        </Button>
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
  if (tab === "Squad" && active)
    return (
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
    );
  if (tab === "Squad")
    return (
      <>
        <PageHeading
          eyebrow="BETTER TOGETHER"
          title="Your people."
          emoji="🫶"
          copy="The best part of any trip is who you go with."
        />
        <EmptyPrompt
          emoji="👯"
          title="Your squad is on its way"
          copy="Once you're in a trip, your people will show up here."
          action="Join a trip"
          onClick={() => open("Join a trip")}
        />
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
                  : key === "help"
                    ? onMe("help")
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
              await supabase.auth.signOut();
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
function FounderDashboard({
  trips,
  onOpen,
}: {
  trips: TripWithRole[];
  onOpen: (key: string) => void;
}) {
  const [counts, setCounts] = useState<{ trips: number; testers: number; reports: number } | null>(
    null,
  );
  const [allTrips, setAllTrips] = useState<{ name: string; start_date: string }[] | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  useEffect(() => {
    let live = true;
    void Promise.all([
      supabase.rpc("founder_trips"),
      supabase.rpc("founder_age_tiers"),
      supabase.rpc("founder_bug_reports"),
    ]).then(([list, ages, reports]) => {
      if (!live) return;
      const real = (list.data ?? []).filter((t) => !t.is_sandbox);
      setAllTrips(list.data ? real : null);
      setCounts({
        trips: list.data ? real.length : trips.length,
        testers: (ages.data ?? []).reduce((sum, x) => sum + Number(x.people ?? 0), 0),
        reports: (reports.data ?? []).length,
      });
    });
    return () => {
      live = false;
    };
  }, [trips.length]);
  const tools: [string, string, string][] = [
    ["Test Lab", founderLabIcon, "lab"],
    ["Feedback", founderFeedbackIcon, "feedback"],
    ["Reports", founderReportsIcon, "reports"],
    ["Founding Members", founderMembersIcon, "founding-members"],
    ["Public launch", founderLaunchIcon, "me-explore"],
    ["Beta codes", founderLaunchIcon, "beta-codes"],
    ["AI", founderFeaturesIcon, "ai-guard"],
  ];
  const next = [...(allTrips ?? trips)]
    .filter((t) => new Date(t.start_date + "T23:59:59").getTime() >= Date.now())
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((t) => ({ name: t.name, starts_at: t.start_date + "T12:00:00Z" }))[0];
  return (
    <section className="cinematic-founder mt-8">
      <p className="eyebrow text-gold">CONTROL TOWER</p>
      <h2 className="font-display text-3xl font-extrabold mt-1">Founder tools</h2>
      <div className="cinematic-founder-stats">
        <span>
          <b>{counts?.trips ?? "—"}</b>Trips
        </span>
        <span>
          <b>{counts?.testers ?? "—"}</b>Testers
        </span>
        <span>
          <b>{counts?.reports ?? "—"}</b>Reports
        </span>
      </div>
      <p className="cinematic-founder-departure">
        NEXT DEPARTURE · <strong>{next ? tripDisplayName(next.name) : "AWAITING A TRIP"}</strong> ·{" "}
        {next
          ? new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })
              .format(new Date(next.starts_at))
              .toUpperCase()
          : "NO DATE SET"}
      </p>
      <div className="cinematic-founder-tools">
        {tools.map(([label, icon, key]) => (
          <Button
            variant="outline"
            key={label}
            onClick={() => (key === "me-explore" ? setLaunchOpen((v) => !v) : onOpen(key))}
          >
            <img src={icon} alt="" />
            <span>{label}</span>
            <ChevronRight size={17} />
          </Button>
        ))}
      </div>
      {launchOpen && (
        <div className="mt-3">
          <LaunchSwitch />
        </div>
      )}
    </section>
  );
}
function MaskedEmail({ email }: { email: string }) {
  const [revealed, setRevealed] = useState(false);
  const [local, domain] = email.split("@");
  const masked = local && domain ? `${local[0]}•••@${domain}` : "";
  return (
    <Button
      variant="ghost"
      className="h-auto max-w-full min-w-0 p-0 justify-start text-sm text-muted-foreground font-normal"
      aria-label={revealed ? "Hide email" : "Reveal email"}
      onClick={() => setRevealed((v) => !v)}
    >
      <span className="truncate">{revealed ? email : masked}</span>
      {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
    </Button>
  );
}
function PageHeading({
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
function FeatureCard({
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
function EmptyPrompt({
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
function AppSheet({
  title,
  onClose,
  onSelect,
  onDone,
  active,
}: {
  title: string | null;
  onClose: () => void;
  onSelect: (value: string) => void;
  onDone: (id: string) => void;
  active: TripWithRole | null;
}) {
  const [copied, setCopied] = useState(false);
  if (title === "Start a trip" || title === "Join a trip" || title === "celebrate")
    return (
      <TripSheets
        key={title}
        mode={title === "Start a trip" ? "create" : title === "Join a trip" ? "join" : "celebrate"}
        trip={active}
        onClose={onClose}
        onDone={onDone}
      />
    );
  if (title === "At Home")
    return (
      <AtHomeSetup
        onClose={onClose}
        onDone={onDone}
        loadTrip={async (id) => {
          const { data } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
          return data ? ({ ...data, myRole: "captain" } as TripWithRole) : null;
        }}
      />
    );
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg bg-card rounded-t-[2rem] p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-soft"
      >
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mb-6" />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-5 right-5"
          aria-label="Close"
          onClick={onClose}
        >
          <X />
        </Button>
        {title === "Invite" && active ? (
          <>
            <span className="text-4xl">💌</span>
            <h2 className="font-display font-extrabold text-3xl mt-3">Bring your people.</h2>
            <p className="text-muted-foreground mt-2">
              Anyone in your squad can share this invite.
            </p>
            <div className="mt-6 rounded-2xl bg-pink-soft p-5 text-center">
              <p className="text-xs font-extrabold">JOIN CODE</p>
              <div className="mt-3">
                <InviteCode code={active.join_code} />
              </div>
            </div>
            <SeatCap
              tripId={active.id}
              isCaptain={active.myRole === "captain"}
              room={active.kind === "at_home" || active.a2e_room ? "culture" : "trip"}
            />
            <div className="grid grid-cols-2 gap-3 mt-5">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl(active.join_code));
                  setCopied(true);
                }}
              >
                <Clipboard />
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button
                variant="playful"
                onClick={async () => {
                  if ((await shareInvite(active.join_code, active.name)) === "copied")
                    setCopied(true);
                }}
              >
                <Share2 />
                Share
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-4xl">✨</span>
            <h2 className="font-display font-extrabold text-3xl mt-3">What are we doing?</h2>
            <div className="grid gap-3 mt-6">
              <Button
                variant="subtle"
                className="justify-between h-14"
                onClick={() => onSelect("Start a trip")}
              >
                <span className="flex gap-3 items-center">
                  <Plus /> Start a trip
                </span>
                <ChevronRight />
              </Button>
              <Button
                variant="subtle"
                className="justify-between h-14"
                onClick={() => onSelect("At Home")}
              >
                <span className="flex gap-3 items-center">Start an At Home experience</span>
                <ChevronRight />
              </Button>
              <Button
                variant="subtle"
                className="justify-between h-14"
                onClick={() => onSelect("Join a trip")}
              >
                <span className="flex gap-3 items-center">
                  <Ticket /> Join a trip
                </span>
                <ChevronRight />
              </Button>
              {active && (
                <Button
                  variant="subtle"
                  className="justify-between h-14"
                  onClick={() => onSelect("Invite")}
                >
                  <span className="flex gap-3 items-center">
                    <Share2 /> Share invite
                  </span>
                  <ChevronRight />
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SquadView({
  trip,
  members,
  cards,
  userId,
  onMember,
  open,
  viewOnly = false,
}: {
  trip: TripWithRole;
  members: Member[];
  cards: PlayerWithAvatar[];
  userId: string;
  onMember: (id: string) => void;
  open: (value: string) => void;
  viewOnly?: boolean;
}) {
  const { data, season } = useBadges(trip, members);
  const mine = cards.find((c) => c.user_id === userId);
  const membership = members.find((m) => m.user_id === userId);
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[28px] font-extrabold">
          The <span className="text-blue">Squad</span>
        </h1>
        {!viewOnly && (
          <Button
            variant="outline"
            size="sm"
            className="text-primary border-primary"
            onClick={() => {
              import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
              open("Invite");
            }}
          >
            + Invite
          </Button>
        )}
      </div>
      {!viewOnly && <WaitingToJoin trip={trip} avatarUrl={(st, sd) => betaAvatarUrl(st, sd)} />}
      <div className="squad-neon-header rounded-[24px] border border-border p-5 mt-[14px] flex items-center gap-4">
        <span className="captain-avatar-wrap">
          <AvatarButton
            userId={userId}
            onOpen={onMember}
            url={mine?.avatarUrl}
            name={mine?.game_name || "Player"}
            className="h-[72px] w-[72px] rounded-[22px] border-2 border-foreground"
          />
          {membership?.role === "captain" && <CaptainCrown badge />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[22px] font-extrabold truncate">
            {mine?.game_name || "Player"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {membership?.role === "captain"
              ? "👑 Captain"
              : membership?.role === "co_captain"
                ? "★ Co-Captain"
                : "Player"}
          </p>
        </div>
      </div>
      <SquadSeasons
        trip={trip}
        members={members}
        cards={cards}
        userId={userId}
        data={data}
        season={season}
        onMember={onMember}
      />
      <h2 className="mt-6 font-display text-xl font-extrabold">Squad players</h2>
      <div className="mt-[14px] space-y-2">
        <ShortList
          items={members.filter((m) => m.user_id !== userId)}
          id={`squad-members-${trip.id}`}
          scrollPanel={true}
          current={(m) => m.user_id === userId}
        >
          {(m) => {
            const card = cards.find((c) => c.user_id === m.user_id);
            return (
              <Button
                key={m.user_id}
                variant="outline"
                disabled={!card}
                data-view-navigation="true"
                onClick={() => {
                  import("@/lib/haptics").then(({ hapticTap }) => hapticTap());
                  onMember(m.user_id);
                }}
                className="w-full h-auto min-h-16 justify-start gap-3 rounded-[18px] px-3 py-2 text-left"
              >
                <span className="captain-avatar-wrap">
                  <Avatar
                    url={card?.avatarUrl}
                    name={card?.game_name || "New player"}
                    className="h-[34px] w-[34px]"
                  />
                  {m.role === "captain" && <CaptainCrown badge />}
                </span>
                <span className="flex-1 font-bold truncate">
                  {card?.game_name || "Making their card…"}
                </span>
                <RoleStamp role={m.role} />
              </Button>
            );
          }}
        </ShortList>
      </div>
    </>
  );
}

function HomeSeasons({
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
  onMember: (id: string) => void;
}) {
  const data = useSeasonsData(trip.id);
  const [asking, setAsking] = useState(false);
  const [feedbackDone, setFeedbackDone] = useFeedbackDone(trip.id);
  const ended = tripHasEnded(trip) || !!trip.ended_at;
  return (
    <>
      <JourneyPhases trip={trip} members={members} cards={cards} userId={userId} />
      {ended && feedbackDone === false && !asking && (
        <Button variant="outline" className="mt-4 w-full min-h-11" onClick={() => setAsking(true)}>
          How was the trip? Tell the founder
        </Button>
      )}
      {asking && (
        <TripFeedbackForm
          trip={trip}
          onDone={() => {
            setAsking(false);
            setFeedbackDone(true);
          }}
        />
      )}
      <MysteryPrizes
        trip={trip}
        members={members}
        cards={cards}
        userId={userId}
        data={data}
        onMember={onMember}
      />
      <ActiveSeasonBoard trip={trip} members={members} cards={cards} userId={userId} />
    </>
  );
}

function VerifyCode({ email, onBack }: { email: string; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [cooldown, setCooldown] = useState(60);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  async function verify(code: string) {
    setBusy(true);
    setError("");
    setNote("");
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" });
    setBusy(false);
    if (error) {
      setError(
        /expired/i.test(error.message)
          ? "That code expired ⏰ Tap Resend for a fresh one."
          : "Hmm, that code doesn't match 🙈 Double-check it and try again.",
      );
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
    }
  }
  function put(i: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split("").concat(Array(6).fill("")).slice(0, 6);
      setDigits(next);
      refs.current[Math.min(clean.length, 5)]?.focus();
      if (clean.length >= 6) void verify(clean.slice(0, 6));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    setError("");
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }
  async function resend() {
    setError("");
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) setError(`Couldn't resend just yet: ${friendlyError(error)}`);
    else {
      setNote("Fresh code on its way 💌");
      setCooldown(60);
    }
  }
  return (
    <main className="min-h-dvh max-w-lg mx-auto flex flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] cinematic-auth cinematic-auth-verify">
      <img
        className="cinematic-auth-scene"
        src={cinematicLoginCoast}
        srcSet={`${cinematicLoginCoast} 768w, ${cinematicLoginCoastLarge} 1024w`}
        sizes="(max-width: 520px) 100vw, 520px"
        alt=""
        width={768}
        height={1366}
      />
      <div className="flex items-center justify-between">
        <Button variant="ghost" className="-ml-3" onClick={onBack}>
          <ArrowLeft /> Back
        </Button>
        <Brand />
      </div>
      <div className="mt-10 text-center">
        <div className="mx-auto grid place-items-center h-28 w-28 rounded-[2rem] bg-orange-soft text-6xl float-sticker">
          💌
        </div>
        <h1 className="font-display text-4xl font-extrabold mt-6">Check your email</h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          We sent a 6-digit code to
          <br />
          <span className="font-bold text-foreground break-all">{`${email.charAt(0)}•••@${email.split("@")[1] ?? ""}`}</span>
        </p>
      </div>
      <div className="mt-8 flex justify-center gap-2" role="group" aria-label="6-digit code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={i === 0 ? 6 : 1}
            aria-label={`Digit ${i + 1}`}
            disabled={busy}
            onChange={(e) => put(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className={`h-16 w-12 rounded-2xl border-2 bg-card text-center font-display text-3xl font-extrabold outline-none transition focus:border-primary focus:scale-105 ${error ? "border-destructive" : d ? "border-blue" : "border-border"}`}
          />
        ))}
      </div>
      {busy && (
        <p role="status" className="mt-4 text-center text-sm font-bold text-blue">
          Checking… ✨
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-center text-sm font-bold text-destructive">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-4 text-center text-sm font-bold text-green">
          {note}
        </p>
      )}
      <Button
        variant="outline"
        size="lg"
        className="mt-8 w-full bg-card border-2"
        disabled={cooldown > 0}
        onClick={() => void resend()}
      >
        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </Button>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Can't find it? Peek in spam or promotions.
      </p>
    </main>
  );
}
