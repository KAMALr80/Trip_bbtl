import { describe, expect, it } from "vitest";
import {
  ENFORCED_CSP,
  reportOnlyCsp,
  STATIC_SECURITY_HEADERS,
  staticFileRoutes,
  withSecurityHeaders,
} from "./security-headers";

const SUPABASE = "https://abc.supabase.co";

describe("security headers (B-28)", () => {
  it("enforces only what the app can't break", () => {
    expect(ENFORCED_CSP).toContain("object-src 'none'");
    expect(ENFORCED_CSP).toContain("base-uri 'self'");
    expect(ENFORCED_CSP).toContain("frame-ancestors 'none'");
    expect(ENFORCED_CSP).toContain("form-action 'self'");
    expect(ENFORCED_CSP).not.toContain("script-src");
  });

  it("the report-only policy allows this project's backend and no other", () => {
    const csp = reportOnlyCsp(SUPABASE);
    expect(csp).toContain(`connect-src 'self' ${SUPABASE} wss://abc.supabase.co`);
    expect(csp).toContain(`img-src 'self' data: blob: ${SUPABASE}`);
    expect(csp).not.toContain("*.supabase.co");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/(script|connect|default)-src[^;]* \*( |;)/);
  });

  it("survives a missing or broken backend URL", () => {
    for (const url of [undefined, "not a url"]) {
      expect(reportOnlyCsp(url)).toContain("connect-src 'self' https://*.sentry.io");
      expect(reportOnlyCsp(url)).not.toContain("null");
    }
  });

  it("adds every header, and keeps the response as it was", async () => {
    const original = new Response("hello", {
      status: 201,
      headers: { "content-type": "text/plain", "x-mine": "1" },
    });
    const res = withSecurityHeaders(original, "https://tripjunkies.app/", SUPABASE);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("hello");
    expect(res.headers.get("x-mine")).toBe("1");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toContain("default-src 'self'");
  });

  it("upgrades insecure requests only over https, so localhost keeps working", () => {
    const secure = withSecurityHeaders(new Response(""), "https://tripjunkies.app/", SUPABASE);
    const local = withSecurityHeaders(new Response(""), "http://localhost:8080/", SUPABASE);
    expect(secure.headers.get("Content-Security-Policy")).toContain("upgrade-insecure-requests");
    expect(local.headers.get("Content-Security-Policy")).not.toContain("upgrade-insecure-requests");
  });

  it("copes with redirects, whose headers are read-only", () => {
    const res = withSecurityHeaders(
      Response.redirect("https://tripjunkies.app/home", 302),
      "https://tripjunkies.app/",
      SUPABASE,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://tripjunkies.app/home");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("the Vercel routes give static files the same values, and only static files", () => {
    const routes = staticFileRoutes(["assets/", "icons/", "sw.js", "offline.html", "robots.txt"]);
    const first = routes[0]!;
    expect(first.headers).toEqual(STATIC_SECURITY_HEADERS);
    expect(first.continue).toBe(true);
    const re = new RegExp(first.src);
    for (const path of ["/assets/a-1.js", "/icons/x/y.png", "/sw.js", "/offline", "/offline.html"])
      expect(re.test(path), path).toBe(true);
    for (const path of ["/", "/home", "/api/public/version", "/sw.jsx", "/swajs", "/assets"])
      expect(re.test(path), path).toBe(false);
  });

  it("serves /offline from offline.html without a redirect, and never caches sw.js", () => {
    const routes = staticFileRoutes([]);
    expect(routes).toContainEqual({ src: "^/offline$", dest: "/offline.html", continue: true });
    const sw = routes.find((r) => new RegExp(r.src).test("/sw.js") && r.headers?.["cache-control"]);
    expect(sw?.headers).toEqual({ "cache-control": "no-cache", "service-worker-allowed": "/" });
    // Every route lets the rest of the list run, so the filesystem and the function still answer.
    expect(routes.every((r) => r.continue === true)).toBe(true);
  });
});
