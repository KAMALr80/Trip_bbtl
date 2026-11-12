// Writes sw.js into the built static files after `vite build` (M4-02); `bun run build` runs it.
// It also adds the static-file routes (security headers, sw.js and /offline rules) to Vercel's
// .vercel/output/config.json (see staticFileRoutes in src/lib/security-headers.ts).
//
// With VITE_SERVICE_WORKER=true (scripts/deploy.sh sets it for staging and production) it bundles
// src/pwa/sw.ts with this build's precache list and a version made from the precached files.
// Without it, sw.js is the kill switch: a worker that removes itself and its caches, so a
// browser that installed one earlier goes back to plain network loading on its next visit.
//   bun scripts/pwa/build-sw.ts
import { staticFileRoutes, type VercelRoute } from "../../src/lib/security-headers";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  FLIGHT_GAME_SOURCES,
  SHELL_URL,
  fileFor,
  flightArt,
  precacheList,
} from "../../src/pwa/sw-plan";

const OUTPUT = ".vercel/output";
const OUT = join(OUTPUT, "static");
if (!existsSync(OUT)) throw new Error(`${OUT} is missing: run vite build first`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(OUT, path).split(sep).join("/")];
  });
}

const KILL_SWITCH = `// No service worker in this build (VITE_SERVICE_WORKER is not "true"): remove any earlier one.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("tj-")) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
`;

let body: string;
let summary: string;
if (process.env["VITE_SERVICE_WORKER"] === "true") {
  const built = walk(OUT);
  const art = flightArt(
    FLIGHT_GAME_SOURCES.map((f) => readFileSync(f, "utf8")),
    built,
  );
  const precache = [...new Set([...precacheList(built), ...art])].sort();
  const hash = createHash("sha256");
  for (const url of precache) {
    if (url === SHELL_URL) continue; // rendered by the server; its scripts are in the list
    hash.update(url).update(readFileSync(join(OUT, fileFor(url))));
  }
  hash.update(readFileSync("src/pwa/sw.ts")).update(readFileSync("src/pwa/sw-plan.ts"));
  const version = hash.digest("hex").slice(0, 12);

  const result = await Bun.build({
    entrypoints: ["src/pwa/sw.ts"],
    target: "browser",
    format: "iife",
    minify: true,
    define: {
      __TJ_VERSION__: JSON.stringify(version),
      __TJ_PRECACHE__: JSON.stringify(precache),
    },
  });
  const [output] = result.outputs;
  if (!result.success || !output) {
    for (const log of result.logs) console.error(log);
    throw new Error("service worker bundle failed");
  }
  body = await output.text();
  const bytes = precache
    .filter((u) => u !== SHELL_URL)
    .reduce((sum, u) => sum + statSync(join(OUT, fileFor(u))).size, 0);
  summary = `service worker ${version}: ${precache.length} files precached, ${art.length} of them flight-game art (${(bytes / 1e6).toFixed(1)} MB)`;
} else {
  body = KILL_SWITCH;
  summary = "service worker off (VITE_SERVICE_WORKER is not true): wrote the self-removing sw.js";
}

writeFileSync(join(OUT, "sw.js"), body);

// Vercel's routes: the static-file rules go first, before Nitro's own (B-28). A fresh vite build
// writes a fresh config.json, so a second run of this script only replaces its own routes.
const configPath = join(OUTPUT, "config.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as { routes?: VercelRoute[] };
const entries = readdirSync(OUT).map((n) => (statSync(join(OUT, n)).isDirectory() ? `${n}/` : n));
const ours = staticFileRoutes(entries);
const isOurs = (r: VercelRoute) => ours.some((o) => JSON.stringify(o) === JSON.stringify(r));
const previous = (config.routes ?? []).filter((r) => !("src" in r) || !r.src.startsWith("^/(?:"));
config.routes = [...ours, ...previous.filter((r) => !isOurs(r))];
writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(summary);
