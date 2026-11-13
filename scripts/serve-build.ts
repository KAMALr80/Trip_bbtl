// Serves a production build (`bun run build` → .vercel/output) locally, the way Vercel does, for
// the browser tests on a build (playwright.build.config.ts, playwright.pwa.config.ts).
//   bun scripts/serve-build.ts [--port 4173]
//
// It follows the subset of Vercel's Build Output API routes the build uses (config.json): routes in
// order, `headers` added on a match, `dest` rewrites, `continue: true` keeps going, otherwise the
// route list stops there; `{ handle: "filesystem" }` serves a static file if one exists; a `dest`
// naming a function (`/__server`) calls it. Local only: never deploy this.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

type Route = {
  src?: string;
  dest?: string;
  headers?: Record<string, string>;
  continue?: boolean;
  handle?: string;
};

const OUTPUT = join(import.meta.dir, "..", ".vercel", "output");
const STATIC = join(OUTPUT, "static");
const portArg = process.argv.indexOf("--port");
const port = Number(portArg > 0 ? process.argv[portArg + 1] : (process.env["PORT"] ?? 4173));

if (!existsSync(join(OUTPUT, "config.json"))) {
  throw new Error(".vercel/output is missing: run `bun run build` first");
}
const routes = (
  JSON.parse(readFileSync(join(OUTPUT, "config.json"), "utf8")) as {
    routes: Route[];
  }
).routes;

type Handler = { fetch: (request: Request) => Response | Promise<Response> };
const functions = new Map<string, Promise<Handler>>();
function fn(name: string): Promise<Handler> | null {
  const dir = join(OUTPUT, "functions", `${name.replace(/^\/+/, "")}.func`);
  if (!existsSync(dir)) return null;
  if (!functions.has(name)) {
    const config = JSON.parse(readFileSync(join(dir, ".vc-config.json"), "utf8")) as {
      handler: string;
    };
    functions.set(
      name,
      import(join(dir, config.handler)).then((m: { default: Handler }) => m.default),
    );
  }
  return functions.get(name)!;
}

function staticFile(path: string): string | null {
  const file = normalize(join(STATIC, decodeURIComponent(path)));
  if (!file.startsWith(STATIC)) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let path = url.pathname;
  const headers = new Headers();
  const respond = async (response: Response) => {
    const out = new Response(response.body, response);
    headers.forEach((value, name) => out.headers.set(name, value));
    return out;
  };
  const tryFile = (p: string) => {
    const file = staticFile(p);
    return file ? respond(new Response(Bun.file(file))) : null;
  };

  for (const route of routes) {
    if (route.handle === "filesystem") {
      const hit = tryFile(path);
      if (hit) return hit;
      continue;
    }
    if (!route.src) continue;
    // Vercel anchors every pattern.
    const match = new RegExp(`^(?:${route.src.replace(/^\^|\$$/g, "")})$`).exec(path);
    if (!match) continue;
    for (const [name, value] of Object.entries(route.headers ?? {})) headers.set(name, value);
    if (route.dest) path = route.dest.replace(/\$(\d+)/g, (_, i: string) => match[+i] ?? "");
    if (route.continue) continue;
    const handler = fn(path);
    if (handler) {
      // The function sees the original URL, as on Vercel.
      return respond(await (await handler).fetch(request));
    }
    return (await tryFile(path)) ?? respond(new Response("Not found", { status: 404 }));
  }
  return respond(new Response("Not found", { status: 404 }));
}

Bun.serve({ port, hostname: "127.0.0.1", fetch: serve });
console.log(`Serving .vercel/output on http://127.0.0.1:${port}`);
