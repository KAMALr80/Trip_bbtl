import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext, type Profile } from "@/lib/auth-context";
import { ConfirmHost } from "@/features/app-shell/ConfirmHost";
import { BrandLockup } from "@/components/BrandLockup";
import errorPilot from "@/assets/cinematic-error-pilot.jpg";
import loginArt from "@/assets/cinematic-login-coast-tall-768.jpg";
import { APP_VERSION } from "@/lib/app-version";
import { Toaster } from "@/components/ui/sonner";
import { UpdatePrompt } from "@/features/app-shell/UpdatePrompt";
// Catches the browser's install prompt as early as possible (M4-01).
import "@/pwa/install";
import { isNetworkError } from "@/data/offline/rules";
import {
  dropSnapshot,
  restoreSnapshot,
  saveAccount,
  savedAccount,
  startSnapshot,
} from "@/data/offline/snapshot";
import { markStartedOffline } from "@/data/offline/status";
import { clearOutbox, startOutbox } from "@/data/offline/outbox";

const CHUNK_RELOAD_KEY = "tj-chunk-reload";
function isChunkError(error: unknown) {
  const m = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported module/i.test(
    m,
  );
}
function retry(error: unknown, fallback: () => void) {
  if (isChunkError(error)) {
    let done = false;
    try {
      done = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
      sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    if (!done) {
      window.location.reload();
      return;
    }
  }
  fallback();
}

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { i18n } from "@/i18n";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent(props: ErrorComponentProps) {
  return <ErrorView {...props} />;
}
function ErrorView({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const [report, setReport] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [reportError, setReportError] = useState("");
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <main className="cinematic-error min-h-dvh px-5 pb-[var(--nav-clearance)] grid place-items-center">
      <div className="w-full max-w-md text-center">
        <BrandLockup className="text-2xl mb-5" />
        <img
          src={errorPilot}
          alt="A friendly bunny pilot"
          className="cinematic-error-pilot"
          width={900}
          height={900}
        />
        <p className="cinematic-error-board">FLIGHT TJ404 · DELAYED</p>
        <h1 className="font-display text-4xl font-extrabold mt-5">This page missed its flight</h1>
        <p className="mt-3 text-sm">
          Something went wrong on our end. Your trips and stamps are safe. Try again, or head back
          to the lounge.
        </p>
        <div className="grid gap-3 mt-6">
          <button
            className="cinematic-error-primary"
            onClick={() =>
              retry(error, () => {
                router.invalidate();
                reset();
              })
            }
          >
            Try again
          </button>
          <a className="cinematic-error-secondary" href="/">
            Back to Home
          </a>
        </div>
        {report === "sent" ? (
          <p role="status" className="mt-5 text-cyan-300">
            Thanks — the founder has it.
          </p>
        ) : (
          <>
            <button
              className="mt-5 text-cyan-300 underline"
              disabled={report === "sending"}
              onClick={async () => {
                setReport("sending");
                const { data } = await supabase.auth.getUser();
                if (!data.user) {
                  setReport("failed");
                  setReportError("Sign in to report this problem.");
                  return;
                }
                const { error: insertError } = await supabase.from("bug_reports").insert({
                  user_id: data.user.id,
                  trip_id: null,
                  page: typeof window !== "undefined" ? window.location.pathname.slice(0, 80) : "/",
                  description:
                    `App error: ${error instanceof Error ? error.message : String(error)}`.slice(
                      0,
                      2000,
                    ),
                  screenshot_path: null,
                  user_agent: navigator.userAgent.slice(0, 400),
                  app_version: APP_VERSION,
                });
                if (insertError) {
                  setReport("failed");
                  setReportError("Couldn't send the report. Please try again.");
                } else setReport("sent");
              }}
            >
              ⚑ {report === "sending" ? "Sending…" : "Report this problem"}
            </button>
            {reportError && (
              <p role="alert" className="text-red-300 text-sm mt-2">
                {reportError}
              </p>
            )}
          </>
        )}
        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Need a hand?{" "}
          <a href="mailto:hello@tripjunkies.app" className="underline">
            hello@tripjunkies.app
          </a>{" "}
          ·{" "}
          <a href="mailto:support@tripjunkies.app" className="underline">
            support@tripjunkies.app
          </a>{" "}
          ·{" "}
          <a href="mailto:safety@tripjunkies.app" className="underline">
            safety@tripjunkies.app
          </a>
        </p>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/icons/icon-192.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icons/icon-180.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preload", href: loginArt, as: "image" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700;800&family=Fredoka:wght@600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=swap",
      },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0E0B1F", media: "(prefers-color-scheme: dark)" },
      { name: "theme-color", content: "#f5f0f9", media: "(prefers-color-scheme: light)" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang={i18n.language}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('tripjunkie-appearance')==='light')document.documentElement.classList.add('light')}catch(e){}",
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Appearance precedence: profile setting → saved local choice → dark.
  // Never falls back to the device's prefers-color-scheme; Night Flight dark is the default.
  const applyChosenAppearance = useCallback((appearance: string | null) => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("tripjunkie-appearance");
    } catch {
      /* storage unavailable */
    }
    const chosen = appearance ?? saved ?? "dark";
    document.documentElement.classList.toggle("light", chosen === "light");
    window.dispatchEvent(new Event("tripjunkie-appearance-change"));
  }, []);

  const loadProfile = useCallback(
    async (currentUser: User) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, onboarding_completed, appearance")
        .eq("id", currentUser.id)
        .maybeSingle();
      if (error) {
        // No network (M4-03): use the profile saved on this device, if there is one.
        const saved = isNetworkError(error, navigator.onLine)
          ? await savedAccount(currentUser.id)
          : null;
        if (saved?.profile) {
          const offlineProfile = saved.profile as Profile & { appearance: string | null };
          setProfile(offlineProfile);
          applyChosenAppearance(offlineProfile.appearance);
        } else console.error("Profile load failed", error);
        return;
      }
      if (data) {
        setProfile(data);
        saveAccount({ profile: data });
        applyChosenAppearance(data.appearance);
        return;
      }
      const { data: created, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: currentUser.id,
          display_name:
            currentUser.user_metadata?.["full_name"] ?? currentUser.user_metadata?.["name"] ?? null,
          avatar_url: currentUser.user_metadata?.["avatar_url"] ?? null,
        })
        .select("id, display_name, avatar_url, onboarding_completed, appearance")
        .single();
      if (createError) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, onboarding_completed, appearance")
          .eq("id", currentUser.id)
          .maybeSingle();
        if (existing) {
          setProfile(existing);
          applyChosenAppearance(existing.appearance);
        } else console.error("Profile creation failed", createError);
      } else if (created) {
        setProfile(created);
        saveAccount({ profile: created });
        applyChosenAppearance(created.appearance);
      }
    },
    [applyChosenAppearance],
  );

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user);
  }, [user, loadProfile]);

  useEffect(() => {
    const applyAppearance = () => {
      let saved: string | null = null;
      try {
        saved = window.localStorage.getItem("tripjunkie-appearance");
      } catch {
        /* storage unavailable */
      }
      document.documentElement.classList.toggle("light", (saved ?? "dark") === "light");
      window.dispatchEvent(new Event("tripjunkie-appearance-change"));
    };
    applyAppearance();
    window.addEventListener("tripjunkie-appearance", applyAppearance);
    let active = true;
    let startedOffline = false;
    const boot = async () => {
      const { data, error } = await supabase.auth
        .getUser()
        .catch((e: unknown) => ({ data: { user: null }, error: e }));
      if (!active) return;
      // No network (M4-03): open as the player signed in last on this device, from the snapshot.
      // A refusal from the server (signed out, expired) never takes this path.
      if (!data.user && isNetworkError(error, navigator.onLine)) {
        const saved = await restoreSnapshot(queryClient);
        if (!active) return;
        if (saved?.user) {
          startedOffline = true;
          markStartedOffline(true);
          void startOutbox(queryClient, saved.user.id);
          setUser(saved.user);
          if (saved.profile) {
            const offlineProfile = saved.profile as Profile & { appearance: string | null };
            setProfile(offlineProfile);
            applyChosenAppearance(offlineProfile.appearance);
          }
          setLoading(false);
          return;
        }
      }
      startedOffline = false;
      markStartedOffline(false);
      // The server answered with no signed-in player: this device's snapshot must go too
      // (supabase-js doesn't always send SIGNED_OUT for a session the server rejects).
      if (!data.user) void dropSnapshot().then(clearOutbox);
      setUser(data.user);
      if (data.user) {
        void startSnapshot(queryClient, data.user);
        void startOutbox(queryClient, data.user.id);
        await loadProfile(data.user);
      }
      if (active) setLoading(false);
    };
    void boot();
    // Started offline and the network is back: check the session with the server again.
    const onOnline = () => {
      if (startedOffline) void boot();
    };
    window.addEventListener("online", onOnline);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") void dropSnapshot().then(clearOutbox);
      else if (session?.user) {
        void startSnapshot(queryClient, session.user);
        void startOutbox(queryClient, session.user.id);
      }
      setUser(session?.user ?? null);
      if (session?.user) void loadProfile(session.user);
      else setProfile(null);
      setLoading(false);
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("tripjunkie-appearance", applyAppearance);
      window.removeEventListener("online", onOnline);
    };
  }, [loadProfile, queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
        <Outlet />
        <ConfirmHost />
        <Toaster position="bottom-center" />
        <UpdatePrompt />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
