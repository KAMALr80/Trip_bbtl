// M3-13: culture rooms are set up on the engine — Home's "Explore a Culture" opens the wizard.
import { expect, test } from "@playwright/test";
import { signInWithMockBackend } from "./support/mock-backend";

test("Explore a Culture on Home opens the setup wizard for that room", async ({ page }) => {
  await signInWithMockBackend(page);
  await page.goto("/home");
  await page
    .getByRole("button", { name: /Explore a Culture/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/trips\/new\?.*room=explore_culture/);
});
