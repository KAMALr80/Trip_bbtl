// The service worker (M4-02). Bundled into .output/public/sw.js by scripts/pwa/build-sw.ts after
// `vite build`, which fills in __TJ_VERSION__ and __TJ_PRECACHE__ for that build.
//
// - Precaches this build's scripts, styles, icons, the Home shell and the offline page.
// - Pages: network first (so online players always get the latest build), cached copy offline.
// - Hashed images and Google Fonts: cache first, kept across builds.
// - Supabase, server functions and /api always go to the network; offline data is M4-03.
// - A new build waits. It takes over only when the player taps Refresh on the update prompt
//   (src/features/app-shell/UpdatePrompt.tsx), so nobody switches version mid-game.
import {
  MAX_IMAGES,
  MAX_PAGES,
  NAVIGATION_TIMEOUT_MS,
  OFFLINE_URL,
  SHELL_URL,
  SKIP_WAITING,
  cacheNames,
  pageKey,
  referencedAssets,
  strategyFor,
} from "./sw-plan";

declare const __TJ_VERSION__: string;
declare const __TJ_PRECACHE__: string[];

// The DOM lib has no service worker types; these are the parts this file uses.
type ExtendableEvent = Event & { waitUntil(p: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith(r: Response | Promise<Response>): void;
};
type MessageEvt = ExtendableEvent & { data: unknown };
type Scope = {
  location: Location;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(options: { type: "window" }): Promise<readonly { url: string }[]>;
  };
  addEventListener(type: "install" | "activate", fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", fn: (e: FetchEvent) => void): void;
  addEventListener(type: "message", fn: (e: MessageEvt) => void): void;
};
const sw = self as unknown as Scope;

const VERSION = __TJ_VERSION__;
const PRECACHE = new Set(__TJ_PRECACHE__);
const names = cacheNames(VERSION);
const ORIGIN = sw.location.origin;

sw.addEventListener("install", (event) => {
  event.waitUntil(install());
});

async function install() {
  const cache = await caches.open(names.precache);
  const urls = [...PRECACHE];
  const responses = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
      // A redirected response can't answer a page load, so it must not be stored.
      if (!res.ok || res.redirected) throw new Error(`precache ${url}: ${res.status}`);
      return res;
    }),
  );
  // The Home shell must belong to this build. During a deploy it could come from the other
  // version; then install fails and the browser tries again at the next update check.
  const shell = responses[urls.indexOf(SHELL_URL)];
  if (shell) {
    const missing = referencedAssets(await shell.clone().text()).filter((a) => !PRECACHE.has(a));
    if (missing.length) throw new Error(`shell from another build: ${missing.join(", ")}`);
  }
  await Promise.all(responses.map((res, i) => cache.put(urls[i] as string, res)));
}

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set(Object.values(names));
      for (const key of await caches.keys()) {
        if (key.startsWith("tj-") && !keep.has(key)) await caches.delete(key);
      }
      await sw.clients.claim();
      await saveOpenPages();
    })(),
  );
});

/**
 * The page that installed the worker loaded before the worker could see it, so it isn't cached
 * yet. Fetch the open pages again so the first page a player opened also works offline.
 */
async function saveOpenPages() {
  const open = await sw.clients.matchAll({ type: "window" });
  await Promise.all(
    open.map(async ({ url }) => {
      const kind = strategyFor({ url, method: "GET", mode: "navigate", origin: ORIGIN }, PRECACHE);
      if (kind !== "page") return;
      try {
        await savePage(url)(await fetch(url, { credentials: "same-origin" }));
      } catch {
        /* offline or failed: it is cached on the next visit instead */
      }
    }),
  );
}

sw.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown } | null;
  if (data?.type === SKIP_WAITING) void sw.skipWaiting();
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  const strategy = strategyFor(
    { url: req.url, method: req.method, mode: req.mode, origin: ORIGIN },
    PRECACHE,
  );
  switch (strategy) {
    case "network":
      return;
    case "page": {
      // Start the network request now and keep the worker alive until its copy is cached, even
      // when the cached copy answers first. waitUntil must be called during the event.
      const network = fetch(req);
      const saved = network.then(savePage(req.url), () => null);
      event.waitUntil(saved);
      event.respondWith(page(req, saved));
      return;
    }
    case "precache":
      event.respondWith(cacheFirst(req, names.precache, new URL(req.url).pathname));
      return;
    case "code":
      event.respondWith(cacheFirst(req, names.runtime));
      return;
    case "image":
      event.respondWith(cacheFirst(req, names.images, undefined, MAX_IMAGES));
      return;
    case "font":
      event.respondWith(cacheFirst(req, names.fonts));
      return;
  }
});

async function cacheFirst(req: Request, cacheName: string, key?: string, max?: number) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(key ?? req);
  if (hit) return hit;
  const res = await fetch(req);
  // Opaque (status 0) is a cross-origin font file loaded without CORS; cache it too.
  if (res.ok || res.type === "opaque") {
    await cache.put(key ?? req, res.clone());
    if (max) await trim(cache, max);
  }
  return res;
}

/** Caches a page response for offline use and passes it on. */
function savePage(url: string) {
  return async (res: Response) => {
    if (cacheable(res)) {
      const pages = await caches.open(names.pages);
      await pages.put(pageKey(url), res.clone());
      await trim(pages, MAX_PAGES);
    }
    return res;
  };
}

/** Network first with a timeout, then this page's cached copy, the Home shell, the offline page. */
async function page(req: Request, network: Promise<Response | null>): Promise<Response> {
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS),
  );
  const first = await Promise.race([network, timeout]);
  if (first) return first;
  const pages = await caches.open(names.pages);
  const cached = await pages.match(pageKey(req.url));
  if (cached) return cached;
  if (new URL(req.url).pathname !== SHELL_URL) {
    // Nothing cached for this page. If the network is merely slow, keep waiting for it.
    const late = await network;
    if (late) return late;
  }
  // The Home shell: the app's router draws the page that was asked for (React logs a recoverable
  // hydration warning and renders it in the browser). The offline page only if that is missing.
  return (await caches.match(SHELL_URL)) ?? (await caches.match(OFFLINE_URL)) ?? Response.error();
}

/** Only plain, successful HTML pages are kept; never anything that sets a cookie. */
function cacheable(res: Response) {
  return (
    res.status === 200 &&
    res.type === "basic" &&
    (res.headers.get("content-type") ?? "").includes("text/html") &&
    !res.headers.has("set-cookie")
  );
}

/** Drops the oldest entries (Cache keeps insertion order) above `max`. */
async function trim(cache: Cache, max: number) {
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(old);
}
