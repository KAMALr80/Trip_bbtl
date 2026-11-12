// Response headers (B-28). Pure, so src/server.ts, scripts/pwa/build-sw.ts and the tests share one
// definition.
//
// Two policies on purpose:
// - ENFORCED: directives that can't break the app, because it uses none of what they forbid.
// - REPORT-ONLY: the full policy, which the browser reports but doesn't block. Move it to the
//   enforced header once staging has run clean (dev-docs/owner-go-live-steps.md, section 8).
//
// script-src keeps 'unsafe-inline': TanStack Start streams its router state in inline scripts, and
// the root route has a small inline theme script. Removing it needs a per-request nonce threaded
// through the router. It still stops scripts loading from other sites.
// style-src keeps 'unsafe-inline': components set style="" attributes throughout.

export const ENFORCED_CSP =
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

/** The origin of a URL, or null if it isn't a URL. */
function originOf(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export function reportOnlyCsp(supabaseUrl: string | undefined): string {
  const supabase = originOf(supabaseUrl);
  const realtime = supabase?.replace(/^http/, "ws");
  const list = (...items: (string | null | undefined)[]) => items.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    list("img-src 'self' data: blob:", supabase),
    list("connect-src 'self'", supabase, realtime, "https://*.sentry.io"),
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "frame-src 'none'",
    ENFORCED_CSP,
  ].join("; ");
}

/** Headers that are the same on every response, including static files. */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": ENFORCED_CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Photos are picked with a file input, which doesn't need the camera permission.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  // Browsers ignore this over http, so it's safe on every environment. No includeSubDomains: other
  // subdomains of the domain aren't this app's to decide.
  "Strict-Transport-Security": "max-age=15552000",
};

/** One route in Vercel's Build Output API (`.vercel/output/config.json`). */
export type VercelRoute = {
  src: string;
  dest?: string;
  headers?: Record<string, string>;
  continue?: boolean;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Routes for the start of Vercel's route list. Static files are served by Vercel's CDN and never
 * reach the server function, so they get the security headers from here (B-28). The browser must
 * always see the newest sw.js and offline page (assets/* are already immutable), and /offline
 * answers with offline.html directly: a redirected response can't answer a page (sw-plan.ts).
 *
 * `entries`: the top-level names in the static folder, with a trailing "/" on folders. Only those
 * paths match, so server responses keep the headers src/server.ts sets.
 */
export function staticFileRoutes(entries: readonly string[]): VercelRoute[] {
  const paths = [...new Set([...entries, "offline"])]
    .sort()
    .map((e) => (e.endsWith("/") ? `${escapeRegExp(e)}.*` : escapeRegExp(e)));
  return [
    { src: `^/(?:${paths.join("|")})$`, headers: { ...STATIC_SECURITY_HEADERS }, continue: true },
    {
      src: "^/sw\\.js$",
      headers: { "cache-control": "no-cache", "service-worker-allowed": "/" },
      continue: true,
    },
    { src: "^/offline$", headers: { "cache-control": "no-cache" }, continue: true },
    { src: "^/offline$", dest: "/offline.html", continue: true },
  ];
}

/** A copy of a server response with the security headers set. */
export function withSecurityHeaders(
  response: Response,
  requestUrl: string,
  supabaseUrl: string | undefined,
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) headers.set(name, value);
  const https = requestUrl.startsWith("https://");
  headers.set(
    "Content-Security-Policy",
    https ? `${ENFORCED_CSP}; upgrade-insecure-requests` : ENFORCED_CSP,
  );
  headers.set("Content-Security-Policy-Report-Only", reportOnlyCsp(supabaseUrl));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
