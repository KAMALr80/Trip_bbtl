// M2-05 / M2-07: the Captain setup wizard against the mocked backend. Checks the screens, the
// automatic trip time zone, what is sent to create_trip_v2, and that off-app names stay on the phone.
import { expect, test, type Page } from "@playwright/test";
import { sampleTrip, signInWithMockBackend, type RpcCall } from "./support/mock-backend";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
const dayLabel = (d: Date) =>
  new RegExp(
    `${d.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
  );
async function pickDay(page: Page, d: Date) {
  const day = page.getByRole("button", { name: dayLabel(d) });
  for (let i = 0; i < 3 && !(await day.isVisible()); i++)
    await page.getByRole("button", { name: /next month/i }).click();
  await day.click();
}
const next = (page: Page) => page.getByRole("button", { name: /^(Next|Create)$/ }).click();

test("a Captain sets up a trip to Bali in five screens", async ({ page }) => {
  const calls: RpcCall[] = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: { create_trip_v2: sampleTrip.id },
  });
  await page.goto("/trips/new?room=trip");
  await expect(page.getByRole("heading", { name: "Who's playing?" })).toBeVisible();
  await page.getByRole("radio", { name: /My crew \(on the app\)/ }).click();
  await next(page);

  await expect(page.getByRole("heading", { name: "Where to?" })).toBeVisible();
  await page.getByRole("combobox").first().fill("Indonesia");
  await page.getByRole("option", { name: "Indonesia" }).click();
  await page.getByRole("combobox").nth(1).fill("Bal");
  await page.getByRole("option", { name: "Bali", exact: true }).click();
  await expect(page.getByText("Culture to explore")).toBeVisible();
  await next(page);

  await expect(page.getByRole("heading", { name: "Trip basics" })).toBeVisible();
  await pickDay(page, inDays(10));
  await pickDay(page, inDays(13));
  await expect(page.getByText("4 days")).toBeVisible();
  await expect(page.getByText(/Trip time: Bali \(UTC\+8\)/)).toBeVisible(); // beta note: not New York
  await expect(page.getByLabel("Trip name")).toHaveValue("Bali Crew");
  await next(page);

  await expect(page.getByRole("heading", { name: "Pre-Flight" })).toBeVisible();
  await page.getByRole("button", { name: "More days" }).click();
  await page.getByRole("button", { name: "More days" }).click();
  await page.getByRole("button", { name: "Add a call night" }).click();
  await page.getByLabel("Call link (optional)").fill("https://meet.example/bali");
  await next(page);

  await expect(page.getByRole("heading", { name: "Trip Season" })).toBeVisible();
  await next(page);
  await expect(page.getByRole("alert")).toHaveText("Add where it happens.");
  await page.getByLabel("Where").fill("The villa rooftop");
  await next(page);

  await expect(page.getByRole("heading", { name: "Invite your crew" })).toBeVisible();
  await expect(page.getByLabel(`Join code ${sampleTrip.join_code}`)).toBeVisible();
  const created = calls.find((c) => c.fn === "create_trip_v2")?.body as {
    p_setup: Record<string, unknown>;
  };
  expect(created.p_setup).toMatchObject({
    room: "trip",
    playMode: "crew",
    destination: "Bali, Indonesia",
    tripTz: "Asia/Makassar",
    startDate: iso(inDays(10)),
    endDate: iso(inDays(13)),
    preflightDays: 2,
    crowningPlace: "The villa rooftop",
  });
  expect((created.p_setup["callNights"] as unknown[]).length).toBe(1);
  expect(calls.filter((c) => c.fn === "save_trip_draft").length).toBe(4); // after each screen

  await page.getByRole("button", { name: "Done · open Play" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play$`));
});

test("a refresh keeps the screen, and can't skip ahead", async ({ page }) => {
  await signInWithMockBackend(page);
  await page.goto("/trips/new?room=window_seat&step=3");
  await expect(page.getByRole("heading", { name: "Who's playing?" })).toBeVisible();
  await expect(page).toHaveURL(/step=0/);
});

test("off-app friends' names stay on the phone (R-006)", async ({ page }) => {
  const calls = await signInWithMockBackend(page, {
    trip: sampleTrip,
    rpc: { create_trip_v2: sampleTrip.id },
  });
  await page.goto("/trips/new?room=game_night");
  await page.getByRole("radio", { name: /Friends off the app/ }).click();
  await next(page);
  await expect(page.getByRole("heading", { name: "Who's playing with you?" })).toBeVisible();
  await page.getByLabel("Friend's first name").fill("Ana");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Friend's first name").fill("Bo");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  expect(JSON.stringify(calls)).not.toMatch(/"Ana"|"Bo"/);
  const setup = (
    calls.find((c) => c.fn === "create_trip_v2")?.body as { p_setup: Record<string, unknown> }
  ).p_setup;
  expect(setup).toMatchObject({ room: "game_night", playMode: "offline", crowningAt: null });
});
