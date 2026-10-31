// M4-03: the app opens offline from this phone's snapshot, but never hides a refusal from the
// server. Run with playwright.pwa.config.ts (production build with the service worker).
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "../support/mock-backend";

const SUPABASE = "http://127.0.0.1:54321/**";
const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const later = new Date(Date.now() + 6 * 3600_000).toISOString();
const discovery = {
  id: "00000000-0000-4000-8000-0000000000d1",
  kind: "daily_discovery",
  slot: "today",
  user_id: null,
  day: hourAgo.slice(0, 10),
  opens_at: hourAgo,
  closes_at: later,
  ref_id: null,
  variant: "question",
  points: 2,
  is_open: true,
  title: "Your first stop",
  body: "What would you try first in Lisbon?",
  insight: null,
  choices: ["Street food", "A cooking class"],
  items: [],
};

/** The saved snapshot's query keys and account facts (empty until the first write). */
const saved = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open("tj-offline");
        req.onsuccess = () => {
          if (!req.result.objectStoreNames.contains("snapshot")) return resolve([]);
          const get = req.result.transaction("snapshot").objectStore("snapshot").get("current");
          get.onsuccess = () => {
            const snap = get.result as
              { account: object; queries: { queries: { queryKey: unknown[] }[] } } | undefined;
            if (!snap) return resolve([]);
            resolve([
              ...snap.queries.queries.map((q) => JSON.stringify(q.queryKey)),
              ...Object.keys(snap.account).map((k) => `account.${k}`),
            ]);
          };
          get.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      }),
  );

const tripId = sampleTrip.id;

async function playOnline(page: Page) {
  await signInWithMockBackend(page, { trip: sampleTrip, rpc: { my_schedule: [discovery] } });
  await page.goto("/home");
  await expect(page.getByText("What would you try first in Lisbon?")).toBeVisible();
  // Query results are written a second after the last load; account facts right away.
  await expect
    .poll(() => saved(page))
    .toEqual(
      expect.arrayContaining([
        '["trips","00000000-0000-4000-8000-000000000001"]',
        `["trip","${tripId}","schedule"]`,
        `["trip","${tripId}","members"]`,
        "account.user",
        "account.profile",
        "account.legalVersion",
        "account.access",
      ]),
    );
}

/** A new tab with the Supabase API unreachable, like opening the app on a plane. */
async function reopen(context: BrowserContext, { browserOffline }: { browserOffline: boolean }) {
  await context.route(SUPABASE, (route) => route.abort("internetdisconnected"));
  if (browserOffline) await context.setOffline(true);
  const tab = await context.newPage();
  await tab.goto("/home");
  return tab;
}

test("with no network the app opens from the snapshot", async ({ page, context }) => {
  await playOnline(page);
  await page.close();
  const tab = await reopen(context, { browserOffline: true });
  await expect(tab.getByText("What would you try first in Lisbon?")).toBeVisible();
  await expect(tab.getByRole("status").filter({ hasText: "Offline" })).toContainText(/Last synced/);
  // Play shows the same trip.
  await tab
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Play", exact: true })
    .click();
  await expect(tab).toHaveURL(/\/play$/);
  await expect(tab.getByText("Continue with Google")).toHaveCount(0);
});

test("the snapshot also covers a connection that is there but not working", async ({
  page,
  context,
}) => {
  await playOnline(page);
  await page.close();
  const tab = await reopen(context, { browserOffline: false });
  await expect(tab.getByText("What would you try first in Lisbon?")).toBeVisible();
  await expect(tab.getByRole("status").filter({ hasText: "Offline" })).toBeVisible();
});

test("a refusal from the server still signs the player out and clears the snapshot", async ({
  page,
  context,
}) => {
  await playOnline(page);
  await page.close();
  // The session is no longer valid: the server answers, and says no.
  await context.route(SUPABASE, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/auth/v1/"))
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "session_not_found",
          msg: "Session from session_id claim in JWT does not exist",
        }),
      });
    return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  const tab = await context.newPage();
  await tab.goto("/home");
  await expect(tab.getByText("Continue with Google")).toBeVisible();
  await expect(tab.getByText("What would you try first in Lisbon?")).toHaveCount(0);
  await expect.poll(() => saved(tab)).toEqual([]);
});
