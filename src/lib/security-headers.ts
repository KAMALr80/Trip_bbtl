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

/** Lines for Cloudflare's `_headers` file, which covers static files the Worker never sees. */
export function headersFileBlock(): string {
  const lines = Object.entries(STATIC_SECURITY_HEADERS).map(([k, v]) => `  ${k}: ${v}`);
  return ["/*", ...lines].join("\n");
}

/** A copy of a Worker response with the security headers set. */
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
