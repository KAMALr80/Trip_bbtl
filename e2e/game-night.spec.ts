// M2-14: a one-night Game Night from Home in three taps, then straight to the games.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

test("Home → Game Night → Who's playing → play on one phone", async ({ page }) => {
  const night = {
    ...sampleTrip,
    room: "game_night",
    play_mode: "offline",
    kind: "at_home",
    name: "Friday Fun",
    destination: "Friday Fun",
    preflight_days: 0,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  };
  const calls = await signInWithMockBackend(page, {
    trip: night,
    rpc: { create_trip_v2: night.id },
  });
  await page.goto("/home");
  await page.getByRole("navigation", { name: "Main navigation" }).waitFor();
  await page.getByRole("button", { name: /Game Night\s*Play right now/ }).click(); // tap 1
  await expect(page.getByRole("heading", { name: "Who's playing?" })).toBeVisible();
  await page.getByRole("radio", { name: /Friends off the app/ }).click(); // tap 2
  await page.getByRole("button", { name: "Create" }).click(); // tap 3
  await expect(page.getByRole("heading", { name: "Who's playing with you?" })).toBeVisible();
  expect(
    (calls.find((c) => c.fn === "create_trip_v2")?.body as { p_setup: { room: string } }).p_setup
      .room,
  ).toBe("game_night");
  await page.getByRole("button", { name: "Done · open Play" }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${night.id}/play$`));
  await expect(page.getByText(/no points or crowns/)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Trip phases" })).toHaveCount(0);
});
