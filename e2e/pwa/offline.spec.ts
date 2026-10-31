// M4-02: the service worker precaches the app, answers pages offline and never caches data.
// Run with playwright.pwa.config.ts (a production build with VITE_SERVICE_WORKER=true).
import { expect, test, type Page } from "@playwright/test";

async function controlled(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++)
      await new Promise((r) => setTimeout(r, 100));
  });
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test("the worker installs and precaches this build", async ({ page }) => {
  await controlled(page);
  const cached = await page.evaluate(async () => {
    const key = (await caches.keys()).find((k) => k.startsWith("tj-precache-"));
    if (!key) return [];
    return (await (await caches.open(key)).keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached).toContain("/");
  expect(cached).toContain("/offline");
  expect(cached.some((p) => p.endsWith(".css"))).toBe(true);
  // M4-05: Games on the Flight art is there before it's ever shown.
  expect(cached.filter((p) => /\/assets\/game-world-/.test(p)).length).toBeGreaterThanOrEqual(9);
  expect(cached.filter((p) => /\/assets\/boarding-game-/.test(p)).length).toBeGreaterThanOrEqual(9);
});

test("sw.js is never served from the HTTP cache", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.headers()["cache-control"]).toBe("no-cache");
});

test("Home and pages opened before load with no network", async ({ page, context }) => {
  await controlled(page);
  await page.goto("/about");
  await page.waitForLoadState("networkidle");

  await context.setOffline(true);
  // Guard: the network really is gone (data requests pass through the worker to the network).
  const reached = await page.evaluate(() =>
    fetch("/api/public/version", { cache: "no-store" }).then(
      () => true,
      () => false,
    ),
  );
  expect(reached).toBe(false);
  await page.goto("/");
  await expect(page).toHaveTitle(/TripJunkies/);
  await page.goto("/about");
  await expect(page).toHaveTitle(/Our Story/);

  // A fresh tab, like opening the installed app on a plane.
  const tab = await context.newPage();
  await tab.goto("/");
  await expect(tab).toHaveTitle(/TripJunkies/);
});

test("a page never opened online opens through the Home shell", async ({ page, context }) => {
  await controlled(page);
  await context.setOffline(true);
  await page.goto("/about");
  // The app's router draws the page from the precached shell.
  await expect(page.getByText("THE STORY BEHIND THE FUN")).toBeVisible();
  await expect(page.getByRole("heading", { name: "You're offline" })).toHaveCount(0);
});

test("the offline page is precached as the last resort", async ({ page }) => {
  await controlled(page);
  const body = await page.evaluate(async () => (await caches.match("/offline"))?.text());
  expect(body).toContain("You're offline");
});

test("data requests are not cached", async ({ page }) => {
  await controlled(page);
  await page.evaluate(() => fetch("/api/public/version").then((r) => r.json()));
  const urls = await page.evaluate(async () => {
    const all: string[] = [];
    for (const key of await caches.keys())
      for (const req of await (await caches.open(key)).keys()) all.push(req.url);
    return all;
  });
  expect(urls.some((u) => u.includes("/api/") || u.includes("/_serverFn/"))).toBe(false);
});
