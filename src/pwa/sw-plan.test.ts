import { describe, expect, it } from "vitest";
import {
  OFFLINE_URL,
  SHELL_URL,
  FLIGHT_GAME_SOURCES,
  cacheNames,
  fileFor,
  flightArt,
  pageKey,
  precacheList,
  referencedAssets,
  strategyFor,
} from "./sw-plan";

const ORIGIN = "https://tripjunkies.app";
const get = (path: string, mode = "cors", method = "GET") => ({
  url: path.startsWith("http") ? path : `${ORIGIN}${path}`,
  method,
  mode,
  origin: ORIGIN,
});

describe("precacheList", () => {
  const files = [
    "_headers",
    "sw.js",
    "offline.html",
    "robots.txt",
    "favicon.ico",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "assets/index-abc123.js",
    "assets/styles-def456.css",
    "assets/index-abc123.js.map",
    "assets/journey-coast-top-BN5ln5RZ.jpg",
  ];
  const list = precacheList(files);

  it("takes the shell, offline page, code, icons and manifest", () => {
    expect(list).toEqual(
      [
        SHELL_URL,
        OFFLINE_URL,
        "/favicon.ico",
        "/manifest.webmanifest",
        "/icons/icon-192.png",
        "/assets/index-abc123.js",
        "/assets/styles-def456.css",
      ].sort(),
    );
  });

  it("leaves out images, maps, the worker itself and Cloudflare's files", () => {
    for (const url of [
      "/assets/journey-coast-top-BN5ln5RZ.jpg",
      "/sw.js",
      "/_headers",
      "/robots.txt",
    ])
      expect(list).not.toContain(url);
    expect(list.some((u) => u.endsWith(".map"))).toBe(false);
  });

  it("maps every URL back to a built file", () => {
    expect(fileFor(OFFLINE_URL)).toBe("offline.html");
    expect(fileFor("/assets/index-abc123.js")).toBe("assets/index-abc123.js");
  });
});

describe("referencedAssets", () => {
  it("finds the scripts and styles a page loads", () => {
    const html = `<link rel="stylesheet" href="/assets/styles-1.css"/><link rel="modulepreload" href="/assets/a-2.js"/>
      <script type="module" src="/assets/a-2.js"></script><link rel="preload" href="/assets/hero-3.jpg" as="image"/>`;
    expect(referencedAssets(html)).toEqual(["/assets/a-2.js", "/assets/styles-1.css"]);
  });
});

describe("strategyFor", () => {
  const precached = new Set(["/", "/assets/index-abc123.js", "/manifest.webmanifest"]);

  it("leaves data requests to the network", () => {
    expect(strategyFor(get("/api/public/version"), precached)).toBe("network");
    expect(strategyFor(get("/_serverFn/abc"), precached)).toBe("network");
    expect(strategyFor(get("/_serverFn/abc", "cors", "POST"), precached)).toBe("network");
    expect(strategyFor(get("https://xyz.supabase.co/rest/v1/trips"), precached)).toBe("network");
    expect(strategyFor(get("/sw.js"), precached)).toBe("network");
  });

  it("answers pages network first, except legal pages and password reset links", () => {
    expect(strategyFor(get("/home", "navigate"), precached)).toBe("page");
    expect(strategyFor(get("/t/abc/play?tools=true", "navigate"), precached)).toBe("page");
    expect(strategyFor(get("/legal/privacy", "navigate"), precached)).toBe("network");
    expect(strategyFor(get("/reset-password", "navigate"), precached)).toBe("network");
  });

  it("serves this build's files from the precache", () => {
    expect(strategyFor(get("/assets/index-abc123.js"), precached)).toBe("precache");
    expect(strategyFor(get("/manifest.webmanifest"), precached)).toBe("precache");
  });

  it("caches other hashed files, images and Google Fonts on first use", () => {
    expect(strategyFor(get("/assets/index-newer99.js"), precached)).toBe("code");
    expect(strategyFor(get("/assets/hero-123.webp"), precached)).toBe("image");
    expect(strategyFor(get("https://fonts.gstatic.com/s/figtree/v1/x.woff2"), precached)).toBe(
      "font",
    );
    expect(strategyFor(get("https://fonts.googleapis.com/css2?family=Figtree"), precached)).toBe(
      "font",
    );
  });
});

describe("cache names and keys", () => {
  it("scopes build caches to the version and keeps images and fonts across builds", () => {
    const a = cacheNames("v1");
    const b = cacheNames("v2");
    expect(a.precache).not.toBe(b.precache);
    expect(a.pages).not.toBe(b.pages);
    expect(a.images).toBe(b.images);
    expect(a.fonts).toBe(b.fonts);
  });

  it("keys pages by path and search, not hash", () => {
    expect(pageKey(`${ORIGIN}/home?sheet=help#top`)).toBe(`${ORIGIN}/home?sheet=help`);
  });
});

describe("flightArt", () => {
  it("maps the images the flight games import to their built files", () => {
    const code = `import bingo from "@/assets/game-world-bingo.jpg";\nimport icon from '@/assets/boarding-game-1.webp';`;
    const built = [
      "assets/game-world-bingo-FEB5KpbX.jpg",
      "assets/boarding-game-1-mHFShdX_.webp",
      "assets/boarding-game-10-AAAAAAAA.webp",
      "assets/passport-spread-imoY-DJU.jpg",
      "assets/index-abc12345.js",
    ];
    expect(flightArt([code], built)).toEqual([
      "/assets/boarding-game-1-mHFShdX_.webp",
      "/assets/game-world-bingo-FEB5KpbX.jpg",
    ]);
  });

  it("finds the art in the real flight-game files", async () => {
    const { readFileSync } = await import("node:fs");
    const sources = FLIGHT_GAME_SOURCES.map((f) => readFileSync(f, "utf8"));
    const imported = sources.join("\n").match(/@\/assets\/[\w.-]+\.\w+/g) ?? [];
    expect(new Set(imported).size).toBeGreaterThanOrEqual(15);
  });
});
