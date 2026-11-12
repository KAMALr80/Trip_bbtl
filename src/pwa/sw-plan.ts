// Service worker plan (M4-02): which files are precached and how each request is answered.
// Pure functions shared by the worker (src/pwa/sw.ts), the build step (scripts/pwa/build-sw.ts)
// and the unit tests, so the rules live in one place.

/** Where the app shell is when the network is down. */
export const SHELL_URL = "/";
/**
 * The last resort when even the Home shell isn't cached (normally it is precached). The file is public/offline.html; Vercel serves
 * it at /offline (staticFileRoutes in src/lib/security-headers.ts) without a redirect, because a
 * redirected response can't answer a page.
 */
export const OFFLINE_URL = "/offline";

/** The built file behind a precached URL (paths relative to the client output folder). */
export function fileFor(url: string): string {
  return url === OFFLINE_URL ? "offline.html" : url.replace(/^\/+/, "");
}

/** Cache names. The precache and runtime caches are per build; images and fonts outlive builds. */
export const cacheNames = (version: string) => ({
  precache: `tj-precache-${version}`,
  pages: `tj-pages-${version}`,
  runtime: `tj-runtime-${version}`,
  images: "tj-images",
  fonts: "tj-fonts",
});

/** At most this many images are kept between builds (oldest go first). */
export const MAX_IMAGES = 150;
/** At most this many pages are kept for offline use. */
export const MAX_PAGES = 40;
/** A page waits this long for the network before the cached copy is used. */
export const NAVIGATION_TIMEOUT_MS = 3500;

const CODE = /\.(?:js|mjs|css)$/i;
const IMAGE = /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/i;
const FONT = /\.(?:woff2?|ttf|otf)$/i;

/**
 * The files to precache from the built client folder (paths relative to it, `/`-separated).
 * Every script and stylesheet (the app can't start without them), the icons and the manifest.
 * Images under /assets are cached when first shown instead, so installing stays small.
 */
export function precacheList(files: readonly string[]): string[] {
  const urls = new Set<string>([SHELL_URL, OFFLINE_URL]);
  for (const raw of files) {
    const file = raw.replace(/^\/+/, "");
    if (file === "sw.js" || file.startsWith("_") || file.endsWith(".map")) continue;
    if (file.startsWith("assets/") && CODE.test(file)) urls.add(`/${file}`);
    else if (file.startsWith("icons/") || file === "manifest.webmanifest" || file === "favicon.ico")
      urls.add(`/${file}`);
  }
  return [...urls].sort();
}

/**
 * Games on the Flight (M4-05, R-334) must work from a cold start in airplane mode, so the art
 * these files import is precached too (≈ 3 MB), not just cached once seen. Their content is
 * bundled code, already precached.
 */
export const FLIGHT_GAME_SOURCES = [
  "src/features/play/GameArcade.tsx",
  "src/features/play/OnePhoneNight.tsx",
  "src/features/play/GameScene.tsx",
  "src/features/play/GameWheel.tsx",
  "src/features/play/ArcadeBadge.tsx",
  "src/features/offline/OfflineTripCards.tsx",
];

/**
 * The built files for the images the flight games import: `@/assets/game-world-bingo.jpg` in a
 * source becomes `assets/game-world-bingo-<hash>.jpg` in the build.
 */
export function flightArt(sources: readonly string[], built: readonly string[]): string[] {
  const wanted = new Set<string>();
  for (const code of sources)
    for (const m of code.matchAll(/["']@\/assets\/([\w.-]+)\.(\w+)["']/g))
      wanted.add(`${m[1]}|${m[2]}`);
  const urls = built.filter((file) => {
    const m = /^assets\/(.+)-[\w-]{8}\.(\w+)$/.exec(file);
    return !!m && wanted.has(`${m[1]}|${m[2]}`);
  });
  return urls.map((f) => `/${f}`).sort();
}

/** Same-origin scripts and stylesheets an HTML page loads, so install can check they're precached. */
export function referencedAssets(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
    if (m[1] && CODE.test(m[1])) found.add(m[1]);
  }
  return [...found].sort();
}

export type Strategy =
  /** Don't touch it: the browser fetches as if there were no worker. */
  | "network"
  /** Network first with a timeout; fall back to the cached page, the shell, then the offline page. */
  | "page"
  /** Precached for this build. */
  | "precache"
  /** Hashed build file not in the precache (a newer build): cache first in the runtime cache. */
  | "code"
  /** Hashed image: cache first, kept across builds. */
  | "image"
  /** Google Fonts: cache first, kept across builds. */
  | "font";

export type RequestInfo = {
  url: string;
  method: string;
  mode: string;
  /** The worker's own origin. */
  origin: string;
};

/**
 * How the worker answers a request. Anything that carries data (Supabase, server functions, /api)
 * goes to the network untouched: the trip snapshot for offline play is M4-03's job, not the cache's.
 */
export function strategyFor(req: RequestInfo, precached: ReadonlySet<string>): Strategy {
  if (req.method !== "GET") return "network";
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return "network";
  }
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com")
    return "font";
  if (url.origin !== req.origin) return "network";
  const path = url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/_server") || path === "/sw.js")
    return "network";
  // Password reset links carry one-time tokens; legal pages must always be the current text.
  if (req.mode === "navigate")
    return path.startsWith("/legal/") || path === "/reset-password" ? "network" : "page";
  if (url.search === "" && precached.has(path)) return "precache";
  if (path.startsWith("/assets/")) {
    if (CODE.test(path)) return "code";
    if (IMAGE.test(path) || FONT.test(path)) return "image";
  }
  return "network";
}

/** The cache key for a page: path and search (sub-screens are search params), no hash. */
export function pageKey(rawUrl: string): string {
  const url = new URL(rawUrl);
  return `${url.origin}${url.pathname}${url.search}`;
}

/** Messages the page sends the worker. */
export const SKIP_WAITING = "TJ_SKIP_WAITING";
