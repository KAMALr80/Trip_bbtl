// M2-11: Captain tools, one tile per phase; leaders only.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

test("a Captain edits the crowning night from the Trip Season tile", async ({ page }) => {
  const trip = { ...sampleTrip, start_date: day(10), end_date: day(14) };
  const calls = await signInWithMockBackend(page, { trip });
  await page.goto(`/t/${trip.id}/trip?tools=true`);
  const tiles = page.getByRole("region", { name: "By phase" });
  await expect(tiles.getByRole("button")).toHaveText([
    /Pre-Flight/,
    /Takeoff/,
    /Trip Season/,
    /Baggage Claim/,
  ]);
  await tiles.getByRole("button", { name: /Trip Season/ }).click();
  await page.getByLabel("Where").fill("Rooftop bar");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  const body = calls.find((c) => c.fn === "set_crowning_night")?.body as Record<string, unknown>;
  expect(body).toMatchObject({ p_trip: trip.id, p_place: "Rooftop bar" });
});

test("players can't open Captain tools from the URL", async ({ page }) => {
  await signInWithMockBackend(page, { trip: sampleTrip, role: "player" });
  await page.goto(`/t/${sampleTrip.id}/trip?tools=true`);
  await expect(page.getByRole("heading", { name: "The Squad" })).toBeVisible();
  await expect(page.getByRole("region", { name: "By phase" })).toHaveCount(0);
});
