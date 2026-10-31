// M4-04: an action taken with no network waits on the phone, survives a restart, is sent once
// when the network is back, and a refusal from the server is shown. Run with
// playwright.pwa.config.ts (production build with the service worker).
import { expect, test, type Page, type Route } from "@playwright/test";
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

const noNetwork = (route: Route) => route.abort("internetdisconnected");
const card = (page: Page) => page.getByLabel(/Daily Discovery/);

async function answerOffline(page: Page) {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: { my_schedule: [discovery], answer_daily: [{ points: 1, correct: null, answer: null }] },
  });
  await page.goto("/home");
  await expect(card(page).getByText("What would you try first in Lisbon?")).toBeVisible();

  await page.context().setOffline(true);
  await page.route(SUPABASE, noNetwork); // registered last, so it wins over the mock
  await card(page).getByRole("button", { name: "Street food" }).click();
  await expect(card(page).getByRole("status")).toContainText("sends when you're back online");
  await expect(page.getByText("1 thing waiting to send")).toBeVisible();
  return calls;
}

test("an answer given offline waits, survives a restart, and is sent once", async ({ page }) => {
  const calls = await answerOffline(page);

  // Close and reopen the app, still offline: the answer is still waiting.
  await page.reload();
  await expect(card(page).getByRole("status")).toContainText("sends when you're back online");
  expect(calls.filter((c) => c.fn === "answer_daily")).toHaveLength(0);

  // Back online: sent once, with the same answer.
  await page.unroute(SUPABASE, noNetwork);
  await page.context().setOffline(false);
  await expect(page.getByText("1 thing waiting to send")).toHaveCount(0);
  const sent = calls.filter((c) => c.fn === "answer_daily");
  expect(sent).toHaveLength(1);
  expect(sent[0]?.body).toEqual({ p_item: discovery.id, p_choice: 0 });
});

test("a refusal from the server is shown, not dropped", async ({ page }) => {
  await answerOffline(page);
  // While the phone was offline, the card closed.
  await page.route("http://127.0.0.1:54321/rest/v1/rpc/answer_daily", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        code: "P0001",
        message: "That card has closed for the day",
        details: null,
        hint: null,
      }),
    }),
  );
  await page.unroute(SUPABASE, noNetwork);
  await page.context().setOffline(false);
  const alert = page.getByRole("alert").filter({ hasText: "Couldn't send your answer" });
  await expect(alert).toContainText("closed for the day");
  await alert.getByRole("button", { name: "OK" }).click();
  await expect(alert).toHaveCount(0);
});

test("a photo proof sent offline is uploaded and recorded once back online", async ({ page }) => {
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const trip = { ...sampleTrip, start_date: day(5), end_date: day(9), preflight_days: 10 };
  const quest = {
    ...discovery,
    id: "00000000-0000-4000-8000-0000000000f1",
    kind: "sealed_quest",
    user_id: "00000000-0000-4000-8000-000000000001",
    variant: null,
    points: 10,
    title: "Sketch a landmark",
    body: "Draw the tram in 10 minutes",
    choices: [],
  };
  const calls = await signInWithMockBackend(page, {
    trip,
    rpc: { my_schedule: [quest], submit_proof: "00000000-0000-4000-8000-0000000000f2" },
  });
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/storage/v1/object/quest-proofs/"))
      uploads.push(new URL(r.url()).pathname.replace("/storage/v1/object/quest-proofs/", ""));
  });
  await page.goto(`/t/${trip.id}/play`);
  await page
    .getByRole("navigation", { name: "Trip phases" })
    .getByRole("button", { name: /Pre-Flight/ })
    .click();
  const questCard = page.getByRole("article", { name: /Sealed quest/ });
  await expect(questCard).toContainText("Draw the tram in 10 minutes");

  await page.context().setOffline(true);
  await page.route(SUPABASE, noNetwork);
  // A 2×2 PNG, like a photo from the camera.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mP8z8DwnwEIGBkZGRgYAAAoAQH/3gmQ0AAAAABJRU5ErkJggg==",
    "base64",
  );
  await questCard
    .getByLabel(/photo/i)
    .setInputFiles({ name: "tram.png", mimeType: "image/png", buffer: png });
  await questCard.getByRole("button", { name: /Send/ }).click();
  await expect(questCard.getByRole("status")).toContainText("sends when you're back online");
  expect(uploads).toHaveLength(0);

  await page.unroute(SUPABASE, noNetwork);
  await page.context().setOffline(false);
  await expect.poll(() => calls.filter((c) => c.fn === "submit_proof").length).toBe(1);
  const body = calls.find((c) => c.fn === "submit_proof")?.body as { p_photo_path: string };
  // The photo went to quest-proofs/<trip>/<me>/<item>/ first, at the path the proof names.
  expect(uploads).toEqual([body.p_photo_path]);
  expect(body.p_photo_path).toMatch(
    new RegExp(`^${trip.id}/00000000-0000-4000-8000-000000000001/${quest.id}/[0-9a-f-]+\\.jpg$`),
  );
});
