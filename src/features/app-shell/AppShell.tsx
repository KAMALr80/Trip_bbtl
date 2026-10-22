import { tabPath, useShellNav } from "@/features/app-shell/nav";
import { Link } from "@tanstack/react-router";
import { TabContent } from "@/features/app-shell/TabContent";
import { tabs } from "@/features/app-shell/tabs";
import { AppSheet } from "@/features/app-shell/AppSheet";
import { AuthScreen } from "@/features/auth/AuthScreen";
import { ExplorePrompt } from "@/features/app-shell/chrome";
import { safeSetItem } from "@/lib/safe-storage";
import { friendlyError } from "@/lib/friendly-error";

import { BrandLockup } from "@/components/BrandLockup";
import { CaptainCrown } from "@/components/CaptainCrown";
import { CinematicSplash } from "@/components/CinematicSplash";
import { CrownCelebration } from "@/components/CrownCelebration";

import { GameArcade } from "@/components/GameArcade";

import iconSuitcase from "@/assets/icon-suitcase.webp";
import iconPassport from "@/assets/icon-passport.webp";

import iconMap from "@/assets/icon-map.webp";
import iconBoarding from "@/assets/icon-boarding-pass.webp";

import iconHome from "@/assets/icon-at-home.webp";

import { OutOfCreditsHost } from "@/components/AiCredits";
import { CaptainNudge } from "@/components/CaptainChecklist";

import { ShowcaseGuest } from "@/components/CultureShowcase";
import { useEffect, useRef, useState } from "react";

import { ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

import { JoinRoomCard } from "@/components/InvitePreview";
import { setViewerZone, deviceZone } from "@/lib/viewer-time";
import { nudgeTopUp } from "@/lib/content.functions";
import { CaptainTools } from "@/components/CaptainTools";

import { FounderReports, QuickCheckIn } from "@/components/BugInbox";
import { FeedbackAdmin } from "@/components/TripFeedback";

import { RoleTips } from "@/components/RoleTips";
import { loadTrips, loadMembers, type TripWithRole, type Member } from "@/lib/trips";
import {
  PlayerCardEditor,
  PlayerCardView,
  QuickJoinCard,
  type AccountProfile,
} from "@/components/PlayerCards";
import { loadCards, dicebearUrl, type PlayerWithAvatar } from "@/lib/player-cards";
import { HelpPage, BugReport, DeleteAccount } from "@/components/MeExtras";

import { ExploreTour } from "@/components/ExploreTour";

import { HomeDashboard } from "@/components/HomeDashboard";
import { FirstRunWelcome } from "@/components/FirstRunWelcome";
import { JourneyMap, type JourneyStop } from "@/components/JourneyMap";

import { AboutContent } from "@/components/AboutStory";
import { TestLab, SandboxBanner, LabViewBanner } from "@/components/TestLab";
import { setFounder } from "@/lib/lab-mode";
import { readPendingCode, clearPendingCode } from "@/lib/pending-code";
import {
  AgeGate,
  BetaLock,
  VIBES,
  WaitingGate,
  TeenJoinGate,
  WaitingTrips,
  vibeOf,
} from "@/components/BetaAccess";
import { readPendingBeta, clearPendingBeta } from "@/lib/pending-beta";

import { DeletedTripNotes } from "@/components/DeletedTripNotes";

import { LegalConsent, useLegalStatus } from "@/components/LegalConsent";

export function AppShell() {
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
  const {
    tab,
    setTab,
    homeScreen,
    setHomeScreen,
    meView,
    setMeView,
    meSection,
    setMeSection,
    about,
    setAbout,
    tools,
    setTools,
    clearParam,
  } = useShellNav();
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
  const [publicView, setPublicView] = useState<"overview" | "story" | "games" | null>(null);
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
              clearParam("showcase");
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
                  clearParam("quest");
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
            asChild
            data-view-navigation="true"
            key={name}
            variant="ghost"
            className={`h-14 min-w-0 flex-1 flex-col gap-0.5 rounded-full px-1 text-[10px] ${tab === name ? "text-blue" : "text-muted-foreground"}`}
          >
            <Link
              to={tabPath[name]}
              onClick={() => {
                if (welcomeOpen) closeWelcome();
                setWelcomeStoryReturn(false);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
              aria-label={name}
              aria-current={tab === name ? "page" : undefined}
              onPointerDown={(e) => e.currentTarget.blur()}
            >
              <Icon size={20} strokeWidth={tab === name ? 2.7 : 2} className="!size-5" />
              {name}
            </Link>
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
