// Security headers on the production build, served by the same Workers runtime as staging (B-28).
import { expect, test, type APIResponse } from "@playwright/test";

function expectSecurityHeaders(res: APIResponse) {
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("geolocation=()");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
}

test("pages carry the security headers and the report-only policy", async ({ request }) => {
  const res = await request.get("/");
  expect(res.ok()).toBe(true);
  expectSecurityHeaders(res);
  const reportOnly = res.headers()["content-security-policy-report-only"];
  expect(reportOnly).toContain("default-src 'self'");
  expect(reportOnly).toContain("connect-src 'self'");
});

test("API routes carry them too", async ({ request }) => {
  expectSecurityHeaders(await request.get("/api/public/version"));
});

test("static files carry them too", async ({ request }) => {
  for (const path of ["/offline.html", "/manifest.webmanifest", "/sw.js"]) {
    const res = await request.get(path);
    expect(res.ok(), path).toBe(true);
    expectSecurityHeaders(res);
  }
  // The headers file doesn't get in the way of what it already set.
  expect((await request.get("/sw.js")).headers()["service-worker-allowed"]).toBe("/");
});

test("an unauthenticated cron call is refused", async ({ request }) => {
  const res = await request.post("/api/public/purge-photos");
  expect(res.status()).toBeGreaterThanOrEqual(401);
  expect(res.status()).toBeLessThan(600);
  expect(res.ok()).toBe(false);
});

test("the signed-out app raises no policy violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|content security policy/i.test(m.text()))
      violations.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in with email" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page.getByRole("textbox", { name: /email/i }).first()).toBeVisible();
  expect(violations).toEqual([]);
});
