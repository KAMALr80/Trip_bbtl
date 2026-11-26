// M2-08: joining asks two things only (role this trip, pre-filled; most excited for), then Play.
// Local QA (QA-B09, PDF p.10): the role is saved on the player profile (the card trigger copies it
// to every card and overwrites a role sent on the card), the answer on the new trip card.
import { expect, test } from "@playwright/test";
import { sampleTrip, signInWithMockBackend } from "./support/mock-backend";

test("after joining: role + most excited for, then Play", async ({ page }) => {
  const calls = await signInWithMockBackend(page, { trip: sampleTrip, noCard: true });
  const cardWrites: string[] = [];
  const profileWrites: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/trip_player_cards"))
      cardWrites.push(r.postData() ?? "");
    if (r.method() === "PATCH" && r.url().includes("/rest/v1/player_profiles"))
      profileWrites.push(r.postData() ?? "");
  });
  await page.goto("/home");
  const card = page.getByLabel("Join this trip");
  await expect(card).toBeVisible();
  await card.getByLabel("Your role this trip").selectOption("photographer");
  await card.getByRole("textbox").fill("The night markets");
  await card.getByRole("button", { name: /let's go|join|save|play/i }).click();
  await expect(page).toHaveURL(new RegExp(`/t/${sampleTrip.id}/play$`));
  expect(profileWrites.join()).toContain('"trip_persona":"photographer"');
  expect(cardWrites.join()).toContain('"most_excited":"The night markets"');
  expect(cardWrites.join()).not.toContain("trip_persona");
  expect(calls.length).toBeGreaterThan(0);
});
