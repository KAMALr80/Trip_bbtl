import { describe, expect, it } from "vitest";
import {
  ENFORCED_CSP,
  headersFileBlock,
  reportOnlyCsp,
  STATIC_SECURITY_HEADERS,
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

  it("the _headers block covers static files with the same values", () => {
    const block = headersFileBlock();
    expect(block.startsWith("/*\n")).toBe(true);
    for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS))
      expect(block).toContain(`  ${name}: ${value}`);
  });
});
