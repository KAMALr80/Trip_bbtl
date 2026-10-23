// App shell navigation backed by the URL (M1-04): the tab is the path (/home, /play, /trip, /me;
// "/" is Home) and sub-screens are search params, so refresh and back/forward work. The setters keep
// the old useState shapes so callers didn't change. Calls made in the same tick are batched into
// one navigation; changing tab starts from clean sub-screen params, like tapping a tab did.
import { useRef } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";
import type { HomeScreen } from "@/components/HomeDashboard";
import type { Tab } from "./tabs";

export const meViews = ["help", "bug", "delete", "feedback", "lab", "reports"] as const;
export type MeView = (typeof meViews)[number];
const homeScreens: readonly HomeScreen[] = [
  "dashboard",
  "trip",
  "trips",
  "passport",
  "inspiration",
  "window",
  "journey",
  "arcade",
];

export type ShellSearch = {
  screen?: HomeScreen;
  view?: MeView;
  section?: string;
  about?: true;
  tools?: true;
  quest?: string;
  showcase?: string;
};

const text = (v: unknown) => (typeof v === "string" && v.length <= 64 ? v : undefined);
const flag = (v: unknown) => (v === true || v === "1" || v === 1 ? (true as const) : undefined);

export function validateShellSearch(raw: Record<string, unknown>): ShellSearch {
  const out: ShellSearch = {};
  const screen = text(raw["screen"]) as HomeScreen | undefined;
  if (screen && homeScreens.includes(screen) && screen !== "dashboard") out.screen = screen;
  const view = text(raw["view"]) as MeView | undefined;
  if (view && meViews.includes(view)) out.view = view;
  const section = text(raw["section"]);
  if (section) out.section = section;
  if (flag(raw["about"])) out.about = true;
  if (flag(raw["tools"])) out.tools = true;
  const quest = text(raw["quest"]);
  if (quest) out.quest = quest;
  const showcase = text(raw["showcase"]);
  if (showcase) out.showcase = showcase;
  return out;
}

export const tabPath: Record<Tab, "/home" | "/play" | "/trip" | "/me"> = {
  Home: "/home",
  Play: "/play",
  Trip: "/trip",
  Me: "/me",
};
export function tabOf(pathname: string): Tab {
  if (pathname.startsWith("/play")) return "Play";
  if (pathname.startsWith("/trip")) return "Trip";
  if (pathname.startsWith("/me")) return "Me";
  return "Home";
}

type Pending = { tab?: Tab | undefined; search: Partial<Record<keyof ShellSearch, unknown>> };

export function useShellNav() {
  const router = useRouter();
  const location = useLocation();
  const search = validateShellSearch(location.search as Record<string, unknown>);
  const pending = useRef<Pending | null>(null);

  const queue = (change: Pending) => {
    const first = !pending.current;
    pending.current = {
      tab: change.tab ?? pending.current?.tab,
      search: { ...pending.current?.search, ...change.search },
    };
    if (!first) return;
    queueMicrotask(() => {
      const next = pending.current;
      pending.current = null;
      if (!next) return;
      const current = router.state.location;
      const fromTab = tabOf(current.pathname);
      const tab = next.tab ?? fromTab;
      const base =
        tab === fromTab ? validateShellSearch(current.search as Record<string, unknown>) : {};
      const merged = validateShellSearch({ ...base, ...next.search });
      const to = tab === fromTab && current.pathname === "/" ? "/" : tabPath[tab];
      void router.navigate({ to, search: merged as never });
    });
  };

  return {
    tab: tabOf(location.pathname),
    homeScreen: search.screen ?? "dashboard",
    meView: search.view ?? null,
    meSection: search.section ?? null,
    about: !!search.about,
    tools: !!search.tools,
    questParam: search.quest ?? null,
    showcaseParam: search.showcase ?? null,
    setTab: (tab: Tab) => queue({ tab, search: {} }),
    setHomeScreen: (screen: HomeScreen) =>
      queue({ search: { screen: screen === "dashboard" ? undefined : screen } }),
    setMeView: (view: MeView | null) => queue({ search: { view } }),
    setMeSection: (section: string | null) => queue({ search: { section } }),
    setAbout: (about: boolean) => queue({ search: { about: about || undefined } }),
    setTools: (tools: boolean) => queue({ search: { tools: tools || undefined } }),
    clearParam: (key: "quest" | "showcase") => queue({ search: { [key]: undefined } }),
  };
}
