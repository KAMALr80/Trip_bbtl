// M2-08: joining asks two things only (role this trip, pre-filled; most excited for), then Play.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

test("after joining: role + most excited for, then Play", async ({ page }) => {
  const calls = await signInWithMockBackend(page, { trip: sampleTrip, noCard: true });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/trip_player_cards"))
      writes.push(r.postData() ?? "");
  });
  await page.goto("/home");
  const card = page.getByLabel("Join this trip");
  await expect(card).toBeVisible();
  await card.getByLabel("Your role this trip").selectOption("photographer");
  await card.getByRole("textbox").fill("The night markets");
  await card.getByRole("button", { name: /let's go|join|save|play/i }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play$`));
  expect(writes.join()).toContain('"trip_persona":"photographer"');
  expect(writes.join()).toContain('"most_excited":"The night markets"');
  expect(calls.length).toBeGreaterThan(0);
});
